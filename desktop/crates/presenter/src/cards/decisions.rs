//! What a card's buttons decide, where kept suggestions go, and how a question's picks become
//! its answers (CardDecisions.kt).

use crate::text::kt_trim;
use crate::transcript::SuggestionRecord;

use super::with_destination;

/// What pressing one of a permission card's buttons decides.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum PermissionChoice {
    Allow,
    AllowKeep,
    Deny,
}

/// What the button at `index` decides, in the card's order: Allow, then Always Allow when the
/// CLI offered something to keep (`has_suggestions`), then Deny. An index past the last button
/// denies.
pub fn permission_choice(index: usize, has_suggestions: bool) -> PermissionChoice {
    match index {
        0 => PermissionChoice::Allow,
        1 if has_suggestions => PermissionChoice::AllowKeep,
        _ => PermissionChoice::Deny,
    }
}

/// What the key or button at `index` decides in the sessions window's detail pane, which has the
/// conversation card's numbers but not its Always Allow (chosen in the conversation, where its
/// destination is): the conversation's answer ([`permission_choice`]), or `None` where that
/// answer keeps a suggestion. So with `has_suggestions` 2 does nothing and 3 denies, as in the
/// conversation.
pub fn detail_choice(index: usize, has_suggestions: bool) -> Option<PermissionChoice> {
    Some(permission_choice(index, has_suggestions)).filter(|it| *it != PermissionChoice::AllowKeep)
}

/// The suggestion kinds that save a permission rule, so a destination applies to them.
pub const RULE_KINDS: [&str; 3] = ["addRules", "replaceRules", "removeRules"];

/// Whether a save destination means anything for `suggestions`: only a rule suggestion is saved
/// somewhere.
pub fn offers_destination(suggestions: &[SuggestionRecord]) -> bool {
    suggestions
        .iter()
        .any(|it| RULE_KINDS.contains(&it.kind.as_str()))
}

/// The `suggestions` an allow keeps: each as the CLI offered it. When the user chose a
/// `destination` only the rule suggestions move there; a mode switch or a directory grant stays
/// where it was offered.
pub fn kept_suggestions(
    suggestions: &[SuggestionRecord],
    destination: Option<&str>,
) -> Vec<SuggestionRecord> {
    let Some(place) = destination else {
        return suggestions.to_vec();
    };
    suggestions
        .iter()
        .map(|it| {
            if !RULE_KINDS.contains(&it.kind.as_str()) || it.destination.as_deref() == Some(place) {
                it.clone()
            } else {
                with_destination(it, place)
            }
        })
        .collect()
}

/// One question as the user answered it: the labels `chosen`, and the `other` line when Other is
/// chosen.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct QuestionPick {
    pub question: String,
    pub chosen: Vec<String>,
    pub other: Option<String>,
}

/// The answers by question: the chosen labels and the Other line (trimmed, when not blank)
/// joined with ", ". As Kotlin's `associate`, a question given twice keeps its first place and
/// its last answer.
pub fn question_answers(picks: &[QuestionPick]) -> Vec<(String, String)> {
    let mut answers: Vec<(String, String)> = Vec::with_capacity(picks.len());
    for pick in picks {
        let answer = answer_of(pick);
        match answers
            .iter_mut()
            .find(|(question, _)| *question == pick.question)
        {
            Some(slot) => slot.1 = answer,
            None => answers.push((pick.question.clone(), answer)),
        }
    }
    answers
}

/// Whether every question in `picks` has an answer, so the answer may go.
pub fn questions_complete(picks: &[QuestionPick]) -> bool {
    picks.iter().all(|it| !answer_of(it).is_empty())
}

fn answer_of(pick: &QuestionPick) -> String {
    let other = pick
        .other
        .as_deref()
        .map(kt_trim)
        .filter(|it| !it.is_empty());
    pick.chosen
        .iter()
        .map(String::as_str)
        .chain(other)
        .collect::<Vec<_>>()
        .join(", ")
}
