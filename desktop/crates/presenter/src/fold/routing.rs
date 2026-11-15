//! Where an Anthropic message's content goes, and the part a block makes (ContentRouting.kt).
//!
//! The content of a turn arrives twice for the main conversation — streamed as raw SSE frames in
//! `stream_event` lines, and as one `assistant` line per finished block — and once for a
//! sub-agent, which never streams (in the captures, no `stream_event` carries
//! `parent_tool_use_id`). Both kinds of line write the same parts: a streamed block's part is
//! keyed by its index, and the k-th block the `assistant` lines carry for a message is the block
//! with index k, so the snapshot finds the part the stream made.

use std::sync::Arc;

use serde_json::{Map, Value};

use crate::fold::paths::{message_at, update_part, with_routing};
use crate::json::{JsonFields, compact};
use crate::keyed::of_cli_id;
use crate::transcript::{
    AnthropicRoute, MessageRecord, MessageSource, OtherRecord, PartRecord, Role, TextRecord,
    ToolCallRecord, Transcript,
};

pub(crate) const TEXT: &str = "text";
pub(crate) const THINKING: &str = "thinking";
const TOOL_USE: &str = "tool_use";

/// The route of the Anthropic message `id` set to `route`.
pub(crate) fn with_route(
    transcript: &Arc<Transcript>,
    id: &str,
    route: AnthropicRoute,
) -> Arc<Transcript> {
    let mut routing = transcript.routing.clone();
    routing.anthropic.insert(id.to_owned(), route);
    with_routing(transcript, routing)
}

fn route_to(location: Vec<String>) -> AnthropicRoute {
    AnthropicRoute {
        location: Arc::from(location),
        ..AnthropicRoute::default()
    }
}

/// Routes the Anthropic message `id` of the main conversation, once: to the turn receiving
/// content, else to the open spontaneous resume, else to a new resume keyed by this message —
/// after a background task the CLI speaks on its own (captures 10 and 11).
pub fn route_top_level(transcript: &Arc<Transcript>, id: &str) -> Arc<Transcript> {
    let routing = &transcript.routing;
    if routing.anthropic.contains_key(id) {
        return Arc::clone(transcript);
    }
    if let Some(target) = routing
        .current_turn
        .as_ref()
        .or(routing.open_resume.as_ref())
    {
        return with_route(transcript, id, route_to(vec![target.clone()]));
    }
    let key = transcript.messages.claim(&of_cli_id(id));
    let message = MessageRecord {
        key: key.clone(),
        role: Role::Assistant,
        source: MessageSource::Resume { end: None },
        parts: Default::default(),
    };
    let mut routing = routing.clone();
    routing.open_resume = Some(key.clone());
    routing
        .anthropic
        .insert(id.to_owned(), route_to(vec![key.clone()]));
    Arc::new(Transcript {
        messages: transcript.messages.put(key, Arc::new(message)),
        routing,
        ..Transcript::clone(transcript)
    })
}

/// Routes a sub-agent's Anthropic message `id` under the tool call that started the sub-agent
/// (`parent` is that call's `tool_use_id`). `None` when no such call is known: the call's own block
/// always arrives first in the captures, and content for a call that does not exist has nowhere to
/// go in the tree.
pub fn route_nested(
    transcript: &Arc<Transcript>,
    id: &str,
    parent: &str,
) -> Option<Arc<Transcript>> {
    if transcript.routing.anthropic.contains_key(id) {
        return Some(Arc::clone(transcript));
    }
    let parent_key = of_cli_id(parent);
    let location = transcript.routing.tools.get(&parent_key)?;
    let part = message_at(&transcript.messages, location)?
        .parts
        .get(&parent_key)?;
    let PartRecord::ToolCall(call) = part.as_ref() else {
        return None;
    };
    Some(nest(transcript, id, location, &parent_key, call))
}

// `location` is that of the message holding the call, `call_key` the call's key.
fn nest(
    transcript: &Arc<Transcript>,
    id: &str,
    location: &[String],
    call_key: &str,
    call: &ToolCallRecord,
) -> Arc<Transcript> {
    let key = call.messages.claim(&of_cli_id(id));
    let nested = Arc::new(MessageRecord {
        key: key.clone(),
        role: Role::Assistant,
        source: MessageSource::Nested,
        parts: Default::default(),
    });
    let with_message = update_part(transcript, location, call_key, |part| match part.as_ref() {
        PartRecord::ToolCall(call) => Arc::new(PartRecord::ToolCall(ToolCallRecord {
            messages: call.messages.put(key.clone(), nested),
            ..call.clone()
        })),
        _ => Arc::clone(part),
    });
    let mut under = location.to_vec();
    under.push(call_key.to_owned());
    under.push(key);
    with_route(&with_message, id, route_to(under))
}

/// The part a block makes, and its key: the tool call's own id, else the block's place in its
/// message.
pub fn part_of(
    id: &str,
    index: i32,
    block: &Map<String, Value>,
    streaming: bool,
) -> (String, PartRecord) {
    let r#type = block.string("type");
    let text = |reasoning: bool, field: &str| {
        PartRecord::Text(TextRecord {
            reasoning,
            text: block.string(field).unwrap_or_default().to_owned(),
            streaming,
        })
    };
    match (r#type, block.string("id")) {
        (Some(TEXT), _) => (format!("{id}:{index}"), text(false, TEXT)),
        (Some(THINKING), _) => (format!("{id}:{index}"), text(true, THINKING)),
        (Some(TOOL_USE), Some(tool_use_id)) => {
            // The streamed start carries an empty placeholder input; only the snapshot's input is
            // the input.
            let input = if streaming { None } else { block.get("input") };
            let record = ToolCallRecord {
                tool_use_id: tool_use_id.to_owned(),
                tool_name: block.string("name").unwrap_or_default().to_owned(),
                args_text: input.map(compact).unwrap_or_default(),
                input: input.map(|it| Arc::new(it.clone())),
                streaming,
                ..ToolCallRecord::default()
            };
            (of_cli_id(tool_use_id), PartRecord::ToolCall(record))
        }
        _ => (
            format!("{id}:{index}"),
            PartRecord::Other(OtherRecord {
                r#type: r#type.unwrap_or_default().to_owned(),
            }),
        ),
    }
}
