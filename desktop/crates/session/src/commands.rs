//! The host's commands for one running session. SessionCommands.kt.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::SystemTime;

use closta_core::ports::{AgentSession, Clock, SendError};
use closta_core::services;
use closta_model::{ApprovalDecision, Attachment, ConversationState};
use closta_presenter::fold::fold_transcript;
use closta_presenter::input::{
    AnswerFailed, AttachmentRefused, ControlRequested, Decided, EffortRefused, PassedOn,
    PresenterInput, ResumeRefusal, ResumeRefused, RewindNotSent, RewindRequested, SendId,
    TurnChangesFound, UserSent,
};
use closta_presenter::records::attachment::{AttachmentRecord, AttachmentRefusal};
use closta_presenter::records::composer::FileSearchRecord;
use closta_presenter::records::operations::ControlKind;
use closta_presenter::records::turn_end::ChangedFile;
use closta_presenter::rewind_refusal::{REWIND_UNKNOWN_MESSAGE, turns_so_far};
use closta_presenter::session::SessionView;

use crate::store::ConversationStore;

/// A test's step between a recorded message and the second look at the session.
#[cfg(test)]
type RecordedHook = Box<dyn Fn(&SessionCommands) + Send + Sync>;

/// The use cases, put together for one running session: its [`AgentSession`], the clock and
/// the store of its view. One set per session.
///
/// Once revoked (the session was closed, ended, or is being restarted into the sandbox), no
/// command reaches the session: each one returns `Err(SendError::Closed)`, and a control
/// request is still recorded as asked and failed.
pub struct SessionCommands {
    session: Arc<dyn AgentSession>,
    clock: Arc<dyn Clock>,
    store: Arc<ConversationStore>,
    revoked: AtomicBool,
    /// Called once a message is recorded, before the session is looked at again.
    #[cfg(test)]
    after_recorded: Option<RecordedHook>,
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

impl SessionCommands {
    pub fn new(
        session: Arc<dyn AgentSession>,
        clock: Arc<dyn Clock>,
        store: Arc<ConversationStore>,
    ) -> SessionCommands {
        SessionCommands {
            session,
            clock,
            store,
            revoked: AtomicBool::new(false),
            #[cfg(test)]
            after_recorded: None,
        }
    }

    /// From now on, no command reaches the session.
    pub fn revoke(&self) {
        self.revoked.store(true, Ordering::SeqCst);
    }

    pub fn is_revoked(&self) -> bool {
        self.revoked.load(Ordering::SeqCst)
    }

    /// The session, unless the commands were revoked.
    fn session(&self) -> Result<&dyn AgentSession, SendError> {
        if self.is_revoked() {
            Err(SendError::Closed)
        } else {
            Ok(self.session.as_ref())
        }
    }

    fn record(&self, input: PresenterInput) {
        self.store.transition(|view| view.fold(&input));
    }

    /// Sends a user message the thread shows as `message_id`: the message goes into the
    /// transcript first, so it stands before anything the CLI says about the turn. A send the session
    /// then refuses is recorded as not sent, and the same error is returned.
    pub fn send_message(
        &self,
        message_id: SendId,
        text: &str,
        attachments: &[Attachment],
    ) -> Result<(), SendError> {
        self.session()?;
        // The transcript keeps the point of each file (its name, kind, size and where it was),
        // never its bytes.
        let noted = attachments
            .iter()
            .map(|attachment| AttachmentRecord {
                name: attachment.name.clone(),
                kind: attachment.kind,
                media_type: attachment.media_type.clone(),
                size: i64::try_from(attachment.bytes.len()).unwrap_or(i64::MAX),
                path: attachment.path.clone(),
            })
            .collect();
        // The uuid the CLI is told the message by; the transcript keeps which message it is.
        let uuid = new_id();
        self.record(PresenterInput::UserSent(UserSent {
            message_id: message_id.clone(),
            text: text.to_owned(),
            attachments: noted,
            uuid: Some(uuid.clone()),
        }));
        #[cfg(test)]
        if let Some(hook) = &self.after_recorded {
            hook(self);
        }
        let sent = self
            .session()
            .and_then(|session| services::send_message(session, text, attachments, Some(&uuid)));
        if sent.is_err() {
            self.record(PresenterInput::SendFailed(message_id));
        }
        sent
    }

    /// Answers a pending approval, under the store's lock: an approval already answered (a
    /// second click) is not answered to the CLI again. `passed_on` is what goes to the CLI with
    /// an allow and is shown on the approval once it is answered. An answer that could not be
    /// sent leaves the view as it was, with the approval open.
    pub fn respond_to_approval(
        &self,
        decision: &ApprovalDecision,
        requested_at: SystemTime,
        payload: Option<&str>,
        passed_on: PassedOn,
    ) -> Result<(), SendError> {
        self.store.transition_with(|view| {
            let session = match self.session() {
                Ok(session) => session,
                Err(error) => return (view, Err(error)),
            };
            let pending = view
                .conversation
                .pending_approvals
                .iter()
                .any(|approval| approval.request_id == decision.request_id());
            if !pending {
                return (view, Ok(()));
            }
            match services::respond_to_approval(
                session,
                self.clock.as_ref(),
                &view.conversation,
                decision,
                requested_at,
                payload,
                passed_on.updated_permissions.as_deref(),
            ) {
                Ok(after) => {
                    let elapsed_ms = services::elapsed_ms(requested_at, self.clock.now());
                    let input = Decided {
                        decision: decision.clone(),
                        elapsed_ms,
                        passed_on,
                    };
                    (decided(&view, after, input), Ok(()))
                }
                Err(error) => (view, Err(error)),
            }
        })
    }

