#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The session's store folds core and the transcript the way `SessionView::fold` does, and its
//! commands write the transcript before the CLI hears them (SessionViewTest.kt,
//! SessionCommandsAttachmentTest.kt, SessionCommandsRewindTest.kt).

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::collections::HashMap;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, UNIX_EPOCH};

use closta_core::ports::{AgentSession, SendError};
use closta_model::{
    ApprovalDecision, Attachment, AttachmentKind, ConversationState, Turn, TurnPhase,
};
use closta_presenter::input::{ControlRequested, Decided, PassedOn, PresenterInput, SendId};
use closta_presenter::records::operations::ControlKind;
use closta_presenter::records::rewind::{REWIND_SEND_FAILED, RewindOutcome};
use closta_presenter::rewind_refusal::REWIND_UNKNOWN_MESSAGE;
use closta_presenter::session::SessionView;
use closta_presenter::transcript::{MessageSource, PartRecord};
use closta_providers::claude::fake::script::{FakeScript, Sent};
use closta_providers::claude::fake::session::{FakeAgentSession, FakeRecord};
use closta_session::commands::SessionCommands;
use closta_session::store::ConversationStore;
use serde_json::{Map, Value};

use support::{Failing, fixed_clock};

const ASKED_MS: u64 = 1_791_504_000_000;

fn send_id(id: &str) -> SendId {
    SendId::new(id).expect("a key")
}

fn fake() -> (Arc<FakeAgentSession>, FakeRecord) {
    let (session, _events, _pump) = FakeAgentSession::start(FakeScript::new(Vec::new()));
    let record = session.record();
    (Arc::new(session), record)
}

fn commands_on(session: Arc<dyn AgentSession>, store: &Arc<ConversationStore>) -> SessionCommands {
    SessionCommands::new(session, fixed_clock(0), Arc::clone(store))
}

/// What the store held when one call reached the session, and the request id it carried.
struct Seen {
    view: SessionView,
    request_id: Option<String>,
}

/// An [`AgentSession`] that looks at the store each time it is called, then passes the call on.
struct Watching {
    inner: Arc<dyn AgentSession>,
    store: Arc<ConversationStore>,
    seen: Mutex<Vec<Seen>>,
}

impl Watching {
    fn new(inner: Arc<dyn AgentSession>, store: &Arc<ConversationStore>) -> Arc<Watching> {
        Arc::new(Watching {
            inner,
            store: Arc::clone(store),
            seen: Mutex::default(),
        })
    }

    fn look(&self, request_id: Option<&str>) {
        let view = self.store.view();
        self.seen
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(Seen {
                view,
                request_id: request_id.map(str::to_owned),
            });
    }

    fn last(&self) -> Seen {
        self.seen
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .pop()
            .expect("a call reached the session")
    }
}

impl AgentSession for Watching {
    fn send_user_message(
        &self,
        text: &str,
        attachments: &[Attachment],
        uuid: Option<&str>,
    ) -> Result<(), SendError> {
        self.look(None);
        self.inner.send_user_message(text, attachments, uuid)
    }

    fn respond_to_approval(
        &self,
        decision: &ApprovalDecision,
        payload: Option<&str>,
        updated_permissions: Option<&str>,
    ) -> Result<(), SendError> {
        // Called under the store's lock: it must not look at the store.
        self.inner
            .respond_to_approval(decision, payload, updated_permissions)
    }

    fn set_model(&self, model: &str, request_id: &str) -> Result<(), SendError> {
        self.look(Some(request_id));
        self.inner.set_model(model, request_id)
    }

    fn set_permission_mode(&self, mode: &str, request_id: &str) -> Result<(), SendError> {
        self.look(Some(request_id));
        self.inner.set_permission_mode(mode, request_id)
    }

    fn request_context_usage(&self, request_id: &str) -> Result<(), SendError> {
        self.look(Some(request_id));
        self.inner.request_context_usage(request_id)
    }

    fn request_settings(&self, request_id: &str) -> Result<(), SendError> {
        self.look(Some(request_id));
        self.inner.request_settings(request_id)
    }

    fn set_effort(&self, effort: Option<&str>, request_id: &str) -> Result<(), SendError> {
        self.look(Some(request_id));
        self.inner.set_effort(effort, request_id)
    }

