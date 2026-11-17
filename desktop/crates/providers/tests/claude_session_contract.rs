#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The `AgentSession` contract on `ClaudeSession`, driven by the in-memory process replaying a
//! capture, plus the checks only the real session can make: what reaches stdin, how a dropped
//! stream ends the pump, and that dropping the pump destroys the process.
//! Mirrors ClaudeSessionContractTest.kt.

mod common;

use std::io::ErrorKind;

use closta_core::ports::{AgentSession, EncodeError, SendError};
use closta_model::{AgentEvent, ApprovalDecision, Attachment, AttachmentKind};
use closta_providers::claude::fake::contract::{
    self, ContractSubject, MessageGiven, RequestGiven, Scenario, await_control_request,
    cancel_and_join, collect_into, within,
};
use closta_providers::claude::fake::process::{
    FakeProcess, FakeProcessProbe, ProcessBeat, ProcessScript, ProcessTermination,
};
use closta_providers::claude::process::ProcessFailure;
use closta_providers::claude::protocol::decode;
use closta_providers::claude::session::{ClaudeSession, PumpEnd, StartedSession};
use futures_lite::future;
use serde_json::Value;
use smol::LocalExecutor;

const SESSION_ID: &str = "test-session";
const BASELINE: &str = "01-baseline-text.ndjson";
const PERMISSION: &str = "05-permission-can-use-tool.ndjson";
const ASK_AFK: &str = "15-ask-afktimeout-updatedinput.ndjson";
const AFK_PAYLOAD: &str = r#"{"afkTimeoutMs":5000}"#;

fn raw_lines(capture: &str) -> Vec<String> {
    common::non_blank_lines(&common::text_of(capture))
}

/// Streams `lines` but holds stdout after each control request until stdin is written to.
fn awaiting_after_control_request(lines: Vec<String>) -> ProcessScript {
    let mut beats = Vec::new();
    for line in lines {
        let is_request = matches!(decode(&line), AgentEvent::ControlRequest { .. });
        beats.push(ProcessBeat::Line(line));
        if is_request {
            beats.push(ProcessBeat::AwaitStdin);
        }
    }
    ProcessScript {
        beats,
        termination: ProcessTermination::Complete,
        stdin_fails: false,
    }
}

/// Waits for the user's message before playing `lines`, as the CLI does. Kotlin also drops lines
/// still queued when stdout ends; Kotlin's FIFO dispatch made its writer run first, but here
/// `race` order is random, so, like the CLI, the script waits for the first message.
fn answering_the_first_message(lines: Vec<String>) -> ProcessScript {
    let mut script = ProcessScript::replaying(lines);
    script.beats.insert(0, ProcessBeat::AwaitStdin);
    script
}

fn script_for(scenario: Scenario) -> ProcessScript {
    match scenario {
        Scenario::SendTurn => answering_the_first_message(raw_lines(BASELINE)),
        Scenario::ApprovalAllow
        | Scenario::ApprovalDeny
        | Scenario::Interrupt
        | Scenario::Unanswered => awaiting_after_control_request(raw_lines(PERMISSION)),
        Scenario::AfkTimeout => awaiting_after_control_request(raw_lines(ASK_AFK)),
        Scenario::DroppedConnection => ProcessScript {
            termination: ProcessTermination::Error(ProcessFailure::Io(ErrorKind::UnexpectedEof)),
            ..ProcessScript::replaying(raw_lines(BASELINE))
        },
        Scenario::LaunchFailure => ProcessScript {
            beats: Vec::new(),
            termination: ProcessTermination::LaunchFailure,
            stdin_fails: false,
        },
    }
}

/// `ClaudeSession` over a [`FakeProcess`]; the readers parse what the last process got on stdin.
#[derive(Default)]
struct ClaudeSubject {
    probe: Option<FakeProcessProbe>,
}

impl ClaudeSubject {
    fn stdin(&self) -> Vec<Value> {
        self.probe
            .as_ref()
            .expect("a session was made")
            .stdin_lines()
            .iter()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect()
    }

    fn user_lines(&self) -> Vec<Value> {
        self.stdin()
            .into_iter()
            .filter(|line| line["type"] == "user")
            .collect()
    }
}