    /// The host could not pass its answer for `approval_id` on: the approval says so in
    /// `message`, the host's own fixed sentence.
    pub fn answer_failed(&self, approval_id: &str, message: &str) {
        self.record(PresenterInput::AnswerFailed(AnswerFailed {
            approval_id: approval_id.to_owned(),
            message: message.to_owned(),
        }));
    }

    /// The host's answer to the thread's file query.
    pub fn files_found(&self, search: FileSearchRecord) {
        self.record(PresenterInput::FilesFound(search));
    }

    /// What the turn that answered the user message `ask_key` changed on disk.
    pub fn turn_changes_found(&self, ask_key: &str, files: Vec<ChangedFile>, more: bool) {
        self.record(PresenterInput::TurnChangesFound(TurnChangesFound {
            ask_key: ask_key.to_owned(),
            files,
            more,
        }));
    }

    /// Changes the model live. The request is recorded as pending under an id of the host's own
    /// **before** it is written: the CLI's answer carries the same id, and can be folded only
    /// after the request it answers is known. A write that fails is recorded as failed.
    pub fn switch_model(&self, model: &str) -> Result<(), SendError> {
        self.requested(ControlKind::Model, Some(model), |session, id| {
            services::switch_model(session, model, id)
        })
    }

    /// Changes the permission mode live, as [`SessionCommands::switch_model`] does.
    pub fn switch_mode(&self, mode: &str) -> Result<(), SendError> {
        self.requested(ControlKind::Mode, Some(mode), |session, id| {
            services::switch_permission_mode(session, mode, id)
        })
    }

    /// Asks how much of the context window is used, as [`SessionCommands::switch_model`] does.
    pub fn request_context_usage(&self) -> Result<(), SendError> {
        self.requested(ControlKind::Context, None, services::request_context_usage)
    }

    /// Asks for the settings in effect, as [`SessionCommands::switch_model`] does.
    pub fn request_settings(&self) -> Result<(), SendError> {
        self.requested(ControlKind::Settings, None, services::request_settings)
    }

    /// Changes the effort live, as [`SessionCommands::switch_model`] does.
    pub fn switch_effort(&self, effort: &str) -> Result<(), SendError> {
        self.requested(ControlKind::Effort, Some(effort), |session, id| {
            services::switch_effort(session, Some(effort), id)
        })
    }

    /// Turns the sandbox off live, as [`SessionCommands::switch_model`] does. Turning it on is a
    /// restart.
    pub fn turn_sandbox_off(&self) -> Result<(), SendError> {
        self.requested(
            ControlKind::Sandbox,
            Some("false"),
            services::turn_sandbox_off,
        )
    }

    /// Asks which MCP servers the session has, as [`SessionCommands::switch_model`] does.
    pub fn request_mcp_status(&self) -> Result<(), SendError> {
        self.requested(ControlKind::McpStatus, None, services::request_mcp_status)
    }

    /// Turns the MCP server `name` on or off, as [`SessionCommands::switch_model`] does.
    /// `enabled` is the wanted value; the record is of the server's name.
    pub fn set_mcp_server_enabled(&self, name: &str, enabled: bool) -> Result<(), SendError> {
        let kind = if enabled {
            ControlKind::McpEnable
        } else {
            ControlKind::McpDisable
        };
        self.requested(kind, Some(name), |session, id| {
            services::set_mcp_server_enabled(session, name, enabled, id)
        })
    }

    /// Reconnects the MCP server `name`, as [`SessionCommands::switch_model`] does.
    pub fn reconnect_mcp_server(&self, name: &str) -> Result<(), SendError> {
        self.requested(ControlKind::McpReconnect, Some(name), |session, id| {
            services::reconnect_mcp_server(session, name, id)
        })
    }

    /// Asks the CLI to put the files back as they were before the message the thread shows as
    /// `message_id`, or with `dry_run` what would change. It is recorded as pending before it
    /// is written, as [`SessionCommands::switch_model`] does. A message the view has no uuid
    /// for (one that went away since the caller's check) is recorded as not sent, and is `Ok`
    /// even once the commands are revoked: nothing is sent, as in Kotlin.
    pub fn rewind_files(
        &self,
        command_id: &str,
        message_id: &str,
        dry_run: bool,
    ) -> Result<(), SendError> {
        let id = new_id();
        let target = self.store.transition_with(|view| {
            let Some(uuid) = view.transcript.user_uuids.get(message_id).cloned() else {
                let refused = view.fold(&PresenterInput::RewindNotSent(RewindNotSent {
                    command_id: command_id.to_owned(),
                    message_id: message_id.to_owned(),
                    dry_run,
                    reason: REWIND_UNKNOWN_MESSAGE.to_owned(),
                }));
                return (refused, None);
            };
            let input = PresenterInput::RewindRequested(RewindRequested {
                request_id: id.clone(),
                command_id: command_id.to_owned(),
                message_id: message_id.to_owned(),
                dry_run,
                sends_at: view.transcript.routing.sends,
                turns_at: turns_so_far(&view.conversation),
            });
            (view.fold(&input), Some(uuid))
        });
        let Some(target) = target else {
            return Ok(());
        };
        self.written(&id, |session| {
            services::rewind_files(session, &target, dry_run, &id)
        })
    }

