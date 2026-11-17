#![cfg(unix)]
#![allow(clippy::expect_used, clippy::unwrap_used)]
//! `ClaudeSession` over a real OS child, the fake CLI started by the native spawner: every
//! capture replayed through stdout, a message round trip through stdin, and the transport edges of
//! ClaudeSessionTransportTest.kt with a real pipe. The same checks over the in-memory process are
//! in claude_session_golden.rs and claude_session_transport.rs.

mod common;

use std::future::Future;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use async_channel::Receiver;
use closta_core::fold;
use closta_core::ports::{AgentSession, SendError};
use closta_model::{AgentEvent, ConversationState};
use closta_providers::claude::launch::Launch;
use closta_providers::claude::process::{AgentProcess, ProcessFailure};
use closta_providers::claude::protocol::encode;
use closta_providers::claude::session::{ClaudeSession, PumpEnd, SessionPump, StartedSession};
use common::*;
use futures_lite::{StreamExt, future};

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

fn path_text(path: &Path) -> &str {
    path.to_str().expect("a UTF-8 path")
}

/// The fake CLI, started with `env`.
fn spawn_fake(env: &[(&str, &str)]) -> Box<dyn AgentProcess> {
    let launch = Launch {
        args: Vec::new(),
        env: env
            .iter()
            .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
            .collect(),
        cwd: None,
    };
    within(spawn_in_background(Arc::new(fake_spawner()), launch)).expect("the fake starts")
}

/// A session on the fake CLI, started with `env`.
fn start(env: &[(&str, &str)]) -> StartedSession {
    ClaudeSession::start(spawn_fake(env), SESSION_ID)
}

/// Runs the pump and reads the events until the pump closes them.
fn run_to_end(pump: SessionPump, events: Receiver<AgentEvent>) -> (Vec<AgentEvent>, PumpEnd) {
    let (end, events) = within(future::zip(pump, events.collect::<Vec<_>>()));
    (events, end)
}

/// The events of `scenario` replayed by the fake CLI, and how the pump ended. The handle is
/// dropped at once, which closes stdin, so the fake ends once it has written the capture.
fn through_fake_cli(scenario: &str) -> (Vec<AgentEvent>, PumpEnd) {
    let capture = fixtures_dir().join(format!("{scenario}.ndjson"));
    let StartedSession {
        session,
        events,
        pump,
    } = start(&[
        ("CLOSTA_FAKE_MODE", "replay"),
        ("CLOSTA_FAKE_CAPTURE", path_text(&capture)),
    ]);
    drop(session);
    run_to_end(pump, events)
}

#[test]
fn each_capture_through_the_fake_cli_gives_the_same_events_and_golden() {
    let scenarios = scenario_names();
    assert!(!scenarios.is_empty(), "the manifest lists no scenarios");
    let mut failures = Vec::new();
    for scenario in &scenarios {
        let (events, end) = through_fake_cli(scenario);
        if end != PumpEnd::Ended {
            failures.push(format!("{scenario}: the pump ended as {end:?}"));
        }
        let direct = parse_all(&text_of(&format!("{scenario}.ndjson")));
        if events.len() != direct.len() {
            failures.push(format!(
                "{scenario}: {} events through the fake CLI, {} decoded directly",
                events.len(),
                direct.len()
            ));
        } else if let Some(i) = (0..events.len()).find(|&i| events[i] != direct[i]) {
            failures.push(format!(
                "{scenario}: event {} differs from the direct decode",
                i + 1
            ));
        }
        let fold_through_fake_cli = |s: &str| {
            through_fake_cli(s)
                .0
                .iter()
                .fold(ConversationState::default(), fold)
        };
        if let Some(failure) = check_scenario(scenario, &fold_through_fake_cli) {
            failures.push(failure);
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn a_message_round_trips_to_the_fake_clis_stdin() {
    let dir = scratch_dir("message_round_trip");
    let log = dir.join("stdin.log");
    let StartedSession {
        session,
        events,
        pump,
    } = start(&[
        ("CLOSTA_FAKE_MODE", "replay"),
        ("CLOSTA_FAKE_STDIN_LOG", path_text(&log)),
    ]);
    session
        .send_user_message("hello\nthere", &[], Some("u-1"))
        .unwrap();
    drop(session);
    let (received, end) = run_to_end(pump, events);
    assert!(received.is_empty());
    assert_eq!(end, PumpEnd::Ended);
    let written = std::fs::read_to_string(&log).expect("the fake kept its stdin");
    let line = encode::user_message(SESSION_ID, "u-1", "hello\nthere", &[]).unwrap();
    assert_eq!(
        written,
        format!("{line}\n"),
        "one line, as the encoder wrote it"
    );
}

// The fake writes the line, then 1 MiB to stderr, and only then reads stdin: the end comes only
// if the pump drains stderr while it reads.
#[test]
fn a_200_kb_line_arrives_whole_as_one_event() {
    let StartedSession {
        session,
        events,
        pump,
    } = start(&[("CLOSTA_FAKE_MODE", "flood")]);
    drop(session);
    let (received, end) = run_to_end(pump, events);
    assert_eq!(
        1,
        received.len(),
        "one 200 KB line is one event, not split, not dropped"
    );
    match &received[0] {
        AgentEvent::BrokenLine { line, .. } => assert_eq!(BIG_LINE_CHARS, line.len()),
        other => panic!("expected a broken line, got {other:?}"),
    }
    assert_eq!(PumpEnd::Ended, end);
}

#[test]
fn a_truncated_stream_ends_with_its_line_then_a_failure() {
    let dir = scratch_dir("truncated_stream");
    let capture = dir.join("capture");
    // Cut mid-line: no newline at the end.
    std::fs::write(&capture, r#"{"type":"stream_event","#).expect("the capture is written");
    let StartedSession {
        session,
        events,
        pump,
    } = start(&[
        ("CLOSTA_FAKE_MODE", "replay"),
        ("CLOSTA_FAKE_CAPTURE", path_text(&capture)),
        ("CLOSTA_FAKE_EXIT", "1"),
    ]);
    drop(session);
    let (received, end) = run_to_end(pump, events);
    assert_eq!(
        1,
        received.len(),
        "the partial line arrives before the failure"
    );
    assert!(matches!(received[0], AgentEvent::BrokenLine { .. }));
    assert_eq!(
        PumpEnd::Failed(ProcessFailure::Exit(1)),
        end,
        "a cut stream is a failure, not a quiet end"
    );
}

// The CLI has already ended before the session starts, so its stdin is a broken pipe. The fake
// writes no line, so what is left to check is that the failed write neither hangs the pump nor
// turns the clean end into a failure, and that a send after the end is refused.
#[test]
fn a_failed_write_does_not_stop_the_read_and_a_send_after_the_end_fails() {
    let process = spawn_fake(&[("CLOSTA_FAKE_MODE", "exit"), ("CLOSTA_FAKE_EXIT", "0")]);
    assert_eq!(within(process.wait()).expect("an exit"), 0);
    let StartedSession {
        session,
        events,
        pump,
    } = ClaudeSession::start(process, SESSION_ID);
    session.interrupt().unwrap();
    let (received, end) = run_to_end(pump, events);
    assert!(received.is_empty(), "{received:?}");
    assert_eq!(PumpEnd::Ended, end);
    assert_eq!(Err(SendError::Closed), session.interrupt());
}
