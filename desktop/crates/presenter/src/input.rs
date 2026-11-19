//! What the presenter folds (PresenterInput.kt): the CLI's stdout lines, and the things only the
//! host knows because it sent them on stdin — the user's own words, which the CLI never echoes,
//! and its answer to an approval.

use std::fmt;
use std::sync::Arc;

use closta_model::{AgentEvent, ApprovalDecision, SavedSessionSummary};
use serde_json::{Map, Value};

use crate::json::is_key;
use crate::records::attachment::{AttachmentRecord, AttachmentRefusal};
use crate::records::composer::FileSearchRecord;
use crate::records::operations::ControlKind;
use crate::records::turn_end::ChangedFile;

/// One input of the presenter. Kotlin's `SelectionCaptured` and `CodeApplied` have no place here:
/// the desktop app has no editor to take a selection from or write code into.
#[derive(Clone, PartialEq, Debug)]
pub enum PresenterInput {
    /// The user pressed stop: the host writes `interrupt` after this. The turns open now stop
    /// running at the next `result`, whatever turn it names. Core does not change.
    StopRequested,
    /// One stdout line.
    Event(AgentEvent),
    UserSent(UserSent),
    /// The session refused the message sent as this id: it never reached the CLI.
    SendFailed(SendId),
    TurnChangesFound(TurnChangesFound),
    RewindRequested(RewindRequested),
    RewindNotSent(RewindNotSent),
    AttachmentRefused(AttachmentRefused),
    Decided(Decided),
    AnswerFailed(AnswerFailed),
    /// The host answered the webview's `query-files`: the last answer is the one the tree shows.
    /// The record's `command_id` is the webview's own command id.
    FilesFound(FileSearchRecord),
    ControlRequested(ControlRequested),
    /// The request with this id could not be written to the CLI, as when the session is already
    /// closed.
    ControlSendFailed(String),
    EffortRefused(EffortRefused),
    Launched(Launched),
    /// The host did not restart the session into the sandbox because a turn is running; the id is
    /// the mark it made for the switch.
    SandboxRefused(String),
    SandboxNotStarted(SandboxNotStarted),
    SessionsListed(SessionsListed),
    /// A line of the record of a session that is being resumed, put back before the CLI says
    /// anything. It folds as the same line from stdout does, and a user's own words in it become a
    /// user message: they are in the record, and only there (the CLI does not echo them).
    Restored(AgentEvent),
    /// Everything the record gave is back; this many lines of it were older than the host puts
    /// back.
    HistoryRestored(i32),
    /// The session was resumed, and its record could not be read: it goes on without the earlier
    /// conversation.
    HistoryUnavailable,
    ResumeRefused(ResumeRefused),
}

/// The id the host gives a user message it sends. It becomes the message's key in the tree, so it
/// must be a key there ([`is_key`]); the host names it before the CLI says anything about the turn.
#[derive(Clone, PartialEq, Eq, Hash, Debug)]
pub struct SendId(String);

impl SendId {
    /// `id` as a send id, or `None` when it is not a key of the tree.
    pub fn new(id: &str) -> Option<SendId> {
        is_key(id).then(|| SendId(id.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// The host sent a user message.
#[derive(Clone, PartialEq, Debug)]
pub struct UserSent {
    pub message_id: SendId,
    pub text: String,
    /// The files that went with it: their points, ahead of the words in the message.
    pub attachments: Vec<AttachmentRecord>,
    /// The uuid the message goes to the CLI with; the transcript keeps which message it belongs
    /// to.
    pub uuid: Option<String>,
}

/// The host found what the turn that answered the user message `ask_key` changed on disk, against
/// the Local History label it put down when the message was sent. Core's state does not change.
#[derive(Clone, PartialEq, Debug)]
pub struct TurnChangesFound {
    pub ask_key: String,
    pub files: Vec<ChangedFile>,
    /// Whether more files changed than the host looked at (`files` are the first ones).
    pub more: bool,
}

/// The webview asked to rewind the files to before the message `message_id`; `command_id` is its
/// own mark and `request_id` the host's mark on the request to the CLI. `sends_at` is how many user
/// messages had been sent and `turns_at` how many turns there had been. Folded before the request
/// is written, as a [`ControlRequested`] is.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct RewindRequested {
    pub request_id: String,
    pub command_id: String,
    pub message_id: String,
    pub dry_run: bool,
    pub sends_at: i32,
    pub turns_at: i32,
}

/// The host did not send a rewind to the CLI, and says why in `reason`.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct RewindNotSent {
    pub command_id: String,
    pub message_id: String,
    pub dry_run: bool,
    pub reason: String,
}

/// The host did not send a message because of its attachments; `request_id` is the mark it made
/// for the refusal. The words of the message and the files are not kept: only why.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct AttachmentRefused {
    pub request_id: String,
    pub reason: AttachmentRefusal,
}

/// The host answered a pending approval; the first two are the arguments the caller gives core's
/// `resolve_approval`. `passed_on` is what it passed on to the CLI with an allow.
#[derive(Clone, PartialEq, Debug)]
pub struct Decided {
    pub decision: ApprovalDecision,
    pub elapsed_ms: i64,
    pub passed_on: PassedOn,
}

/// The host could not pass its answer for `approval_id` on to the CLI. `message` is the host's own
/// fixed sentence, never the text of an error. An approval that is already settled is left as it
/// is.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct AnswerFailed {
    pub approval_id: String,
    pub message: String,
}

