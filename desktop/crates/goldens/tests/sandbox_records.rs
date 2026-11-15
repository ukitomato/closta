//! What the operations keep of the sandbox and of the permission modes the host must remember:
//! whether the sandbox is on (the settings' answers of captures 33 to 40), how a switch of it ends,
//! and whether bypass was entered or auto refused once in the session (SandboxRecordsTest.kt).

use std::sync::Arc;

use closta_goldens::common::read_capture;
use closta_goldens::lines;
use closta_model::AgentEvent;
use closta_presenter::composer_state::{ComposerState, composer_state};
use closta_presenter::input::{ControlRequested, Launched, PresenterInput, SandboxNotStarted};
use closta_presenter::records::operations::{
    ControlKind, OperationRecords, SANDBOX_NOT_APPLIED, SANDBOX_NOT_CONFIRMED, SANDBOX_NOT_OFF,
    SANDBOX_NOT_STARTED, SANDBOX_REFUSED_TURN, SwitchKind, SwitchOutcome, SwitchRecord,
    applied_sandbox, asks_for_settings,
};
use closta_presenter::session::SessionView;

const SWITCHES_AFTER: usize = 25;

#[derive(Clone, Default)]
struct Host(SessionView);

impl Host {
    fn with(&self, input: PresenterInput) -> Host {
        Host(self.0.clone().fold(&input))
    }

    fn event(&self, event: AgentEvent) -> Host {
        self.with(PresenterInput::Event(event))
    }

    fn request(&self, id: &str, kind: ControlKind, value: Option<&str>) -> Host {
        self.with(PresenterInput::ControlRequested(ControlRequested {
            request_id: id.into(),
            kind,
            value: value.map(str::to_owned),
        }))
    }

    fn launched(&self, sandbox: bool) -> Host {
        self.with(PresenterInput::Launched(Launched {
            sandbox,
            ..Launched::default()
        }))
    }

    fn settings(&self, id: &str, answer: AgentEvent) -> Host {
        self.request(id, ControlKind::Settings, None).event(answer)
    }

    fn ops(&self) -> &OperationRecords {
        &self.0.transcript.operations
    }

    fn composer(&self) -> ComposerState {
        composer_state(&self.0.conversation, &self.0.transcript)
    }

    fn sandbox_records(&self) -> Vec<SwitchRecord> {
        self.ops()
            .switches
            .iter()
            .filter(|it| it.kind == SwitchKind::Sandbox)
            .cloned()
            .collect()
    }

    fn sandbox_record(&self) -> SwitchRecord {
        let records = self.sandbox_records();
        assert_eq!(1, records.len(), "one sandbox record");
        records
            .into_iter()
            .next()
            .unwrap_or_else(|| panic!("a record"))
    }
}

fn answer_of(scenario: &str, request_id: &str) -> AgentEvent {
    let answers: Vec<AgentEvent> = read_capture(&format!("{scenario}.ndjson"))
        .into_iter()
        .filter(|it| {
            matches!(it, AgentEvent::ControlResponse { request_id: Some(id), .. } if id == request_id)
        })
        .collect();
    assert_eq!(1, answers.len(), "one answer to {request_id}");
    answers
        .into_iter()
        .next()
        .unwrap_or_else(|| panic!("an answer"))
}