    fn turn_sandbox_off(&self, request_id: &str) -> Result<(), SendError> {
        self.look(Some(request_id));
        self.inner.turn_sandbox_off(request_id)
    }

    fn request_mcp_status(&self, request_id: &str) -> Result<(), SendError> {
        self.look(Some(request_id));
        self.inner.request_mcp_status(request_id)
    }

    fn set_mcp_server_enabled(
        &self,
        name: &str,
        enabled: bool,
        request_id: &str,
    ) -> Result<(), SendError> {
        self.look(Some(request_id));
        self.inner.set_mcp_server_enabled(name, enabled, request_id)
    }

    fn reconnect_mcp_server(&self, name: &str, request_id: &str) -> Result<(), SendError> {
        self.look(Some(request_id));
        self.inner.reconnect_mcp_server(name, request_id)
    }

    fn rewind_files(
        &self,
        user_message_id: &str,
        dry_run: bool,
        request_id: &str,
    ) -> Result<(), SendError> {
        self.look(Some(request_id));
        self.inner
            .rewind_files(user_message_id, dry_run, request_id)
    }

    fn interrupt(&self) -> Result<(), SendError> {
        self.look(None);
        self.inner.interrupt()
    }

    fn stop_task(&self, task_id: &str) -> Result<(), SendError> {
        self.look(None);
        self.inner.stop_task(task_id)
    }
}

/// The stdout lines of `scenario`, up to and with the one that raises its first approval.
fn up_to_the_approval(scenario: &str) -> Vec<PresenterInput> {
    let mut view = SessionView::default();
    let mut inputs = Vec::new();
    for event in common::read_capture(&format!("{scenario}.ndjson")) {
        let input = PresenterInput::Event(event);
        view = view.fold(&input);
        inputs.push(input);
        if !view.conversation.pending_approvals.is_empty() {
            return inputs;
        }
    }
    panic!("{scenario} raises no approval");
}

fn store_with(inputs: &[PresenterInput]) -> Arc<ConversationStore> {
    let store = Arc::new(ConversationStore::default());
    for input in inputs {
        store.transition(|view| view.fold(input));
    }
    store
}

fn the_pending_request(store: &ConversationStore) -> String {
    let pending = store.conversation().pending_approvals;
    assert_eq!(1, pending.len());
    pending[0].request_id.clone()
}

fn approvals_sent(record: &FakeRecord) -> Vec<Sent> {
    record
        .sent()
        .into_iter()
        .filter(|sent| matches!(sent, Sent::Approval { .. }))
        .collect()
}

#[test]
fn the_store_folds_every_capture_as_session_view_does() {
    let captures = common::capture_file_names();
    assert!(captures.len() >= 40, "the 40 captures are on disk");
    for capture in captures {
        let store = ConversationStore::default();
        let mut host = SessionView::default();
        for (index, event) in common::read_capture(&capture).into_iter().enumerate() {
            let input = PresenterInput::Event(event);
            store.transition(|view| view.fold(&input));
            host = host.fold(&input);
            let view = store.view();
            assert!(host == view, "{capture} #{index}");
            assert!(
                store.conversation() == view.conversation,
                "{capture} #{index}"
            );
        }
    }
}

#[test]
fn a_sent_message_is_in_the_transcript_before_the_cli_is_told() {
    let store = Arc::new(ConversationStore::default());
    let (session, record) = fake();
    let watching = Watching::new(session, &store);
    let commands = commands_on(watching.clone(), &store);

    commands
        .send_message(send_id("send-1"), "Explain the build", &[])
        .expect("sent");

    let seen = watching.last().view;
    assert_eq!(
        vec!["send-1"],
        seen.transcript.messages.order().collect::<Vec<_>>()
    );
    let sent = record.sent();
    assert!(
        matches!(&sent[..], [Sent::UserMessage { text, uuid: Some(_), .. }] if text == "Explain the build")
    );
    let view = store.view();
    let message = view.transcript.messages.get("send-1").expect("the message");
    assert_eq!(MessageSource::Sent, message.source);
    assert_eq!(
        vec!["send-1"],
        view.transcript.messages.order().collect::<Vec<_>>()
    );
}

