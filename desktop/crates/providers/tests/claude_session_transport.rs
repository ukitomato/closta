#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The transport edges of `ClaudeSession` over the in-memory process: a very large line, a cut
//! stream, a failed write, and what each of the three parts does when it is dropped alone.
//! Mirrors ClaudeSessionTransportTest.kt.

use std::future::Future;
use std::io::ErrorKind;
use std::time::Duration;

use closta_core::ports::{AgentSession, EncodeError, SendError};
use closta_model::{AgentEvent, ApprovalDecision, Attachment, AttachmentKind};
use closta_providers::claude::fake::process::{
    FakeProcess, FakeProcessProbe, ProcessBeat, ProcessScript, ProcessTermination,
};
use closta_providers::claude::fake::spawner::FakeSpawner;
use closta_providers::claude::launch::env::SecretEnv;
use closta_providers::claude::launch::{Launch, LaunchError};
use closta_providers::claude::process::{ProcessFailure, ProcessSpawner};
use closta_providers::claude::protocol::encode;
use closta_providers::claude::session::{ClaudeSession, PumpEnd, StartedSession};
use futures_lite::{StreamExt, future};
use serde_json::Value;

const SESSION_ID: &str = "test-session";
const TIMEOUT: Duration = Duration::from_secs(30);
const BIG_LINE_CHARS: usize = 200_000;

/// Runs `work` to its end, failing instead of hanging.
fn within<T>(work: impl Future<Output = T>) -> T {
    smol::block_on(future::or(work, async {
        smol::Timer::after(TIMEOUT).await;
        panic!("did not end within {TIMEOUT:?}")
    }))
}

fn start(script: ProcessScript) -> (StartedSession, FakeProcessProbe) {
    let (process, probe) = FakeProcess::new(script);
    (ClaudeSession::start(Box::new(process), SESSION_ID), probe)
}

/// Runs the pump and reads the events until the pump closes them.
fn run_to_end(started: StartedSession) -> (ClaudeSession, Vec<AgentEvent>, PumpEnd) {
    let StartedSession {
        session,
        events,
        pump,
    } = started;
    let (end, events) = within(future::zip(pump, events.collect::<Vec<_>>()));
    (session, events, end)
}

fn script(beats: Vec<ProcessBeat>) -> ProcessScript {
    ProcessScript {
        beats,
        termination: ProcessTermination::Complete,
        stdin_fails: false,
    }
}

#[test]
fn a_200_kb_line_arrives_whole_as_one_event() {
    let big = "x".repeat(BIG_LINE_CHARS);
    let (started, _probe) = start(ProcessScript::replaying(vec![big]));
    let (_session, events, end) = run_to_end(started);
    assert_eq!(
        1,
        events.len(),
        "one 200 KB line is one event, not split, not dropped"
    );
    match &events[0] {
        AgentEvent::BrokenLine { line, .. } => assert_eq!(BIG_LINE_CHARS, line.len()),
        other => panic!("expected a broken line, got {other:?}"),
    }
    assert_eq!(PumpEnd::Ended, end);
}

