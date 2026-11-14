//! What the history of sessions shows, kept next to the transcript: the project's saved sessions,
//! and the earlier conversation of a resumed session that was put back from its record
//! (HistoryRecords.kt).

use std::fmt;
use std::sync::Arc;

use crate::records::operations::EFFORT_REFUSED_TURN;
use crate::text::utf16_len;
use crate::transcript::Transcript;

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
