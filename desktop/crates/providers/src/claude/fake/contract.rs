//! The one conformance suite for [`AgentSession`]. Mirrors AgentSessionContract.kt.
//!
//! The same fourteen checks run against `ClaudeSession` over the in-memory process and against
//! [`FakeAgentSession`](super::session::FakeAgentSession); only the [`ContractSubject`] differs.
//! Each implementation's test file calls every check from its own `#[test]`.
//!
//! Every assertion is on what a caller can see: the events, how the pump ended and the pure
//! `resolve_approval`. The subject's readers report what reached the implementation (its stdin,
//! or the fake's record). No clock is used on the tested path: one `LocalExecutor` runs the pump
//! and the test body, and Kotlin's `yield` hand-off is `try_tick` until nothing can run. The
//! [`TIMEOUT`] is only a net for a session that never lets go.

use std::future::Future;
use std::time::Duration;

use async_channel::Receiver;
use closta_core::ports::AgentSession;
use closta_core::resolve_approval;
use closta_model::{
    AgentEvent, ApprovalDecision, ApprovalKind, Attachment, AttachmentKind, ConversationState,
    PendingApproval,
};
use futures_lite::future;
use smol::{LocalExecutor, Task};

use crate::claude::session::PumpEnd;

/// The bound on each check as a whole (Kotlin's `@Timeout`).
pub const TIMEOUT: Duration = Duration::from_secs(30);

const OTHER_REQUEST: &str = "req-other";

/// Which behaviour a check exercises; [`ContractSubject::session_for`] scripts a session for it.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Scenario {
    /// Streams assistant output and ends the turn with a result.
    SendTurn,
    /// Emits a control request, holds on it, then goes on to a result once the host allows.
    ApprovalAllow,
    /// Emits a control request, holds on it, then goes on to a result once the host denies.
    ApprovalDeny,
    /// Emits a control request, holds on it, then goes on to a result on an AFK timeout.
    AfkTimeout,
    /// Emits a control request, holds on it, then ends when the host interrupts.
    Interrupt,
    /// Emits a control request and holds on it for good unless answered.
    Unanswered,
    /// Emits some events, then fails: a dropped connection or a dead process.
    DroppedConnection,
    /// Fails before any event: a launch that gave no process.
    LaunchFailure,
}

/// One control request the session was asked to make: its kind, its id, its value.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct RequestGiven {
    pub subtype: String,
    pub request_id: String,
    pub value: Option<String>,
}

/// One user message the session was given: its text and how many attachments went with it.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct MessageGiven {
    pub text: String,
    pub attachments: usize,
}

/// An implementation under the contract. The readers report on the session the last
/// [`ContractSubject::session_for`] made.
pub trait ContractSubject: Default {
    /// A session scripted for `scenario`: the handle, the events and the pump.
    fn session_for(
        &mut self,
        scenario: Scenario,
    ) -> (
        Box<dyn AgentSession>,
        Receiver<AgentEvent>,
        future::Boxed<PumpEnd>,
    );

    /// The opaque body the host attaches to an AFK timeout (`updatedInput.afkTimeoutMs`).
    fn afk_payload(&self) -> Option<String> {
        None
    }

    /// The accepted permissions given with each allow, in order, as the JSON text passed on;
    /// `None` for an allow that carried none.
    fn updated_permissions_given(&self) -> Vec<Option<String>>;

    /// The model, mode, usage, MCP and rewind requests made, in order.
    fn requests_given(&self) -> Vec<RequestGiven>;

    /// The uuids of the user messages given, in order; `None` where none is to be seen.
    fn uuids_given(&self) -> Vec<Option<String>>;

    /// The user messages given, in order.
    fn messages_given(&self) -> Vec<MessageGiven>;
}

