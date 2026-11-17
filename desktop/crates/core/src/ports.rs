//! What core asks of the outside world. Mirrors `AgentSession` in AgentSession.kt.

use closta_model::{ApprovalDecision, Attachment};

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
}
