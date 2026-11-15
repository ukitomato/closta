//! The `assistant` and `user` lines: finished blocks and tool results (SnapshotFold.kt).

use std::cell::OnceCell;
use std::sync::Arc;

use closta_model::RawJson;
use serde_json::{Map, Value};

use crate::fold::paths::{add_part, message_at, update_part};
use crate::fold::routing::{TEXT, part_of, route_nested, route_top_level, with_route};
use crate::json::{JsonFields, parse};
use crate::keyed::{Keyed, of_cli_id};
use crate::records::tasks::AGENT_TOOLS;
use crate::transcript::{
    AnthropicRoute, MessageRecord, MessageSource, PartRecord, Role, TextRecord, ToolCallRecord,
    ToolResult, Transcript,
};

const TOOL_RESULT: &str = "tool_result";

/// An `assistant` line: the next finished blocks of an Anthropic message, the main conversation's
/// or a sub-agent's (under the call `parent`).
pub fn fold_assistant(
    transcript: &Arc<Transcript>,
    message: &RawJson,
    parent: Option<&str>,
) -> Arc<Transcript> {
    let Some(Value::Object(message)) = parse(&message.0) else {
        return Arc::clone(transcript);
    };
    let (Some(id), Some(content)) = (message.string("id"), message.array("content")) else {
        return Arc::clone(transcript);
    };
    let routed = match parent {
        None => Some(route_top_level(transcript, id)),
        Some(parent) => route_nested(transcript, id, parent),
    };
    match routed {
        Some(routed) => snapshot_blocks(&routed, id, content),
        None => Arc::clone(transcript),
    }
}

fn snapshot_blocks(transcript: &Arc<Transcript>, id: &str, content: &[Value]) -> Arc<Transcript> {
    let Some(route) = transcript.routing.anthropic.get(id) else {
        return Arc::clone(transcript);
    };
    let mut next = Arc::clone(transcript);
    for (offset, block) in content.iter().enumerate() {
        if let Value::Object(block) = block {
            let index = route.blocks.wrapping_add(as_i32(offset));
            next = snapshot_block(&next, id, index, block, &route.location);
        }
    }
    let counted = AnthropicRoute {
        blocks: route.blocks.wrapping_add(as_i32(content.len())),
        ..route.clone()
    };
    with_route(&next, id, counted)
}

// Kotlin's `Int` arithmetic on a list position: it wraps rather than fails.
#[expect(
    clippy::cast_possible_truncation,
    clippy::cast_possible_wrap,
    reason = "Kotlin's Int wraps the same way"
)]
fn as_i32(n: usize) -> i32 {
    n as i32
}

/// A finished block. Its text is the authority — normally what streamed, verbatim — and a part
/// that never streamed is made here, already finished. A tool call gets its whole input; its
/// `args_text` keeps what streamed, and is the input's JSON only when nothing did.
fn snapshot_block(
    transcript: &Arc<Transcript>,
    id: &str,
    index: i32,
    block: &Map<String, Value>,
    location: &[String],
) -> Arc<Transcript> {
    let (key, made) = part_of(id, index, block, false);
    let at = transcript
        .routing
        .tools
        .get(&key)
        .map_or(location, |it| &it[..]);
    let exists = message_at(&transcript.messages, at).is_some_and(|it| it.parts.contains(&key));
    if !exists {
        return add_part(transcript, at, &key, made);
    }
    update_part(transcript, at, &key, |existing| {
        match (existing.as_ref(), &made) {
            (PartRecord::Text(old), PartRecord::Text(new)) if old.reasoning == new.reasoning => {
                if old.text == new.text {
                    Arc::clone(existing)
                } else {
                    Arc::new(PartRecord::Text(TextRecord {
                        text: new.text.clone(),
                        ..old.clone()
                    }))
                }
            }
            (PartRecord::ToolCall(old), PartRecord::ToolCall(new)) => {
                let finished = ToolCallRecord {
                    input: new.input.clone(),
                    args_text: if old.args_text.is_empty() {
                        new.args_text.clone()
                    } else {
                        old.args_text.clone()
                    },
                    ..old.clone()
                };
                if finished == *old {
                    Arc::clone(existing)
                } else {
                    Arc::new(PartRecord::ToolCall(finished))
                }
            }
            _ => Arc::clone(existing),
        }
    })
}

