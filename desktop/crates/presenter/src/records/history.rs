//! What the history of sessions shows, kept next to the transcript: the project's saved sessions,
//! and the earlier conversation of a resumed session that was put back from its record
//! (HistoryRecords.kt).

use std::fmt;
use std::sync::Arc;

use closta_model::{AgentEvent, ConversationState, RawJson};
use serde_json::{Map, Value};

use crate::input::{PresenterInput, ResumeRefusal, ResumeRefused, SessionsListed};
use crate::json::{JsonFields, parse};
use crate::keyed::{Keyed, of_cli_id};
use crate::records::operations::{EFFORT_REFUSED_TURN, OperationRecords, SwitchKind};
use crate::text::{kt_is_blank, utf16_len};
use crate::transcript::{
    MessageRecord, MessageSource, PartRecord, ResumeEnd, Role, TextRecord, Transcript,
};

/// One saved session as the tree lists it: the title is the user's own words, shown and never
/// logged.
#[derive(Clone, PartialEq, Eq)]
pub struct SavedSessionRecord {
    pub id: String,
    pub title: String,
    pub updated_at_ms: i64,
    pub current: bool,
}

impl fmt::Debug for SavedSessionRecord {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "SavedSessionRecord({}, {} chars, current={})",
            self.id,
            utf16_len(&self.title),
            self.current
        )
    }
}

/// What was put back when the session was resumed: the key of the last message of it (`until`,
/// so every message up to and including it is the earlier conversation, read only), how many
/// messages that is, and whether the record held more than was put back (`partly`).
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct RestoredRecord {
    pub until: String,
    pub count: i32,
    pub partly: bool,
}

/// What the projection reads of the history in a [`Transcript`], as one value so that it compares
/// in one step: the list the host last gave, whether the last listing could not be read, what was
/// put back, and whether the record could not be read.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct HistoryFacts {
    pub saved_sessions: Option<Arc<[SavedSessionRecord]>>,
    pub saved_sessions_unreadable: bool,
    pub restored: Option<RestoredRecord>,
    pub unavailable: bool,
}

impl HistoryFacts {
    pub fn of(transcript: &Transcript) -> Self {
        Self {
            saved_sessions: transcript.saved_sessions.clone(),
            saved_sessions_unreadable: transcript.saved_sessions_unreadable,
            restored: transcript.restored.clone(),
            unavailable: transcript.history_unavailable,
        }
    }
}

/// The sentence of a resume the host refused because a turn was running: the same as an effort
/// switch's.
pub const RESUME_REFUSED_TURN: &str = EFFORT_REFUSED_TURN;

/// The sentence of a resume the host refused because another tab of the tool window has that
/// session.
pub const RESUME_REFUSED_ELSEWHERE: &str = "It is open in another tab";

/// What the thread says of a record that could not be read: its first notice, ahead of the CLI's.
pub const HISTORY_UNAVAILABLE_TEXT: &str = "The earlier conversation of this session could not be read, so it is not shown. The session goes on without it.";

impl OperationRecords {
    /// The host did not open the saved session: a record that is over at once.
    pub(crate) fn refuse_resume(&self, input: &ResumeRefused) -> Self {
        let detail = match input.reason {
            ResumeRefusal::Turn => RESUME_REFUSED_TURN,
            ResumeRefusal::Elsewhere => RESUME_REFUSED_ELSEWHERE,
        };
        self.refused(
            &input.request_id,
            SwitchKind::Resume,
            &input.session_id,
            Some(detail),
        )
    }
}

/// How a line of stdout folds: what a line of the record that is not the user's words folds as.
pub(crate) type EventFold =
    fn(&Arc<Transcript>, &AgentEvent, &ConversationState, &ConversationState) -> Arc<Transcript>;

/// The inputs of the history of sessions: the list, the earlier conversation put back, and what
/// became of it. `fallback` folds a line of the record that is not the user's words, as the same
/// line from stdout is folded.
pub(crate) fn fold_history(
    transcript: &Arc<Transcript>,
    input: &PresenterInput,
    before: &ConversationState,
    after: &ConversationState,
    fallback: EventFold,
) -> Arc<Transcript> {
    match input {
        PresenterInput::SessionsListed(listed) => fold_listed(transcript, listed),
        PresenterInput::Restored(event) => {
            fold_restored_event(transcript, event, before, after, fallback)
        }
        PresenterInput::HistoryRestored(dropped) => restored_with(transcript, *dropped),
        PresenterInput::HistoryUnavailable if !transcript.history_unavailable => {
            Arc::new(Transcript {
                history_unavailable: true,
                ..Transcript::clone(transcript)
            })
        }
        _ => Arc::clone(transcript),
    }
}

