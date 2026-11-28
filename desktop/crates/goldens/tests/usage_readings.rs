//! `get_usage`: capture 43 holds one answer, with the five-hour window alone and many names that
//! are no window. The answers without windows, or with a window of no share, no capture holds:
//! those bodies are made by hand (UsageReadingsTest.kt).
//!
//! Not ported: Kotlin's composer state (`usageWaiting`, `usage`) is not in the desktop's records
//! yet; the screen is a later stage's.

use std::sync::Arc;

use closta_goldens::lines;
use closta_goldens::replay::inputs;
use closta_presenter::input::{ControlRequested, Launched, PresenterInput};
use closta_presenter::records::operations::{ControlKind, MAX_WAITING, OperationRecords};
use closta_presenter::records::usage::{UsageRecord, UsageWindow, usage_of};
use closta_presenter::session::SessionView;
use serde_json::{Map, Value};

#[derive(Clone, Default)]
struct Host(SessionView);

impl Host {
    fn with(&self, input: PresenterInput) -> Host {
        Host(self.0.clone().fold(&input))
    }

    fn asked(&self, id: &str) -> Host {
        self.request(id, ControlKind::Usage)
    }

    fn request(&self, id: &str, kind: ControlKind) -> Host {
        self.with(PresenterInput::ControlRequested(ControlRequested {
            request_id: id.into(),
            kind,
            value: None,
        }))
    }

    fn answered(&self, id: &str, body: &str) -> Host {
        self.with(PresenterInput::Event(lines::control_ok(id, Some(body))))
    }

    fn ops(&self) -> &OperationRecords {
        &self.0.transcript.operations
    }

    fn waiting(&self) -> Vec<String> {
        self.ops().usage_waiting.iter().cloned().collect()
    }
}

fn body(text: &str) -> Map<String, Value> {
    match serde_json::from_str(text) {
        Ok(Value::Object(fields)) => fields,
        _ => panic!("not an object: {text}"),
    }
}

fn with_limits(limits: &str) -> String {
    format!(
        r#"{{"session":{{"total_cost_usd":1.5}},"rate_limits_available":true,"rate_limits":{limits}}}"#
    )
}

fn window(name: &str, share: Option<i32>, resets_at: Option<&str>) -> UsageWindow {
    UsageWindow {
        name: name.into(),
        utilization_percent: share,
        resets_at: resets_at.map(str::to_owned),
    }
}

#[test]
fn capture_43_the_answer_reads_as_the_sessions_cost_and_the_five_hour_window() {
    // 43-usage-and-rules.ndjson line 16: the answer to req-2, `session.total_cost_usd`
    // 0.049589999999999995, `five_hour` 25 resetting at 2026-11-14T15:20:00.983604+00:00.
    let state = inputs("43-usage-and-rules", false)
        .iter()
        .fold(Host::default(), |host, input| host.with(input.clone()));
    let usage = state
        .ops()
        .usage
        .as_ref()
        .unwrap_or_else(|| panic!("43 line 16 is read as a usage answer"));

    assert!((usage.session_cost_usd - 0.04959).abs() < 1e-9);
    assert!(usage.rate_limits_available);
    assert_eq!(
        vec![window(
            "five_hour",
            Some(25),
            Some("2026-11-14T15:20:00.983604+00:00")
        )],
        usage.windows
    );
    assert!(state.ops().usage_waiting.is_empty());
}

#[test]
fn type_only_no_limits_or_a_window_that_is_null_leaves_the_windows_out_and_keeps_the_cost() {
    let read = |text: &str| usage_of(&body(text)).unwrap_or_else(|| panic!("a cost: {text}"));
    let none = read(&with_limits("null"));
    let null_window = read(&with_limits(
        r#"{"five_hour":null,"seven_day":{"utilization":3,"resets_at":null}}"#,
    ));
    let unavailable = read(
        r#"{"session":{"total_cost_usd":1.5},"rate_limits_available":false,"rate_limits":{"five_hour":{"utilization":3,"resets_at":null}}}"#,
    );
    let unsaid = read(
        r#"{"session":{"total_cost_usd":1.5},"rate_limits":{"five_hour":{"utilization":3,"resets_at":null}}}"#,
    );

    // No word of the limits is no limits.
    assert_eq!(
        UsageRecord {
            session_cost_usd: 1.5,
            rate_limits_available: false,
            windows: vec![]
        },
        unsaid
    );
    assert_eq!(
        UsageRecord {
            session_cost_usd: 1.5,
            rate_limits_available: true,
            windows: vec![]
        },
        none
    );
    assert_eq!(
        vec![window("seven_day", Some(3), None)],
        null_window.windows
    );
    assert!((unavailable.session_cost_usd - 1.5).abs() < f64::EPSILON);
    assert!(!unavailable.rate_limits_available);
    assert!(unavailable.windows.is_empty());
}