/// Runs `work` on `executor` to its end, failing instead of hanging past [`TIMEOUT`].
pub fn within<T>(executor: &LocalExecutor<'_>, work: impl Future<Output = T>) -> T {
    smol::block_on(executor.run(future::race(work, async {
        async_io::Timer::after(TIMEOUT).await;
        panic!("the check did not end within {TIMEOUT:?}")
    })))
}

/// Runs every task of `executor` until none can run: Kotlin's `yield` hand-off, made exact.
/// Each check spawns one task, the pump, so it is never stolen into a runner's local queue
/// where `try_tick` cannot see it.
pub fn settle(executor: &LocalExecutor<'_>) {
    while executor.try_tick() {}
}

/// Cancels the pump's task and waits until its future is dropped (Kotlin's `cancelAndJoin`).
pub fn cancel_and_join(executor: &LocalExecutor<'_>, pump: Task<PumpEnd>) {
    within(executor, pump.cancel());
}

/// Reads `events` into `received` until a control request arrives, and returns its id.
pub async fn await_control_request(
    events: &Receiver<AgentEvent>,
    received: &mut Vec<AgentEvent>,
) -> String {
    loop {
        if let Some(request_id) = received.iter().find_map(|event| match event {
            AgentEvent::ControlRequest { request_id, .. } => Some(request_id.clone()),
            _ => None,
        }) {
            return request_id;
        }
        match events.recv().await {
            Ok(event) => received.push(event),
            Err(_) => panic!("the events closed before a control request"),
        }
    }
}

/// Reads `events` into `received` until they close.
pub async fn collect_into(events: &Receiver<AgentEvent>, received: &mut Vec<AgentEvent>) {
    while let Ok(event) = events.recv().await {
        received.push(event);
    }
}

/// Moves what is already in `events` into `received`, without running anything.
fn drain_into(events: &Receiver<AgentEvent>, received: &mut Vec<AgentEvent>) {
    while let Ok(event) = events.try_recv() {
        received.push(event);
    }
}

fn is_result(event: &AgentEvent) -> bool {
    matches!(event, AgentEvent::Result { .. })
}

fn request(subtype: &str, request_id: &str, value: Option<&str>) -> RequestGiven {
    RequestGiven {
        subtype: subtype.to_string(),
        request_id: request_id.to_string(),
        value: value.map(str::to_string),
    }
}

/// Holds an unanswered session at its control request, lets `act` send through it, runs
/// everything that can run, then cancels the pump.
fn while_unanswered<S: ContractSubject>(subject: &mut S, act: impl FnOnce(&dyn AgentSession)) {
    let (session, events, pump) = subject.session_for(Scenario::Unanswered);
    let executor = LocalExecutor::new();
    let pump = executor.spawn(pump);
    let mut received = Vec::new();
    within(&executor, async {
        await_control_request(&events, &mut received).await;
        act(session.as_ref());
        settle(&executor);
    });
    cancel_and_join(&executor, pump);
}

pub fn a_model_mode_and_usage_request_is_written_with_the_id_the_caller_gave_it<
    S: ContractSubject,
>() {
    let mut subject = S::default();
    while_unanswered(&mut subject, |session| {
        session.set_model("opus", "id-model").unwrap();
        session.set_permission_mode("plan", "id-mode").unwrap();
        session.request_context_usage("id-usage").unwrap();
    });
    assert_eq!(
        vec![
            request("set_model", "id-model", Some("opus")),
            request("set_permission_mode", "id-mode", Some("plan")),
            request("get_context_usage", "id-usage", Some("summary")),
        ],
        subject.requests_given(),
        "each line carries the caller's id as its request_id, and the usage request asks for the summary"
    );
}

pub fn an_mcp_status_toggle_and_reconnect_request_is_written_with_the_id_the_caller_gave_it<
    S: ContractSubject,
