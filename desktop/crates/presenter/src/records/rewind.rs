//! The last rewind of the files: what the webview asked, and how the CLI answered
//! (RewindRecords.kt). Only the last one is kept, as the webview opens one panel; it lives in
//! [`OperationRecords`](crate::records::operations::OperationRecords) so that a change of it
//! updates the tree as the others do.

use std::fmt;
use std::sync::Arc;

/// How a rewind ended. `Pending` is asked and not answered.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub enum RewindOutcome {
    #[default]
    Pending,
    Done,
    Refused,
    Failed,
}

impl RewindOutcome {
    pub fn wire(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Done => "done",
            Self::Refused => "refused",
            Self::Failed => "failed",
        }
    }
}

/// The last `rewind-files` command. `request_id` is the host's mark on the CLI request (`None` for
/// one the host refused itself, which has no answer to wait for); `command_id` is the webview's own
/// mark. `sends_at` is how many user messages had been sent when a dry run was asked, and
/// `turns_at` how many turns there had been: a real rewind after another message or turn is not
/// the one that was checked. `files` are the paths a dry run said would change (at most
/// [`MAX_REWIND_FILES`]) and `files_total` how many there were. The paths are the user's files:
/// `Debug` leaves them out.
#[derive(Clone, PartialEq, Eq, Default)]
pub struct RewindRecord {
    pub request_id: Option<String>,
    pub command_id: String,
    pub message_id: String,
    pub dry_run: bool,
    pub sends_at: i32,
    pub turns_at: i32,
    pub outcome: RewindOutcome,
    pub files: Arc<[String]>,
    pub files_total: i32,
    pub insertions: i64,
    pub deletions: i64,
    pub detail: Option<String>,
}

impl fmt::Debug for RewindRecord {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "RewindRecord({}, dryRun={}, {:?}, {} files)",
            self.command_id,
            self.dry_run,
            self.outcome,
            self.files.len()
        )
    }
}

/// The most paths kept of a dry run; the rest are only counted.
pub const MAX_REWIND_FILES: usize = 200;

/// What a success whose body cannot be read says.
pub const REWIND_UNREADABLE: &str = "The answer of the CLI could not be read.";

/// What a failed write says.
pub const REWIND_SEND_FAILED: &str = "The request could not be sent to the session.";
