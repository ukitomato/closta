//! Paths to message records (TranscriptPaths.kt).
//!
//! A location is the path of keys to a message record: a top-level message key, then a tool-call
//! key and a nested message key for each level of sub-agent. Updates copy the records along the
//! path and nothing else; a change that leaves a record as it was returns the same `Arc`s all the
//! way up.

use std::sync::Arc;

use serde_json::Value;

use crate::keyed::{Keyed, of_cli_id};
use crate::transcript::{Denial, MessageRecord, PartRecord, Routing, ToolCallRecord, Transcript};

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

/// `transcript` with `routing`, or the same `Arc` when `routing` equals its own.
pub fn with_routing(transcript: &Arc<Transcript>, routing: Routing) -> Arc<Transcript> {
    if same_routing(&routing, &transcript.routing) {
        Arc::clone(transcript)
    } else {
        replace_routing(transcript, routing)
    }
}

/// `transcript` with `routing`, for a caller that knows `routing` differs from its own.
pub(crate) fn replace_routing(transcript: &Arc<Transcript>, routing: Routing) -> Arc<Transcript> {
    Arc::new(Transcript {
        routing,
        ..Transcript::clone(transcript)
    })
}

/// Whether two routings are equal. The tables grow with the conversation, and `imbl` compares two
/// maps entry by entry even when they share their root, so each table that is the very one on the
/// other side is taken as equal without a walk (Kotlin's `equals` stops at identity the same way).
fn same_routing(a: &Routing, b: &Routing) -> bool {
    // Destructured whole, so a field added to `Routing` and not compared here does not compile.
    let Routing {
        current_turn,
        open_resume,
        streaming,
        turns,
        sends,
        stopping,
        stopped,
        anthropic,
        tools,
    } = a;
    *current_turn == b.current_turn
        && *open_resume == b.open_resume
        && *streaming == b.streaming
        && *sends == b.sends
        && (turns.ptr_eq(&b.turns) || *turns == b.turns)
        && (stopping.ptr_eq(&b.stopping) || *stopping == b.stopping)
        && (stopped.ptr_eq(&b.stopped) || *stopped == b.stopped)
        && (anthropic.ptr_eq(&b.anthropic) || *anthropic == b.anthropic)
        && (tools.ptr_eq(&b.tools) || *tools == b.tools)
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
/// part. A call is routed to by its key, and takes the refusal that was waiting for it.
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
    if !is_call {
        return added;
    }
    let held = added.routing.tools.get(key);
    let routed = if held.is_some_and(|it| **it == *location) {
        added
    } else {
        let mut routing = added.routing.clone();
        routing
            .tools
            .insert(key.to_owned(), Arc::from(location.to_vec()));
        replace_routing(&added, routing)
    };
    let Some(denial) = routed.denials.get(key).cloned() else {
        return routed;
    };
    let mut denials = routed.denials.clone();
    denials.remove(key);
    let spent = Arc::new(Transcript {
        denials,
        ..Transcript::clone(&routed)
    });
    mark_denied(&spent, key, denial)
}

/// Marks the call `key` as refused for `denial`, wherever it is (a sub-agent's too); remembers the
/// refusal when the call has no line yet. The same refusal again gives the same `Arc`.
pub fn mark_denied(transcript: &Arc<Transcript>, key: &str, denial: Denial) -> Arc<Transcript> {
    let Some(at) = transcript.routing.tools.get(key).cloned() else {
        if transcript.denials.get(key) == Some(&denial) {
            return Arc::clone(transcript);
        }
        let mut denials = transcript.denials.clone();
        denials.insert(key.to_owned(), denial);
        return Arc::new(Transcript {
            denials,
            ..Transcript::clone(transcript)
        });
    };
    update_part(transcript, &at, key, |part| match part.as_ref() {
        PartRecord::ToolCall(call) if call.denied.as_ref() != Some(&denial) => {
            Arc::new(PartRecord::ToolCall(ToolCallRecord {
                denied: Some(denial),
                ..call.clone()
            }))
        }
        _ => Arc::clone(part),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transcript::AnthropicRoute;

    #[test]
    fn an_unchanged_routing_returns_the_same_transcript_and_a_changed_one_a_new_one() {
        let mut routing = Routing::default();
        for n in 0..64 {
            routing.turns.insert(format!("c{n}"), format!("k{n}"));
            routing.anthropic.insert(
                format!("m{n}"),
                AnthropicRoute {
                    location: Arc::from(vec![format!("k{n}")]),
                    ..AnthropicRoute::default()
                },
            );
            routing
                .tools
                .insert(format!("t{n}"), Arc::from(vec![format!("k{n}")]));
        }
        routing.stopped.insert("c0".to_owned());
        let transcript = Arc::new(Transcript {
            routing,
            ..Transcript::default()
        });

        let unchanged = with_routing(&transcript, transcript.routing.clone());
        let mut moved = transcript.routing.clone();
        moved.current_turn = Some("k1".into());
        let changed = with_routing(&transcript, moved);
        let mut rebuilt = transcript.routing.clone();
        rebuilt.turns = transcript
            .routing
            .turns
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        let equal = with_routing(&transcript, rebuilt);

        assert!(Arc::ptr_eq(&transcript, &unchanged));
        assert!(!Arc::ptr_eq(&transcript, &changed));
        assert_eq!(Some("k1"), changed.routing.current_turn.as_deref());
        assert!(
            Arc::ptr_eq(&transcript, &equal),
            "a table rebuilt equal is still equal"
        );
    }
}
