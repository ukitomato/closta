//! The last rewind of the files: what the webview asked, and how the CLI answered
//! (RewindRecords.kt). Only the last one is kept, as the webview opens one panel; it lives in
//! [`OperationRecords`](crate::records::operations::OperationRecords) so that a change of it
//! updates the tree as the others do.

use std::fmt;
use std::sync::Arc;

use serde_json::{Map, Value};

use crate::input::{RewindNotSent, RewindRequested};
use crate::json::JsonFields;
use crate::records::operations::{Answer, OperationRecords};
use crate::refusal_sentence::plain_sentence_of;

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

impl OperationRecords {
    /// The host's own record of a rewind: asked and written, or not sent.
    pub(crate) fn rewind_requested(&self, input: &RewindRequested) -> Self {
        Self {
            rewind: Some(RewindRecord {
                request_id: Some(input.request_id.clone()),
                command_id: input.command_id.clone(),
                message_id: input.message_id.clone(),
                dry_run: input.dry_run,
                sends_at: input.sends_at,
                turns_at: input.turns_at,
                ..RewindRecord::default()
            }),
            ..self.clone()
        }
    }

    /// The host did not send the rewind: it is a record that is over at once.
    pub(crate) fn rewind_not_sent(&self, input: &RewindNotSent) -> Self {
        Self {
            rewind: Some(RewindRecord {
                request_id: None,
                command_id: input.command_id.clone(),
                message_id: input.message_id.clone(),
                dry_run: input.dry_run,
                outcome: RewindOutcome::Failed,
                detail: Some(input.reason.clone()),
                ..RewindRecord::default()
            }),
            ..self.clone()
        }
    }

    /// The pending rewind `request_id` was for, made `change` of; `None` when it is for no
    /// pending rewind.
    fn pending_rewind(
        &self,
        request_id: Option<&str>,
        change: impl FnOnce(&RewindRecord) -> RewindRecord,
    ) -> Option<Self> {
        let record = self.rewind.as_ref().filter(|it| {
            it.outcome == RewindOutcome::Pending && it.request_id.as_deref() == request_id
        })?;
        Some(Self {
            rewind: Some(change(record)),
            ..self.clone()
        })
    }

    /// The request `request_id` could not be written. Returns `None` when it is not the pending
    /// rewind.
    pub(crate) fn rewind_send_failed(&self, request_id: &str) -> Option<Self> {
        self.pending_rewind(Some(request_id), |record| RewindRecord {
            outcome: RewindOutcome::Failed,
            detail: Some(REWIND_SEND_FAILED.to_owned()),
            ..record.clone()
        })
    }

    /// The CLI's answer to the pending rewind; `None` when it is for no pending rewind.
    pub(crate) fn rewind_answered(&self, answer: &Answer<'_>) -> Option<Self> {
        self.pending_rewind(answer.request_id, |record| {
            if answer.succeeded() {
                answered_by(record, answer)
            } else {
                RewindRecord {
                    outcome: RewindOutcome::Failed,
                    detail: Some(plain_sentence_of(answer.error.unwrap_or_default())),
                    ..record.clone()
                }
            }
        })
    }
}

// A success: the CLI says whether it can. `canRewind` false is its refusal, with the reason in the
// answer's `error`. A body that cannot be read (no response, or no canRewind that is true or
// false) is not its no, and is failed.
fn answered_by(record: &RewindRecord, answer: &Answer<'_>) -> RewindRecord {
    let body = answer.body();
    match body
        .as_ref()
        .and_then(|it| it.get("canRewind"))
        .and_then(Value::as_bool)
    {
        None => RewindRecord {
            outcome: RewindOutcome::Failed,
            detail: Some(REWIND_UNREADABLE.to_owned()),
            ..record.clone()
        },
        Some(false) => {
            let error = body
                .as_ref()
                .and_then(|it| it.string("error"))
                .or(answer.error);
            RewindRecord {
                outcome: RewindOutcome::Refused,
                detail: Some(plain_sentence_of(error.unwrap_or_default())),
                ..record.clone()
            }
        }
        Some(true) => done(record, body.as_ref()),
    }
}

fn done(record: &RewindRecord, body: Option<&Map<String, Value>>) -> RewindRecord {
    let changed: Vec<String> = body
        .and_then(|it| it.array("filesChanged"))
        .map(|files| {
            files
                .iter()
                .filter_map(|it| it.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default();
    RewindRecord {
        outcome: RewindOutcome::Done,
        files_total: i32::try_from(changed.len()).unwrap_or(i32::MAX),
        files: changed.into_iter().take(MAX_REWIND_FILES).collect(),
        insertions: body.and_then(|it| it.count("insertions")).unwrap_or(0),
        deletions: body.and_then(|it| it.count("deletions")).unwrap_or(0),
        ..record.clone()
    }
}