/// The host is about to ask the CLI for something under `request_id`, a mark it made itself: the
/// model or the permission mode to `value`, or the context usage (`value` is `None`). It is folded
/// before the request is sent, so the CLI's answer, which carries the same id, never comes before
/// the request it answers.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ControlRequested {
    pub request_id: String,
    pub kind: ControlKind,
    pub value: Option<String>,
}

/// The host did not restart the session for the effort `effort` because a turn is running;
/// `request_id` is the mark it made for the switch.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct EffortRefused {
    pub request_id: String,
    pub effort: String,
}

/// The session was started with the effort `effort`, or with none, and with the in-process MCP
/// servers named `built_in_mcp_servers`: the names it declared to the CLI, which the list of
/// servers shows as the host's own. `sandbox` is whether it was asked to start in the sandbox
/// (`--settings`); the CLI's settings say whether it is.
#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct Launched {
    pub effort: Option<String>,
    pub built_in_mcp_servers: Vec<String>,
    pub sandbox: bool,
}

/// The CLI asked to start in the sandbox did not start (it wrote a `result` and exited before
/// `initialize`). `request_id` is the switch's mark, or a new one when the launch was not a switch;
/// `detail` is the CLI's sentence.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct SandboxNotStarted {
    pub request_id: String,
    pub detail: Option<String>,
}

/// The host listed the project's saved sessions: the last list is the one the tree shows.
/// `current_id` is the session this thread talks to, which the list marks. With `unreadable` the
/// list could not be read: `sessions` is empty and the list the tree had stays. The titles are the
/// user's own words: `Debug` gives only how many sessions there are.
#[derive(Clone, PartialEq, Eq)]
pub struct SessionsListed {
    pub sessions: Vec<SavedSessionSummary>,
    pub current_id: String,
    pub unreadable: bool,
}

impl fmt::Debug for SessionsListed {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "SessionsListed({} sessions, unreadable={})",
            self.sessions.len(),
            self.unreadable
        )
    }
}

/// The host did not open the saved session `session_id`, for `reason` (a turn is running, or
/// another tab has it); `request_id` is the mark it made for the request.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ResumeRefused {
    pub request_id: String,
    pub session_id: String,
    pub reason: ResumeRefusal,
}

/// Why the host did not open a saved session: it is the one thing a record's sentence depends on.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Default)]
pub enum ResumeRefusal {
    /// A turn is running in the session that would have been replaced.
    #[default]
    Turn,
    /// Another tab already has that session.
    Elsewhere,
}

/// What the host passed on to the CLI with an allow, as one value from the answer's making
/// (`updated_permissions` and `accepted_suggestions` together are one choice).
///
/// `updated_permissions` is the JSON array of the suggestions given to the CLI, in the CLI's own
/// shape and opaque here; `accepted_suggestions` are their ids as the tree names them; `input` is
/// the input the allow carried. The tree shows the input only when it is not the request's own (a
/// rewrite), and the accepted ids only for an answer that was an allow. The suggestions and the
/// input are the user's and the CLI's: `Debug` gives only how many suggestions there are.
#[derive(Clone, PartialEq, Default)]
pub struct PassedOn {
    pub updated_permissions: Option<String>,
    pub accepted_suggestions: Vec<String>,
    pub input: Option<Arc<Map<String, Value>>>,
}

impl fmt::Debug for PassedOn {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "PassedOn({} suggestions)",
            self.accepted_suggestions.len()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_send_id_must_be_a_tree_key() {
        assert_eq!(Some("m-1"), SendId::new("m-1").as_ref().map(SendId::as_str));
        assert_eq!(None, SendId::new(""));
        assert_eq!(None, SendId::new("__proto__"));
    }

    #[test]
    fn debug_leaves_out_what_the_user_passed_on() {
        let passed = PassedOn {
            updated_permissions: Some(r#"[{"rules":["secret"]}]"#.into()),
            accepted_suggestions: vec!["s1".into()],
            input: None,
        };

        let text = format!("{passed:?}");

        assert_eq!("PassedOn(1 suggestions)", text);
    }
}
