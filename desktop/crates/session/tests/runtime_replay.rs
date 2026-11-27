#![allow(clippy::expect_used, clippy::unwrap_used)]
//! Every capture through the whole runtime: the version check, the launch, the fold and the end.
//! The settings request the host adds is not core's, so the state still matches core's golden.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::sync::{Arc, Mutex, PoisonError};

use closta_model::ConversationState;
use closta_providers::claude::fake::process::ProcessScript;
use closta_providers::claude::fake::spawner::FakeSpawner;
use closta_providers::claude::launch::env::SecretEnv;
use closta_session::launch::NativeSessionLaunchPlanner;
use closta_session::log::SessionLog;
use closta_session::runtime::{SessionConfig, SessionRuntime};
use closta_session::status::SessionStatus;

use support::{GUARD, ID, RecordingLog, VERSION, WORKING_DIR, drive, statuses};

/// Runs `scenario` through a runtime and gives the statuses it went through and the state it
/// ended with.
fn through_runtime(scenario: &str) -> (Vec<SessionStatus>, ConversationState) {
    let lines = common::non_blank_lines(&common::text_of(&format!("{scenario}.ndjson")));
    let spawner = Arc::new(FakeSpawner::new(move |launch| {
        Ok(if launch.args == ["--version"] {
            ProcessScript::replaying(vec![format!("{VERSION} (Claude Code)")])
        } else {
            ProcessScript::replaying(lines.clone())
        })
    }));
    let planner = Arc::new(NativeSessionLaunchPlanner::new(
        spawner,
        Arc::new(SecretEnv::default),
    ));
    let log: Arc<dyn SessionLog> = Arc::new(RecordingLog::default());
    let mut config = SessionConfig::new(ID, planner, Some(WORKING_DIR.to_owned()), log);
    config.version_timeout = GUARD;
    let (runtime, run) = SessionRuntime::new(config);
    let watched = runtime.watch_status();
    drive(|executor| async move { executor.spawn(run).await });
    (statuses(&watched), runtime.view().conversation)
}

#[test]
fn each_capture_through_the_runtime_goes_starting_running_ended_and_matches_the_golden() {
    let scenarios = common::scenario_names();
    assert!(scenarios.len() >= 40, "{} scenarios", scenarios.len());
    let expected = [
        SessionStatus::Starting,
        SessionStatus::Running {
            version: "2.1.282".to_owned(),
        },
        SessionStatus::Ended,
    ];
    let failures = Mutex::new(Vec::new());
    for scenario in &scenarios {
        let fold = |s: &str| {
            let (seen, state) = through_runtime(s);
            if seen != expected {
                failures
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .push(format!("{s}: the statuses were {seen:?}"));
            }
            state
        };
        if let Some(failure) = common::check_scenario(scenario, &fold) {
            failures
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(failure);
        }
    }
    let failures = failures
        .into_inner()
        .unwrap_or_else(PoisonError::into_inner);
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

/// The text of `field` on the 1-based non-blank line `line_number` of `capture`, which must not be
/// empty.
fn field_at(capture: &str, line_number: usize, field: &str) -> String {
    let lines = common::non_blank_lines(&common::text_of(&format!("{capture}.ndjson")));
    let value: serde_json::Value = serde_json::from_str(&lines[line_number - 1]).unwrap();
    let text = value[field].as_str().unwrap_or_default().to_owned();
    assert!(
        !text.is_empty(),
        "{capture} line {line_number} has no {field}"
    );
    text
}

#[test]
fn the_new_kinds_leave_none_of_their_text_in_the_log() {
    let hand_written = [
        r#"{"type":"system","subtype":"informational","content":"hand-written content sentence","level":"warning","uuid":"u1","session_id":"s"}"#,
        r#"{"type":"system","subtype":"api_retry","attempt":2,"max_retries":10,"retry_delay_ms":2500,"error_status":529,"error":"hand-written error sentence","uuid":"u2","session_id":"s"}"#,
    ];
    let sentences = [
        (
            "message of 44",
            field_at("44-permission-denied", 23, "message"),
        ),
        (
            "message of 10",
            field_at("10-background-task", 72, "message"),
        ),
        ("content", "hand-written content sentence".to_owned()),
        ("error", "hand-written error sentence".to_owned()),
    ];
    let mut lines = common::non_blank_lines(&common::text_of("44-permission-denied.ndjson"));
    lines.extend(common::non_blank_lines(&common::text_of(
        "10-background-task.ndjson",
    )));
    lines.extend(hand_written.iter().map(|l| (*l).to_owned()));
    lines.extend(common::non_blank_lines(&common::text_of(
        "41-clear-reset.ndjson",
    )));

    let spawner = Arc::new(FakeSpawner::new(move |launch| {
        Ok(if launch.args == ["--version"] {
            ProcessScript::replaying(vec![format!("{VERSION} (Claude Code)")])
        } else {
            ProcessScript::replaying(lines.clone())
        })
    }));
    let planner = Arc::new(NativeSessionLaunchPlanner::new(
        spawner,
        Arc::new(SecretEnv::default),
    ));
    let log = Arc::new(RecordingLog::default());
    let mut config = SessionConfig::new(
        ID,
        planner,
        Some(WORKING_DIR.to_owned()),
        Arc::clone(&log) as Arc<dyn SessionLog>,
    );
    config.version_timeout = GUARD;
    let (runtime, run) = SessionRuntime::new(config);
    drive(|executor| async move { executor.spawn(run).await });

    let id = runtime.view().conversation.session.map(|s| s.session_id);
    assert_eq!(
        Some("b3c1b6ae-517a-4b6a-8b61-f3693facb4f1".to_owned()),
        id,
        "the session is the one the init after 41's reset names"
    );
    let written = log.lines();
    assert!(!written.is_empty(), "the run wrote nothing to the log");
    // Line numbers and sentence names only: the log lines themselves are not shown.
    // A `Debug` print escapes quotes and newlines, so each sentence is also looked for escaped.
    let needles: Vec<(&str, String, String)> = sentences
        .iter()
        .map(|(name, text)| {
            let escaped = format!("{text:?}");
            (
                *name,
                text.clone(),
                escaped[1..escaped.len() - 1].to_owned(),
            )
        })
        .collect();
    let leaks: Vec<String> = written
        .iter()
        .enumerate()
        .flat_map(|(i, line)| {
            needles
                .iter()
                .filter(move |(_, text, escaped)| {
                    line.contains(text.as_str()) || line.contains(escaped.as_str())
                })
                .map(move |(name, _, _)| format!("log line {}: {name}", i + 1))
        })
        .collect();
    assert!(leaks.is_empty(), "{}", leaks.join("; "));
}
