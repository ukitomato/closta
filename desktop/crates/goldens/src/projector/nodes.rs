//! The tree's vocabulary is the protocol's, field for field (TreeNodes.kt); nothing here adds a key
//! of its own, because the webview passes unknown keys on to assistant-ui untouched.

use closta_model::AttachmentKind;
use closta_presenter::records::attachment::AttachmentRecord;
use closta_presenter::transcript::{ApprovalRecord, OtherRecord, Role, TextRecord};
use serde_json::{Map, Value, json};

use super::approvals::{answer_nodes, input_node, question_node, settled, suggestion_node};
use super::leaves::ToolLeaves;
use super::question::Question;

/// The levels of the tree's fixed skeleton, the root being 1 (`MAX_DEPTH` counts the same way):
/// root, `threads`, its `byId`, the thread, `messages`, its `byId`, the message, `parts`, its
/// `byId`, the part.
pub(crate) mod levels {
    pub const THREAD: usize = 4;
    pub const TOP_MESSAGES: usize = THREAD + 1;

    // From a collection to an entity in it: the collection, its byId, the entity.
    const COLLECTION_TO_ENTITY: usize = 2;

    /// The level of a message whose collection sits at `collection`.
    pub fn message_in(collection: usize) -> usize {
        collection + COLLECTION_TO_ENTITY
    }

    /// The level of a part of a message at `message`: `parts` is one below the message.
    pub fn part_of(message: usize) -> usize {
        message + 1 + COLLECTION_TO_ENTITY
    }

    /// The level of the collection of messages nested under a part at `part`.
    pub fn nested_under(part: usize) -> usize {
        part + 1
    }
}

/// A status of a message or part.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Status {
    Running,
    RequiresAction,
    Complete,
    CompleteStop,
    CompleteUnknown,
    Cancelled,
    /// A failure; its node carries the error.
    Failed,
}

impl Status {
    /// Whether the work it describes was cut off or failed.
    pub fn incomplete(self) -> bool {
        matches!(self, Self::Cancelled | Self::Failed)
    }
}

/// How a node is drawn besides its record: its status, and the approval on it.
#[derive(Clone, Debug, Default)]
pub(crate) struct Look {
    pub status: Option<Status>,
    pub error: Option<String>,
    pub approval: Option<Value>,
}

impl Look {
    pub fn of(status: Status) -> Self {
        Self {
            status: Some(status),
            ..Self::default()
        }
    }
}

/// The node of `status`, with `error` when it is [`Status::Failed`] and the failure said something.
pub(crate) fn status_node(status: Status, error: Option<&str>) -> Value {
    match status {
        Status::Running => json!({ "type": "running" }),
        Status::RequiresAction => json!({ "type": "requires-action", "reason": "interrupt" }),
        Status::Complete => json!({ "type": "complete" }),
        Status::CompleteStop => json!({ "type": "complete", "reason": "stop" }),
        Status::CompleteUnknown => json!({ "type": "complete", "reason": "unknown" }),
        Status::Cancelled => json!({ "type": "incomplete", "reason": "cancelled" }),
        Status::Failed => {
            let mut node = Map::new();
            node.insert("type".into(), "incomplete".into());
            node.insert("reason".into(), "error".into());
            if let Some(error) = error.filter(|it| !it.is_empty()) {
                node.insert("error".into(), error.into());
            }
            Value::Object(node)
        }
    }
}

/// A collection: the keys in order and the entries by key.
pub(crate) fn collection_node(entries: Vec<(String, Value)>) -> Value {
    let order: Vec<Value> = entries
        .iter()
        .map(|(key, _)| Value::String(key.clone()))
        .collect();
    let by_id: Map<String, Value> = entries.into_iter().collect();
    json!({ "order": order, "byId": by_id })
}

pub(crate) fn message_node(key: &str, role: Role, look: &Look, parts: Value) -> Value {
    let mut node = Map::new();
    node.insert("id".into(), key.into());
    node.insert("role".into(), role.wire().into());
    if let Some(status) = look.status {
        node.insert("status".into(), status_node(status, look.error.as_deref()));
    }
    node.insert("parts".into(), parts);
    Value::Object(node)
}

pub(crate) fn text_node(record: &TextRecord, status: Option<Status>) -> Value {
    let mut node = Map::new();
    let kind = if record.reasoning {
        "reasoning"
    } else {
        "text"
    };
    node.insert("type".into(), kind.into());
    node.insert("text".into(), record.text.as_str().into());
    if let Some(status) = status {
        node.insert("status".into(), status_node(status, None));
    }
    Value::Object(node)
}

