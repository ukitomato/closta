#![allow(clippy::expect_used, clippy::unwrap_used)]
//! Turning the sandbox on restarts the session's CLI under the same runtime: the restart's argv,
//! the wait for the old process, the one start without the sandbox when the sandboxed CLI does
//! not start, a close during a restart, and turning the sandbox off live.
//! SessionRuntimeSandboxTest.kt.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::future::Future;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use closta_model::AgentEvent;
use closta_presenter::input::SendId;
use closta_presenter::records::operations::{SwitchKind, SwitchOutcome, SwitchRecord};
use closta_presenter::refusal_sentence::plain_sentence_of;
use closta_presenter::thread_running::thread_is_running;
use closta_providers::claude::fake::live::{LiveControl, LiveOptions, LiveProcess};
use closta_providers::claude::fake::spawner::FakeSpawner;
use closta_providers::claude::launch::env::SecretEnv;
use closta_providers::claude::launch::spec::SANDBOX_SETTINGS;
use closta_providers::claude::launch::{Launch, LaunchError};
use closta_providers::claude::process::{AgentProcess, ProcessSpawner};
use closta_providers::claude::protocol::encode;
use closta_session::commands::SessionCommands;
use closta_session::launch::{NativeSessionLaunchPlanner, SessionLaunchPlanner};
use closta_session::runtime::SessionRuntime;
use closta_session::sandbox::{carried_choices, restart_spec};
use closta_session::status::SessionStatus;
use futures_lite::future;
use smol::Timer;

use support::{GUARD, ID, Processes, WORKING_DIR, drive, reach, runtime, runtime_over, until};

const TURN: &str = "01-baseline-text.ndjson";
const UNAVAILABLE: &str = "36-sandbox-unavailable.ndjson";
/// What a shell reports for a process ended by SIGTERM.
const SIGTERM_EXIT: i32 = 143;

fn running(status: &SessionStatus) -> bool {
    matches!(status, SessionStatus::Running { .. })
}

fn failed(status: &SessionStatus) -> bool {
    matches!(status, SessionStatus::Failed(_))
}

/// A process that does not end when told to; only `exit` or a kill ends it.
fn stubborn() -> LiveOptions {
    LiveOptions {
        exit_on_destroy: None,
        ..LiveOptions::default()
    }
}

/// Waits for `work` and fails if it takes [`GUARD`].
async fn within<T>(work: impl Future<Output = T>) -> T {
    future::or(work, async {
        Timer::after(GUARD).await;
        panic!("nothing came within {GUARD:?}")
    })
    .await
}

/// Running on the `spawns`-th session process, with its commands.
async fn running_on(
    runtime: &SessionRuntime,
    processes: &Processes,
    spawns: usize,
) -> Arc<SessionCommands> {
    until(|| running(&runtime.status()) && processes.controls().len() == spawns).await;
    runtime.commands().expect("a running session has commands")
}

fn sandbox_switches(runtime: &SessionRuntime) -> Vec<SwitchRecord> {
    runtime
        .view()
        .transcript
        .operations
        .switches
        .iter()
        .filter(|switch| switch.kind == SwitchKind::Sandbox)
        .cloned()
        .collect()
}

/// A message sent and its turn ended, so a restart is allowed and resumes.
async fn one_turn(runtime: &SessionRuntime, commands: &SessionCommands, control: &LiveControl) {
    commands
        .send_message(SendId::new("m1").expect("a key"), "hello", &[])
        .expect("sent");
    for line in common::non_blank_lines(&common::text_of(TURN)) {
        control.emit(&line);
    }
    until(|| {
        let view = runtime.view();
        view.transcript.routing.sends == 1
            && !thread_is_running(&view.conversation, &view.transcript)
    })
    .await;
}

fn success(id: &str) -> String {
    format!(
        r#"{{"type":"control_response","response":{{"subtype":"success","request_id":"{id}"}}}}"#
    )
}

fn unavailable() -> String {
    common::non_blank_lines(&common::text_of(UNAVAILABLE))
        .into_iter()
        .next()
        .expect("capture 36 has a line")
}

/// The sentence the records keep of capture 36's error result.
fn unavailable_sentence() -> String {
    match common::parse(&unavailable()) {
        AgentEvent::Result { result, .. } => plain_sentence_of(&result),
        other => panic!("capture 36 starts with a result, not {other:?}"),
    }
}

