//! What the shell keeps of a waiting card (the note, the place to keep a rule, the question's
//! picks, when it was first drawn) and what answering a permission card sends.

use std::fmt;

use closta_model::ApprovalDecision;
use closta_presenter::cards::decisions::{
    PermissionChoice, QuestionPick, RULE_KINDS, kept_suggestions, offers_destination,
    permission_choice, question_answers, questions_complete,
};
use closta_presenter::cards::plan::{PlanChoice, PlanGo, plan_answer};
use closta_presenter::cards::{
    QuestionCard, ThreadCard, allow_payload, answer_payload, card_of, passed_on,
};
use closta_presenter::input::PassedOn;
use closta_presenter::text::kt_trim;
use closta_presenter::transcript::{ApprovalRecord, SuggestionRecord};

use crate::card_keys::card_choices;

/// What was picked for one question: the options by index, whether Other is chosen and the line
/// written for it.
#[derive(Clone, PartialEq, Eq, Default)]
pub struct OptionPicks {
    pub chosen: Vec<usize>,
    pub other: bool,
    pub other_text: String,
}

/// The text is the user's: `Debug` gives only its length.
impl fmt::Debug for OptionPicks {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "OptionPicks({} chosen, other {}, {} bytes)",
            self.chosen.len(),
            self.other,
            self.other_text.len()
        )
    }
}

/// What the shell holds of one waiting card, from the first time it is touched until it is
/// answered or stops waiting.
#[derive(Clone, PartialEq, Eq, Default)]
pub struct CardState {
    /// When the card in the conversation was first drawn.
    pub shown_ms: Option<i64>,
    /// When its row in the needs-you list was first drawn.
    pub list_shown_ms: Option<i64>,
    pub note_open: bool,
    pub note: String,
    /// Where an Always Allow keeps its rules; `None` for a card with nothing to keep.
    pub destination: Option<String>,
    pub picks: Vec<OptionPicks>,
}

impl fmt::Debug for CardState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "CardState(shown {:?}, list {:?}, note {} {} bytes, destination {:?}, {} picks)",
            self.shown_ms,
            self.list_shown_ms,
            if self.note_open { "open" } else { "closed" },
            self.note.len(),
            self.destination,
            self.picks.len()
        )
    }
}

impl CardState {
    /// The state a card starts with: a permission card's place is the one it offers first, a
    /// question has an empty pick for each of its questions.
    pub fn for_card(card: &ThreadCard) -> CardState {
        match card {
            ThreadCard::Permission(card) => CardState {
                destination: default_destination(&card.suggestions),
                ..CardState::default()
            },
            ThreadCard::Question(card) => CardState {
                picks: vec![OptionPicks::default(); card.questions.len()],
                ..CardState::default()
            },
            ThreadCard::Plan(_) => CardState::default(),
        }
    }

    /// Picks or drops the option of the question; a single-choice question keeps one and
    /// leaves Other, a multi-choice one adds or removes it.
    pub fn toggle_option(&mut self, question: usize, option: usize, multi: bool) {
        let Some(pick) = self.picks.get_mut(question) else {
            return;
        };
        if multi {
            match pick.chosen.iter().position(|it| *it == option) {
                Some(at) => {
                    pick.chosen.remove(at);
                }
                None => {
                    pick.chosen.push(option);
                    pick.chosen.sort_unstable();
                }
            }
        } else if pick.chosen == [option] {
            pick.chosen.clear();
        } else {
            pick.chosen = vec![option];
            pick.other = false;
        }
    }

    /// Chooses or drops Other; a single-choice question drops its options with it.
    pub fn toggle_other(&mut self, question: usize, multi: bool) {
        let Some(pick) = self.picks.get_mut(question) else {
            return;
        };
        if !multi {
            pick.chosen.clear();
        }
        pick.other = !pick.other;
    }

    /// Writes the Other line. Typing one chooses Other, so a line is never written and left
    /// out of the answer.
    pub fn edit_other(&mut self, question: usize, text: &str, multi: bool) {
        let Some(pick) = self.picks.get_mut(question) else {
            return;
        };
        pick.other_text = text.to_owned();
        if !kt_trim(text).is_empty() && !pick.other {
            self.toggle_other(question, multi);
        }
    }

