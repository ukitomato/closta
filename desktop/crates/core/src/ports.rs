//! What core asks of the outside world. Mirrors `AgentSession` in AgentSession.kt.

use closta_model::{ApprovalDecision, Attachment, SavedSessionSummary, SavedTranscript};

/// Why a line could not be written for the agent. It names only the kind: never the text, the
/// payload, an attachment's name or its bytes.
#[derive(Clone, Copy, PartialEq, Eq, Debug, thiserror::Error)]
pub enum EncodeError {
    #[error("a text attachment is not UTF-8")]
    TextNotUtf8,
    #[error("a payload is not JSON")]
    BadPayload,
}

/// Why a command did not reach the agent.
#[derive(Clone, Copy, PartialEq, Eq, Debug, thiserror::Error)]
pub enum SendError {
    /// The session no longer takes lines.
    #[error("the session is closed")]
    Closed,
    /// The command could not be written as a line; nothing was sent.
    #[error(transparent)]
    Encode(#[from] EncodeError),
}

/// The seam to a running agent. Core drives one conversation through it without knowing what
/// speaks behind it.
///
/// Unlike Kotlin, the commands are synchronous and object-safe: sending only queues a line and
/// never waits. The event stream is not part of the trait; the implementation hands it out once,
/// when the session is made, so that it has exactly one owner.
pub trait AgentSession: Send + Sync {
    /// Sends a user message. `attachments` go before the text. `uuid` is the id the caller gave
    /// the message, so that it can later be named to the agent; `None` lets the session make one.
    fn send_user_message(
        &self,
        text: &str,
        attachments: &[Attachment],
        uuid: Option<&str>,
    ) -> Result<(), SendError>;

    /// Returns the host's decision about a pending approval. `payload` is the host's raw,
    /// provider-shaped answer (answers or updatedInput) passed through opaquely; `None` for a
    /// plain allow, deny or AFK timeout. `updated_permissions` is the accepted permission
    /// suggestions, a JSON array passed through opaquely like `payload`.
    fn respond_to_approval(
        &self,
        decision: &ApprovalDecision,
        payload: Option<&str>,
        updated_permissions: Option<&str>,
    ) -> Result<(), SendError>;

    /// Changes the model live. `request_id` is minted by the caller and written as the request's
    /// own id, so that the answer (a `ControlResponse` with the same id) can be matched to it.
    fn set_model(&self, model: &str, request_id: &str) -> Result<(), SendError>;

    /// Changes the permission mode live; `request_id` as for [`AgentSession::set_model`].
    fn set_permission_mode(&self, mode: &str, request_id: &str) -> Result<(), SendError>;

    /// Asks how much of the context window is used; the answer carries `request_id`.
    fn request_context_usage(&self, request_id: &str) -> Result<(), SendError>;

    /// Asks for the settings in effect (the effort and the model of the next request); the answer
    /// carries `request_id`.
    fn request_settings(&self, request_id: &str) -> Result<(), SendError>;

    /// Changes the effort live; `None` puts the model's own default back.
    fn set_effort(&self, effort: Option<&str>, request_id: &str) -> Result<(), SendError>;

    /// Turns the sandbox off live. There is no live way back on: that is a new launch.
    fn turn_sandbox_off(&self, request_id: &str) -> Result<(), SendError>;

    /// Asks which MCP servers the session has and in what state; the answer carries `request_id`.
    fn request_mcp_status(&self, request_id: &str) -> Result<(), SendError>;

    /// Turns the MCP server `name` on or off. `enabled` is the wanted value, not a flip.
    fn set_mcp_server_enabled(
        &self,
        name: &str,
        enabled: bool,
        request_id: &str,
    ) -> Result<(), SendError>;

    /// Reconnects the MCP server `name`; the answer carries `request_id`.
    fn reconnect_mcp_server(&self, name: &str, request_id: &str) -> Result<(), SendError>;

    /// Puts the files back as they were before the user message `user_message_id`, or with
    /// `dry_run` only asks what would change. The conversation is not changed.
    fn rewind_files(
        &self,
        user_message_id: &str,
        dry_run: bool,
        request_id: &str,
    ) -> Result<(), SendError>;