#[test]
fn a_truncated_stream_ends_with_its_line_then_a_failure_without_hanging() {
    let failure = ProcessFailure::Io(ErrorKind::UnexpectedEof);
    let (started, probe) = start(ProcessScript {
        termination: ProcessTermination::Error(failure),
        ..ProcessScript::replaying(vec![r#"{"type":"stream_event","#.to_string()])
    });
    let (_session, events, end) = run_to_end(started);
    assert_eq!(
        1,
        events.len(),
        "the partial line arrives before the failure"
    );
    assert!(matches!(events[0], AgentEvent::BrokenLine { .. }));
    assert_eq!(
        PumpEnd::Failed(failure),
        end,
        "a cut stream is a failure, not a quiet end"
    );
    assert!(probe.destroyed());
}

// A CLI that already ended: its stdin is closed, and its stdout still holds a line it wrote (as
// capture 36's result), which comes only once the host has tried to write.
#[test]
fn a_failed_write_does_not_stop_the_read_and_a_send_after_the_end_fails() {
    let line =
        r#"{"type":"system","subtype":"status","status":"requesting","session_id":"s","uuid":"u"}"#;
    let (started, probe) = start(ProcessScript {
        stdin_fails: true,
        ..script(vec![
            ProcessBeat::AwaitStdin,
            ProcessBeat::Line(line.to_string()),
        ])
    });
    started.session.interrupt().unwrap();
    let (session, events, end) = run_to_end(started);
    assert_eq!(
        1,
        events.len(),
        "the line written before the CLI ended is read: {events:?}"
    );
    assert_eq!(PumpEnd::Ended, end);
    assert!(probe.stdin_lines().is_empty());
    assert_eq!(Err(SendError::Closed), session.interrupt());
}

#[test]
fn dropping_the_handle_writes_what_was_queued_then_closes_stdin() {
    let (started, probe) = start(script(vec![
        ProcessBeat::AwaitStdin,
        ProcessBeat::AwaitStdin,
        ProcessBeat::AwaitStdin,
    ]));
    let StartedSession {
        session,
        events,
        pump,
    } = started;
    for (model, id) in [("m1", "q1"), ("m2", "q2"), ("m3", "q3")] {
        session.set_model(model, id).unwrap();
    }
    drop(session);
    let (end, _) = within(future::zip(pump, events.collect::<Vec<_>>()));
    assert_eq!(
        vec![
            encode::set_model("q1", "m1"),
            encode::set_model("q2", "m2"),
            encode::set_model("q3", "m3"),
        ],
        probe.stdin_lines()
    );
    assert!(probe.stdin_closed());
    assert_eq!(PumpEnd::Ended, end);
}

// The CLI ends on end of file of stdin. With nothing written, only the writer closing stdin once
// the last handle is gone lets this script go on.
#[test]
fn dropping_the_handle_with_nothing_queued_closes_stdin_so_the_cli_ends() {
    let (started, probe) = start(script(vec![ProcessBeat::AwaitStdin]));
    drop(started.session);
    let (end, _) = within(future::zip(
        started.pump,
        started.events.collect::<Vec<_>>(),
    ));
    assert!(probe.stdin_lines().is_empty());
    assert!(probe.stdin_closed());
    assert_eq!(PumpEnd::Ended, end);
}

#[test]
fn a_bad_payload_is_refused_and_the_session_goes_on() {
    let (started, probe) = start(script(vec![ProcessBeat::AwaitStdin]));
    let allow = ApprovalDecision::Allow {
        request_id: "r".into(),
    };
    assert_eq!(
        Err(SendError::Encode(EncodeError::BadPayload)),
        started
            .session
            .respond_to_approval(&allow, Some("{nope"), None)
    );
    assert_eq!(Ok(()), started.session.set_model("m", "q"));
    run_to_end(started);
    assert_eq!(vec![encode::set_model("q", "m")], probe.stdin_lines());
}

#[test]
fn dropping_the_receiver_ends_the_pump_at_the_next_line_as_abandoned() {
    let (started, probe) = start(ProcessScript::replaying(vec![
        r#"{"type":"keep_alive"}"#.to_string(),
    ]));
    let StartedSession {
        session: _session,
        events,
        pump,
    } = started;
    drop(events);
    assert_eq!(PumpEnd::Abandoned, within(pump));
    assert!(probe.destroyed());
}

#[test]
fn a_launch_failure_closes_the_events_empty_and_fails() {
    let (started, probe) = start(ProcessScript {
        termination: ProcessTermination::LaunchFailure,
        ..ProcessScript::replaying(vec![r#"{"type":"keep_alive"}"#.to_string()])
    });
    let (session, events, end) = run_to_end(started);
    assert!(events.is_empty());
    assert_eq!(
        PumpEnd::Failed(ProcessFailure::Io(ErrorKind::NotFound)),
        end
    );
    assert!(probe.destroyed());
    assert_eq!(Err(SendError::Closed), session.interrupt());
}

#[test]
fn dropping_the_pump_destroys_the_process() {
    let (started, probe) = start(script(vec![ProcessBeat::AwaitStdin]));
    let StartedSession {
        session,
        events: _events,
        mut pump,
    } = started;
    assert_eq!(None, smol::block_on(future::poll_once(&mut pump)));
    assert!(!probe.destroyed());
    drop(pump);
    assert!(probe.destroyed());
    assert!(
        probe.forcibly_destroyed(),
        "the last owner of the process kills it"
    );
    assert_eq!(Err(SendError::Closed), session.interrupt());
}

fn launch(arg: &str) -> Launch {
    Launch {
        args: vec![arg.to_string()],
        env: SecretEnv::default(),
        cwd: None,
    }
}

#[test]
fn the_fake_spawner_hands_out_scripted_processes_and_records_launches() {
    let spawner = FakeSpawner::new(|launch| match launch.args[0].as_str() {
        "first" => Ok(ProcessScript::replaying(vec![
            r#"{"type":"keep_alive"}"#.to_string(),
        ])),
        _ => Err(LaunchError::TooManyProcesses),
    });
    let first = spawner.spawn(&launch("first")).unwrap();
    assert_eq!(
        Some(LaunchError::TooManyProcesses),
        spawner.spawn(&launch("second")).err()
    );
    let args: Vec<Vec<String>> = spawner.launches().into_iter().map(|l| l.args).collect();
    assert_eq!(
        vec![vec!["first".to_string()], vec!["second".to_string()]],
        args
    );
    assert_eq!(1, spawner.probes().len());

    let probe = spawner.probes().remove(0);
    let started = ClaudeSession::start(first, SESSION_ID);
    let (_session, events, end) = run_to_end(started);
    assert_eq!(1, events.len());
    assert_eq!(PumpEnd::Ended, end);
    assert!(
        probe.forcibly_destroyed(),
        "the process was dropped with the pump"
    );
}

/// The one line `send` writes, through a session whose CLI waits for stdin.
fn written(send: impl FnOnce(&dyn AgentSession)) -> String {
    let (started, probe) = start(script(vec![ProcessBeat::AwaitStdin]));
    send(&started.session);
    run_to_end(started);
    let mut lines = probe.stdin_lines();
    assert_eq!(1, lines.len(), "{lines:?}");
    lines.remove(0)
}

fn field(line: &str, name: &str) -> String {
    let value: Value = serde_json::from_str(line).unwrap();
    let id = value[name].as_str().unwrap().to_string();
    uuid::Uuid::parse_str(&id).unwrap_or_else(|e| panic!("{name} {id} is not a uuid: {e}"));
    id
}

#[test]
fn every_command_writes_its_encoder_line() {
    let text = Attachment {
        kind: AttachmentKind::Text,
        media_type: "text/plain".into(),
        name: "a.txt".into(),
        bytes: b"hi".to_vec(),
        path: None,
    };

    let line = written(|s| {
        s.send_user_message("hello", std::slice::from_ref(&text), Some("u-1"))
            .unwrap()
    });
    assert_eq!(
        encode::user_message(SESSION_ID, "u-1", "hello", std::slice::from_ref(&text)).unwrap(),
        line
    );
    let line = written(|s| s.send_user_message("hello", &[], None).unwrap());
    assert_eq!(
        encode::user_message(SESSION_ID, &field(&line, "uuid"), "hello", &[]).unwrap(),
        line
    );

    let id = |r: &str| r.to_string();
    let line = written(|s| {
        s.respond_to_approval(
            &ApprovalDecision::Allow {
                request_id: id("r1"),
            },
            Some(r#"{"command":"ls"}"#),
            Some(r#"[{"type":"addRules"}]"#),
        )
        .unwrap()
    });
    assert_eq!(
        encode::allow(
            "r1",
            r#"{"command":"ls"}"#,
            Some(r#"[{"type":"addRules"}]"#)
        )
        .unwrap(),
        line
    );
    let line = written(|s| {
        s.respond_to_approval(
            &ApprovalDecision::Allow {
                request_id: id("r2"),
            },
            None,
            None,
        )
        .unwrap()
    });
    assert_eq!(encode::allow("r2", "{}", None).unwrap(), line);
    let line = written(|s| {
        s.respond_to_approval(
            &ApprovalDecision::Answered {
                request_id: id("r3"),
            },
            Some(r#"{"answers":{"q":"a"}}"#),
            None,
        )
        .unwrap()
    });
    assert_eq!(
        encode::allow("r3", r#"{"answers":{"q":"a"}}"#, None).unwrap(),
        line
    );
    let line = written(|s| {
        s.respond_to_approval(
            &ApprovalDecision::AfkTimeout {
                request_id: id("r4"),
            },
            None,
            None,
        )
        .unwrap()
    });
    assert_eq!(encode::allow("r4", "{}", None).unwrap(), line);
    let line = written(|s| {
        s.respond_to_approval(
            &ApprovalDecision::Deny {
                request_id: id("r5"),
            },
            None,
            None,
        )
        .unwrap()
    });
    assert_eq!(encode::deny("r5", ""), line);
    let line = written(|s| {
        s.respond_to_approval(
            &ApprovalDecision::Deny {
                request_id: id("r6"),
            },
            Some("not that"),
            None,
        )
        .unwrap()
    });
    assert_eq!(encode::deny("r6", "not that"), line);

    let line = written(|s| s.set_model("opus", "q1").unwrap());
    assert_eq!(encode::set_model("q1", "opus"), line);
    let line = written(|s| s.set_permission_mode("plan", "q2").unwrap());
    assert_eq!(encode::set_permission_mode("q2", "plan"), line);
    let line = written(|s| s.request_context_usage("q3").unwrap());
    assert_eq!(encode::get_context_usage("q3", "summary"), line);
    let line = written(|s| s.request_settings("q4").unwrap());
    assert_eq!(encode::get_settings("q4"), line);
    let line = written(|s| s.set_effort(Some("high"), "q5").unwrap());
    assert_eq!(encode::apply_effort("q5", Some("high")), line);
    let line = written(|s| s.set_effort(None, "q6").unwrap());
    assert_eq!(encode::apply_effort("q6", None), line);
    let line = written(|s| s.turn_sandbox_off("q7").unwrap());
    assert_eq!(encode::sandbox_off("q7"), line);
    let line = written(|s| s.request_mcp_status("q8").unwrap());
    assert_eq!(encode::mcp_status("q8"), line);
    let line = written(|s| s.set_mcp_server_enabled("srv", false, "q9").unwrap());
    assert_eq!(encode::mcp_toggle("q9", "srv", false), line);
    let line = written(|s| s.reconnect_mcp_server("srv", "q10").unwrap());
    assert_eq!(encode::mcp_reconnect("q10", "srv"), line);
    let line = written(|s| s.rewind_files("u-1", true, "q11").unwrap());
    assert_eq!(encode::rewind_files("q11", "u-1", true), line);

    let line = written(|s| s.interrupt().unwrap());
    assert_eq!(encode::interrupt(&field(&line, "request_id")), line);
    let line = written(|s| s.stop_task("task-1").unwrap());
    assert_eq!(
        encode::stop_task(&field(&line, "request_id"), "task-1"),
        line
    );
}
