//! The lines about the session itself rather than its content (SessionLineFold.kt): a reset
//! divides the thread. Each goes in the message receiving content, or in one of its own
//! ([`with_part`]).

use std::sync::Arc;

use crate::keyed::{Keyed, of_cli_id};
use crate::transcript::{
    ClearedRecord, MessageRecord, MessageSource, PartRecord, Role, Transcript,
};

const CLEARED_PART: &str = "cleared";

/// A reset divides the thread in the message receiving content (the `/clear`'s own turn), or in
/// one of its own when none is, whatever its trigger says: the CLI asks its consumers to reset on
/// every one. What came before stays.
pub(crate) fn fold_reset(
    transcript: &Arc<Transcript>,
    uuid: &str,
    timestamp: Option<&str>,
) -> Arc<Transcript> {
    let (placed, message_key) = with_part(transcript, uuid, CLEARED_PART, |key| {
        PartRecord::Cleared(ClearedRecord {
            key,
            at: timestamp.map(str::to_owned),
        })
    });
    let cleared_at = placed.messages.order().position(|it| it == message_key);
    Arc::new(Transcript {
        cleared_at,
        ..Transcript::clone(&placed)
    })
}

/// Puts a part made by `make` in the message receiving content (the turn's, else the open
/// spontaneous resume's), or in one of its own named for `uuid` when none is; and gives that
/// message's key. The part is named `name`, numbered when the message has one by that name.
pub(crate) fn with_part(
    transcript: &Arc<Transcript>,
    uuid: &str,
    name: &str,
    make: impl FnOnce(String) -> PartRecord,
) -> (Arc<Transcript>, String) {
    let routing = &transcript.routing;
    let held = routing
        .current_turn
        .as_ref()
        .or(routing.open_resume.as_ref())
        .filter(|it| transcript.messages.contains(it));
    let message_key =
        held.map_or_else(|| transcript.messages.claim(&of_cli_id(uuid)), Clone::clone);
    let message = transcript.messages.get(&message_key).map_or_else(
        || MessageRecord {
            key: message_key.clone(),
            role: Role::Assistant,
            source: MessageSource::Nested,
            parts: Keyed::new(),
        },
        |it| MessageRecord::clone(it),
    );
    let part_key = message.parts.claim(name);
    let placed = MessageRecord {
        parts: message
            .parts
            .put(part_key.clone(), Arc::new(make(part_key))),
        ..message
    };
    let transcript = Arc::new(Transcript {
        messages: transcript
            .messages
            .put(message_key.clone(), Arc::new(placed)),
        ..Transcript::clone(transcript)
    });
    (transcript, message_key)
}
