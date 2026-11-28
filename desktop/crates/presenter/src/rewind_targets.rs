//! What can be done from an ask or a turn's end: rewind the conversation, rewind the files and
//! then the conversation, or fork (RewindTargets.kt). Each carries the uuid of the user line a copy
//! of the saved record leaves out from (`rewind_before`); `None` leaves nothing out of a fork and
//! keeps nothing of a rewind.

use std::collections::HashSet;

use crate::transcript::{Role, Transcript};

/// Opens a copy without the ask and what came after; `rewind_before` `None` keeps nothing (a new
/// conversation).
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct RewindConversation {
    pub rewind_before: Option<String>,
}

/// Puts the files back as they were before the ask `message_id` first, then rewinds as
/// [`RewindConversation`] does.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct RewindFilesThenConversation {
    pub message_id: String,
    pub rewind_before: Option<String>,
}

/// Opens a copy up to and with the ask's exchange: `rewind_before` is the next ask's uuid, `None`
/// for the last ask.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ForkFrom {
    pub rewind_before: Option<String>,
}

/// The actions an ask or a turn's end offers; when none is offered, `refusal` says why.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct AskActions {
    pub rewind: Option<RewindConversation>,
    pub rewind_files: Option<RewindFilesThenConversation>,
    pub fork: Option<ForkFrom>,
    pub refusal: Option<RewindRefusal>,
}

/// Why an ask or a turn's end offers nothing; the screen puts it into words.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum RewindRefusal {
    /// The thread is running.
    Running,
    /// The CLI has no record of the ask.
    Unknown,
    /// Nothing came after the turn.
    NothingAfter,
    /// The ask came before the conversation was cleared: the CLI's conversation now has no record
    /// of it.
    BeforeClear,
}

fn refused(why: RewindRefusal) -> AskActions {
    AskActions {
        rewind: None,
        rewind_files: None,
        fork: None,
        refusal: Some(why),
    }
}

/// What the ask `ask_key` offers. `running` is whether the thread is running
/// ([`thread_is_running`](crate::thread_running::thread_is_running)).
pub fn ask_actions(transcript: &Transcript, running: bool, ask_key: &str) -> AskActions {
    let asks = live_asks(transcript);
    let at = asks.iter().position(|it| it == ask_key);
    match at {
        // Before a clear nothing is ever offered, running or not: the screen does not show the
        // buttons at all.
        None if before_clear(transcript, ask_key) => refused(RewindRefusal::BeforeClear),
        _ if running => refused(RewindRefusal::Running),
        None => refused(RewindRefusal::Unknown),
        Some(at) => {
            // The record's first user line has no parent to cut at: rewinding to it keeps nothing.
            // After a clear the record starts afresh, whatever was put back of the one before.
            let keeps_nothing = at == 0
                && (transcript.cleared_at.is_some()
                    || !transcript.restored.as_ref().is_some_and(|it| it.partly));
            let uuid_of = |key: &str| transcript.user_uuids.get(key).cloned();
            let before = if keeps_nothing {
                None
            } else {
                uuid_of(ask_key)
            };
            let next = asks.get(at + 1).and_then(|it| uuid_of(it));
            AskActions {
                rewind: Some(RewindConversation {
                    rewind_before: before.clone(),
                }),
                rewind_files: Some(RewindFilesThenConversation {
                    message_id: ask_key.to_owned(),
                    rewind_before: before,
                }),
                fork: Some(ForkFrom {
                    rewind_before: next,
                }),
                refusal: None,
            }
        }
    }
}

/// What the end of the turn that answered `ask_key` offers: rewinding to right after it (no
/// fork).
pub fn turn_end_actions(transcript: &Transcript, running: bool, ask_key: &str) -> AskActions {
    let asks = live_asks(transcript);
    let at = asks.iter().position(|it| it == ask_key);
    match at {
        // Before a clear nothing is ever offered, running or not, as for an ask.
        None if before_clear(transcript, ask_key) => refused(RewindRefusal::BeforeClear),
        _ if running => refused(RewindRefusal::Running),
        None => refused(RewindRefusal::Unknown),
        Some(at) => match asks.get(at + 1) {
            None => refused(RewindRefusal::NothingAfter),
            Some(next) => AskActions {
                fork: None,
                ..ask_actions(transcript, false, next)
            },
        },
    }
}

/// The keys of the thread's user messages the CLI knows by a uuid, in order.
pub(crate) fn sent_asks(transcript: &Transcript) -> Vec<String> {
    transcript
        .messages
        .order()
        .filter(|key| {
            transcript.user_uuids.contains_key(*key)
                && transcript
                    .messages
                    .get(key)
                    .is_some_and(|it| it.role == Role::User)
        })
        .map(str::to_owned)
        .collect()
}

/// [`sent_asks`] after the last clear: the asks of the conversation the CLI has now.
pub(crate) fn live_asks(transcript: &Transcript) -> Vec<String> {
    let asks = sent_asks(transcript);
    let Some(cleared) = transcript.cleared_at else {
        return asks;
    };
    let after: HashSet<&str> = transcript.messages.order().skip(cleared + 1).collect();
    asks.into_iter()
        .filter(|it| after.contains(it.as_str()))
        .collect()
}

/// Whether `ask_key` is an ask the CLI knew that came before the last clear: one of
/// [`sent_asks`] that [`live_asks`] left out.
fn before_clear(transcript: &Transcript, ask_key: &str) -> bool {
    transcript.cleared_at.is_some() && sent_asks(transcript).iter().any(|it| it == ask_key)
}