fn text(value: &Value) -> String {
    value.as_str().expect("a string").to_string()
}

impl ContractSubject for ClaudeSubject {
    fn session_for(
        &mut self,
        scenario: Scenario,
    ) -> (
        Box<dyn AgentSession>,
        async_channel::Receiver<AgentEvent>,
        future::Boxed<PumpEnd>,
    ) {
        let (process, probe) = FakeProcess::new(script_for(scenario));
        self.probe = Some(probe);
        let StartedSession {
            session,
            events,
            pump,
        } = ClaudeSession::start(Box::new(process), SESSION_ID);
        (Box::new(session), events, Box::pin(pump))
    }

    fn afk_payload(&self) -> Option<String> {
        Some(AFK_PAYLOAD.to_string())
    }

    fn updated_permissions_given(&self) -> Vec<Option<String>> {
        self.stdin()
            .into_iter()
            .filter(|line| line["type"] == "control_response")
            .map(|line| {
                line["response"]["response"]
                    .get("updatedPermissions")
                    .map(Value::to_string)
            })
            .collect()
    }

    fn requests_given(&self) -> Vec<RequestGiven> {
        self.stdin()
            .into_iter()
            .filter_map(|line| {
                let request = line.get("request")?;
                let subtype = text(&request["subtype"]);
                let value = match subtype.as_str() {
                    "set_model" => Some(text(&request["model"])),
                    "set_permission_mode" => Some(text(&request["mode"])),
                    "get_context_usage" => Some(text(&request["detail"])),
                    "mcp_status" => None,
                    "mcp_toggle" => Some(format!(
                        "{}:{}",
                        text(&request["serverName"]),
                        request["enabled"]
                    )),
                    "mcp_reconnect" => Some(text(&request["serverName"])),
                    "rewind_files" => Some(format!(
                        "{}:{}",
                        text(&request["user_message_id"]),
                        request["dry_run"]
                    )),
                    _ => return None,
                };
                Some(RequestGiven {
                    subtype,
                    request_id: text(&line["request_id"]),
                    value,
                })
            })
            .collect()
    }

    fn uuids_given(&self) -> Vec<Option<String>> {
        self.user_lines()
            .iter()
            .map(|line| Some(text(&line["uuid"])))
            .collect()
    }

    fn messages_given(&self) -> Vec<MessageGiven> {
        self.user_lines()
            .iter()
            .map(|line| match &line["message"]["content"] {
                Value::Array(blocks) => MessageGiven {
                    text: text(&blocks.last().expect("a text block")["text"]),
                    attachments: blocks.len() - 1,
                },
                content => MessageGiven {
                    text: text(content),
                    attachments: 0,
                },
            })
            .collect()
    }
}

#[test]
fn a_model_mode_and_usage_request_is_written_with_the_id_the_caller_gave_it() {
    contract::a_model_mode_and_usage_request_is_written_with_the_id_the_caller_gave_it::<
        ClaudeSubject,
    >()
}

#[test]
fn an_mcp_status_toggle_and_reconnect_request_is_written_with_the_id_the_caller_gave_it() {
    contract::an_mcp_status_toggle_and_reconnect_request_is_written_with_the_id_the_caller_gave_it::<
        ClaudeSubject,
    >()
}

#[test]
fn a_uuid_the_caller_gave_a_message_goes_with_it_and_a_rewind_request_names_it() {
    contract::a_uuid_the_caller_gave_a_message_goes_with_it_and_a_rewind_request_names_it::<
        ClaudeSubject,
    >()
}

#[test]
fn a_message_goes_through_with_its_attachments_and_a_message_without_any_as_it_always_did() {
    contract::a_message_goes_through_with_its_attachments_and_a_message_without_any_as_it_always_did::<
        ClaudeSubject,
    >()
}

#[test]
fn send_streams_through_to_a_turn_result() {
    contract::send_streams_through_to_a_turn_result::<ClaudeSubject>()
}

#[test]
fn allow_completes_an_approval_round_trip_and_drops_only_its_pending() {
    contract::allow_completes_an_approval_round_trip_and_drops_only_its_pending::<ClaudeSubject>()
}