fn settings_saying(id: &str, effective: Option<&str>) -> AgentEvent {
    let body = effective.map_or_else(|| "{}".to_owned(), |it| format!(r#"{{"effective":{it}}}"#));
    lines::control_ok(id, Some(&body))
}

#[test]
fn the_sandbox_follows_the_settings_at_start() {
    let id = "35-sandbox-project-setting-req-2";
    let state = Host::default()
        .launched(false)
        .settings(id, answer_of("35-sandbox-project-setting", id));
    assert_eq!(Some(true), state.ops().sandbox);
    assert!(state.composer().sandbox.on);
}

#[test]
fn the_sandbox_is_read_after_the_launch() {
    let launched = Host::default().launched(true);
    assert_eq!(None, launched.ops().sandbox, "not answered yet");
    assert!(
        launched.composer().sandbox.on,
        "the launch's own value until the CLI answers"
    );
    let id = "34-sandbox-launch-req-2";
    let read = launched.settings(id, answer_of("34-sandbox-launch", id));
    assert!(read.composer().sandbox.on);
    assert!(read.ops().switches.is_empty(), "no failure");
    assert!(!read.ops().launch_unconfirmed);
}

#[test]
fn a_launch_into_the_sandbox_the_settings_do_not_confirm_adds_a_failure() {
    let id = "40-sandbox-same-id-req-2";
    let state = Host::default()
        .launched(true)
        .settings(id, answer_of("40-sandbox-same-id", id));
    let record = state.sandbox_record();
    assert_eq!(id, record.id);
    assert_eq!("true", record.value);
    assert_eq!(SwitchOutcome::Failed, record.outcome);
    assert_eq!(Some(SANDBOX_NOT_APPLIED), record.detail.as_deref());
    assert!(!state.composer().sandbox.on);
    assert!(!state.ops().launch_unconfirmed);
}

#[test]
fn the_sandbox_off_is_confirmed_by_the_settings() {
    let scenario = "33-sandbox-live";
    let req = |n: u8| format!("{scenario}-req-{n}");
    let on = Host::default().settings(&req(4), answer_of(scenario, &req(4)));
    assert!(on.composer().sandbox.on);
    let answered = on
        .request(&req(5), ControlKind::Sandbox, Some("false"))
        .event(answer_of(scenario, &req(5)));
    assert_eq!(
        SwitchOutcome::Pending,
        answered.sandbox_record().outcome,
        "the settings say whether"
    );
    assert_eq!(
        Some(req(5).as_str()),
        answered.ops().sandbox_confirming.as_deref()
    );
    let confirmed = answered.settings(&req(6), answer_of(scenario, &req(6)));
    let record = confirmed.sandbox_record();
    assert_eq!(SwitchOutcome::Applied, record.outcome);
    assert_eq!(None, record.detail);
    assert!(!confirmed.composer().sandbox.on);
    assert_eq!(None, confirmed.ops().sandbox_confirming);
}

#[test]
fn the_sandbox_off_the_settings_do_not_confirm_fails() {
    let state = Host::default()
        .request("x", ControlKind::Sandbox, Some("false"))
        .event(lines::control_ok("x", None))
        .settings(
            "s",
            settings_saying("s", Some(r#"{"sandbox":{"enabled":true}}"#)),
        );
    let record = state.sandbox_record();
    assert_eq!(SwitchOutcome::Failed, record.outcome);
    assert_eq!(Some(SANDBOX_NOT_OFF), record.detail.as_deref());
    assert!(state.composer().sandbox.on);
}

#[test]
fn the_sandbox_on_is_confirmed_after_the_relaunch() {
    let id = "39-sandbox-resume-req-3";
    let relaunched = Host::default()
        .request("x", ControlKind::Sandbox, Some("true"))
        .launched(true);
    assert_eq!(Some("x"), relaunched.ops().sandbox_confirming.as_deref());
    let state = relaunched.settings(id, answer_of("39-sandbox-resume", id));
    let record = state.sandbox_record();
    assert_eq!("x", record.id);
    assert_eq!(SwitchOutcome::Applied, record.outcome);
    assert!(state.composer().sandbox.on);
    assert_eq!(None, state.ops().sandbox_confirming);
    assert!(!state.ops().launch_unconfirmed);
}

#[test]
fn the_sandbox_on_the_settings_do_not_confirm_fails() {
    let state = Host::default()
        .request("x", ControlKind::Sandbox, Some("true"))
        .launched(true)
        .settings("s", settings_saying("s", Some("{}")));
    let record = state.sandbox_record();
    assert_eq!("x", record.id);
    assert_eq!(SwitchOutcome::Failed, record.outcome);
    assert_eq!(Some(SANDBOX_NOT_APPLIED), record.detail.as_deref());
    assert!(!state.composer().sandbox.on);
}

fn switched_into_sandbox() -> Host {
    Host::default()
        .request("x", ControlKind::Sandbox, Some("true"))
        .launched(true)
}

fn launched_into_sandbox() -> Host {
    Host::default().launched(true)
}

fn assert_failed_off(state: &Host, id: &str, detail: &str) {
    let record = state.sandbox_record();
    assert_eq!(id, record.id);
    assert_eq!("true", record.value);
    assert_eq!(SwitchOutcome::Failed, record.outcome);
    assert_eq!(Some(detail), record.detail.as_deref());
    assert!(
        !state.composer().sandbox.on,
        "a sandbox that could not be confirmed on is shown off"
    );
    assert_eq!(None, state.ops().sandbox_confirming);
    assert!(!state.ops().launch_unconfirmed);
}

#[test]
fn a_sandbox_switch_is_not_confirmed_when_the_settings_are_refused() {
    let state = switched_into_sandbox().settings("s", lines::control_error("s", "no"));
    assert_failed_off(&state, "x", SANDBOX_NOT_CONFIRMED);
}

#[test]
fn a_sandbox_switch_is_not_confirmed_when_the_settings_say_nothing() {
    let state = switched_into_sandbox().settings("s", settings_saying("s", None));
    assert_failed_off(&state, "x", SANDBOX_NOT_CONFIRMED);
}

#[test]
fn a_sandbox_launch_is_not_confirmed_when_the_settings_are_refused() {
    let state = launched_into_sandbox().settings("s", lines::control_error("s", "no"));
    assert_failed_off(&state, "s", SANDBOX_NOT_APPLIED);
}

#[test]
fn a_sandbox_launch_is_not_confirmed_when_the_settings_say_nothing() {
    let state = launched_into_sandbox().settings("s", settings_saying("s", None));
    assert_failed_off(&state, "s", SANDBOX_NOT_APPLIED);
}

#[test]
fn a_sandbox_off_not_confirmed_keeps_the_last_value() {
    let on = Host::default().settings(
        "s0",
        settings_saying("s0", Some(r#"{"sandbox":{"enabled":true}}"#)),
    );
    let state = on
        .request("x", ControlKind::Sandbox, Some("false"))
        .event(lines::control_ok("x", None))
        .settings("s", lines::control_error("s", "no"));
    assert_eq!(
        Some(SANDBOX_NOT_CONFIRMED),
        state.sandbox_record().detail.as_deref()
    );
    assert!(
        state.composer().sandbox.on,
        "turning off unconfirmed leaves what was last read"
    );
}

#[test]
fn settings_asked_before_the_switch_took_do_not_settle_it() {
    let asked = Host::default()
        .request("s1", ControlKind::Settings, None)
        .request("x", ControlKind::Sandbox, Some("false"))
        .event(lines::control_ok("x", None))
        .request("s2", ControlKind::Settings, None);
    let early = asked.event(settings_saying(
        "s1",
        Some(r#"{"sandbox":{"enabled":true}}"#),
    ));
    assert_eq!(
        SwitchOutcome::Pending,
        early.sandbox_record().outcome,
        "s1 was asked before"
    );
    assert_eq!(
        Some(true),
        early.ops().sandbox,
        "an older answer still says what the sandbox is"
    );
    let confirmed = early.event(settings_saying(
        "s2",
        Some(r#"{"sandbox":{"enabled":false}}"#),
    ));
    assert_eq!(SwitchOutcome::Applied, confirmed.sandbox_record().outcome);
    assert!(!confirmed.composer().sandbox.on);
}

#[test]
fn settings_asked_before_the_relaunch_do_not_settle_it() {
    let asked = Host::default()
        .request("s1", ControlKind::Settings, None)
        .request("x", ControlKind::Sandbox, Some("true"))
        .launched(true)
        .request("s2", ControlKind::Settings, None);
    let early = asked.event(settings_saying("s1", Some("{}")));
    assert_eq!(
        SwitchOutcome::Pending,
        early.sandbox_record().outcome,
        "s1 went to the old CLI"
    );
    assert!(early.ops().launch_unconfirmed);
    let confirmed = early.event(settings_saying(
        "s2",
        Some(r#"{"sandbox":{"enabled":true}}"#),
    ));
    assert_eq!(SwitchOutcome::Applied, confirmed.sandbox_record().outcome);
    assert!(confirmed.composer().sandbox.on);
}

#[test]
fn a_sandbox_that_did_not_start_fails() {
    let refusal = match read_capture("36-sandbox-unavailable.ndjson")
        .into_iter()
        .next()
    {
        Some(AgentEvent::Result { result, .. }) => result,
        other => panic!("36 starts with a result, not {other:?}"),
    };
    let state = Host::default()
        .request("x", ControlKind::Sandbox, Some("true"))
        .launched(true)
        .with(PresenterInput::SandboxNotStarted(SandboxNotStarted {
            request_id: "x".into(),
            detail: Some(refusal.clone()),
        }));
    let record = state.sandbox_record();
    assert_eq!(SwitchOutcome::Failed, record.outcome);
    assert_eq!(Some(refusal.as_str()), record.detail.as_deref());
    assert!(
        !state.composer().sandbox.on,
        "the CLI that started is not in the sandbox"
    );
    assert_eq!(None, state.ops().sandbox_confirming);
    assert!(!state.ops().launch_unconfirmed);
    let unknown = Host::default()
        .with(PresenterInput::SandboxNotStarted(SandboxNotStarted {
            request_id: "y".into(),
            detail: None,
        }))
        .sandbox_record();
    assert_eq!("true", unknown.value);
    assert_eq!(SwitchOutcome::Failed, unknown.outcome);
    assert_eq!(Some(SANDBOX_NOT_STARTED), unknown.detail.as_deref());
}

#[test]
fn an_earlier_settings_answer_does_not_settle() {
    let state = Host::default()
        .request("s1", ControlKind::Settings, None)
        .request("x", ControlKind::Sandbox, Some("false"))
        .event(settings_saying(
            "s1",
            Some(r#"{"sandbox":{"enabled":true}}"#),
        ));
    assert_eq!(SwitchOutcome::Pending, state.sandbox_record().outcome);
    assert_eq!(Some(true), state.ops().sandbox);
}

#[test]
fn a_sandbox_switch_refused_while_running() {
    let state = Host::default().with(PresenterInput::SandboxRefused("x".into()));
    let record = state.sandbox_record();
    assert_eq!("true", record.value);
    assert_eq!(SwitchOutcome::Rejected, record.outcome);
    assert_eq!(Some(SANDBOX_REFUSED_TURN), record.detail.as_deref());
    assert_eq!(Some(record), state.composer().sandbox_failure);
    let again = state.with(PresenterInput::SandboxRefused("x".into()));
    assert!(Arc::ptr_eq(&state.0.transcript, &again.0.transcript));
}

#[test]
fn a_sandbox_switch_refused_by_the_cli() {
    let state = Host::default()
        .request("x", ControlKind::Sandbox, Some("false"))
        .event(lines::control_error("x", "Cannot change the sandbox"));
    let record = state.sandbox_record();
    assert_eq!(SwitchOutcome::Rejected, record.outcome);
    assert_eq!(Some("Cannot change the sandbox"), record.detail.as_deref());
    assert_eq!(None, state.ops().sandbox_confirming);
    assert_eq!(Some(record), state.composer().sandbox_failure);
}

#[test]
fn the_host_asks_for_the_settings_after_a_sandbox_switch() {
    let asked = Host::default().request("x", ControlKind::Sandbox, Some("false"));
    assert!(asks_for_settings(
        asked.ops(),
        &lines::control_ok("x", None)
    ));
    let refused = asked.event(lines::control_error("x", "no"));
    assert!(
        !asks_for_settings(refused.ops(), &lines::control_ok("x", None)),
        "a switch already over"
    );
}

#[test]
fn bypass_entered_survives_old_switches() {
    let mut state = Host::default()
        .request("m", ControlKind::Mode, Some("bypassPermissions"))
        .event(lines::control_ok(
            "m",
            Some(r#"{"mode":"bypassPermissions"}"#),
        ));
    assert!(state.ops().bypass_entered);
    for index in 0..SWITCHES_AFTER {
        let id = format!("model-{index}");
        state = state
            .request(&id, ControlKind::Model, Some("opus"))
            .event(lines::control_ok(&id, None));
    }
    assert!(
        state.ops().switches.iter().all(|it| it.id != "m"),
        "the bypass record was pushed out"
    );
    assert!(state.ops().bypass_entered);
}

#[test]
fn bypass_refused_is_not_entered() {
    let id = "38-plan-bypass-req-2";
    let state = Host::default()
        .request(id, ControlKind::Mode, Some("bypassPermissions"))
        .event(answer_of("38-plan-bypass", id));
    assert_eq!(1, state.ops().switches.len());
    assert_eq!(SwitchOutcome::Rejected, state.ops().switches[0].outcome);
    assert!(!state.ops().bypass_entered);
    assert!(!state.ops().auto_rejected);
}

#[test]
fn auto_is_rejected_after_a_refusal() {
    let state = Host::default()
        .request("a", ControlKind::Mode, Some("auto"))
        .event(lines::control_error("a", "not available"));
    assert!(state.ops().auto_rejected);
    assert!(!state.ops().bypass_entered);
    let applied = Host::default()
        .request("a", ControlKind::Mode, Some("auto"))
        .event(lines::control_ok("a", None));
    assert!(!applied.ops().auto_rejected);
}

#[test]
fn auto_is_rejected_after_a_failed_send() {
    let state = Host::default()
        .request("a", ControlKind::Mode, Some("auto"))
        .with(PresenterInput::ControlSendFailed("a".into()));
    assert!(state.ops().auto_rejected);
}

fn records_of(value: &str, outcome: SwitchOutcome, kind: SwitchKind) -> OperationRecords {
    OperationRecords {
        seq: 1,
        switches: [SwitchRecord {
            id: "s".into(),
            seq: 1,
            kind,
            value: value.into(),
            outcome,
            detail: None,
        }]
        .into_iter()
        .collect(),
        ..OperationRecords::default()
    }
}

fn sandbox_of(value: &str, outcome: SwitchOutcome) -> OperationRecords {
    records_of(value, outcome, SwitchKind::Sandbox)
}

#[test]
fn applied_sandbox_only_when_applied() {
    let pending = sandbox_of("true", SwitchOutcome::Pending);
    assert_eq!(
        None,
        applied_sandbox(&pending, &sandbox_of("true", SwitchOutcome::Failed))
    );
    assert_eq!(
        None,
        applied_sandbox(&pending, &sandbox_of("true", SwitchOutcome::Rejected))
    );
    assert_eq!(None, applied_sandbox(&pending, &pending));
    assert_eq!(
        Some(true),
        applied_sandbox(&pending, &sandbox_of("true", SwitchOutcome::Applied))
    );
    assert_eq!(
        Some(false),
        applied_sandbox(
            &sandbox_of("false", SwitchOutcome::Pending),
            &sandbox_of("false", SwitchOutcome::Applied)
        )
    );
}

#[test]
fn applied_sandbox_ignores_other_kinds_and_switches_settled_before() {
    let mode_pending = records_of("auto", SwitchOutcome::Pending, SwitchKind::Mode);
    assert_eq!(
        None,
        applied_sandbox(
            &mode_pending,
            &records_of("auto", SwitchOutcome::Applied, SwitchKind::Mode)
        )
    );
    let done = sandbox_of("true", SwitchOutcome::Applied);
    assert_eq!(None, applied_sandbox(&done, &done));
    assert_eq!(None, applied_sandbox(&OperationRecords::default(), &done));
}