/// A `user` line carries the results of tool calls, wherever those calls are. Its text is shown
/// only for a sub-agent (under the call `parent`) — that is the prompt the sub-agent was given; the
/// user's own words came from the host.
pub fn fold_user(
    transcript: &Arc<Transcript>,
    message: &RawJson,
    parent: Option<&str>,
    uuid: &str,
    tool_use_result: Option<&RawJson>,
) -> Arc<Transcript> {
    let Some(Value::Object(message)) = parse(&message.0) else {
        return Arc::clone(transcript);
    };
    match message.get("content") {
        Some(Value::String(prompt)) => parent.map_or_else(
            || Arc::clone(transcript),
            |parent| nested_prompt(transcript, parent, uuid, &[(0, prompt.as_str())]),
        ),
        Some(Value::Array(items)) => {
            let mut next = Arc::clone(transcript);
            let mut texts: Vec<(usize, &str)> = Vec::new();
            // Read only for a sub-agent's call: another tool's carries its whole output, not worth
            // a second parse.
            let duration = OnceCell::new();
            let duration = || {
                *duration.get_or_init(|| {
                    tool_use_result.and_then(|it| tool_result_duration(parse(&it.0).as_ref()))
                })
            };
            for (index, item) in items.iter().enumerate() {
                let Value::Object(block) = item else {
                    continue;
                };
                match block.string("type") {
                    Some(TOOL_RESULT) => next = tool_result(&next, block, &duration),
                    Some(TEXT) => {
                        if let Some(text) = block.string(TEXT) {
                            texts.push((index, text));
                        }
                    }
                    _ => {}
                }
            }
            match parent {
                Some(parent) if !texts.is_empty() => nested_prompt(&next, parent, uuid, &texts),
                _ => next,
            }
        }
        _ => Arc::clone(transcript),
    }
}

/// How long a sub-agent ran, from the `tool_use_result` (`AgentOutput.totalDurationMs`); `None`
/// for another shape.
pub fn tool_result_duration(tool_use_result: Option<&Value>) -> Option<i64> {
    tool_use_result?.get("totalDurationMs")?.as_i64()
}

fn tool_result(
    transcript: &Arc<Transcript>,
    block: &Map<String, Value>,
    duration_ms: &dyn Fn() -> Option<i64>,
) -> Arc<Transcript> {
    let Some(key) = block.string("tool_use_id").map(of_cli_id) else {
        return Arc::clone(transcript);
    };
    let Some(location) = transcript.routing.tools.get(&key) else {
        return Arc::clone(transcript);
    };
    update_part(transcript, location, &key, |part| {
        let PartRecord::ToolCall(call) = part.as_ref() else {
            return Arc::clone(part);
        };
        let took = if AGENT_TOOLS.contains(&call.tool_name.as_str()) {
            duration_ms()
        } else {
            None
        };
        let result = ToolResult {
            content: block.get("content").map(|it| Arc::new(it.clone())),
            is_error: block.get("is_error").and_then(Value::as_bool),
            duration_ms: took,
        };
        if call.result.as_ref() == Some(&result) {
            Arc::clone(part)
        } else {
            Arc::new(PartRecord::ToolCall(ToolCallRecord {
                result: Some(result),
                ..call.clone()
            }))
        }
    })
}

/// The prompt a sub-agent was given, as a user message under the call that started it.
fn nested_prompt(
    transcript: &Arc<Transcript>,
    parent: &str,
    uuid: &str,
    texts: &[(usize, &str)],
) -> Arc<Transcript> {
    let parent_key = of_cli_id(parent);
    let Some(location) = transcript.routing.tools.get(&parent_key) else {
        return Arc::clone(transcript);
    };
    update_part(transcript, location, &parent_key, |part| {
        let PartRecord::ToolCall(call) = part.as_ref() else {
            return Arc::clone(part);
        };
        // Its key is claimed like any other message's, so a line that repeats a uuid adds rather
        // than replaces.
        let key = call.messages.claim(&of_cli_id(uuid));
        let parts = texts.iter().fold(Keyed::new(), |parts, (index, text)| {
            parts.put(
                format!("{key}:{index}"),
                Arc::new(PartRecord::Text(TextRecord {
                    reasoning: false,
                    text: (*text).to_owned(),
                    streaming: false,
                })),
            )
        });
        let message = MessageRecord {
            key: key.clone(),
            role: Role::User,
            source: MessageSource::Nested,
            parts,
        };
        Arc::new(PartRecord::ToolCall(ToolCallRecord {
            messages: call.messages.put(key, Arc::new(message)),
            ..call.clone()
        }))
    })
}