#[test]
fn an_allow_passes_the_accepted_permissions_on_as_given_and_an_allow_without_any_passes_none() {
    contract::an_allow_passes_the_accepted_permissions_on_as_given_and_an_allow_without_any_passes_none::<
        ClaudeSubject,
    >()
}

#[test]
fn deny_completes_an_approval_round_trip_and_drops_only_its_pending() {
    contract::deny_completes_an_approval_round_trip_and_drops_only_its_pending::<ClaudeSubject>()
}

#[test]
fn an_afk_timeout_resolves_the_question_with_no_waiting() {
    contract::an_afk_timeout_resolves_the_question_with_no_waiting::<ClaudeSubject>()
}

#[test]
fn interrupt_ends_a_stream_that_is_waiting_on_the_host() {
    contract::interrupt_ends_a_stream_that_is_waiting_on_the_host::<ClaudeSubject>()
}

#[test]
fn an_unanswered_request_never_advances_the_stream_and_stays_cancellable() {
    contract::an_unanswered_request_never_advances_the_stream_and_stays_cancellable::<ClaudeSubject>(
    )
}

#[test]
fn stop_task_is_accepted_by_a_session_that_waits_on_the_host_and_leaves_it_cancellable() {
    contract::stop_task_is_accepted_by_a_session_that_waits_on_the_host_and_leaves_it_cancellable::<
        ClaudeSubject,
    >()
}

#[test]
fn a_dropped_connection_surfaces_as_a_stream_error_after_its_events() {
    contract::a_dropped_connection_surfaces_as_a_stream_error_after_its_events::<ClaudeSubject>()
}

#[test]
fn a_launch_failure_surfaces_on_subscription_with_no_events() {
    contract::a_launch_failure_surfaces_on_subscription_with_no_events::<ClaudeSubject>()
}

// The checks only the real session can make.

fn start(script: ProcessScript) -> (StartedSession, FakeProcessProbe) {
    let (process, probe) = FakeProcess::new(script);
    (ClaudeSession::start(Box::new(process), SESSION_ID), probe)
}

/// Answers the permission capture's request with `answer` and runs the session to its end; returns
/// the request's id.
fn answer_the_permission_request(
    answer: impl FnOnce(&ClaudeSession, String),
) -> (String, FakeProcessProbe) {
    let (started, probe) = start(awaiting_after_control_request(raw_lines(PERMISSION)));
    let StartedSession {
        session,
        events,
        pump,
    } = started;
    let executor = LocalExecutor::new();
    let pump = executor.spawn(pump);
    let mut received = Vec::new();
    let request_id = within(&executor, async {
        let request_id = await_control_request(&events, &mut received).await;
        answer(&session, request_id.clone());
        collect_into(&events, &mut received).await;
        pump.await;
        request_id
    });
    (request_id, probe)
}

fn the_one_control_response(probe: &FakeProcessProbe) -> Value {
    let replies: Vec<Value> = probe
        .stdin_lines()
        .iter()
        .map(|line| serde_json::from_str::<Value>(line).unwrap())
        .filter(|line| line["type"] == "control_response")
        .collect();
    assert_eq!(1, replies.len(), "one reply was written");
    replies.into_iter().next().unwrap()
}

#[test]
fn an_approval_reply_is_written_to_stdin_keyed_to_the_top_level_request_id() {
    let (request_id, probe) = answer_the_permission_request(|session, request_id| {
        session
            .respond_to_approval(&ApprovalDecision::Allow { request_id }, None, None)
            .unwrap();
    });
    let reply = the_one_control_response(&probe);
    assert_eq!(
        Value::from(request_id),
        reply["response"]["request_id"],
        "the allow reply is keyed to the top-level request_id"
    );
}