    /// Records that the rewind `command_id` was not sent to the CLI, and why.
    pub fn rewind_not_sent(&self, command_id: &str, message_id: &str, dry_run: bool, reason: &str) {
        self.record(PresenterInput::RewindNotSent(RewindNotSent {
            command_id: command_id.to_owned(),
            message_id: message_id.to_owned(),
            dry_run,
            reason: reason.to_owned(),
        }));
    }

    /// Records that the restart for `effort` was refused because a turn is running.
    pub fn refuse_effort(&self, effort: &str) {
        self.record(PresenterInput::EffortRefused(EffortRefused {
            request_id: new_id(),
            effort: effort.to_owned(),
        }));
    }

    /// Records that a message was not sent because of its attachments, and why.
    pub fn refuse_attachment(&self, reason: AttachmentRefusal) {
        self.record(PresenterInput::AttachmentRefused(AttachmentRefused {
            request_id: new_id(),
            reason,
        }));
    }

    /// Records that opening the saved session `session_id` was refused, and why.
    pub fn refuse_resume(&self, session_id: &str, reason: ResumeRefusal) {
        self.record(PresenterInput::ResumeRefused(ResumeRefused {
            request_id: new_id(),
            session_id: session_id.to_owned(),
            reason,
        }));
    }

    /// Stops the turn: the view knows first (it ends the turn at the next `result`).
    pub fn interrupt(&self) -> Result<(), SendError> {
        self.session()?;
        self.record(PresenterInput::StopRequested);
        services::interrupt(self.session()?)
    }

    /// Stops one running task by the CLI's own id.
    pub fn stop_task(&self, task_id: &str) -> Result<(), SendError> {
        services::stop_task(self.session()?, task_id)
    }

    fn requested(
        &self,
        kind: ControlKind,
        value: Option<&str>,
        write: impl FnOnce(&dyn AgentSession, &str) -> Result<(), SendError>,
    ) -> Result<(), SendError> {
        let id = new_id();
        self.record(PresenterInput::ControlRequested(ControlRequested {
            request_id: id.clone(),
            kind,
            value: value.map(str::to_owned),
        }));
        self.written(&id, |session| write(session, &id))
    }

    // A write that did not happen is not an answer to wait for: the request `id` is recorded as
    // failed, and the error goes back to the caller.
    fn written(
        &self,
        id: &str,
        write: impl FnOnce(&dyn AgentSession) -> Result<(), SendError>,
    ) -> Result<(), SendError> {
        let result = self.session().and_then(write);
        if result.is_err() {
            self.record(PresenterInput::ControlSendFailed(id.to_owned()));
        }
        result
    }
}

/// The view after an answer the CLI took: core's state is `after`, which core resolved once,
/// and the transcript folds the decision against the state before and after it (Kotlin's
/// `SessionView.decided`). `SessionView::fold` would resolve the approval in core a second time.
fn decided(view: &SessionView, after: ConversationState, decided: Decided) -> SessionView {
    let input = PresenterInput::Decided(decided);
    let transcript = fold_transcript(&view.transcript, &input, &view.conversation, &after);
    SessionView {
        conversation: after,
        transcript,
    }
}

#[cfg(test)]
mod tests {
    use closta_presenter::input::SendId;
    use closta_providers::claude::fake::script::FakeScript;
    use closta_providers::claude::fake::session::FakeAgentSession;

    use super::*;

    struct NoClock;

    impl Clock for NoClock {
        fn now(&self) -> SystemTime {
            SystemTime::UNIX_EPOCH
        }
    }

    #[test]
    fn a_send_revoked_after_it_was_recorded_is_not_sent() {
        let (session, _events, _pump) = FakeAgentSession::start(FakeScript::new(Vec::new()));
        let record = session.record();
        let store = Arc::new(ConversationStore::default());
        let mut commands =
            SessionCommands::new(Arc::new(session), Arc::new(NoClock), store.clone());
        commands.after_recorded = Some(Box::new(|commands| {
            // The message stands in the transcript when the revoke comes.
            assert!(commands.store.view().transcript.messages.contains("send-1"));
            commands.revoke();
        }));
        let id = SendId::new("send-1").expect("a key");

        assert_eq!(
            Err(SendError::Closed),
            commands.send_message(id, "one", &[])
        );

        let view = store.view();
        assert!(view.transcript.messages.contains("send-1"));
        assert!(view.transcript.not_sent.contains("send-1"));
        assert!(record.sent().is_empty());
    }
}