    /// Interrupts whatever the agent is doing.
    fn interrupt(&self) -> Result<(), SendError>;

    /// Stops one running task by the agent's own `task_id`, leaving the rest of the session as it
    /// is. The task's end comes back as an event.
    fn stop_task(&self, task_id: &str) -> Result<(), SendError>;
}

/// The one place core learns the current time; core never reads a clock directly. Mirrors
/// `Clock.kt`.
///
/// A use case that needs elapsed time reads [`Clock::now`] and passes the figure into a pure
/// function, so the transition stays testable under a fixed clock.
pub trait Clock: Send + Sync {
    /// The current wall-clock time, from a real or a fixed clock.
    fn now(&self) -> std::time::SystemTime;
}

/// The most sessions [`SavedSessions::list`] returns.
pub const MAX_LISTED: usize = 50;

/// Why the saved sessions could not be listed or read. It names only the kind: never a path, the
/// text of an `io::Error` (which can hold the path) or a line of a record.
#[derive(Clone, Copy, PartialEq, Eq, Debug, thiserror::Error)]
pub enum SavedSessionsError {
    /// The id is not in the shape of a session id (a UUID).
    #[error("not a session id")]
    NotASessionId,
    /// The place of the CLI's records was not found; the reason is logged where it was found.
    #[error("the saved sessions have no place")]
    NoPlace,
    /// The record could not be read; only the kind of failure is kept.
    #[error("the record could not be read ({0:?})")]
    Unreadable(std::io::ErrorKind),
    /// `stop` turned true before the read was done.
    #[error("the read was stopped")]
    Stopped,
}

/// The sessions the CLI saved for one project, read and never written. Mirrors `SavedSessions.kt`.
///
/// Both calls are synchronous and object-safe, like [`AgentSession`]: the caller runs them off
/// the UI thread and passes `stop`, which the read looks at line by line and which makes it end
/// with [`SavedSessionsError::Stopped`] once it turns true.
pub trait SavedSessions: Send + Sync {
    /// The newest-written sessions first, at most [`MAX_LISTED`]. One record that cannot be read
    /// does not fail the list. When there is no place (no folder, a name too long, no config
    /// directory, a place not yet known) the list is empty, not an error: only [`read`] says
    /// [`SavedSessionsError::NoPlace`].
    ///
    /// [`read`]: SavedSessions::read
    fn list(&self, stop: &dyn Fn() -> bool)
    -> Result<Vec<SavedSessionSummary>, SavedSessionsError>;

    /// The whole conversation of one session. A record that is too big is read from its newest
    /// side, up to the size limit, and the lines left unread are counted in `dropped`.
    fn read(
        &self,
        session_id: &str,
        stop: &dyn Fn() -> bool,
    ) -> Result<SavedTranscript, SavedSessionsError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_encode_error_becomes_a_send_error_that_says_the_same_and_nothing_more() {
        let error: SendError = EncodeError::BadPayload.into();
        assert_eq!(error, SendError::Encode(EncodeError::BadPayload));
        assert_eq!(error.to_string(), "a payload is not JSON");
        assert_eq!(
            SendError::from(EncodeError::TextNotUtf8).to_string(),
            "a text attachment is not UTF-8"
        );
    }

    #[test]
    fn a_saved_sessions_error_names_only_its_kind() {
        assert_eq!(
            SavedSessionsError::Unreadable(std::io::ErrorKind::PermissionDenied).to_string(),
            "the record could not be read (PermissionDenied)"
        );
        assert_eq!(
            SavedSessionsError::NotASessionId.to_string(),
            "not a session id"
        );
        assert_eq!(
            SavedSessionsError::NoPlace.to_string(),
            "the saved sessions have no place"
        );
        assert_eq!(
            SavedSessionsError::Stopped.to_string(),
            "the read was stopped"
        );
    }

    #[test]
    fn saved_sessions_is_object_safe() {
        fn _takes(_: &dyn SavedSessions) {}
    }
}