>() {
    let mut subject = S::default();
    while_unanswered(&mut subject, |session| {
        session.request_mcp_status("id-status").unwrap();
        session
            .set_mcp_server_enabled("fake-echo", false, "id-off")
            .unwrap();
        session
            .set_mcp_server_enabled("fake-echo", true, "id-on")
            .unwrap();
        session
            .reconnect_mcp_server("fake-echo", "id-reconnect")
            .unwrap();
    });
    let mcp: Vec<RequestGiven> = subject
        .requests_given()
        .into_iter()
        .filter(|given| given.subtype.starts_with("mcp_"))
        .collect();
    assert_eq!(
        vec![
            request("mcp_status", "id-status", None),
            request("mcp_toggle", "id-off", Some("fake-echo:false")),
            request("mcp_toggle", "id-on", Some("fake-echo:true")),
            request("mcp_reconnect", "id-reconnect", Some("fake-echo")),
        ],
        mcp,
        "each line carries the caller's id as its request_id, the name, and for a toggle the wanted value"
    );
}

pub fn a_uuid_the_caller_gave_a_message_goes_with_it_and_a_rewind_request_names_it<
    S: ContractSubject,
>() {
    let mut subject = S::default();
    while_unanswered(&mut subject, |session| {
        session
            .send_user_message("first", &[], Some("uuid-first"))
            .unwrap();
        session.rewind_files("uuid-first", true, "id-dry").unwrap();
        session
            .rewind_files("uuid-first", false, "id-real")
            .unwrap();
    });
    assert_eq!(vec![Some("uuid-first".to_string())], subject.uuids_given());
    let rewinds: Vec<RequestGiven> = subject
        .requests_given()
        .into_iter()
        .filter(|given| given.subtype == "rewind_files")
        .collect();
    assert_eq!(
        vec![
            request("rewind_files", "id-dry", Some("uuid-first:true")),
            request("rewind_files", "id-real", Some("uuid-first:false")),
        ],
        rewinds,
        "each line carries the caller's id, the uuid of the message and whether it is a dry run"
    );
}

pub fn a_message_goes_through_with_its_attachments_and_a_message_without_any_as_it_always_did<
    S: ContractSubject,
>() {
    let mut subject = S::default();
    let (session, events, pump) = subject.session_for(Scenario::SendTurn);
    let image = Attachment {
        kind: AttachmentKind::Image,
        media_type: "image/png".to_string(),
        name: "a.png".to_string(),
        bytes: vec![1, 2, 3],
        path: None,
    };
    let notes = Attachment {
        kind: AttachmentKind::Text,
        media_type: "text/plain".to_string(),
        name: "notes.txt".to_string(),
        bytes: b"hello".to_vec(),
        path: None,
    };
    session
        .send_user_message("with two", &[image, notes], None)
        .unwrap();
    session.send_user_message("plain", &[], None).unwrap();
    let executor = LocalExecutor::new();
    let pump = executor.spawn(pump);
    let mut received = Vec::new();
    within(&executor, async {
        collect_into(&events, &mut received).await;
        pump.await
    });
    assert_eq!(
        vec![
            MessageGiven {
                text: "with two".to_string(),
                attachments: 2,
            },
            MessageGiven {
                text: "plain".to_string(),
                attachments: 0,
            },
        ],
        subject.messages_given(),
        "the attachments go with the message that carried them, and none go with the other"
    );
}

pub fn send_streams_through_to_a_turn_result<S: ContractSubject>() {
    let mut subject = S::default();
    let (session, events, pump) = subject.session_for(Scenario::SendTurn);
    session.send_user_message("hi", &[], None).unwrap();
    let executor = LocalExecutor::new();
    let pump = executor.spawn(pump);
    let mut received = Vec::new();
    within(&executor, async {
        collect_into(&events, &mut received).await;
        pump.await
    });
    let result_index = received.iter().position(is_result);
    assert!(
        result_index.is_some(),
        "the turn should stream through to a result"
    );
    let stream_index = received.iter().position(|event| {
        matches!(
            event,
            AgentEvent::StreamEvent { .. } | AgentEvent::Assistant { .. }
        )
    });
    assert!(
        stream_index.is_some_and(|stream| Some(stream) < result_index),
        "assistant output should arrive before the result"
    );
}