    /// The picks as the presenter reads them: the labels chosen, and the Other line when Other
    /// is chosen.
    pub fn question_picks(&self, card: &QuestionCard) -> Vec<QuestionPick> {
        card.questions
            .iter()
            .enumerate()
            .map(|(at, view)| {
                let pick = self.picks.get(at);
                QuestionPick {
                    question: view.text.clone(),
                    chosen: pick
                        .map(|it| {
                            it.chosen
                                .iter()
                                .filter_map(|i| view.options.get(*i))
                                .map(|option| option.label.clone())
                                .collect()
                        })
                        .unwrap_or_default(),
                    other: pick.filter(|it| it.other).map(|it| it.other_text.clone()),
                }
            })
            .collect()
    }
}

/// The place the card keeps a rule at first: that of the first rule suggestion, else that of the
/// first suggestion.
pub fn default_destination(suggestions: &[SuggestionRecord]) -> Option<String> {
    suggestions
        .iter()
        .find(|it| RULE_KINDS.contains(&it.kind.as_str()))
        .or_else(|| suggestions.first())
        .and_then(|it| it.destination.clone())
}

/// How a card is answered.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Reply {
    /// The button at this index.
    Choose(usize),
    /// Deny with the card's note, if it has one; a question is skipped.
    Deny,
    /// Send what was picked for a question.
    Answer,
}

/// What goes to the session to answer a card.
pub struct Verdict {
    pub decision: ApprovalDecision,
    pub payload: Option<String>,
    pub passed_on: PassedOn,
    /// The mode to switch the session to once the answer is sent.
    pub mode_after: Option<String>,
}

/// The answer `reply` gives to the card of `approval`; `None` for a reply the card does not
/// have: a button past its last, or a question that is not fully answered.
pub fn verdict(
    approval: &ApprovalRecord,
    go: PlanGo,
    state: Option<&CardState>,
    reply: Reply,
) -> Option<Verdict> {
    let card = match card_of(approval, go) {
        ThreadCard::Permission(card) => card,
        ThreadCard::Plan(card) => {
            let choice = match reply {
                Reply::Choose(0) => PlanChoice::Go,
                Reply::Choose(1) => PlanChoice::AskEdits,
                Reply::Choose(2) | Reply::Deny => PlanChoice::KeepPlanning,
                Reply::Choose(_) | Reply::Answer => return None,
            };
            let note = state.map_or("", |it| it.note.as_str());
            let answer = plan_answer(&card, approval, choice, note);
            return Some(Verdict {
                decision: answer.decision,
                payload: Some(answer.payload).filter(|it| !it.is_empty()),
                passed_on: answer.passed_on,
                mode_after: answer.mode_after,
            });
        }
        ThreadCard::Question(card) => {
            let request_id = card.request_id.clone();
            return match reply {
                Reply::Deny => Some(Verdict {
                    decision: ApprovalDecision::Deny { request_id },
                    payload: None,
                    passed_on: PassedOn::default(),
                    mode_after: None,
                }),
                Reply::Answer => {
                    let picks = match state {
                        Some(state) => state.question_picks(&card),
                        None => CardState::for_card(&ThreadCard::Question(card.clone()))
                            .question_picks(&card),
                    };
                    questions_complete(&picks).then(|| Verdict {
                        decision: ApprovalDecision::Answered { request_id },
                        payload: Some(answer_payload(approval, &question_answers(&picks))),
                        passed_on: PassedOn::default(),
                        mode_after: None,
                    })
                }
                Reply::Choose(_) => None,
            };
        }
    };
    let request_id = approval.request_id.clone();
    let choice = match reply {
        Reply::Choose(index) => {
            if index >= card_choices(&ThreadCard::Permission(card.clone())) {
                return None;
            }
            permission_choice(index, !card.suggestions.is_empty())
        }
        Reply::Deny => PermissionChoice::Deny,
        Reply::Answer => return None,
    };
    Some(match choice {
        PermissionChoice::Allow => Verdict {
            decision: ApprovalDecision::Allow { request_id },
            payload: Some(allow_payload(approval)),
            passed_on: PassedOn::default(),
            mode_after: None,
        },
        PermissionChoice::AllowKeep => {
            // A place means something only to a rule; a mode switch or a directory grant is
            // kept where it was offered.
            let place = state
                .and_then(|it| it.destination.as_deref())
                .filter(|_| offers_destination(&card.suggestions));
            let kept = kept_suggestions(&card.suggestions, place);
            Verdict {
                decision: ApprovalDecision::Allow { request_id },
                payload: Some(allow_payload(approval)),
                passed_on: passed_on(approval, &kept),
                mode_after: None,
            }
        }
        PermissionChoice::Deny => {
            let note = state.map_or("", |it| kt_trim(&it.note));
            Verdict {
                decision: ApprovalDecision::Deny { request_id },
                payload: (!note.is_empty()).then(|| note.to_owned()),
                passed_on: PassedOn::default(),
                mode_after: None,
            }
        }
    })
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used)]
mod tests {
    use closta_presenter::cards::{QuestionOption, QuestionView};

