#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The `AgentSession` contract on `FakeAgentSession`, plus what only the fake can show: the
//! decisions, the AFK payload, the model switch and the stopped tasks it recorded.
//! Mirrors FakeAgentSessionContractTest.kt.

mod common;

use std::io::ErrorKind;

use closta_core::ports::AgentSession;
use closta_model::{AgentEvent, ApprovalDecision};
use closta_providers::claude::fake::contract::{
    self, ContractSubject, MessageGiven, RequestGiven, Scenario, collect_into, within,
};
use closta_providers::claude::fake::script::{
    FakeScript, Sent, Termination, beats_awaiting_after_control_requests, beats_emitting,
};
use closta_providers::claude::fake::session::{FakeAgentSession, FakeRecord};
use closta_providers::claude::process::ProcessFailure;
use closta_providers::claude::session::PumpEnd;
use futures_lite::future;
use smol::LocalExecutor;

const BASELINE: &str = "01-baseline-text.ndjson";
const PERMISSION: &str = "05-permission-can-use-tool.ndjson";
const ASK_AFK: &str = "15-ask-afktimeout-updatedinput.ndjson";
const AFK_PAYLOAD: &str = r#"{"afkTimeoutMs":5000}"#;

fn script_for(scenario: Scenario) -> FakeScript {
    match scenario {
        Scenario::SendTurn => FakeScript::new(beats_emitting(&common::read_capture(BASELINE))),
        Scenario::ApprovalAllow
        | Scenario::ApprovalDeny
        | Scenario::Interrupt
        | Scenario::Unanswered => FakeScript::new(beats_awaiting_after_control_requests(
            &common::read_capture(PERMISSION),
        )),
        Scenario::AfkTimeout => FakeScript::new(beats_awaiting_after_control_requests(
            &common::read_capture(ASK_AFK),
        )),
        Scenario::DroppedConnection => FakeScript {
            beats: beats_emitting(&common::read_capture(BASELINE)),
            termination: Termination::Error(ProcessFailure::Io(ErrorKind::ConnectionReset)),
        },
        Scenario::LaunchFailure => FakeScript {
            beats: Vec::new(),
            termination: Termination::LaunchFailure,
        },
    }
}

/// `FakeAgentSession`; the readers read the last session's record.
#[derive(Default)]
struct FakeSubject {
    record: Option<FakeRecord>,
}

impl FakeSubject {
    fn sent(&self) -> Vec<Sent> {
        self.record.as_ref().expect("a session was made").sent()
    }
}

impl ContractSubject for FakeSubject {
    fn session_for(
        &mut self,
        scenario: Scenario,
    ) -> (
        Box<dyn AgentSession>,
        async_channel::Receiver<AgentEvent>,
        future::Boxed<PumpEnd>,
    ) {
        let (session, events, pump) = FakeAgentSession::start(script_for(scenario));
        self.record = Some(session.record());
        (Box::new(session), events, pump)
    }

    fn afk_payload(&self) -> Option<String> {
        Some(AFK_PAYLOAD.to_string())
    }

    fn updated_permissions_given(&self) -> Vec<Option<String>> {
        self.sent()
            .into_iter()
            .filter_map(|sent| match sent {
                Sent::Approval {
                    updated_permissions,
                    ..
                } => Some(updated_permissions),
                _ => None,
            })
            .collect()
    }

    fn requests_given(&self) -> Vec<RequestGiven> {
        let given = |subtype: &str, request_id: String, value: Option<String>| RequestGiven {
            subtype: subtype.to_string(),
            request_id,
            value,
        };
        self.sent()
            .into_iter()
            .filter_map(|sent| match sent {
                Sent::SetModel { model, request_id } => {
                    Some(given("set_model", request_id, Some(model)))
                }
                Sent::SetPermissionMode { mode, request_id } => {
                    Some(given("set_permission_mode", request_id, Some(mode)))
                }
                // The fake takes no detail; the real session's line says summary, so that is what
                // the fake stands for.
                Sent::RequestContextUsage { request_id } => Some(given(
                    "get_context_usage",
                    request_id,
                    Some("summary".to_string()),
                )),
                Sent::RequestMcpStatus { request_id } => {
                    Some(given("mcp_status", request_id, None))
                }
                Sent::SetMcpServerEnabled {
                    name,
                    enabled,
                    request_id,
                } => Some(given(
                    "mcp_toggle",
                    request_id,
                    Some(format!("{name}:{enabled}")),
                )),
                Sent::ReconnectMcpServer { name, request_id } => {
                    Some(given("mcp_reconnect", request_id, Some(name)))
                }
                Sent::RewindFiles {
                    user_message_id,
                    dry_run,
                    request_id,
                } => Some(given(
                    "rewind_files",
                    request_id,
                    Some(format!("{user_message_id}:{dry_run}")),
                )),
                _ => None,
            })
            .collect()
    }