/// The part kinds the protocol knows. A block of an unknown type spelled like one of them would
/// claim fields it lacks, and one without a type names nothing, so both show as `unknown`.
const KNOWN_PART_TYPES: [&str; 4] = ["text", "reasoning", "tool-call", "attachment"];

pub(crate) fn other_node(record: &OtherRecord) -> Value {
    let kind = if record.r#type.is_empty() || KNOWN_PART_TYPES.contains(&record.r#type.as_str()) {
        "unknown"
    } else {
        record.r#type.as_str()
    };
    json!({ "type": kind })
}

/// The part of the tree for an attachment: its name, kind, media type and size, and nothing of
/// its content (AttachmentRecords.kt's `attachmentNode`).
pub(crate) fn attachment_node(record: &AttachmentRecord) -> Value {
    let kind = match record.kind {
        AttachmentKind::Image => "image",
        AttachmentKind::Document => "document",
        AttachmentKind::Text => "text",
    };
    json!({
        "type": "attachment",
        "name": record.name,
        "kind": kind,
        "mediaType": record.media_type,
        "size": record.size,
    })
}

pub(crate) fn tool_call_node(
    key: &str,
    tool_name: &str,
    leaves: ToolLeaves,
    look: Look,
    messages: Option<Value>,
) -> Value {
    let mut node = Map::new();
    node.insert("type".into(), "tool-call".into());
    node.insert("toolCallId".into(), key.into());
    node.insert("toolName".into(), tool_name.into());
    node.insert("argsText".into(), leaves.args_text.into());
    node.insert("args".into(), leaves.args);
    if let Some(result) = leaves.result {
        node.insert("result".into(), result);
    }
    if let Some(is_error) = leaves.is_error {
        node.insert("isError".into(), is_error.into());
    }
    if let Some(status) = look.status {
        node.insert("status".into(), status_node(status, look.error.as_deref()));
    }
    if let Some(approval) = look.approval {
        node.insert("approval".into(), approval);
    }
    if let Some(messages) = messages {
        node.insert("messages".into(), messages);
    }
    Value::Object(node)
}

/// An approval as the tree shows it. A question shows its options when they can be read
/// (`question`); one that cannot be answered by choosing shows as a decision, with the question's
/// text when that can be read. While it is pending it says only what is asked; once it is not, it
/// says how it ended — the host's answer, or cancelled when the CLI stopped waiting without one (a
/// `result` discarded it).
pub(crate) fn approval_node(
    record: &ApprovalRecord,
    pending: bool,
    question: Option<&Question>,
    level: usize,
) -> Value {
    let mut node = Map::new();
    node.insert("id".into(), record.request_id.as_str().into());
    let choices = question.map(|it| it.options.as_slice()).unwrap_or_default();
    let display = if choices.is_empty() {
        "decision"
    } else {
        "select"
    };
    node.insert("display".into(), display.into());
    if let Some(prompt) = question.and_then(|it| it.prompt.as_deref()) {
        node.insert("prompt".into(), prompt.into());
    }
    if !choices.is_empty() {
        // An answer is chosen by its label: that is what `updatedInput.answers` carries back
        // (capture 14).
        let options: Vec<Value> = choices
            .iter()
            .map(|option| {
                let mut entry = Map::new();
                entry.insert("id".into(), option.id.as_str().into());
                entry.insert("kind".into(), "answer".into());
                entry.insert("label".into(), option.label.as_str().into());
                if let Some(description) = &option.description {
                    entry.insert("description".into(), description.as_str().into());
                }
                Value::Object(entry)
            })
            .collect();
        node.insert("options".into(), options.into());
    }
    if let Some(input) = input_node(record, level) {
        node.insert("input".into(), input);
    }
    if !record.suggestions.is_empty() {
        let suggestions: Vec<Value> = record.suggestions.iter().map(suggestion_node).collect();
        node.insert("suggestions".into(), suggestions.into());
    }
    if let Some(question) = question.filter(|it| !it.questions.is_empty()) {
        let questions: Vec<Value> = question.questions.iter().map(question_node).collect();
        node.insert("questions".into(), questions.into());
    }
    if !pending {
        settled(&mut node, record.outcome);
    }
    answer_nodes(&mut node, record, level);
    Value::Object(node)
}
