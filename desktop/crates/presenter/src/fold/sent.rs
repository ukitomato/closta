//! The user's own messages: the one the host sent, and the one the session refused.

use std::sync::Arc;

use crate::input::{SendId, UserSent};
use crate::keyed::Keyed;
use crate::transcript::{MessageRecord, MessageSource, PartRecord, Role, TextRecord, Transcript};

/// The user's words exist only here: the CLI does not echo them on stdout.
pub(super) fn fold_sent(transcript: &Arc<Transcript>, sent: &UserSent) -> Arc<Transcript> {
    let key = transcript.messages.claim(sent.message_id.as_str());
    // The files go ahead of the words, as they do to the CLI; their keys are a letter and a
    // number, the words' is 0.
    let files = sent
        .attachments
        .iter()
        .enumerate()
        .fold(Keyed::new(), |parts, (index, file)| {
            parts.put(
                format!("{key}:a{index}"),
                Arc::new(PartRecord::Attachment(file.clone())),
            )
        });
    let parts = files.put(
        format!("{key}:0"),
        Arc::new(PartRecord::Text(TextRecord {
            reasoning: false,
            text: sent.text.clone(),
            streaming: false,
        })),
    );
    let message = MessageRecord {
        key: key.clone(),
        role: Role::User,
        source: MessageSource::Sent,
        parts,
    };
    let mut routing = transcript.routing.clone();
    routing.sends = routing.sends.wrapping_add(1);
    let user_uuids = match &sent.uuid {
        Some(uuid) => transcript.user_uuids.update(key.clone(), uuid.clone()),
        None => transcript.user_uuids.clone(),
    };
    Arc::new(Transcript {
        messages: transcript.messages.put(key, Arc::new(message)),
        routing,
        user_uuids,
        ..Transcript::clone(transcript)
    })
}

/// Marks the newest sent message that was keyed `id` (or `id~N`, as `claim` renames a key already
/// taken) as not sent, and takes its send back so the thread does not wait for a turn the CLI
/// never heard of. A message already marked, or an id nothing was sent as, changes nothing.
pub(super) fn fold_send_failed(transcript: &Arc<Transcript>, id: &SendId) -> Arc<Transcript> {
    let messages = &transcript.messages;
    let Some(key) = messages.order().rev().find(|key| {
        claimed_from(key, id.as_str())
            && messages
                .get(key)
                .is_some_and(|message| message.source == MessageSource::Sent)
    }) else {
        return Arc::clone(transcript);
    };
    if transcript.not_sent.contains(key) {
        return Arc::clone(transcript);
    }
    let key = key.to_owned();
    let Some(message) = messages.get(&key) else {
        return Arc::clone(transcript);
    };
    // A new `Arc` with the same content: the rows kept for the old one are let go and the row is
    // made again, with the mark.
    let remade = Arc::new(MessageRecord::clone(message));
    let mut routing = transcript.routing.clone();
    routing.sends = (routing.sends - 1).max(0);
    Arc::new(Transcript {
        messages: messages.put(key.clone(), remade),
        not_sent: transcript.not_sent.update(key),
        routing,
        ..Transcript::clone(transcript)
    })
}

/// Whether `key` is `id` or what `claim` made of it: `id~2`, `id~3`...
fn claimed_from(key: &str, id: &str) -> bool {
    match key.strip_prefix(id) {
        Some("") => true,
        Some(rest) => rest
            .strip_prefix('~')
            .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit())),
        None => false,
    }
}
