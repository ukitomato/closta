//! A `stream_event` frame: the main conversation's content as it is generated (StreamFold.kt).

use std::sync::Arc;

use closta_model::RawJson;
use serde_json::{Map, Value};

use crate::fold::paths::{add_part, update_part, with_routing};
use crate::fold::routing::{TEXT, THINKING, part_of, route_top_level, with_route};
use crate::json::{JsonFields, parse};
use crate::transcript::{AnthropicRoute, PartRecord, TextRecord, ToolCallRecord, Transcript};

/// Folds one `stream_event` frame. A frame that claims a sub-agent (`parent_tool_use_id`) is left
/// alone — a sub-agent's content is taken from its `assistant` lines, and the frame would be routed
/// into the main conversation's message.
pub fn fold_stream(
    transcript: &Arc<Transcript>,
    frame: &RawJson,
    parent_tool_use_id: Option<&str>,
) -> Arc<Transcript> {
    if parent_tool_use_id.is_some() {
        return Arc::clone(transcript);
    }
    let Some(Value::Object(frame)) = parse(&frame.0) else {
        return Arc::clone(transcript);
    };
    match frame.string("type") {
        Some("message_start") => start_message(transcript, &frame),
        Some("content_block_start") => with_block(transcript, &frame, |id, route, index| {
            start_block(transcript, id, route, index, &frame)
        }),
        Some("content_block_delta") => with_block(transcript, &frame, |_, route, index| {
            append_delta(transcript, route, index, &frame)
        }),
        Some("content_block_stop") => with_block(transcript, &frame, |_, route, index| {
            stop_block(transcript, route, index)
        }),
        Some("message_stop") => {
            let mut routing = transcript.routing.clone();
            routing.streaming = None;
            with_routing(transcript, routing)
        }
        _ => Arc::clone(transcript),
    }
}

fn start_message(transcript: &Arc<Transcript>, frame: &Map<String, Value>) -> Arc<Transcript> {
    let Some(id) = frame.obj("message").and_then(|it| it.string("id")) else {
        return Arc::clone(transcript);
    };
    let routed = route_top_level(transcript, id);
    let mut routing = routed.routing.clone();
    routing.streaming = Some(id.to_owned());
    with_routing(&routed, routing)
}

/// Folds a block frame of the message that is streaming, when there is one and the frame names
/// its index.
fn with_block(
    transcript: &Arc<Transcript>,
    frame: &Map<String, Value>,
    fold: impl FnOnce(&str, &AnthropicRoute, i32) -> Arc<Transcript>,
) -> Arc<Transcript> {
    let routing = &transcript.routing;
    let id = routing.streaming.as_deref();
    let route = id.and_then(|it| routing.anthropic.get(it));
    let index = frame.index("index").and_then(|it| i32::try_from(it).ok());
    match (id, route, index) {
        (Some(id), Some(route), Some(index)) => fold(id, route, index),
        _ => Arc::clone(transcript),
    }
}

fn start_block(
    transcript: &Arc<Transcript>,
    id: &str,
    route: &AnthropicRoute,
    index: i32,
    frame: &Map<String, Value>,
) -> Arc<Transcript> {
    let Some(block) = frame.obj("content_block") else {
        return Arc::clone(transcript);
    };
    if route.streamed.contains_key(&index) {
        return Arc::clone(transcript);
    }
    let (key, record) = part_of(id, index, block, true);
    let streamed = AnthropicRoute {
        streamed: route.streamed.update(index, key.clone()),
        ..route.clone()
    };
    let with_part = if transcript.routing.tools.contains_key(&key) {
        Arc::clone(transcript)
    } else {
        add_part(transcript, &route.location, &key, record)
    };
    with_route(&with_part, id, streamed)
}

fn append_delta(
    transcript: &Arc<Transcript>,
    route: &AnthropicRoute,
    index: i32,
    frame: &Map<String, Value>,
) -> Arc<Transcript> {
    let (Some(key), Some(delta)) = (route.streamed.get(&index), frame.obj("delta")) else {
        return Arc::clone(transcript);
    };
    let location = transcript.routing.tools.get(key).unwrap_or(&route.location);
    match delta.string("type") {
        Some("text_delta") => append_text(transcript, location, key, false, delta.string(TEXT)),
        Some("thinking_delta") => {
            append_text(transcript, location, key, true, delta.string(THINKING))
        }
        Some("input_json_delta") => {
            append_args(transcript, location, key, delta.string("partial_json"))
        }
        // signature_delta and whatever comes later show nothing.
        _ => Arc::clone(transcript),
    }
}

fn append_text(
    transcript: &Arc<Transcript>,
    location: &[String],
    key: &str,
    reasoning: bool,
    more: Option<&str>,
) -> Arc<Transcript> {
    let Some(more) = more.filter(|it| !it.is_empty()) else {
        return Arc::clone(transcript);
    };
    update_part(transcript, location, key, |part| match part.as_ref() {
        PartRecord::Text(text) if text.streaming && text.reasoning == reasoning => {
            Arc::new(PartRecord::Text(TextRecord {
                text: format!("{}{more}", text.text),
                ..text.clone()
            }))
        }
        _ => Arc::clone(part),
    })
}

// A delta lands only while its block streams: a part made from a snapshot that came before the
// block's start already holds the whole block, and appending would write it twice.
fn append_args(
    transcript: &Arc<Transcript>,
    location: &[String],
    key: &str,
    more: Option<&str>,
) -> Arc<Transcript> {
    let Some(more) = more.filter(|it| !it.is_empty()) else {
        return Arc::clone(transcript);
    };
    update_part(transcript, location, key, |part| match part.as_ref() {
        PartRecord::ToolCall(call) if call.streaming => {
            Arc::new(PartRecord::ToolCall(ToolCallRecord {
                args_text: format!("{}{more}", call.args_text),
                ..call.clone()
            }))
        }
        _ => Arc::clone(part),
    })
}

fn stop_block(transcript: &Arc<Transcript>, route: &AnthropicRoute, index: i32) -> Arc<Transcript> {
    let Some(key) = route.streamed.get(&index) else {
        return Arc::clone(transcript);
    };
    let location = transcript.routing.tools.get(key).unwrap_or(&route.location);
    update_part(transcript, location, key, |part| match part.as_ref() {
        PartRecord::Text(text) if text.streaming => Arc::new(PartRecord::Text(TextRecord {
            streaming: false,
            ..text.clone()
        })),
        PartRecord::ToolCall(call) if call.streaming => {
            Arc::new(PartRecord::ToolCall(ToolCallRecord {
                streaming: false,
                ..call.clone()
            }))
        }
        _ => Arc::clone(part),
    })
}