#[test]
fn an_allow_carries_updated_permissions_as_the_given_array_and_leaves_the_key_out_when_none() {
    let suggestions = r#"[{"type":"setMode","mode":"acceptEdits","destination":"session"}]"#;
    let written: Vec<Value> = [Some(suggestions), None]
        .into_iter()
        .map(|accepted| {
            let (_, probe) = answer_the_permission_request(|session, request_id| {
                session
                    .respond_to_approval(
                        &ApprovalDecision::Allow { request_id },
                        Some("{}"),
                        accepted,
                    )
                    .unwrap();
            });
            the_one_control_response(&probe)["response"]["response"].clone()
        })
        .collect();
    assert_eq!(
        Some(&serde_json::from_str::<Value>(suggestions).unwrap()),
        written[0].get("updatedPermissions"),
        "the accepted array is written as JSON equal to what was passed"
    );
    assert!(
        written[1].get("updatedPermissions").is_none(),
        "no suggestions: the key is absent"
    );
}

#[test]
fn stop_task_writes_one_stop_task_control_request_with_the_task_id_to_stdin() {
    let (_, probe) = answer_the_permission_request(|session, _| {
        // The fake process lets its wait go on any stdin write, so the stream ends after it.
        session.stop_task("bc4b0ae63").unwrap();
    });
    let lines = probe.stdin_lines();
    assert_eq!(1, lines.len(), "one line: {} written", lines.len());
    let line: Value = serde_json::from_str(&lines[0]).unwrap();
    assert_eq!("control_request", line["type"]);
    assert!(
        line["request_id"].as_str().is_some_and(|id| !id.is_empty()),
        "a control request has an id of its own"
    );
    assert_eq!("stop_task", line["request"]["subtype"]);
    assert_eq!("bc4b0ae63", line["request"]["task_id"]);
}

#[test]
fn a_text_attachment_that_is_not_utf8_fails_without_its_name_or_its_bytes_in_the_message() {
    let (started, probe) = start(ProcessScript::replaying(raw_lines(BASELINE)));
    let bad = Attachment {
        kind: AttachmentKind::Text,
        media_type: "text/plain".to_string(),
        name: "private-notes.txt".to_string(),
        bytes: vec![0x68, 0xC3],
        path: None,
    };

    let failure = started
        .session
        .send_user_message("question", &[bad], None)
        .expect_err("a text that is not UTF-8 is refused, not sent damaged");

    assert_eq!(SendError::Encode(EncodeError::TextNotUtf8), failure);
    for shown in [failure.to_string(), format!("{failure:?}")] {
        assert!(!shown.contains("private-notes"), "the name is not shown");
        assert!(!shown.contains("104"), "nor the bytes");
        assert!(!shown.contains("question"), "nor the text");
    }
    drop(started);
    assert!(probe.stdin_lines().is_empty(), "nothing was written");
}

#[test]
fn a_dropped_connection_ends_the_pump_as_failed_not_as_abandoned() {
    let failure = ProcessFailure::Io(ErrorKind::ConnectionReset);
    let (started, _probe) = start(ProcessScript {
        termination: ProcessTermination::Error(failure),
        ..ProcessScript::replaying(raw_lines(BASELINE))
    });
    let StartedSession {
        session: _session,
        events,
        pump,
    } = started;
    let executor = LocalExecutor::new();
    let pump = executor.spawn(pump);
    let mut received = Vec::new();
    // Kotlin told this from a cancellation; here the pump runs to its own end, which must carry
    // the process's failure rather than say the receiver went away.
    let end = within(&executor, async {
        collect_into(&events, &mut received).await;
        pump.await
    });
    assert_eq!(PumpEnd::Failed(failure), end);
}

#[test]
fn dropping_the_pump_destroys_the_process() {
    let (started, probe) = start(awaiting_after_control_request(raw_lines(PERMISSION)));
    let StartedSession {
        session: _session,
        events,
        pump,
    } = started;
    let executor = LocalExecutor::new();
    let pump = executor.spawn(pump);
    let mut received = Vec::new();
    within(&executor, async {
        await_control_request(&events, &mut received).await;
    });
    assert!(
        !probe.destroyed(),
        "the process must not be destroyed while the pump runs"
    );
    // Cancelling the task drops the pump, as cancelling the collection did in Kotlin.
    cancel_and_join(&executor, pump);
    assert!(
        probe.destroyed(),
        "dropping the pump tears the process down"
    );
}
