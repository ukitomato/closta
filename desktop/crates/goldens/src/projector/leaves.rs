//! What a tool call holds from the CLI, made safe for the place it goes (ToolLeaves.kt).

use closta_presenter::json::{MAX_DEPTH, compact, fits, parse};
use closta_presenter::transcript::ToolResult;
use serde_json::{Map, Value};

pub(crate) struct ToolLeaves {
    pub args_text: String,
    /// Always an object.
    pub args: Value,
    pub result: Option<Value>,
    pub is_error: Option<bool>,
}

/// `args` is the snapshot's input when it came, else what `args_text` parses to once its stream
/// has stopped: parsing every fragment while it streams would read the input over and over, and a
/// fragment rarely parses.
///
/// Values from the CLI go into the tree only when they fit where they go: no member that reaches
/// a prototype and no deeper than the room left under `level`. A value that does not fit is folded
/// into its JSON text, which keeps what it said; `args` must stay an object, so it becomes empty,
/// and `argsText` still has the text.
pub(crate) fn tool_leaves(
    args_text: &str,
    input: Option<&Value>,
    result: Option<&ToolResult>,
    level: usize,
    streaming: bool,
) -> ToolLeaves {
    let room = MAX_DEPTH.saturating_sub(level);
    let candidate = match input {
        Some(Value::Object(fields)) => Some(fields.clone()),
        _ if !streaming && !args_text.is_empty() => match parse(args_text) {
            Some(Value::Object(fields)) => Some(fields),
            _ => None,
        },
        _ => None,
    }
    .unwrap_or_default();
    let candidate = Value::Object(candidate);
    let args = if fits(&candidate, room) {
        candidate
    } else {
        Value::Object(Map::new())
    };
    let shown = result.and_then(|it| it.content.as_deref()).map(|content| {
        if fits(content, room) {
            content.clone()
        } else {
            Value::String(compact(content))
        }
    });
    ToolLeaves {
        args_text: args_text.to_owned(),
        args,
        result: shown,
        is_error: result.and_then(|it| it.is_error),
    }
}