/// Answers the control request of `scenario` with the decision `decision_for` makes, and lets the
/// stream run to its end.
fn round_trip<S: ContractSubject>(
    scenario: Scenario,
    decision_for: impl Fn(String) -> ApprovalDecision,
) {
    let mut subject = S::default();
    let (session, events, pump) = subject.session_for(scenario);
    let executor = LocalExecutor::new();
    let pump = executor.spawn(pump);
    let mut received = Vec::new();
    let request_id = within(&executor, async {
        let request_id = await_control_request(&events, &mut received).await;
        session
            .respond_to_approval(&decision_for(request_id.clone()), None, None)
            .unwrap();
        collect_into(&events, &mut received).await;
        pump.await;
        request_id
    });
    assert!(
        received.iter().any(is_result),
        "the turn should resume after the decision"
    );
    assert_drops_only(&decision_for(request_id));
}

pub fn allow_completes_an_approval_round_trip_and_drops_only_its_pending<S: ContractSubject>() {
    round_trip::<S>(Scenario::ApprovalAllow, |request_id| {
        ApprovalDecision::Allow { request_id }
    });
}

pub fn an_allow_passes_the_accepted_permissions_on_as_given_and_an_allow_without_any_passes_none<
    S: ContractSubject,
>() {
    let accepted = r#"[{"type":"setMode","mode":"acceptEdits","destination":"session"}]"#;
    let mut subject = S::default();
    for given in [Some(accepted), None] {
        let (session, events, pump) = subject.session_for(Scenario::ApprovalAllow);
        let executor = LocalExecutor::new();
        let pump = executor.spawn(pump);
        let mut received = Vec::new();
        within(&executor, async {
            let request_id = await_control_request(&events, &mut received).await;
            session
                .respond_to_approval(&ApprovalDecision::Allow { request_id }, Some("{}"), given)
                .unwrap();
            collect_into(&events, &mut received).await;
            pump.await
        });
        assert_eq!(
            vec![given.map(str::to_string)],
            subject.updated_permissions_given(),
            "the session passes on what it was given"
        );
    }
}

pub fn deny_completes_an_approval_round_trip_and_drops_only_its_pending<S: ContractSubject>() {
    round_trip::<S>(Scenario::ApprovalDeny, |request_id| {
        ApprovalDecision::Deny { request_id }
    });
}

pub fn an_afk_timeout_resolves_the_question_with_no_waiting<S: ContractSubject>() {
    let mut subject = S::default();
    let (session, events, pump) = subject.session_for(Scenario::AfkTimeout);
    let payload = subject.afk_payload();
    let executor = LocalExecutor::new();
    let pump = executor.spawn(pump);
    let mut received = Vec::new();
    let request_id = within(&executor, async {
        let request_id = await_control_request(&events, &mut received).await;
        session
            .respond_to_approval(
                &ApprovalDecision::AfkTimeout {
                    request_id: request_id.clone(),
                },
                payload.as_deref(),
                None,
            )
            .unwrap();
        collect_into(&events, &mut received).await;
        pump.await;
        request_id
    });
    assert!(
        received.iter().any(is_result),
        "the turn should resume after the afk timeout"
    );
    assert_drops_only(&ApprovalDecision::AfkTimeout { request_id });
}

pub fn interrupt_ends_a_stream_that_is_waiting_on_the_host<S: ContractSubject>() {
    let mut subject = S::default();
    let (session, events, pump) = subject.session_for(Scenario::Interrupt);
    let executor = LocalExecutor::new();
    let pump = executor.spawn(pump);
    let mut received = Vec::new();
    within(&executor, async {
        await_control_request(&events, &mut received).await;
        session.interrupt().unwrap();
        // Ends only if the interrupt let the wait go.
        collect_into(&events, &mut received).await;
        pump.await
    });
    assert!(
        !received.is_empty(),
        "events before the interrupt should have arrived"
    );
}