    fn uuids_given(&self) -> Vec<Option<String>> {
        self.sent()
            .into_iter()
            .filter_map(|sent| match sent {
                Sent::UserMessage { uuid, .. } => Some(uuid),
                _ => None,
            })
            .collect()
    }

    fn messages_given(&self) -> Vec<MessageGiven> {
        self.sent()
            .into_iter()
            .filter_map(|sent| match sent {
                Sent::UserMessage {
                    text, attachments, ..
                } => Some(MessageGiven {
                    text,
                    attachments: attachments.len(),
                }),
                _ => None,
            })
            .collect()
    }
}

#[test]
fn a_model_mode_and_usage_request_is_written_with_the_id_the_caller_gave_it() {
    contract::a_model_mode_and_usage_request_is_written_with_the_id_the_caller_gave_it::<FakeSubject>(
    )
}

#[test]
fn an_mcp_status_toggle_and_reconnect_request_is_written_with_the_id_the_caller_gave_it() {
    contract::an_mcp_status_toggle_and_reconnect_request_is_written_with_the_id_the_caller_gave_it::<
        FakeSubject,
    >()
}

#[test]
fn a_uuid_the_caller_gave_a_message_goes_with_it_and_a_rewind_request_names_it() {
    contract::a_uuid_the_caller_gave_a_message_goes_with_it_and_a_rewind_request_names_it::<
        FakeSubject,
    >()
}

#[test]
fn a_message_goes_through_with_its_attachments_and_a_message_without_any_as_it_always_did() {
    contract::a_message_goes_through_with_its_attachments_and_a_message_without_any_as_it_always_did::<
        FakeSubject,
    >()
}

#[test]
fn send_streams_through_to_a_turn_result() {
    contract::send_streams_through_to_a_turn_result::<FakeSubject>()
}

#[test]
fn allow_completes_an_approval_round_trip_and_drops_only_its_pending() {
    contract::allow_completes_an_approval_round_trip_and_drops_only_its_pending::<FakeSubject>()
}

#[test]
fn an_allow_passes_the_accepted_permissions_on_as_given_and_an_allow_without_any_passes_none() {
    contract::an_allow_passes_the_accepted_permissions_on_as_given_and_an_allow_without_any_passes_none::<
        FakeSubject,
    >()
}

#[test]
fn deny_completes_an_approval_round_trip_and_drops_only_its_pending() {
    contract::deny_completes_an_approval_round_trip_and_drops_only_its_pending::<FakeSubject>()
}

#[test]
fn an_afk_timeout_resolves_the_question_with_no_waiting() {
    contract::an_afk_timeout_resolves_the_question_with_no_waiting::<FakeSubject>()
}

#[test]
fn interrupt_ends_a_stream_that_is_waiting_on_the_host() {
    contract::interrupt_ends_a_stream_that_is_waiting_on_the_host::<FakeSubject>()
}

#[test]
fn an_unanswered_request_never_advances_the_stream_and_stays_cancellable() {
    contract::an_unanswered_request_never_advances_the_stream_and_stays_cancellable::<FakeSubject>()
}

#[test]
fn stop_task_is_accepted_by_a_session_that_waits_on_the_host_and_leaves_it_cancellable() {
    contract::stop_task_is_accepted_by_a_session_that_waits_on_the_host_and_leaves_it_cancellable::<
        FakeSubject,
    >()
}

