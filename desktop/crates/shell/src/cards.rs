//! What the shell keeps of a waiting card (the note, the place to keep a rule, the question's
//! picks, when it was first drawn) and what answering a permission card sends.

use std::fmt;

use closta_model::ApprovalDecision;
use closta_presenter::cards::decisions::{
    PermissionChoice, RULE_KINDS, kept_suggestions, offers_destination, permission_choice,
};
use closta_presenter::cards::plan::PlanGo;
use closta_presenter::cards::{ThreadCard, allow_payload, card_of, passed_on};
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
    /// Deny with the card's note, if it has one.
    Deny,
}

/// What goes to the session to answer a card.
pub struct Verdict {
    pub decision: ApprovalDecision,
    pub payload: Option<String>,
    pub passed_on: PassedOn,
}

/// The answer `reply` gives to a permission or edit card of `approval`; `None` for a card of
/// another kind, or a button the card does not have.
pub fn verdict(
    approval: &ApprovalRecord,
    go: PlanGo,
    state: Option<&CardState>,
    reply: Reply,
) -> Option<Verdict> {
    let ThreadCard::Permission(card) = card_of(approval, go) else {
        return None;
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
    };
    Some(match choice {
        PermissionChoice::Allow => Verdict {
            decision: ApprovalDecision::Allow { request_id },
            payload: Some(allow_payload(approval)),
            passed_on: PassedOn::default(),
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
            }
        }
        PermissionChoice::Deny => {
            let note = state.map_or("", |it| kt_trim(&it.note));
            Verdict {
                decision: ApprovalDecision::Deny { request_id },
                payload: (!note.is_empty()).then(|| note.to_owned()),
                passed_on: PassedOn::default(),
            }
        }
    })
}