    use super::*;

    fn card() -> QuestionCard {
        let options = |labels: &[&str]| {
            labels
                .iter()
                .map(|it| QuestionOption {
                    label: (*it).to_owned(),
                    description: None,
                })
                .collect()
        };
        QuestionCard {
            request_id: "r".to_owned(),
            questions: vec![
                QuestionView {
                    text: "one".to_owned(),
                    header: None,
                    multi_select: false,
                    options: options(&["A", "B"]),
                },
                QuestionView {
                    text: "two".to_owned(),
                    header: None,
                    multi_select: true,
                    options: options(&["X", "Y", "Z"]),
                },
            ],
            answered: None,
            failure: None,
        }
    }

    fn fresh() -> CardState {
        CardState::for_card(&ThreadCard::Question(card()))
    }

    #[test]
    fn a_single_choice_keeps_one_and_other_replaces_it() {
        let mut state = fresh();
        state.toggle_option(0, 0, false);
        state.toggle_option(0, 1, false);
        assert_eq!(state.picks[0].chosen, vec![1]);
        state.toggle_other(0, false);
        assert!(state.picks[0].chosen.is_empty());
        assert!(state.picks[0].other);
        state.toggle_option(0, 0, false);
        assert_eq!(state.picks[0].chosen, vec![0]);
        assert!(!state.picks[0].other);
        state.toggle_option(0, 0, false);
        assert!(state.picks[0].chosen.is_empty());
        state.toggle_other(0, false);
        state.toggle_other(0, false);
        assert!(!state.picks[0].other);
    }

    #[test]
    fn multi_choices_toggle_each() {
        let mut state = fresh();
        state.toggle_option(1, 2, true);
        state.toggle_option(1, 0, true);
        state.toggle_other(1, true);
        assert_eq!(state.picks[1].chosen, vec![0, 2]);
        assert!(state.picks[1].other);
        state.toggle_option(1, 2, true);
        assert_eq!(state.picks[1].chosen, vec![0]);
        assert!(state.picks[1].other);
        assert_eq!(state.picks[0], OptionPicks::default());
    }

    #[test]
    fn typing_other_chooses_it() {
        let mut state = fresh();
        state.toggle_option(0, 1, false);
        state.edit_other(0, "C", false);
        assert!(state.picks[0].other);
        assert!(state.picks[0].chosen.is_empty());
        state.edit_other(0, "CD", false);
        assert!(state.picks[0].other);
        assert_eq!(state.picks[0].other_text, "CD");
        state.toggle_option(1, 1, true);
        state.edit_other(1, "   ", true);
        assert!(!state.picks[1].other);
        state.edit_other(1, "W", true);
        assert!(state.picks[1].other);
        assert_eq!(state.picks[1].chosen, vec![1]);
    }

    #[test]
    fn picks_read_as_labels_and_the_other_line() {
        let mut state = fresh();
        state.toggle_option(0, 1, false);
        state.toggle_option(1, 2, true);
        state.toggle_option(1, 0, true);
        state.edit_other(0, "kept off", false);
        state.toggle_other(0, false);
        state.toggle_other(1, true);
        state.edit_other(1, " W ", true);
        let picks = state.question_picks(&card());
        assert_eq!(picks[0].question, "one");
        assert_eq!(picks[0].chosen, Vec::<String>::new());
        assert_eq!(picks[0].other, None);
        assert_eq!(picks[1].chosen, vec!["X".to_owned(), "Z".to_owned()]);
        assert_eq!(picks[1].other.as_deref(), Some(" W "));
    }
}