#[test]
fn a_send_the_session_refuses_is_recorded_as_not_sent() {
    let store = Arc::new(ConversationStore::default());
    let commands = commands_on(Arc::new(Failing), &store);

    assert_eq!(
        Err(SendError::Closed),
        commands.send_message(send_id("send-1"), "one", &[])
    );

    let view = store.view();
    assert!(view.transcript.messages.contains("send-1"));
    assert!(view.transcript.not_sent.contains("send-1"));
    assert_eq!(0, view.transcript.routing.sends);
}

#[test]
fn a_revoked_send_records_nothing() {
    let store = Arc::new(ConversationStore::default());
    let (session, record) = fake();
    let commands = commands_on(session, &store);
    commands.revoke();

    assert_eq!(
        Err(SendError::Closed),
        commands.send_message(send_id("send-1"), "one", &[])
    );

    let view = store.view();
    assert!(view.transcript.messages.is_empty());
    assert!(view.transcript.not_sent.is_empty());
    assert_eq!(0, view.transcript.routing.sends);
    assert!(record.sent().is_empty());
}

#[test]
fn an_approval_is_answered_to_the_cli_once_however_often_the_answer_is_given() {
    let store = store_with(&up_to_the_approval("05-permission-can-use-tool"));
    let request_id = the_pending_request(&store);
    let (session, record) = fake();
    let commands = SessionCommands::new(session, fixed_clock(ASKED_MS + 1_000), store);
    let asked = UNIX_EPOCH + Duration::from_millis(ASKED_MS);

    for _ in 0..2 {
        commands
            .respond_to_approval(
                &ApprovalDecision::Allow {
                    request_id: request_id.clone(),
                },
                asked,
                Some("{}"),
                PassedOn::default(),
            )
            .expect("answered");
    }

    assert_eq!(1, approvals_sent(&record).len());
}

