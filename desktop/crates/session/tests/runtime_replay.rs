#![allow(clippy::expect_used, clippy::unwrap_used)]
//! Every capture through the whole runtime: the version check, the launch, the fold and the end.
//! The settings request the host adds is not core's, so the state still matches core's golden.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::sync::{Arc, Mutex, PoisonError};

use closta_model::{AgentEventKind, ConversationState};
use closta_presenter::fold::paths::message_at;
use closta_presenter::input::{ControlRequested, PresenterInput};
use closta_presenter::records::operations::ControlKind;
use closta_presenter::session::SessionView;
use closta_presenter::transcript::PartRecord;
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
    assert!(scenarios.len() >= 44, "{} scenarios", scenarios.len());
    let expected = [
        SessionStatus::Starting,
        SessionStatus::Running {
            version: VERSION.to_owned(),
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
        // A refusal of 44's Bash call (44 line 23) with the CLI's own words, which no capture has.
        r#"{"type":"system","subtype":"permission_denied","tool_name":"Bash","tool_use_id":"toolu_01LeMqLTAqR4JiZqRuLiYC21","decision_reason_type":"rule","decision_reason":"hand-written reason sentence","message":"m","uuid":"u3","session_id":"s"}"#,
    ];
    // Each line the sentences come from decodes to its new kind: an `UnknownKind` would also keep
    // its text out of the log, and then the test would hold nothing.
    let kinds = [
        (
            "44:23",
            common::capture_line("44-permission-denied", 23).kind(),
            AgentEventKind::SystemPermissionDenied,
        ),
        (
            "10:72",
            common::capture_line("10-background-task", 72).kind(),
            AgentEventKind::SystemPermissionDenied,
        ),
        (
            "informational",
            common::parse(hand_written[0]).kind(),
            AgentEventKind::SystemInformational,
        ),
        (
            "api_retry",
            common::parse(hand_written[1]).kind(),
            AgentEventKind::SystemApiRetry,
        ),
        (
            "permission_denied",
            common::parse(hand_written[2]).kind(),
            AgentEventKind::SystemPermissionDenied,
        ),
        (
            "41:18",
            common::capture_line("41-clear-reset", 18).kind(),
            AgentEventKind::ConversationReset,
        ),
    ];
    for (line, decoded, expected) in kinds {
        assert_eq!(Some(expected), decoded, "{line}");
    }
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
        ("decision_reason", "hand-written reason sentence".to_owned()),
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
    // The refusal and the notice went into the transcript: else they could not have leaked.
    let transcript = runtime.view().transcript;
    let bash = transcript
        .routing
        .tools
        .get("toolu_01LeMqLTAqR4JiZqRuLiYC21")
        .and_then(|at| message_at(&transcript.messages, at))
        .and_then(|message| message.parts.get("toolu_01LeMqLTAqR4JiZqRuLiYC21"))
        .map(|part| match part.as_ref() {
            PartRecord::ToolCall(call) => call
                .denied
                .as_ref()
                .is_some_and(|it| it.reason.as_deref() == Some("hand-written reason sentence")),
            _ => false,
        });
    assert_eq!(
        Some(true),
        bash,
        "44's Bash call carries the hand-written refusal"
    );
    let notices = transcript
        .messages
        .values()
        .flat_map(|message| message.parts.values().cloned().collect::<Vec<_>>())
        .filter(
            |part| matches!(part.as_ref(), PartRecord::Informational(it) if it.level == "warning"),
        )
        .count();
    assert_eq!(1, notices, "the hand-written warning is a part");
    // Nor does the transcript's `Debug`, which a log line could carry.
    let shown = format!("{transcript:?}");
    for (name, text) in [
        ("decision_reason", "hand-written reason sentence"),
        ("content", "hand-written content sentence"),
    ] {
        assert!(
            !shown.contains(text),
            "the transcript's Debug shows the {name}"
        );
    }
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

#[test]
fn the_usage_answer_leaves_its_cost_and_reset_time_out_of_the_log_and_the_debug() {
    // 43's usage answer (line 16): the cost and the reset time of the five-hour window.
    let id = "43-usage-and-rules-req-2";
    let answer = common::capture_line("43-usage-and-rules", 16);
    // Precondition: line 16 is the answer to `id`, and folded after its request it is a usage
    // record. The runtime's own replay asks no usage (that is a later stage's), so the record is
    // made here by the same fold.
    let resets = field_in_response(&[
        "response",
        "response",
        "rate_limits",
        "five_hour",
        "resets_at",
    ]);
    let asked = SessionView::default().fold(&PresenterInput::ControlRequested(ControlRequested {
        request_id: id.to_owned(),
        kind: ControlKind::Usage,
        value: None,
    }));
    let folded = asked.fold(&PresenterInput::Event(answer));
    let usage = folded
        .transcript
        .operations
        .usage
        .as_ref()
        .expect("the answer is read as a usage record");
    // The cost as the record spells it (the log is raw text, so this is the surest needle), as the
    // parsed number prints in both ways, and the digits every printing of it shares.
    let spelled = "0.049589999999999995";
    let cost = usage.session_cost_usd;
    let cost_needles = [
        ("recorded spelling", spelled.to_owned()),
        ("displayed value", format!("{cost}")),
        ("debug value", format!("{cost:?}")),
        ("rounded spelling", "0.04959".to_owned()),
        ("digits", "4958999".to_owned()),
    ];
    let mut needles: Vec<(String, String)> = cost_needles
        .iter()
        .map(|(name, text)| (format!("cost ({name})"), text.clone()))
        .collect();
    needles.push(("resets_at".to_owned(), resets.clone()));
    let shown = format!("{:?}", folded.transcript.operations);
    for (name, text) in &needles {
        assert!(
            !shown.contains(text.as_str()),
            "the operations' Debug shows the {name}"
        );
    }
    let raw = common::non_blank_lines(&common::text_of("43-usage-and-rules.ndjson"))[15].clone();
    assert!(raw.contains(spelled), "the cost looked for is the answer's");

    let lines = common::non_blank_lines(&common::text_of("43-usage-and-rules.ndjson"));
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
    let (_runtime, run) = SessionRuntime::new(config);
    drive(|executor| async move { executor.spawn(run).await });

    let written = log.lines();
    assert!(!written.is_empty(), "the run wrote nothing to the log");
    // The runtime's replay asks no usage, so `runtime.view()` holds no usage record to inspect.
    for (name, text) in &needles {
        let leaks: Vec<usize> = written
            .iter()
            .enumerate()
            .filter(|(_, line)| line.contains(text.as_str()))
            .map(|(i, _)| i + 1)
            .collect();
        assert!(leaks.is_empty(), "the {name} is in log lines {leaks:?}");
    }
}

/// The text of the member at `path` of 43's line 16, which must hold a number or a string.
fn field_in_response(path: &[&str]) -> String {
    let line = common::non_blank_lines(&common::text_of("43-usage-and-rules.ndjson"))[15].clone();
    let mut value: serde_json::Value = serde_json::from_str(&line).unwrap();
    for key in path {
        value = value[key].take();
    }
    match value {
        serde_json::Value::String(text) => text,
        other => other.to_string(),
    }
}
