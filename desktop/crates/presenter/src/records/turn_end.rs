//! How each turn ended and what the host found it changed (TurnEnd.kt).

use std::fmt;
use std::sync::Arc;

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