/// The host's list of the saved sessions: the new list, or (unreadable) the one before it marked
/// as not current.
fn fold_listed(transcript: &Arc<Transcript>, input: &SessionsListed) -> Arc<Transcript> {
    if input.unreadable {
        if transcript.saved_sessions_unreadable {
            return Arc::clone(transcript);
        }
        return Arc::new(Transcript {
            saved_sessions_unreadable: true,
            ..Transcript::clone(transcript)
        });
    }
    let records: Arc<[SavedSessionRecord]> = input
        .sessions
        .iter()
        .map(|it| SavedSessionRecord {
            id: it.id.clone(),
            title: it.title.clone(),
            updated_at_ms: it.updated_at_ms,
            current: it.id == input.current_id,
        })
        .collect();
    if transcript.saved_sessions.as_ref() == Some(&records) && !transcript.saved_sessions_unreadable
    {
        return Arc::clone(transcript);
    }
    Arc::new(Transcript {
        saved_sessions: Some(records),
        saved_sessions_unreadable: false,
        ..Transcript::clone(transcript)
    })
}

/// A line of the record put back. A user's words (a string, or a list of text blocks with no tool
/// result among them) are a user message — the only place they are known — and end the assistant
/// message before them, so that what the assistant said after them is a message of its own. Any
/// other line folds as its twin from stdout.
fn fold_restored_event(
    transcript: &Arc<Transcript>,
    event: &AgentEvent,
    before: &ConversationState,
    after: &ConversationState,
    fallback: EventFold,
) -> Arc<Transcript> {
    if let AgentEvent::User {
        uuid,
        message,
        parent_tool_use_id: None,
        ..
    } = event
        && let Some(words) = words_of(message).filter(|it| !it.is_empty())
    {
        return user_said(transcript, uuid, words);
    }
    fallback(transcript, event, before, after)
}

const TEXT: &str = "text";

/// The sentences a user line holds, when it holds the user's words and no result of a tool: a
/// string, or a list of text blocks. Blank ones are not words.
fn words_of(message: &RawJson) -> Option<Vec<String>> {
    let parsed = parse(&message.0)?;
    let words = |texts: Vec<&str>| {
        texts
            .into_iter()
            .filter(|it| !kt_is_blank(it))
            .map(str::to_owned)
            .collect()
    };
    match parsed.as_object()?.get("content")? {
        Value::String(text) => Some(words(vec![text])),
        Value::Array(items) => {
            let blocks: Vec<&Map<String, Value>> =
                items.iter().filter_map(Value::as_object).collect();
            if blocks
                .iter()
                .any(|it| it.string("type") == Some("tool_result"))
            {
                return None;
            }
            Some(words(
                blocks
                    .iter()
                    .filter(|it| it.string("type") == Some(TEXT))
                    .filter_map(|it| it.string(TEXT))
                    .collect(),
            ))
        }
        _ => None,
    }
}

fn user_said(transcript: &Arc<Transcript>, uuid: &str, words: Vec<String>) -> Arc<Transcript> {
    let ended = end_resume(transcript);
    let key = ended.messages.claim(&of_cli_id(uuid));
    let parts = words
        .into_iter()
        .enumerate()
        .fold(Keyed::new(), |parts, (index, text)| {
            parts.put(
                format!("{key}:{index}"),
                Arc::new(PartRecord::Text(TextRecord {
                    reasoning: false,
                    text,
                    streaming: false,
                })),
            )
        });
    let message = MessageRecord {
        key: key.clone(),
        role: Role::User,
        source: MessageSource::Sent,
        parts,
    };
    Arc::new(Transcript {
        messages: ended.messages.put(key.clone(), Arc::new(message)),
        // The record's own uuid is the one the CLI knows the message by.
        user_uuids: ended.user_uuids.update(key, uuid.to_owned()),
        ..Transcript::clone(&ended)
    })
}

/// The assistant message that is open without a turn, ended as a `result` would have: not
/// running, not failed.
fn end_resume(transcript: &Arc<Transcript>) -> Arc<Transcript> {
    let Some(open) = &transcript.routing.open_resume else {
        return Arc::clone(transcript);
    };
    let messages = transcript.messages.update(open, |message| {
        Arc::new(MessageRecord {
            source: MessageSource::Resume {
                end: Some(ResumeEnd {
                    is_error: false,
                    result: String::new(),
                }),
            },
            ..MessageRecord::clone(message)
        })
    });
    let mut routing = transcript.routing.clone();
    routing.open_resume = None;
    Arc::new(Transcript {
        messages,
        routing,
        ..Transcript::clone(transcript)
    })
}

/// Everything the record gave is back: nothing it said is still running, and where it ends is
/// kept.
fn restored_with(transcript: &Arc<Transcript>, dropped: i32) -> Arc<Transcript> {
    let ended = end_resume(transcript);
    let Some(until) = ended.messages.order().next_back() else {
        return ended;
    };
    let restored = RestoredRecord {
        until: until.to_owned(),
        count: i32::try_from(ended.messages.len()).unwrap_or(i32::MAX),
        partly: dropped > 0,
    };
    if ended.restored.as_ref() == Some(&restored) {
        return ended;
    }
    Arc::new(Transcript {
        restored: Some(restored),
        ..Transcript::clone(&ended)
    })
}
