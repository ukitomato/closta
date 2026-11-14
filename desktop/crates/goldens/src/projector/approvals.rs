//! The parts of an approval the tree shows besides its decision (ApprovalNodes.kt).

use closta_presenter::json::{MAX_DEPTH, fits};
use closta_presenter::transcript::{ApprovalOutcome, ApprovalRecord, SuggestionRecord};
use serde_json::{Map, Value};

use super::question::AskedQuestion;

/// One suggestion the CLI offered: its id, kind, detail and, when it has one, where it would be
/// kept.
pub(crate) fn suggestion_node(offered: &SuggestionRecord) -> Value {
    let mut node = Map::new();
    node.insert("id".into(), offered.id.as_str().into());
    node.insert("kind".into(), offered.kind.as_str().into());
    node.insert("detail".into(), offered.detail.as_str().into());
    if let Some(destination) = &offered.destination {
        node.insert("destination".into(), destination.as_str().into());
    }
    Value::Object(node)
}

/// One question of a call, with its own options. A question without text shows the empty prompt.
pub(crate) fn question_node(asked: &AskedQuestion) -> Value {
    let options: Vec<Value> = asked
        .options
        .iter()
        .map(|choice| {
            let mut entry = Map::new();
            entry.insert("id".into(), choice.id.as_str().into());
            entry.insert("label".into(), choice.label.as_str().into());
            if let Some(description) = &choice.description {
                entry.insert("description".into(), description.as_str().into());
            }
            Value::Object(entry)
        })
        .collect();
    let mut node = Map::new();
    node.insert("id".into(), asked.id.as_str().into());
    node.insert(
        "prompt".into(),
        asked.prompt.as_deref().unwrap_or_default().into(),
    );
    node.insert("multiSelect".into(), asked.multi_select.into());
    node.insert("options".into(), options.into());
    Value::Object(node)
}

/// The room left for a value held one level below the approval of a part at `level`.
fn room_under_approval(level: usize) -> usize {
    MAX_DEPTH.saturating_sub(level + 1)
}

/// What the host did with the answer and what it could not do: the suggestions it passed on, the
/// input it sent when that is not the request's own, and the sentence for the last answer that
/// did not go through with how many there were.
pub(crate) fn answer_nodes(node: &mut Map<String, Value>, record: &ApprovalRecord, level: usize) {
    if !record.accepted_suggestions.is_empty() {
        let accepted: Vec<Value> = record
            .accepted_suggestions
            .iter()
            .map(|it| Value::String(it.clone()))
            .collect();
        node.insert("acceptedSuggestions".into(), accepted.into());
    }
    if let Some(updated) = &record.updated_input {
        let updated = Value::Object(Map::clone(updated));
        if fits(&updated, room_under_approval(level)) {
            node.insert("updatedInput".into(), updated);
        }
    }
    if let Some(failure) = &record.failure {
        node.insert("failure".into(), failure.as_str().into());
    }
    if record.failures > 0 {
        node.insert("failures".into(), record.failures.into());
    }
}

/// How an approval that is no longer pending ended: the host's answer, or cancelled when none
/// came.
pub(crate) fn settled(node: &mut Map<String, Value>, outcome: Option<ApprovalOutcome>) {
    match outcome {
        Some(ApprovalOutcome::Approved) => node.insert("approved".into(), true.into()),
        Some(ApprovalOutcome::Denied) => node.insert("approved".into(), false.into()),
        Some(ApprovalOutcome::Expired) => node.insert("resolution".into(), "expired".into()),
        Some(ApprovalOutcome::Cancelled) | None => {
            node.insert("resolution".into(), "cancelled".into())
        }
    };
}

/// What the request would run with, for the webview to start a rewritten input from: the
/// request's `input` when it is an object that fits under the approval at `level` (the level of
/// the part the approval sits on, as for a tool call's `args`); an input that does not is left
/// out, as it is not an input to rewrite.
pub(crate) fn input_node(record: &ApprovalRecord, level: usize) -> Option<Value> {
    record
        .input
        .as_deref()
        .filter(|input| input.is_object() && fits(input, room_under_approval(level)))
        .cloned()
}
