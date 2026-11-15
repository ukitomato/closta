//! Paths to message records (TranscriptPaths.kt).
//!
//! A location is the path of keys to a message record: a top-level message key, then a tool-call
//! key and a nested message key for each level of sub-agent. Updates copy the records along the
//! path and nothing else; a change that leaves a record as it was returns the same `Arc`s all the
//! way up.

use std::sync::Arc;

use serde_json::Value;

use crate::keyed::{Keyed, of_cli_id};
use crate::transcript::{MessageRecord, PartRecord, Routing, ToolCallRecord, Transcript};

/// The message at `location`, or `None` when the path does not lead to one.
pub fn message_at<'a>(
    messages: &'a Keyed<MessageRecord>,
    location: &[String],
) -> Option<&'a Arc<MessageRecord>> {
    let message = messages.get(location.first()?)?;
    match location.get(1) {
        None => Some(message),
        Some(call_key) => match message.parts.get(call_key)?.as_ref() {
            PartRecord::ToolCall(call) => message_at(&call.messages, &location[2..]),
            _ => None,
        },
    }
}

/// The finished input of the tool call `tool_use_id`, wherever the call is (a sub-agent's too):
/// the `call` the projection reads a question from when the request's own input has none. `None`
/// when the call is not there or has no input yet.
pub fn call_input<'a>(transcript: &'a Transcript, tool_use_id: &str) -> Option<&'a Arc<Value>> {
    let key = of_cli_id(tool_use_id);
    let location = transcript.routing.tools.get(&key)?;
    match message_at(&transcript.messages, location)?
        .parts
        .get(&key)?
        .as_ref()
    {
        PartRecord::ToolCall(call) => call.input.as_ref(),
        _ => None,
    }
}

/// Replaces the message at `location` with `change` of it; a path that leads nowhere changes
/// nothing.
pub fn update_message_at(
    messages: &Keyed<MessageRecord>,
    location: &[String],
    change: impl FnOnce(&Arc<MessageRecord>) -> Arc<MessageRecord>,
) -> Keyed<MessageRecord> {
    let Some(key) = location.first() else {
        return messages.clone();
    };
    let Some(call_key) = location.get(1) else {
        return messages.update(key, change);
    };
    messages.update(key, |message| {
        let parts = message.parts.update(call_key, |part| match part.as_ref() {
            PartRecord::ToolCall(call) => {
                let nested = update_message_at(&call.messages, &location[2..], change);
                if nested.same(&call.messages) {
                    Arc::clone(part)
                } else {
                    Arc::new(PartRecord::ToolCall(ToolCallRecord {
                        messages: nested,
                        ..call.clone()
                    }))
                }
            }
            _ => Arc::clone(part),
        });
        with_parts(message, parts)
    })
}

/// `message` with `parts`, or the same `Arc` when they are its own.
pub(crate) fn with_parts(
    message: &Arc<MessageRecord>,
    parts: Keyed<PartRecord>,
) -> Arc<MessageRecord> {
    if parts.same(&message.parts) {
        Arc::clone(message)
    } else {
        Arc::new(MessageRecord {
            parts,
            ..MessageRecord::clone(message)
        })
    }
}

pub fn with_messages(
    transcript: &Arc<Transcript>,
    messages: Keyed<MessageRecord>,
) -> Arc<Transcript> {
    if messages.same(&transcript.messages) {
        Arc::clone(transcript)
    } else {
        Arc::new(Transcript {
            messages,
            ..Transcript::clone(transcript)
        })
    }
}

pub fn with_routing(transcript: &Arc<Transcript>, routing: Routing) -> Arc<Transcript> {
    if routing == transcript.routing {
        Arc::clone(transcript)
    } else {
        Arc::new(Transcript {
            routing,
            ..Transcript::clone(transcript)
        })
    }
}

/// Replaces the part `key` of the message at `location` with `change` of it.
pub fn update_part(
    transcript: &Arc<Transcript>,
    location: &[String],
    key: &str,
    change: impl FnOnce(&Arc<PartRecord>) -> Arc<PartRecord>,
) -> Arc<Transcript> {
    with_messages(
        transcript,
        update_message_at(&transcript.messages, location, |message| {
            with_parts(message, message.parts.update(key, change))
        }),
    )
}

/// Adds `record` as part `key` of the message at `location`, unless the message already has that
/// part.
pub fn add_part(
    transcript: &Arc<Transcript>,
    location: &[String],
    key: &str,
    record: PartRecord,
) -> Arc<Transcript> {
    let Some(message) = message_at(&transcript.messages, location) else {
        return Arc::clone(transcript);
    };
    if message.parts.contains(key) {
        return Arc::clone(transcript);
    }
    let is_call = matches!(record, PartRecord::ToolCall(_));
    let record = Arc::new(record);
    let added = with_messages(
        transcript,
        update_message_at(&transcript.messages, location, |message| {
            with_parts(message, message.parts.put(key.to_owned(), record))
        }),
    );
    if is_call {
        let mut routing = added.routing.clone();
        routing
            .tools
            .insert(key.to_owned(), Arc::from(location.to_vec()));
        with_routing(&added, routing)
    } else {
        added
    }
}
