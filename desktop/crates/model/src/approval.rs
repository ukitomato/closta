//! Pending host-input requests. Mirrors `Approval.kt`.
//!
//! Only the domain of a pending request lives here: its correlation ids and its kind. The
//! request's content stays in the event's `RawJson` for the presenter to project. A resolved
//! request is removed from the state rather than kept, so there is no terminal state.

use serde::Serialize;

/// One unanswered host-input request the CLI is blocking on.
///
/// `request_id` is the primary key and is present on every `control_request`. `tool_use_id` and
/// `agent_id` are optional attribution: `agent_id` is `None` for a main-conversation approval and
/// carries the spawning subagent's `task_id` for a subagent one.
#[derive(Clone, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingApproval {
    pub request_id: String,
    pub kind: ApprovalKind,
    pub tool_use_id: Option<String>,
    pub agent_id: Option<String>,
}

/// What kind of host input a [`PendingApproval`] is waiting for.
///
/// Decided from the typed tool name: `AskUserQuestion` is `Ask`, everything else (including no
/// tool name) is `Approval`.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ApprovalKind {
    /// A plain tool awaiting allow/deny.
    Approval,
    /// An `AskUserQuestion` awaiting an answer.
    Ask,
}

/// The host's out-of-band decision about a pending request.
///
/// The host's reply travels on stdin, so it is not an event and cannot be folded. This carries only
/// the outcome kind; every variant removes the pending request the same way.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum ApprovalDecision {
    /// The host returned a `control_response` for the request. For an `Ask` answered with neither
    /// `answers` nor `afkTimeoutMs` this is the no-answer path.
    Allow { request_id: String },
    /// The host denied the tool.
    Deny { request_id: String },
    /// The host injected answers for an `AskUserQuestion`.
    Answered { request_id: String },
    /// The host let the request expire on an AFK timeout.
    AfkTimeout { request_id: String },
}

impl ApprovalDecision {
    pub fn request_id(&self) -> &str {
        match self {
            Self::Allow { request_id }
            | Self::Deny { request_id }
            | Self::Answered { request_id }
            | Self::AfkTimeout { request_id } => request_id,
        }
    }
}