/// A CLI that refused to start as capture 36's first one did: its one error result written and
/// exited with 1 before the host writes anything, so the settings request the host writes at
/// once finds its stdin closed.
fn not_started(processes: &Processes) -> LiveControl {
    let control = processes.prepare(LiveOptions::default());
    control.emit(&unavailable());
    control.exit(1);
    control
}

fn flag_value<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
    args.windows(2)
        .find(|pair| pair[0] == flag)
        .map(|pair| pair[1].as_str())
}

fn has_arg(args: &[String], arg: &str) -> bool {
    args.iter().any(|it| it == arg)
}

#[test]
fn the_launch_carries_the_sandbox_and_asks_its_settings_at_once() {
    drive(|executor| async move {
        let processes = Processes::new();
        let (runtime, run, _log) = runtime(&processes, |config| config.sandbox = true);
        let run = executor.spawn(run);
        running_on(&runtime, &processes, 1).await;

        let args = processes.session_args();
        assert_eq!(flag_value(&args[0], "--settings"), Some(SANDBOX_SETTINGS));
        assert!(runtime.view().transcript.operations.launch_sandbox);
        let first = within(processes.controls()[0].next_stdin_line()).await;
        assert!(
            first
                .as_deref()
                .is_some_and(|line| line.contains(r#""subtype":"get_settings""#)),
            "the settings are asked at once: {first:?}"
        );
        runtime.close();
        within(run).await;
    });
}

#[test]
fn turning_on_restarts_with_resume_and_settings() {
    drive(|executor| async move {
        let processes = Processes::new();
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        let commands = running_on(&runtime, &processes, 1).await;
        one_turn(&runtime, &commands, &processes.controls()[0]).await;
        let before = runtime.view();
        let planned =
            NativeSessionLaunchPlanner::new(processes.spawner(), Arc::new(SecretEnv::default))
                .plan(ID, Some(WORKING_DIR))
                .await
                .expect("planned");
        let expected = restart_spec(&planned.spec, true, &carried_choices(&before), true)
            .to_args()
            .expect("valid args");

        assert!(runtime.turn_sandbox_on());
        let again = running_on(&runtime, &processes, 2).await;

        assert!(!Arc::ptr_eq(&again, &commands));
        let args = processes.session_args();
        assert_eq!(args[1], expected);
        assert!(
            has_arg(&expected, &format!("--resume={ID}")),
            "{expected:?}"
        );
        assert_eq!(flag_value(&args[1], "--settings"), Some(SANDBOX_SETTINGS));
        assert_eq!(
            runtime.view().transcript.messages.len(),
            before.transcript.messages.len()
        );
        assert!(processes.controls()[0].destroyed());
        runtime.close();
        within(run).await;
    });
}

#[test]
fn a_restart_waits_for_the_old_process() {
    drive(|executor| async move {
        let processes = Processes::new();
        let first = processes.prepare(stubborn());
        let (runtime, run, _log) = runtime(&processes, |config| config.close_wait = GUARD);
        let run = executor.spawn(run);
        running_on(&runtime, &processes, 1).await;

        assert!(runtime.turn_sandbox_on());
        until(|| first.destroyed()).await;
        // A negative: the old process still runs, so nothing may be spawned yet.
        Timer::after(Duration::from_millis(100)).await;
        assert_eq!(processes.session_args().len(), 1);
        first.exit(SIGTERM_EXIT);
        running_on(&runtime, &processes, 2).await;

        assert_eq!(
            processes.previous_ended_at_spawn(),
            [true],
            "the second spawn came after the first ended"
        );
        runtime.close();
        within(run).await;
    });
}

#[test]
fn a_restart_carries_the_choices() {
    drive(|executor| async move {
        let processes = Processes::new();
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        let commands = running_on(&runtime, &processes, 1).await;
        let control = processes.controls()[0].clone();
        let switches: [&dyn Fn(&SessionCommands); 3] = [
            &|commands| commands.switch_mode("plan").expect("written"),
            &|commands| commands.switch_model("opus").expect("written"),
            &|commands| commands.switch_effort("high").expect("written"),
        ];
        for switch in switches {
            switch(&commands);
            let id = runtime
                .view()
                .transcript
                .operations
                .switches
                .last()
                .expect("a switch")
                .id
                .clone();
            control.emit(&success(&id));
            until(|| {
                runtime
                    .view()
                    .transcript
                    .operations
                    .switches
                    .iter()
                    .any(|it| it.id == id && it.outcome == SwitchOutcome::Applied)
            })
            .await;
        }

        assert!(runtime.turn_sandbox_on());
        running_on(&runtime, &processes, 2).await;

        let args = &processes.session_args()[1];
        let flags = ["--permission-mode", "--model", "--effort"].map(|flag| flag_value(args, flag));
        assert_eq!(flags, [Some("plan"), Some("opus"), Some("high")]);
        runtime.close();
        within(run).await;
    });
}

#[test]
fn a_sandbox_start_failure_falls_back_once() {
    drive(|executor| async move {
        let processes = Processes::new();
        let first = processes.prepare(LiveOptions::default());
        not_started(&processes);
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        let commands = running_on(&runtime, &processes, 1).await;
        one_turn(&runtime, &commands, &first).await;
        let notices = runtime.view().conversation.notices;
        let cost = runtime.view().conversation.usage.session_cost_usd;

        assert!(runtime.turn_sandbox_on());
        running_on(&runtime, &processes, 3).await;

        let args = processes.session_args();
        assert!(has_arg(&args[1], "--settings"), "{:?}", args[1]);
        assert!(!has_arg(&args[2], "--settings"), "{:?}", args[2]);
        assert!(
            has_arg(&args[2], &format!("--resume={ID}")),
            "{:?}",
            args[2]
        );
        let switches = sandbox_switches(&runtime);
        let [record] = switches.as_slice() else {
            panic!("one sandbox switch: {switches:?}")
        };
        assert_eq!(record.outcome, SwitchOutcome::Failed);
        let sentence = unavailable_sentence();
        assert!(
            sentence.starts_with("Sandbox required but unavailable"),
            "{sentence}"
        );
        assert_eq!(record.detail.as_deref(), Some(sentence.as_str()));
        assert!(running(&runtime.status()));
        // The result of the CLI that did not start is not the conversation's.
        assert_eq!(runtime.view().conversation.notices, notices);
        assert_eq!(runtime.view().conversation.usage.session_cost_usd, cost);
        assert!(!runtime.view().transcript.operations.launch_sandbox);
        runtime.close();
        within(run).await;
    });
}

#[test]
fn a_fallback_failure_is_a_failure() {
    drive(|executor| async move {
        let processes = Processes::new();
        processes.prepare(LiveOptions::default());
        not_started(&processes);
        processes.prepare(LiveOptions::default()).exit(1);
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        running_on(&runtime, &processes, 1).await;

        assert!(runtime.turn_sandbox_on());
        within(reach(&runtime, failed)).await;

        assert_eq!(processes.session_args().len(), 3);
        let switches = sandbox_switches(&runtime);
        assert_eq!(switches.len(), 1, "{switches:?}");
        assert_eq!(switches[0].outcome, SwitchOutcome::Failed);
        within(run).await;
    });
}

#[test]
fn a_launch_start_failure_falls_back() {
    drive(|executor| async move {
        let processes = Processes::new();
        not_started(&processes);
        let (runtime, run, _log) = runtime(&processes, |config| config.sandbox = true);
        let run = executor.spawn(run);
        running_on(&runtime, &processes, 2).await;

        let args = processes.session_args();
        assert!(has_arg(&args[0], "--settings"), "{:?}", args[0]);
        assert!(!has_arg(&args[1], "--settings"), "{:?}", args[1]);
        assert!(
            has_arg(&args[1], &format!("--session-id={ID}")),
            "{:?}",
            args[1]
        );
        let switches = sandbox_switches(&runtime);
        let [record] = switches.as_slice() else {
            panic!("one sandbox switch: {switches:?}")
        };
        assert_eq!(record.outcome, SwitchOutcome::Failed);
        assert_eq!(
            record.detail.as_deref(),
            Some(unavailable_sentence().as_str())
        );
        assert!(!runtime.view().transcript.operations.launch_sandbox);
        runtime.close();
        within(run).await;
    });
}

#[test]
fn a_restart_is_refused_while_a_turn_runs() {
    drive(|executor| async move {
        let processes = Processes::new();
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        let commands = running_on(&runtime, &processes, 1).await;
        commands
            .send_message(SendId::new("m1").expect("a key"), "hello", &[])
            .expect("sent");

        assert!(!runtime.turn_sandbox_on());

        let switches = sandbox_switches(&runtime);
        assert_eq!(switches.len(), 1, "{switches:?}");
        assert_eq!(switches[0].outcome, SwitchOutcome::Rejected);
        assert_eq!(processes.session_args().len(), 1);
        assert!(running(&runtime.status()));
        runtime.close();
        within(run).await;
    });
}

#[test]
fn a_second_restart_is_ignored() {
    drive(|executor| async move {
        let processes = Processes::new();
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        running_on(&runtime, &processes, 1).await;

        assert!(runtime.turn_sandbox_on());
        assert!(!runtime.turn_sandbox_on());
        running_on(&runtime, &processes, 2).await;
        assert!(
            !runtime.turn_sandbox_on(),
            "the switch still waits for the settings"
        );

        assert_eq!(sandbox_switches(&runtime).len(), 1);
        assert_eq!(processes.session_args().len(), 2);
        runtime.close();
        within(run).await;
    });
}

#[test]
fn a_close_during_a_restart_ends_all() {
    drive(|executor| async move {
        let processes = Processes::new();
        let first = processes.prepare(stubborn());
        let (runtime, run, _log) = runtime(&processes, |config| config.close_wait = GUARD);
        let run = executor.spawn(run);
        running_on(&runtime, &processes, 1).await;

        assert!(runtime.turn_sandbox_on());
        until(|| first.destroyed()).await;
        runtime.close();
        first.exit(SIGTERM_EXIT);
        within(run).await;

        assert!(processes.controls().iter().all(LiveControl::destroyed));
        assert_eq!(
            processes.session_args().len(),
            1,
            "nothing was started after the close"
        );
        assert_eq!(runtime.status(), SessionStatus::Closed);
        let switches = sandbox_switches(&runtime);
        assert_eq!(switches.len(), 1, "{switches:?}");
        assert_eq!(
            switches[0].outcome,
            SwitchOutcome::Failed,
            "no switch stays pending"
        );
    });
}

#[test]
fn a_sandboxed_cli_that_fails_after_starting_leaves_no_switch_pending() {
    drive(|executor| async move {
        let processes = Processes::new();
        processes.prepare(LiveOptions::default());
        // The restarted CLI says something (so it started), then dies before its settings are
        // answered.
        let dies = processes.prepare(LiveOptions::default());
        dies.emit(&format!(
            r#"{{"type":"system","subtype":"status","status":"requesting","session_id":"{ID}","uuid":"u"}}"#
        ));
        dies.exit(1);
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        running_on(&runtime, &processes, 1).await;

        assert!(runtime.turn_sandbox_on());
        within(reach(&runtime, failed)).await;
        within(run).await;

        assert_eq!(
            processes.session_args().len(),
            2,
            "a CLI that started and failed is not started again"
        );
        let switches = sandbox_switches(&runtime);
        assert_eq!(switches.len(), 1, "{switches:?}");
        assert_eq!(switches[0].outcome, SwitchOutcome::Failed);
    });
}

#[test]
fn the_old_commands_are_gone_from_the_mark_on() {
    drive(|executor| async move {
        let processes = Processes::new();
        let first = processes.prepare(stubborn());
        let (runtime, run, _log) = runtime(&processes, |config| config.close_wait = GUARD);
        let run = executor.spawn(run);
        let old = running_on(&runtime, &processes, 1).await;
        let watched = runtime.watch_status();

        assert!(runtime.turn_sandbox_on());
        assert_eq!(
            runtime.status(),
            SessionStatus::Starting,
            "Starting as soon as the switch is marked"
        );
        assert!(runtime.commands().is_none());
        // The old CLI is still being waited for: nothing may hand out its commands meanwhile.
        until(|| first.destroyed()).await;
        assert_eq!(runtime.status(), SessionStatus::Starting);
        assert!(runtime.commands().is_none());

        // A host that kept the old commands sends through them: refused, on the record, and
        // written to no CLI.
        assert_eq!(
            old.switch_model("m"),
            Err(closta_core::ports::SendError::Closed)
        );
        let model = runtime
            .view()
            .transcript
            .operations
            .switches
            .iter()
            .find(|it| it.kind == SwitchKind::Model)
            .cloned()
            .expect("the model switch is recorded");
        assert_eq!(model.outcome, SwitchOutcome::Failed);

        first.exit(SIGTERM_EXIT);
        let again = running_on(&runtime, &processes, 2).await;
        assert!(!Arc::ptr_eq(&again, &old));
        assert_eq!(
            support::statuses(&watched).len(),
            3,
            "Running, then Starting once, then Running on the new CLI"
        );
        let set_model = |control: &LiveControl| {
            control
                .stdin_lines()
                .iter()
                .any(|line| line.contains(r#""subtype":"set_model""#))
        };
        let controls = processes.controls();
        assert!(!set_model(&controls[0]));
        assert!(!set_model(&controls[1]));
        runtime.close();
        within(run).await;
    });
}

#[test]
fn a_restart_whose_spawn_fails_leaves_no_switch_pending() {
    drive(|executor| async move {
        let processes = Processes::new();
        processes.fail_spawn(1, LaunchError::TooManyProcesses);
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        running_on(&runtime, &processes, 1).await;

        assert!(runtime.turn_sandbox_on());
        within(reach(&runtime, failed)).await;
        within(run).await;

        let switches = sandbox_switches(&runtime);
        assert_eq!(switches.len(), 1, "{switches:?}");
        assert_eq!(switches[0].outcome, SwitchOutcome::Failed);
    });
}

#[test]
fn turn_sandbox_off_writes_apply_flag_settings() {
    drive(|executor| async move {
        let processes = Processes::new();
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        let commands = running_on(&runtime, &processes, 1).await;
        let control = processes.controls()[0].clone();

        commands.turn_sandbox_off().expect("written");
        let switches = sandbox_switches(&runtime);
        let [record] = switches.as_slice() else {
            panic!("one sandbox switch: {switches:?}")
        };
        assert_eq!(record.value, "false");
        let line = within(control.next_stdin_line()).await;
        assert_eq!(line, Some(encode::sandbox_off(&record.id)));
        control.emit(&success(&record.id));
        let next = within(control.next_stdin_line()).await;
        assert!(
            next.as_deref()
                .is_some_and(|line| line.contains(r#""subtype":"get_settings""#)),
            "{next:?}"
        );
        runtime.close();
        within(run).await;
    });
}

#[test]
fn turning_the_sandbox_on_outside_running_does_nothing() {
    drive(|executor| async move {
        // Starting: `--version` gets a process that prints nothing and does not end by itself.
        let checks = Arc::new(Mutex::new(Vec::<LiveControl>::new()));
        let kept = Arc::clone(&checks);
        let spawner = Arc::new(FakeSpawner::answering(move |_: &Launch| {
            let (process, control) = LiveProcess::new(LiveOptions::default());
            kept.lock().unwrap().push(control);
            Ok(Box::new(process) as Box<dyn AgentProcess>)
        }));
        let (starting, run, _log) =
            runtime_over(Arc::clone(&spawner) as Arc<dyn ProcessSpawner>, |_| {});
        let run = executor.spawn(run);
        until(|| !checks.lock().unwrap().is_empty()).await;
        assert_eq!(starting.status(), SessionStatus::Starting);
        assert!(!starting.turn_sandbox_on());
        assert!(sandbox_switches(&starting).is_empty());
        starting.close();
        within(run).await;
        assert_eq!(spawner.launches().len(), 1, "only the version check");

        // Ended.
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (ended, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        running_on(&ended, &processes, 1).await;
        control.exit(0);
        within(run).await;
        assert_eq!(ended.status(), SessionStatus::Ended);
        assert!(!ended.turn_sandbox_on());
        assert!(sandbox_switches(&ended).is_empty());
        assert_eq!(processes.session_args().len(), 1);

        // Closed.
        let processes = Processes::new();
        let (closed, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        running_on(&closed, &processes, 1).await;
        closed.close();
        within(run).await;
        assert!(!closed.turn_sandbox_on());
        assert!(sandbox_switches(&closed).is_empty());
        assert_eq!(processes.session_args().len(), 1);
    });
}
