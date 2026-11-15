//! How each turn ended and what the host found it changed (TurnEnd.kt).

use std::fmt;
use std::sync::Arc;

use crate::input::TurnChangesFound;
use crate::transcript::{MessageSource, Role, Transcript};

/// A file a turn changed, as the host found it against the Local History label it put down when
/// the turn was sent. Never what is in it; the path is the user's, and `Debug` leaves it out.
#[derive(Clone, PartialEq, Eq)]
pub struct ChangedFile {
    pub path: String,
    pub added: i32,
    pub removed: i32,
    /// Whether the turn made it: its first change in the turn was its creation.
    pub created: bool,
    pub deleted: bool,
    /// Whether "Revert All" can put it back: Local History has its content at the label, or the
    /// turn made it.
    pub revertable: bool,
    /// Whether `added` and `removed` were counted (not for a binary or a big file).
    pub counted: bool,
}

impl fmt::Debug for ChangedFile {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "ChangedFile(+{} -{}, created={}, deleted={})",
            self.added, self.removed, self.created, self.deleted
        )
    }
}

/// What the host found a turn changed, in its order.
#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct TurnChangesRecord {
    pub files: Arc<[ChangedFile]>,
    /// Whether more files changed than the host looked at.
    pub more: bool,
}

/// How a turn ended: the `result` that closed it. `ask_key` is the user message it answered;
/// `duration_ms` its time.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct TurnEndRecord {
    pub ask_key: Option<String>,
    pub duration_ms: Option<i64>,
}

/// The key of the user message a turn answers: the one sent with the turn's `command_uuid`, else
/// the last user message ahead of the turn's own message.
pub(crate) fn ask_key_of(transcript: &Transcript, turn_key: &str) -> Option<String> {
    let messages = &transcript.messages;
    if let Some(MessageSource::Turn { command_uuid }) = messages.get(turn_key).map(|it| &it.source)
    {
        // Kotlin takes the first entry of `userUuids` in its insertion order. A uuid and its
        // message's key go in together, so that order is the messages' own: the earliest message
        // sent with this uuid. One uuid should go with one send; if it went with more, the first
        // still wins, whatever order the hash map keeps.
        if let Some(key) = messages
            .order()
            .find(|key| transcript.user_uuids.get(*key) == Some(command_uuid))
        {
            return Some(key.to_owned());
        }
    }
    messages
        .order()
        .rev()
        .skip_while(|key| *key != turn_key)
        .skip(1)
        .find(|key| messages.get(key).is_some_and(|it| it.role == Role::User))
        .map(str::to_owned)
}

/// The host found what the turn of `found.ask_key` changed; a later finding replaces it.
pub(crate) fn fold_turn_changes(
    transcript: &Arc<Transcript>,
    found: &TurnChangesFound,
) -> Arc<Transcript> {
    let record = TurnChangesRecord {
        files: Arc::from(found.files.as_slice()),
        more: found.more,
    };
    if transcript.turn_changes.get(&found.ask_key) == Some(&record) {
        return Arc::clone(transcript);
    }
    Arc::new(Transcript {
        turn_changes: transcript
            .turn_changes
            .update(found.ask_key.clone(), record),
        ..Transcript::clone(transcript)
    })
}

/// `turn_key`'s turn was closed by a `result` that took `duration_ms`.
pub(crate) fn with_turn_end(
    transcript: &Arc<Transcript>,
    turn_key: &str,
    duration_ms: Option<i64>,
) -> Arc<Transcript> {
    let record = TurnEndRecord {
        ask_key: ask_key_of(transcript, turn_key),
        duration_ms,
    };
    if transcript.turn_ends.get(turn_key) == Some(&record) {
        return Arc::clone(transcript);
    }
    Arc::new(Transcript {
        turn_ends: transcript.turn_ends.update(turn_key.to_owned(), record),
        ..Transcript::clone(transcript)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keyed::Keyed;
    use crate::transcript::MessageRecord;

    fn message(key: &str, role: Role, source: MessageSource) -> Arc<MessageRecord> {
        Arc::new(MessageRecord {
            key: key.into(),
            role,
            source,
            parts: Keyed::new(),
        })
    }

    #[test]
    fn a_uuid_sent_with_two_messages_answers_the_earliest_of_them() {
        // The premise is one uuid per send; when it is broken the earliest send wins, as the
        // first entry of Kotlin's insertion-ordered map does, for any number of sends.
        for count in [2, 3, 17] {
            let mut messages = Keyed::new();
            let mut user_uuids = imbl::HashMap::new();
            for n in 0..count {
                let key = format!("send-{n}");
                messages =
                    messages.put(key.clone(), message(&key, Role::User, MessageSource::Sent));
                user_uuids.insert(key, "u".to_owned());
            }
            let turn = MessageSource::Turn {
                command_uuid: "u".into(),
            };
            messages = messages.put("turn".into(), message("turn", Role::Assistant, turn));
            let transcript = Transcript {
                messages,
                user_uuids,
                ..Transcript::default()
            };

            assert_eq!(Some("send-0".to_owned()), ask_key_of(&transcript, "turn"));
        }
    }
}