pub fn an_unanswered_request_never_advances_the_stream_and_stays_cancellable<S: ContractSubject>() {
    let mut subject = S::default();
    let (_session, events, pump) = subject.session_for(Scenario::Unanswered);
    let executor = LocalExecutor::new();
    let pump = executor.spawn(pump);
    let mut received = Vec::new();
    within(&executor, async {
        await_control_request(&events, &mut received).await;
        drain_into(&events, &mut received);
        let settled = received.len();
        // Every task runs until none can: the stream has every chance to (wrongly) go on.
        settle(&executor);
        drain_into(&events, &mut received);
        assert_eq!(
            settled,
            received.len(),
            "an unanswered request must not advance the stream"
        );
        assert!(
            !received.iter().any(is_result),
            "no turn result before the host answers"
        );
    });
    // The waiting pump can be cancelled: cancelling its task does not hang.
    cancel_and_join(&executor, pump);
}

pub fn stop_task_is_accepted_by_a_session_that_waits_on_the_host_and_leaves_it_cancellable<
    S: ContractSubject,
>() {
    let mut subject = S::default();
    let (session, events, pump) = subject.session_for(Scenario::Unanswered);
    let executor = LocalExecutor::new();
    let pump = executor.spawn(pump);
    let mut received = Vec::new();
    within(&executor, async {
        await_control_request(&events, &mut received).await;
        // Accepted: the request goes out, and the task's end comes back as an event.
        session.stop_task("task-1").unwrap();
        drain_into(&events, &mut received);
        assert!(
            !received.iter().any(is_result),
            "a stop issues a request and answers nothing"
        );
    });
    cancel_and_join(&executor, pump);
}

/// Reads the events of `scenario` until they close and returns them with how the pump ended.
fn collect_to_end<S: ContractSubject>(scenario: Scenario) -> (Vec<AgentEvent>, PumpEnd) {
    let mut subject = S::default();
    let (_session, events, pump) = subject.session_for(scenario);
    let executor = LocalExecutor::new();
    let pump = executor.spawn(pump);
    let mut received = Vec::new();
    let end = within(&executor, async {
        collect_into(&events, &mut received).await;
        pump.await
    });
    (received, end)
}

pub fn a_dropped_connection_surfaces_as_a_stream_error_after_its_events<S: ContractSubject>() {
    let (received, end) = collect_to_end::<S>(Scenario::DroppedConnection);
    assert!(
        matches!(end, PumpEnd::Failed(_)),
        "a dropped connection should end the pump as failed, not as a quiet end: {end:?}"
    );
    assert!(
        !received.is_empty(),
        "events should arrive before the drop (this tells it from a launch failure)"
    );
}

pub fn a_launch_failure_surfaces_on_subscription_with_no_events<S: ContractSubject>() {
    let (received, end) = collect_to_end::<S>(Scenario::LaunchFailure);
    assert!(
        matches!(end, PumpEnd::Failed(_)),
        "a launch failure should end the pump as failed: {end:?}"
    );
    assert!(
        received.is_empty(),
        "a launch that never started emits nothing"
    );
}

/// The pure `resolve_approval` drops only the answered request and leaves a second one pending.
fn assert_drops_only(decision: &ApprovalDecision) {
    let state = ConversationState {
        pending_approvals: [decision.request_id(), OTHER_REQUEST]
            .into_iter()
            .map(|request_id| PendingApproval {
                request_id: request_id.to_string(),
                kind: ApprovalKind::Approval,
                tool_use_id: None,
                agent_id: None,
            })
            .collect(),
        ..ConversationState::default()
    };
    let after = resolve_approval(state, decision, 0);
    let left: Vec<&str> = after
        .pending_approvals
        .iter()
        .map(|pending| pending.request_id.as_str())
        .collect();
    assert_eq!(
        vec![OTHER_REQUEST],
        left,
        "resolve_approval should drop only the answered request"
    );
}