#[test]
fn an_answer_goes_with_its_payload_and_resolves_the_approval_in_core_and_in_the_transcript() {
    let up_to_request = up_to_the_approval("05-permission-can-use-tool");
    let store = store_with(&up_to_request);
    let request_id = the_pending_request(&store);
    let (session, record) = fake();
    let commands = SessionCommands::new(session, fixed_clock(ASKED_MS + 2_000), Arc::clone(&store));
    let asked = UNIX_EPOCH + Duration::from_millis(ASKED_MS);
    let mut input = Map::new();
    input.insert("file_path".into(), Value::String("x".into()));
    let passed_on = PassedOn {
        input: Some(Arc::new(input)),
        ..PassedOn::default()
    };
    let allow = ApprovalDecision::Allow {
        request_id: request_id.clone(),
    };

    commands
        .respond_to_approval(
            &allow,
            asked,
            Some(r#"{"file_path":"x"}"#),
            passed_on.clone(),
        )
        .expect("answered");

    assert_eq!(
        vec![Sent::Approval {
            decision: allow.clone(),
            payload: Some(r#"{"file_path":"x"}"#.into()),
            updated_permissions: None,
        }],
        record.sent()
    );
    assert!(store.view().conversation.pending_approvals.is_empty());
    assert!(store.conversation().pending_approvals.is_empty());
    // The same as the host's fold of the answer, two seconds after the request.
    let host = up_to_request
        .iter()
        .chain([&PresenterInput::Decided(Decided {
            decision: allow,
            elapsed_ms: 2_000,
            passed_on,
        })])
        .fold(SessionView::default(), |view, input| view.fold(input));
    assert!(host == store.view());
    let approval = store
        .view()
        .transcript
        .approvals
        .get(&request_id)
        .cloned()
        .expect("the approval");
    assert!(approval.outcome.is_some());
}

#[test]
fn accepted_suggestions_go_to_the_session_and_a_failed_answer_is_recorded() {
    let store = store_with(&up_to_the_approval("16-permission-suggestion-accept"));
    let request_id = the_pending_request(&store);
    let (session, record) = fake();
    let commands = SessionCommands::new(session, fixed_clock(ASKED_MS + 1_000), Arc::clone(&store));
    let asked = UNIX_EPOCH + Duration::from_millis(ASKED_MS);

    commands.answer_failed(&request_id, "The answer could not be passed on.");

    let failed = store
        .view()
        .transcript
        .approvals
        .get(&request_id)
        .cloned()
        .expect("the approval");
    assert_eq!(
        Some("The answer could not be passed on."),
        failed.failure.as_deref()
    );
    assert_eq!(1, failed.failures);
    assert_eq!(
        1,
        store.conversation().pending_approvals.len(),
        "a failed answer leaves the approval pending"
    );

    let updated = r#"[{"type":"setMode","mode":"acceptEdits","destination":"session"}]"#;
    commands
        .respond_to_approval(
            &ApprovalDecision::Allow {
                request_id: request_id.clone(),
            },
            asked,
            Some(r#"{"file_path":"x"}"#),
            PassedOn {
                updated_permissions: Some(updated.into()),
                accepted_suggestions: vec!["s1".into()],
                input: None,
            },
        )
        .expect("answered");

    let reached: Vec<Option<String>> = approvals_sent(&record)
        .into_iter()
        .map(|sent| match sent {
            Sent::Approval {
                updated_permissions,
                ..
            } => updated_permissions,
            _ => None,
        })
        .collect();
    assert_eq!(
        vec![Some(updated.to_owned())],
        reached,
        "the suggestions reach the session"
    );
    let settled = store
        .view()
        .transcript
        .approvals
        .get(&request_id)
        .cloned()
        .expect("the approval");
    assert_eq!(vec!["s1".to_owned()], settled.accepted_suggestions.to_vec());
    assert_eq!(None, settled.failure);
    assert_eq!(1, settled.failures);
}

#[test]
fn a_failed_send_of_an_answer_keeps_the_approval_open() {
    let store = store_with(&up_to_the_approval("05-permission-can-use-tool"));
    let request_id = the_pending_request(&store);
    let before = store.view();
    let commands = commands_on(Arc::new(Failing), &store);

    let answered = commands.respond_to_approval(
        &ApprovalDecision::Allow {
            request_id: request_id.clone(),
        },
        UNIX_EPOCH,
        None,
        PassedOn::default(),
    );

    assert_eq!(Err(SendError::Closed), answered);
    assert_eq!(request_id, the_pending_request(&store));
    assert!(before == store.view());
}

#[test]
fn a_files_path_goes_into_the_threads_record_of_it_and_a_pasted_image_has_none() {
    let store = Arc::new(ConversationStore::default());
    let (session, _record) = fake();
    let commands = commands_on(session, &store);
    let file = Attachment {
        kind: AttachmentKind::Text,
        media_type: "text/plain".into(),
        name: "a.txt".into(),
        bytes: vec![1],
        path: Some("/work/a.txt".into()),
    };
    let pasted = Attachment {
        kind: AttachmentKind::Image,
        media_type: "image/png".into(),
        name: "shot.png".into(),
        bytes: vec![2, 3],
        path: None,
    };

    commands
        .send_message(send_id("send-1"), "look", &[file, pasted])
        .expect("sent");

    let view = store.view();
    let kept: Vec<(Option<String>, i64)> = view
        .transcript
        .messages
        .values()
        .flat_map(|message| {
            message
                .parts
                .values()
                .filter_map(|part| match part.as_ref() {
                    PartRecord::Attachment(record) => Some((record.path.clone(), record.size)),
                    _ => None,
                })
                .collect::<Vec<_>>()
        })
        .collect();
    assert_eq!(vec![(Some("/work/a.txt".to_owned()), 1), (None, 2)], kept);
}

fn sent_uuids(record: &FakeRecord) -> Vec<Option<String>> {
    record
        .sent()
        .into_iter()
        .filter_map(|sent| match sent {
            Sent::UserMessage { uuid, .. } => Some(uuid),
            _ => None,
        })
        .collect()
}

#[test]
fn the_uuid_the_cli_is_given_is_the_one_the_view_keeps_under_the_messages_key() {
    let store = Arc::new(ConversationStore::default());
    let (session, record) = fake();
    let commands = commands_on(session, &store);

    commands
        .send_message(send_id("send-1"), "one", &[])
        .expect("sent");
    commands
        .send_message(send_id("send-2"), "two", &[])
        .expect("sent");

    let given: Vec<String> = sent_uuids(&record)
        .into_iter()
        .map(|uuid| uuid.expect("a uuid"))
        .collect();
    assert_eq!(2, given.len());
    assert!(given.iter().all(|uuid| !uuid.is_empty()));
    assert_ne!(given[0], given[1], "a uuid for each message");
    let kept: HashMap<String, String> = store
        .view()
        .transcript
        .user_uuids
        .iter()
        .map(|(key, uuid)| (key.clone(), uuid.clone()))
        .collect();
    assert_eq!(
        HashMap::from([
            ("send-1".to_owned(), given[0].clone()),
            ("send-2".to_owned(), given[1].clone()),
        ]),
        kept
    );
}

#[test]
fn a_rewind_names_the_uuid_of_its_message_and_stands_in_the_view_as_pending_before_it_is_written() {
    let store = Arc::new(ConversationStore::default());
    let (session, record) = fake();
    let watching = Watching::new(session, &store);
    let commands = commands_on(watching.clone(), &store);
    commands
        .send_message(send_id("send-1"), "one", &[])
        .expect("sent");

    commands
        .rewind_files("c1", "send-1", true)
        .expect("written");

    let seen = watching.last();
    assert_eq!(
        Some(RewindOutcome::Pending),
        seen.view
            .transcript
            .operations
            .rewind
            .as_ref()
            .map(|rewind| rewind.outcome)
    );
    let uuid = sent_uuids(&record).remove(0);
    let written = record.sent().pop().expect("the rewind");
    let Sent::RewindFiles {
        user_message_id,
        dry_run,
        request_id,
    } = written
    else {
        panic!("not a rewind: {written:?}");
    };
    assert_eq!(uuid, Some(user_message_id));
    assert!(dry_run);
    let view = store.view();
    let rewind = view
        .transcript
        .operations
        .rewind
        .as_ref()
        .expect("a record");
    assert_eq!(Some(request_id), rewind.request_id);
    assert_eq!("c1", rewind.command_id);
    assert_eq!("send-1", rewind.message_id);
    assert_eq!(
        1, rewind.sends_at,
        "how many messages had been sent when it was asked"
    );
}

#[test]
fn a_message_the_view_has_no_uuid_for_is_refused_and_nothing_is_written() {
    let store = Arc::new(ConversationStore::default());
    let (session, record) = fake();
    let commands = commands_on(session, &store);

    commands
        .rewind_files("c1", "send-9", false)
        .expect("refused, not failed");

    assert!(record.sent().is_empty());
    let view = store.view();
    let rewind = view
        .transcript
        .operations
        .rewind
        .as_ref()
        .expect("a record");
    assert_eq!(RewindOutcome::Failed, rewind.outcome);
    assert_eq!(Some(REWIND_UNKNOWN_MESSAGE), rewind.detail.as_deref());
}

#[test]
fn a_rewind_that_cannot_be_written_is_a_failed_record_and_an_error() {
    let store = Arc::new(ConversationStore::default());
    let (session, _record) = fake();
    commands_on(session, &store)
        .send_message(send_id("send-1"), "one", &[])
        .expect("sent");
    let broken = commands_on(Arc::new(Failing), &store);

    let written = broken.rewind_files("c1", "send-1", true);

    assert_eq!(Err(SendError::Closed), written);
    let view = store.view();
    let rewind = view
        .transcript
        .operations
        .rewind
        .as_ref()
        .expect("a record");
    assert_eq!(RewindOutcome::Failed, rewind.outcome);
    assert_eq!(Some(REWIND_SEND_FAILED), rewind.detail.as_deref());
}

#[test]
fn a_refusal_by_the_host_is_written_on_the_view_as_a_failed_answer_with_its_sentence() {
    let store = Arc::new(ConversationStore::default());
    let (session, _record) = fake();

    commands_on(session, &store).rewind_not_sent("c2", "send-1", false, "A turn is running.");

    let view = store.view();
    let rewind = view
        .transcript
        .operations
        .rewind
        .as_ref()
        .expect("a record");
    assert_eq!(RewindOutcome::Failed, rewind.outcome);
    assert_eq!(Some("A turn is running."), rewind.detail.as_deref());
    assert_eq!("c2", rewind.command_id);
}

#[test]
fn a_record_keeps_how_many_turns_there_had_been_the_clis_own_included_and_a_refused_one_keeps_none()
{
    let store = Arc::new(ConversationStore::default());
    let (session, _record) = fake();
    let commands = commands_on(session, &store);
    commands
        .send_message(send_id("send-1"), "one", &[])
        .expect("sent");
    store.transition(|view| {
        let closed = Turn {
            command_uuid: "u1".into(),
            phase: TurnPhase::Closed,
            incomplete_reason: None,
            lifecycle_done: false,
        };
        SessionView {
            conversation: ConversationState {
                turns: [closed.clone(), closed].into_iter().collect(),
                spontaneous_resume_count: 1,
                ..ConversationState::default()
            },
            ..view
        }
    });

    commands
        .rewind_files("c1", "send-1", true)
        .expect("written");
    let turns_at = |store: &ConversationStore| {
        store
            .view()
            .transcript
            .operations
            .rewind
            .as_ref()
            .expect("a record")
            .turns_at
    };
    assert_eq!(3, turns_at(&store));

    commands
        .rewind_files("c2", "send-9", true)
        .expect("refused, not failed");
    assert_eq!(0, turns_at(&store));
}

/// One control request: how the host makes it, what it records and what reaches the session.
struct Control {
    name: &'static str,
    call: fn(&SessionCommands) -> Result<(), SendError>,
    kind: ControlKind,
    value: Option<&'static str>,
    sent: fn(String) -> Sent,
}

fn controls() -> Vec<Control> {
    vec![
        Control {
            name: "switch_model",
            call: |commands| commands.switch_model("opus"),
            kind: ControlKind::Model,
            value: Some("opus"),
            sent: |request_id| Sent::SetModel {
                model: "opus".into(),
                request_id,
            },
        },
        Control {
            name: "switch_mode",
            call: |commands| commands.switch_mode("plan"),
            kind: ControlKind::Mode,
            value: Some("plan"),
            sent: |request_id| Sent::SetPermissionMode {
                mode: "plan".into(),
                request_id,
            },
        },
        Control {
            name: "request_context_usage",
            call: SessionCommands::request_context_usage,
            kind: ControlKind::Context,
            value: None,
            sent: |request_id| Sent::RequestContextUsage { request_id },
        },
        Control {
            name: "request_settings",
            call: SessionCommands::request_settings,
            kind: ControlKind::Settings,
            value: None,
            sent: |request_id| Sent::RequestSettings { request_id },
        },
        Control {
            name: "switch_effort",
            call: |commands| commands.switch_effort("high"),
            kind: ControlKind::Effort,
            value: Some("high"),
            sent: |request_id| Sent::SetEffort {
                effort: Some("high".into()),
                request_id,
            },
        },
        Control {
            name: "turn_sandbox_off",
            call: SessionCommands::turn_sandbox_off,
            kind: ControlKind::Sandbox,
            value: Some("false"),
            sent: |request_id| Sent::TurnSandboxOff { request_id },
        },
        Control {
            name: "request_mcp_status",
            call: SessionCommands::request_mcp_status,
            kind: ControlKind::McpStatus,
            value: None,
            sent: |request_id| Sent::RequestMcpStatus { request_id },
        },
        Control {
            name: "set_mcp_server_enabled(true)",
            call: |commands| commands.set_mcp_server_enabled("files", true),
            kind: ControlKind::McpEnable,
            value: Some("files"),
            sent: |request_id| Sent::SetMcpServerEnabled {
                name: "files".into(),
                enabled: true,
                request_id,
            },
        },
        Control {
            name: "set_mcp_server_enabled(false)",
            call: |commands| commands.set_mcp_server_enabled("files", false),
            kind: ControlKind::McpDisable,
            value: Some("files"),
            sent: |request_id| Sent::SetMcpServerEnabled {
                name: "files".into(),
                enabled: false,
                request_id,
            },
        },
        Control {
            name: "reconnect_mcp_server",
            call: |commands| commands.reconnect_mcp_server("files"),
            kind: ControlKind::McpReconnect,
            value: Some("files"),
            sent: |request_id| Sent::ReconnectMcpServer {
                name: "files".into(),
                request_id,
            },
        },
    ]
}

fn requested(control: &Control, request_id: &str) -> SessionView {
    SessionView::default().fold(&PresenterInput::ControlRequested(ControlRequested {
        request_id: request_id.to_owned(),
        kind: control.kind,
        value: control.value.map(str::to_owned),
    }))
}

fn failed(control: &Control, request_id: &str) -> SessionView {
    requested(control, request_id).fold(&PresenterInput::ControlSendFailed(request_id.to_owned()))
}

#[test]
fn every_control_request_is_recorded_before_it_is_written_and_fails_on_the_record() {
    for control in controls() {
        let name = control.name;
        let store = Arc::new(ConversationStore::default());
        let (session, record) = fake();
        let watching = Watching::new(session, &store);

        (control.call)(&commands_on(watching.clone(), &store)).expect(name);

        let seen = watching.last();
        let request_id = seen.request_id.expect(name);
        assert_eq!(
            Some((control.sent)(request_id.clone())),
            record.sent().pop(),
            "{name}"
        );
        assert!(
            requested(&control, &request_id) == seen.view,
            "{name}: recorded before it was written"
        );
        assert!(requested(&control, &request_id) == store.view(), "{name}");

        let store = Arc::new(ConversationStore::default());
        let watching = Watching::new(Arc::new(Failing), &store);

        let written = (control.call)(&commands_on(watching.clone(), &store));

        assert_eq!(Err(SendError::Closed), written, "{name}");
        let request_id = watching.last().request_id.expect(name);
        assert!(
            failed(&control, &request_id) == store.view(),
            "{name}: failed on the record"
        );
    }
}

#[test]
fn revoked_commands_send_nothing_and_record_the_failure() {
    let store = Arc::new(ConversationStore::default());
    let (session, record) = fake();
    let commands = commands_on(session, &store);
    assert!(!commands.is_revoked());

    commands.revoke();

    assert!(commands.is_revoked());
    assert_eq!(Err(SendError::Closed), commands.switch_model("opus"));
    assert!(record.sent().is_empty());
    let request_id = store
        .view()
        .transcript
        .operations
        .switches
        .last()
        .expect("the switch is recorded")
        .id
        .clone();
    let model = &controls()[0];
    assert!(failed(model, &request_id) == store.view());

    // Kotlin records the message and the stop, then throws; a revoked session records neither,
    // so it shows no "stopping…" and no message that was never sent.
    let before = store.view();
    assert_eq!(
        Err(SendError::Closed),
        commands.send_message(send_id("send-1"), "one", &[])
    );
    assert_eq!(Err(SendError::Closed), commands.interrupt());
    assert!(record.sent().is_empty());
    assert!(
        before == store.view(),
        "neither the message nor the stop is recorded"
    );

    assert_eq!(Err(SendError::Closed), commands.stop_task("task-1"));
    assert!(record.sent().is_empty());

    // A rewind of a message with a uuid is asked, then fails on the record.
    let (live, _record) = fake();
    commands_on(live, &store)
        .send_message(send_id("send-2"), "two", &[])
        .expect("sent");
    assert_eq!(
        Err(SendError::Closed),
        commands.rewind_files("c1", "send-2", false)
    );
    assert!(record.sent().is_empty());
    let view = store.view();
    let rewind = view
        .transcript
        .operations
        .rewind
        .as_ref()
        .expect("a record");
    assert!(rewind.request_id.is_some(), "it was asked");
    assert_eq!(RewindOutcome::Failed, rewind.outcome);
    assert_eq!(Some(REWIND_SEND_FAILED), rewind.detail.as_deref());

    // An answer is not sent, and the approval stays open.
    let store = store_with(&up_to_the_approval("05-permission-can-use-tool"));
    let request_id = the_pending_request(&store);
    let (session, record) = fake();
    let commands = commands_on(session, &store);
    commands.revoke();
    assert_eq!(
        Err(SendError::Closed),
        commands.respond_to_approval(
            &ApprovalDecision::Allow {
                request_id: request_id.clone()
            },
            UNIX_EPOCH + Duration::from_millis(ASKED_MS),
            Some("{}"),
            PassedOn::default(),
        )
    );
    assert!(record.sent().is_empty());
    assert_eq!(request_id, the_pending_request(&store));
}

#[test]
fn view_pings_coalesce_while_no_one_reads() {
    fn one_more(view: SessionView) -> SessionView {
        SessionView {
            conversation: ConversationState {
                spontaneous_resume_count: view.conversation.spontaneous_resume_count + 1,
                ..view.conversation
            },
            ..view
        }
    }
    let store = ConversationStore::default();
    let unread = store.watch();

    for _ in 0..1_000 {
        store.transition(one_more);
    }

    assert_eq!(1, unread.len());
    assert_eq!(1_000, store.conversation().spontaneous_resume_count);

    let reader = store.watch();
    drop(unread);
    store.transition(one_more);

    assert_eq!(1, reader.len());
    assert_eq!(1_001, store.view().conversation.spontaneous_resume_count);
}