#[test]
fn type_only_a_window_with_no_share_has_none_and_a_share_with_a_fraction_is_rounded() {
    let read = usage_of(&body(&with_limits(
        r#"{"five_hour":{"utilization":null,"resets_at":"x"},"seven_day_opus":{"utilization":10.6,"resets_at":null}}"#,
    )))
    .unwrap_or_else(|| panic!("a cost"));

    assert_eq!(
        vec![
            window("five_hour", None, Some("x")),
            window("seven_day_opus", Some(11), None)
        ],
        read.windows
    );
}

#[test]
fn type_only_extra_usage_limits_spend_and_names_the_plugin_does_not_know_are_no_windows() {
    let read = usage_of(&body(&with_limits(
        r#"{"extra_usage":{"utilization":10.95975,"resets_at":null},"tangelo":{"utilization":5,"resets_at":null},"limits":[{"percent":25}],"spend":{"percent":11},"model_scoped":[{"utilization":0}],"seven_day_oauth_apps":{"utilization":7,"resets_at":null},"seven_day_sonnet":{"utilization":2,"resets_at":null},"five_hour":{"utilization":1,"resets_at":null}}"#,
    )))
    .unwrap_or_else(|| panic!("a cost"));

    assert_eq!(
        vec![
            window("five_hour", Some(1), None),
            window("seven_day_sonnet", Some(2), None)
        ],
        read.windows
    );
}

#[test]
fn type_only_an_answer_without_the_sessions_cost_is_not_read_and_the_last_one_stays() {
    let first = Host::default()
        .asked("u1")
        .answered("u1", &with_limits("null"));
    assert!(first.ops().usage.is_some(), "the first answer is read");
    let odd = first
        .asked("u2")
        .answered("u2", r#"{"rate_limits_available":true,"rate_limits":null}"#);
    let failed = odd
        .asked("u3")
        .with(PresenterInput::Event(lines::control_error("u3", "boom")));

    assert!(usage_of(&body(r#"{"session":{}}"#)).is_none());
    assert!(usage_of(&body(r#"{"session":{"total_cost_usd":"1"}}"#)).is_none());
    assert_eq!(first.ops().usage, odd.ops().usage);
    assert!(odd.ops().usage_waiting.is_empty());
    assert_eq!(first.ops().usage, failed.ops().usage);
    assert!(failed.ops().usage_waiting.is_empty());
}

#[test]
fn a_usage_request_that_could_not_be_written_is_not_waited_for() {
    let asked = Host::default().asked("u1");
    let unsent = asked.with(PresenterInput::ControlSendFailed("u1".into()));

    assert_eq!(vec!["u1".to_owned()], asked.waiting());
    assert!(unsent.waiting().is_empty());
    assert!(unsent.ops().usage.is_none());
    assert!(
        unsent.ops().switches.is_empty(),
        "a usage request is no switch"
    );
}

#[test]
fn usage_requests_wait_in_their_own_column_the_newest_kept() {
    let mut state = Host::default().request("c0", ControlKind::Context);
    for n in 1..=MAX_WAITING + 2 {
        state = state.asked(&format!("u{n}"));
    }

    assert_eq!(
        vec!["c0".to_owned()],
        state.ops().waiting.iter().cloned().collect::<Vec<_>>()
    );
    assert_eq!(
        (3..=MAX_WAITING + 2)
            .map(|it| format!("u{it}"))
            .collect::<Vec<_>>(),
        state.waiting()
    );
    // The same id twice is one wait.
    let twice = state.asked("u3");
    assert!(Arc::ptr_eq(
        &state.0.transcript.operations,
        &twice.0.transcript.operations
    ));
}

/// UsageReadingsTest.kt (a22fa03) "a new CLI answers none of the old requests, so nothing waits for
/// them after a launch": every waiting column is emptied by a launch, and the new CLI's answers
/// are read. Kotlin's composer `usageWaiting` and `contextWaiting` are read here as the columns.
#[test]
fn a_new_cli_answers_none_of_the_old_requests_so_nothing_waits_for_them_after_a_launch() {
    let lost = Host::default()
        .asked("u1")
        .request("c1", ControlKind::Context)
        .request("m1", ControlKind::McpStatus)
        .request("s1", ControlKind::Settings);
    assert_eq!(vec!["u1".to_owned()], lost.waiting());
    assert_eq!(1, lost.ops().waiting.len());
    assert_eq!(1, lost.ops().mcp_waiting.len());
    assert_eq!(1, lost.ops().settings_waiting.len());

    let relaunched = lost.with(PresenterInput::Launched(Launched {
        effort: None,
        built_in_mcp_servers: Vec::new(),
        sandbox: false,
    }));
    let answered = relaunched
        .asked("u2")
        .answered("u2", &with_limits("null"))
        .request("c2", ControlKind::Context)
        .with(PresenterInput::Event(lines::control_ok(
            "c2",
            Some(r#"{"totalTokens":10,"maxTokens":100,"percentage":10}"#),
        )));

    assert!(relaunched.ops().usage_waiting.is_empty());
    assert!(relaunched.ops().waiting.is_empty());
    assert!(relaunched.ops().mcp_waiting.is_empty());
    assert!(relaunched.ops().settings_waiting.is_empty());
    assert!(answered.ops().usage_waiting.is_empty());
    assert!(answered.ops().waiting.is_empty());
}
