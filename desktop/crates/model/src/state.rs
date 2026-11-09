//! The domain state of one conversation. Mirrors `ConversationState.kt`.
//!
//! Core keeps the domain (who is in session, which turns opened and closed, what the session has
//! cost, which tasks run, the latest thinking estimate, notices) and nothing of the display: no
//! message text, no thinking prose, no tool arguments or results. Those stay in `RawJson` on the
//! events for the presenter to project.

use crate::approval::PendingApproval;

/// The domain state of one conversation, folded from a stream of events.
#[derive(Clone, PartialEq, Debug, Default)]
pub struct ConversationState {
    /// Session metadata, or `None` until a `system/init` establishes it.
    pub session: Option<SessionInfo>,
    /// Turns in arrival order, each correlated by its `command_uuid`.
    pub turns: Vec<Turn>,
    /// Session-level usage figures.
    pub usage: Usage,
    /// Subagent and background tasks in arrival order, correlated by `task_id`.
    pub tasks: Vec<Task>,
    /// The latest thinking-token estimate. Per assistant message and non-cumulative, so each
    /// `system/thinking_tokens` replaces it. `None` until one arrives.
    pub thinking_estimate: Option<i64>,
    /// Notices raised while folding (errors and the like), in arrival order.
    pub notices: Vec<Notice>,
    /// How many `result` lines arrived that closed no turn: a background completion that resumed
    /// the conversation on its own.
    pub spontaneous_resume_count: i32,
    /// Unanswered host-input requests in arrival order: the approvals and questions the CLI is
    /// currently blocking on. A resolved, timed-out or discarded request is removed rather than
    /// kept, so an empty list is the evidence that the queue is empty. The request's content stays
    /// in its `RawJson`.
    pub pending_approvals: Vec<PendingApproval>,
}

/// Session metadata, built from the typed top-level fields of `system/init` only.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct SessionInfo {
    pub session_id: String,
    pub model: String,
    pub permission_mode: String,
    pub cwd: String,
    /// The CLI version, from `system/init.claude_code_version`.
    pub version: String,
}

/// One turn: a single request/response round, identified by its `command_uuid`.
///
/// It opens on `command_lifecycle{queued|started}` and closes only on a `result` that names it.
/// `incomplete_reason` is `result.result` when the closing `result` had `is_error`, else `None`.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Turn {
    pub command_uuid: String,
    pub phase: TurnPhase,
    pub incomplete_reason: Option<String>,
    /// The CLI's `command_lifecycle` said `completed` while the turn was open (a message taken
    /// into another turn).
    pub lifecycle_done: bool,
}

/// Whether a [`Turn`] is still open or has been closed by its correlated `result`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TurnPhase {
    Open,
    Closed,
}

/// A subagent or background task, correlated by `task_id`. The parent is held by id, never by
/// array index.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Task {
    pub task_id: String,
    pub parent_tool_use_id: Option<String>,
    pub subagent_type: Option<String>,
    pub is_backgrounded: bool,
    pub spawn_depth: Option<i32>,
    pub status: TaskStatus,
    /// Present only when `status` is [`TaskStatus::Incomplete`].
    pub incomplete_reason: Option<String>,
}

/// The lifecycle value of a [`Task`].
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TaskStatus {
    Running,
    Complete,
    Incomplete,
}

/// Session-level usage.
#[derive(Clone, PartialEq, Debug, Default)]
pub struct Usage {
    /// The session running total in USD, from `result.total_cost_usd`. Replaced on each `result`,
    /// never added. `0.0` until a `result` arrives.
    pub session_cost_usd: f64,
}

/// Something worth surfacing that is not itself a turn, task or usage change.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct Notice {
    pub kind: NoticeKind,
    pub message: String,
    /// The `request_id` a [`NoticeKind::ControlError`] answers; `None` for every other kind.
    pub request_id: Option<String>,
}

/// The kind of a [`Notice`].
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum NoticeKind {
    Error,
    /// A control request the host sent was answered with an error.
    ControlError,
}