#[test]
fn a_dropped_connection_surfaces_as_a_stream_error_after_its_events() {
    contract::a_dropped_connection_surfaces_as_a_stream_error_after_its_events::<FakeSubject>()
}

#[test]
fn a_launch_failure_surfaces_on_subscription_with_no_events() {
    contract::a_launch_failure_surfaces_on_subscription_with_no_events::<FakeSubject>()
}

// What only the fake can show.

#[test]
fn the_fake_records_both_allow_and_deny_decisions_it_receives() {
    let (session, _events, _pump) = FakeAgentSession::start(FakeScript::new(
        beats_awaiting_after_control_requests(&common::read_capture(PERMISSION)),
    ));
    session
        .respond_to_approval(
            &ApprovalDecision::Allow {
                request_id: "req-allow".to_string(),
            },
            None,
            None,
        )
        .unwrap();
    session
        .respond_to_approval(
            &ApprovalDecision::Deny {
                request_id: "req-deny".to_string(),
            },
            None,
            None,
        )
        .unwrap();
    let sent = session.record().sent();
    assert!(
        sent.iter().any(|sent| matches!(
            sent,
            Sent::Approval {
                decision: ApprovalDecision::Allow { .. },
                ..
            }
        )),
        "the fake should record the allow it received"
    );
    assert!(
        sent.iter().any(|sent| matches!(
            sent,
            Sent::Approval {
                decision: ApprovalDecision::Deny { .. },
                ..
            }
        )),
        "the fake should record the deny it received (both must be recorded)"
    );
}

#[test]
fn the_fake_records_the_afk_timeout_payload_verbatim() {
    let (session, _events, _pump) = FakeAgentSession::start(FakeScript::new(Vec::new()));
    session
        .respond_to_approval(
            &ApprovalDecision::AfkTimeout {
                request_id: "req-afk".to_string(),
            },
            Some(AFK_PAYLOAD),
            None,
        )
        .unwrap();
    assert_eq!(
        vec![Sent::Approval {
            decision: ApprovalDecision::AfkTimeout {
                request_id: "req-afk".to_string(),
            },
            payload: Some(AFK_PAYLOAD.to_string()),
            updated_permissions: None,
        }],
        session.record().sent(),
        "the afk window is carried in the payload as it was given"
    );
}

#[test]
fn the_fake_records_a_user_message_a_model_switch_and_an_interrupt() {
    let (session, events, pump) = FakeAgentSession::start(FakeScript::new(beats_emitting(
        &common::read_capture(BASELINE),
    )));
    session.send_user_message("hi", &[], None).unwrap();
    session.set_model("claude-opus-4-8", "id-1").unwrap();
    session.interrupt().unwrap();
    let executor = LocalExecutor::new();
    let pump = executor.spawn(pump);
    let mut received = Vec::new();
    // The baseline has no wait, so the stream runs to its end.
    let end = within(&executor, async {
        collect_into(&events, &mut received).await;
        pump.await
    });
    assert_eq!(PumpEnd::Ended, end);
    let sent = session.record().sent();
    assert!(
        sent.iter()
            .any(|sent| matches!(sent, Sent::UserMessage { text, .. } if text == "hi")),
        "user message recorded"
    );
    assert!(
        sent.contains(&Sent::SetModel {
            model: "claude-opus-4-8".to_string(),
            request_id: "id-1".to_string(),
        }),
        "model switch recorded"
    );
    assert!(sent.contains(&Sent::Interrupt), "interrupt recorded");
}

#[test]
fn the_fake_records_the_tasks_it_was_asked_to_stop_in_order_and_an_interrupt_is_not_one_of_them() {
    let (session, _events, _pump) = FakeAgentSession::start(FakeScript::new(beats_emitting(
        &common::read_capture(BASELINE),
    )));
    session.stop_task("t1").unwrap();
    session.stop_task("t2").unwrap();
    session.interrupt().unwrap();
    let record = session.record();
    assert_eq!(
        vec!["t1".to_string(), "t2".to_string()],
        record.stopped_tasks()
    );
    assert_eq!(vec![Sent::Interrupt], record.sent());
}
