#![allow(clippy::expect_used, clippy::unwrap_used)]
//! A session's life from the version check to its end, over the in-memory processes: the order
//! of the launch, the failures and how they are sorted, what the log may hold, the fold and the
//! settings request. SessionRuntimeTest.kt, SessionRuntimeWslTest.kt and
//! SessionRuntimeSettingsTest.kt.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::io::ErrorKind;
use std::sync::{Arc, Mutex, PoisonError};

use closta_presenter::input::SendId;
use closta_providers::claude::fake::live::{LiveControl, LiveOptions};
use closta_providers::claude::fake::process::{ProcessScript, ProcessTermination};
use closta_providers::claude::launch::env::SecretEnv;
use closta_providers::claude::launch::spec::LaunchSpec;
use closta_providers::claude::launch::{Launch, LaunchError};
use closta_providers::claude::process::ProcessFailure;
use closta_session::launch::{NativeSessionLaunchPlanner, SessionLaunch, SessionLaunchPlanner};
use closta_session::runtime::SessionRuntime;
use closta_session::status::{SessionFailure, SessionStatus};
use futures_lite::future;
use serde_json::Value;

use support::{GUARD, ID, Processes, VERSION, WORKING_DIR, drive, reach, runtime, statuses, until};

const INIT_MARK: &str = "\"subtype\":\"init\"";
const GET_SETTINGS: &str = "\"subtype\":\"get_settings\"";

fn running(status: &SessionStatus) -> bool {
    matches!(status, SessionStatus::Running { .. })
}

/// The args the native planner gives session [`ID`] in [`WORKING_DIR`], with `change` made.
fn args_with(change: impl FnOnce(&mut LaunchSpec)) -> Vec<String> {
    let mut spec = LaunchSpec {
        cwd: Some(WORKING_DIR.to_owned()),
        permission_prompt_tool_stdio: true,
        ..LaunchSpec::new(ID)
    };
    change(&mut spec);
    Launch::of(&spec).expect("a valid spec").args
}

fn flag_value<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
    args.windows(2)
        .find(|pair| pair[0] == flag)
        .map(|pair| pair[1].as_str())
}

fn init_line() -> String {
    common::non_blank_lines(&common::text_of("01-baseline-text.ndjson"))
        .into_iter()
        .find(|line| line.contains(INIT_MARK))
        .expect("the capture has a system/init")
}

/// The init line with `model` in place of the CLI's: a second init the fold visibly took.
fn init_line_with_model(model: &str) -> String {
    let mut init: Value = serde_json::from_str(&init_line()).expect("json");
    init["model"] = Value::String(model.to_owned());
    init.to_string()
}

async fn next_line(control: &LiveControl) -> String {
    future::or(
        async { control.next_stdin_line().await.expect("a stdin line") },
        async {
            smol::Timer::after(GUARD).await;
            panic!(
                "no stdin line within {GUARD:?}; so far {:?}",
                control.stdin_lines()
            )
        },
    )
    .await
}

fn request_id(line: &str) -> String {
    let value: Value = serde_json::from_str(line).expect("json");
    value["request_id"]
        .as_str()
        .expect("a control request has its id")
        .to_owned()
}

fn send_id(id: &str) -> SendId {
    SendId::new(id).expect("a key")
}

/// A planner that answers `answer` without spawning anything.
struct Answering(Mutex<Option<Result<SessionLaunch, SessionFailure>>>);

impl SessionLaunchPlanner for Answering {
    fn plan(
        &self,
        _session_id: &str,
        _working_directory: Option<&str>,
    ) -> future::Boxed<Result<SessionLaunch, SessionFailure>> {
        let answer = self
            .0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take()
            .expect("planned once");
        Box::pin(future::ready(answer))
    }
}

fn answering(answer: Result<SessionLaunch, SessionFailure>) -> Arc<dyn SessionLaunchPlanner> {
    Arc::new(Answering(Mutex::new(Some(answer))))
}

#[test]
fn starts_with_the_version_check_then_exactly_one_long_lived_process_with_the_specs_argv() {
    drive(|executor| async move {
        let processes = Processes::new();
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        let status = reach(&runtime, running).await;
        assert_eq!(
            status,
            SessionStatus::Running {
                version: VERSION.to_owned()
            }
        );
        let expected = args_with(|_| {});
        let launches = processes.launches();
        let args: Vec<Vec<String>> = launches.iter().map(|l| l.args.clone()).collect();
        assert_eq!(args, [vec!["--version".to_owned()], expected.clone()]);
        assert_eq!(launches.iter().filter(|l| l.args == expected).count(), 1);
        assert!(
            launches
                .iter()
                .all(|l| l.cwd.as_deref() == Some(WORKING_DIR))
        );
        runtime.close();
        run.await;
    });
}

#[test]
fn a_session_started_with_an_effort_has_it_in_its_argv_and_its_view_before_it_runs_and_one_without_has_none()
 {
    drive(|executor| async move {
        let processes = Processes::new();
        let (effortful, run, _log) = runtime(&processes, |config| {
            config.effort = Some("high".to_owned());
        });
        let run = executor.spawn(run);
        reach(&effortful, running).await;
        let expected = args_with(|spec| spec.effort = Some("high".to_owned()));
        assert_eq!(processes.session_args(), std::slice::from_ref(&expected));
        assert_eq!(flag_value(&expected, "--effort"), Some("high"));
        assert_eq!(
            effortful.view().transcript.operations.effort.as_deref(),
            Some("high")
        );
        effortful.close();
        run.await;

        let plain_processes = Processes::new();
        let (plain, run, _log) = runtime(&plain_processes, |_| {});
        let run = executor.spawn(run);
        reach(&plain, running).await;
        assert_eq!(plain.view().transcript.operations.effort, None);
        assert!(!plain_processes.session_args()[0].contains(&"--effort".to_owned()));
        plain.close();
        run.await;
    });
}

#[test]
fn a_clean_exit_ends_the_session_127_and_other_codes_fail_it_and_nothing_restarts() {
    drive(|executor| async move {
        for (code, expected) in [
            (0, SessionStatus::Ended),
            (127, SessionStatus::Failed(SessionFailure::CommandNotFound)),
            (
                3,
                SessionStatus::Failed(SessionFailure::EndedAbnormally(ProcessFailure::Exit(3))),
            ),
        ] {
            let processes = Processes::new();
            let control = processes.prepare(LiveOptions::default());
            let (runtime, run, _log) = runtime(&processes, |_| {});
            let run = executor.spawn(run);
            reach(&runtime, running).await;
            control.exit(code);
            run.await;
            assert_eq!(runtime.status(), expected, "exit {code}");
            assert_eq!(processes.launches().len(), 2, "exit {code}");
            assert!(runtime.commands().is_none(), "exit {code}");
        }
    });
}

#[test]
fn a_spawn_failure_and_a_planner_failure_are_reported_as_their_own_failures() {
    drive(|executor| async move {
        let processes = Processes::new();
        processes.refuse(LaunchError::Spawn(ErrorKind::NotFound));
        let (launch, run, _log) = runtime(&processes, |_| {});
        executor.spawn(run).await;
        assert_eq!(
            launch.status(),
            SessionStatus::Failed(SessionFailure::LaunchFailed {
                kind: ErrorKind::NotFound
            })
        );

        let processes = Processes::new();
        let (planned, run, _log) = runtime(&processes, |config| {
            config.planner = answering(Err(SessionFailure::PlanFailed));
        });
        executor.spawn(run).await;
        assert_eq!(
            planned.status(),
            SessionStatus::Failed(SessionFailure::PlanFailed)
        );
        assert!(processes.launches().is_empty());

        // A spec that contradicts itself is a plan that failed too, and nothing is spawned.
        let processes = Processes::new();
        let contradicting = SessionLaunch {
            spawner: processes.spawner(),
            spec: LaunchSpec {
                fork_session: true,
                ..LaunchSpec::new(ID)
            },
        };
        let (contradicted, run, _log) = runtime(&processes, |config| {
            config.planner = answering(Ok(contradicting));
        });
        executor.spawn(run).await;
        assert_eq!(
            contradicted.status(),
            SessionStatus::Failed(SessionFailure::PlanFailed)
        );
        assert!(processes.launches().is_empty());
    });
}

#[test]
fn a_missing_working_folder_fails_with_that_after_a_check_that_passed() {
    drive(|executor| async move {
        let processes = Processes::new();
        processes.refuse(LaunchError::WorkingDirectoryMissing {
            path: "/work/wt".to_owned(),
        });
        let (runtime, run, log) = runtime(&processes, |_| {});
        executor.spawn(run).await;
        assert_eq!(
            runtime.status(),
            SessionStatus::Failed(SessionFailure::WorkingDirectoryMissing {
                path: "/work/wt".to_owned()
            })
        );
        // The version check ran and passed before the start failed.
        assert_eq!(processes.launches()[0].args, ["--version"]);
        let lines = log.lines();
        assert!(lines.iter().any(|l| l.contains(VERSION)), "{lines:?}");
        // The screen says which folder; the log says only what kind of failure, as a path holds
        // the user's name.
        let warning = format!("WARN claude session {ID}: failed (WorkingDirectoryMissing)");
        assert!(lines.contains(&warning), "{lines:?}");
        assert!(!lines.iter().any(|l| l.contains("/work/wt")), "{lines:?}");
    });
}

#[test]
fn a_failure_the_planner_names_keeps_its_kind_and_nothing_is_spawned() {
    drive(|executor| async move {
        let processes = Processes::new();
        let named = SessionFailure::WslUnavailable {
            distro: "Ubuntu".to_owned(),
        };
        let (runtime, run, _log) = runtime(&processes, |config| {
            config.planner = answering(Err(named.clone()));
        });
        executor.spawn(run).await;
        assert_eq!(runtime.status(), SessionStatus::Failed(named));
        assert!(processes.launches().is_empty());
    });
}

#[test]
fn the_launch_log_carries_the_argv_and_the_version_never_the_environment_or_the_folder() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let spawner = processes.spawner();
        let (runtime, run, log) = runtime(&processes, |config| {
            config.planner = Arc::new(NativeSessionLaunchPlanner::new(
                spawner,
                Arc::new(|| {
                    let mut env = SecretEnv::default();
                    env.insert("ANTHROPIC_API_KEY", "sk-secret");
                    env
                }),
            ));
        });
        let run = executor.spawn(run);
        reach(&runtime, running).await;
        control.exit(127);
        run.await;
        // The secret did reach the process.
        assert_eq!(
            processes.launches()[1].env.get("ANTHROPIC_API_KEY"),
            Some("sk-secret")
        );
        let lines = log.lines();
        assert!(
            lines
                .iter()
                .any(|l| l.contains(&format!("--session-id={ID}"))),
            "{lines:?}"
        );
        assert!(lines.iter().any(|l| l.contains(VERSION)), "{lines:?}");
        for line in &lines {
            assert!(!line.contains("sk-secret"), "{line}");
            assert!(!line.contains("ANTHROPIC_API_KEY"), "{line}");
            assert!(!line.contains("someone"), "{line}");
        }
        assert_eq!(
            lines.iter().filter(|l| l.starts_with("WARN")).count(),
            1,
            "{lines:?}"
        );
        let status = format!("{:?}", runtime.status());
        assert!(!status.contains("sk-secret"), "{status}");
    });
}

#[test]
fn events_are_folded_into_the_conversation_and_commands_reach_the_process() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        reach(&runtime, running).await;
        control.emit(&init_line());
        until(|| runtime.view().conversation.session.is_some()).await;
        assert_eq!(
            runtime
                .view()
                .conversation
                .session
                .map(|session| session.version),
            Some("2.1.282".to_owned())
        );

        let commands = runtime.commands().expect("running");
        commands
            .send_message(send_id("send-1"), "hello", &[])
            .expect("sent");
        // A session with no initialize asks for the settings at its first system/init. That
        // request is written from the fold, so it may reach stdin before or after the user line.
        let lines = [next_line(&control).await, next_line(&control).await];
        assert!(lines.iter().any(|l| l.contains(GET_SETTINGS)), "{lines:?}");
        assert!(
            lines
                .iter()
                .any(|l| l.contains("\"type\":\"user\"") && l.contains("hello") && l.contains(ID)),
            "{lines:?}"
        );
        runtime.close();
        run.await;
    });
}

#[test]
fn no_initialize_is_written_and_the_first_line_is_the_users() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        reach(&runtime, running).await;
        runtime
            .commands()
            .expect("running")
            .send_message(send_id("send-1"), "hello", &[])
            .expect("sent");
        let first = next_line(&control).await;
        assert!(first.contains("\"type\":\"user\""), "{first}");
        assert!(
            !control
                .stdin_lines()
                .iter()
                .any(|l| l.contains("\"subtype\":\"initialize\""))
        );
        runtime.close();
        run.await;
    });
}

#[test]
fn the_settings_are_asked_after_the_first_init_and_after_a_model_switch_the_cli_took() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        reach(&runtime, running).await;

        control.emit(&init_line());
        assert!(next_line(&control).await.contains(GET_SETTINGS));

        // A second init is folded and asks nothing.
        control.emit(&init_line_with_model("second-model"));
        until(|| {
            runtime
                .view()
                .conversation
                .session
                .is_some_and(|session| session.model == "second-model")
        })
        .await;
        let commands = runtime.commands().expect("running");
        commands.switch_model("opus").expect("sent");
        let switch = next_line(&control).await;
        assert!(switch.contains("\"subtype\":\"set_model\""), "{switch}");

        // The CLI took the switch: the settings are asked again.
        control.emit(&format!(
            r#"{{"type":"control_response","response":{{"subtype":"success","request_id":"{}"}}}}"#,
            request_id(&switch)
        ));
        assert!(next_line(&control).await.contains(GET_SETTINGS));
        let written = control.stdin_lines();
        assert_eq!(written.len(), 3, "{written:?}");
        assert_eq!(
            written.iter().filter(|l| l.contains(GET_SETTINGS)).count(),
            2,
            "{written:?}"
        );
        runtime.close();
        run.await;
    });
}

#[test]
fn a_settings_request_that_cannot_be_written_is_logged_and_the_session_goes_on() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (runtime, run, log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        reach(&runtime, running).await;

        // The CLI stops reading: the next write fails and the session's queue closes.
        control.close_stdin();
        runtime
            .commands()
            .expect("running")
            .switch_model("opus")
            .expect("queued");
        until(|| control.refused_writes() >= 1).await;

        control.emit(&init_line());
        until(|| runtime.view().conversation.session.is_some()).await;
        let warning =
            format!("WARN claude session {ID}: the settings could not be asked for (Closed)");
        until(|| log.lines().contains(&warning)).await;
        assert_eq!(
            log.lines().iter().filter(|l| **l == warning).count(),
            1,
            "{:?}",
            log.lines()
        );
        assert!(running(&runtime.status()), "{:?}", runtime.status());

        // Later lines are still folded.
        control.emit(&init_line_with_model("later-model"));
        until(|| {
            runtime
                .view()
                .conversation
                .session
                .is_some_and(|session| session.model == "later-model")
        })
        .await;
        runtime.close();
        run.await;
    });
}

#[test]
fn a_watcher_that_goes_away_does_not_stop_the_session() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (runtime, run, _log) = runtime(&processes, |_| {});
        drop(runtime.watch_status());
        drop(runtime.watch_view());
        let run = executor.spawn(run);
        reach(&runtime, running).await;
        control.emit(&init_line());
        control.emit(&init_line_with_model("later-model"));
        control.exit(0);
        run.await;
        assert_eq!(runtime.status(), SessionStatus::Ended);
        assert_eq!(
            runtime.view().conversation.session.map(|s| s.model),
            Some("later-model".to_owned())
        );
    });
}

#[test]
fn the_run_is_send() {
    fn assert_send<T: Send + 'static>(_: &T) {}
    fn assert_shared<T: Send + Sync + Clone>(_: &T) {}
    let (runtime, run, _log) = runtime(&Processes::new(), |_| {});
    assert_send(&run);
    assert_shared(&runtime);
}

#[test]
fn the_statuses_go_starting_running_and_end_and_the_runtime_has_its_id() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (runtime, run, log) = runtime(&processes, |_| {});
        assert_eq!(runtime.id(), ID);
        assert_eq!(runtime.status(), SessionStatus::Starting);
        let watched = runtime.watch_status();
        let run = executor.spawn(run);
        reach(&runtime, running).await;
        control.exit(0);
        run.await;
        assert_eq!(
            statuses(&watched),
            [
                SessionStatus::Starting,
                SessionStatus::Running {
                    version: VERSION.to_owned()
                },
                SessionStatus::Ended
            ]
        );
        assert_eq!(
            log.lines().last().map(String::as_str),
            Some(format!("INFO claude session {ID}: ended").as_str())
        );
    });
}

// SessionRuntimeWslTest.kt: a 127 from a launch in WSL is the distribution's own failure.

#[test]
fn a_127_from_the_conversation_in_wsl_names_the_distribution_and_not_the_hosts_path() {
    drive(|executor| async move {
        let processes = Processes::wsl("Ubuntu");
        let control = processes.prepare(LiveOptions::default());
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        reach(&runtime, running).await;
        control.exit(127);
        run.await;
        assert_eq!(
            runtime.status(),
            SessionStatus::Failed(SessionFailure::WslCommandNotFound {
                distro: "Ubuntu".to_owned()
            })
        );
    });
}

fn exits_127() -> ProcessScript {
    ProcessScript {
        beats: Vec::new(),
        termination: ProcessTermination::Error(ProcessFailure::Exit(127)),
        stdin_fails: false,
    }
}

#[test]
fn a_127_from_the_version_check_in_wsl_is_the_same_failure() {
    drive(|executor| async move {
        let processes = Processes::wsl("Ubuntu");
        processes.version_answers(exits_127());
        let (runtime, run, _log) = runtime(&processes, |_| {});
        executor.spawn(run).await;
        assert_eq!(
            runtime.status(),
            SessionStatus::Failed(SessionFailure::WslCommandNotFound {
                distro: "Ubuntu".to_owned()
            })
        );
        assert!(processes.session_args().is_empty());
    });
}

#[test]
fn a_127_from_a_launch_not_in_wsl_stays_command_not_found_in_both_places() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (conversation, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        reach(&conversation, running).await;
        control.exit(127);
        run.await;
        assert_eq!(
            conversation.status(),
            SessionStatus::Failed(SessionFailure::CommandNotFound)
        );

        let processes = Processes::new();
        processes.version_answers(exits_127());
        let (check, run, _log) = runtime(&processes, |_| {});
        executor.spawn(run).await;
        assert_eq!(
            check.status(),
            SessionStatus::Failed(SessionFailure::CommandNotFound)
        );
    });
}

// SessionRuntimeSettingsTest.kt: the permission mode a session's CLI is started in.

/// Starts a session over `processes` with `mode` read at its start, and closes it once running.
async fn start_with_mode(
    executor: &smol::LocalExecutor<'static>,
    processes: &Processes,
    mode: Arc<dyn Fn() -> Option<String> + Send + Sync>,
) -> SessionRuntime {
    let (runtime, run, _log) = runtime(processes, |config| config.start_mode = mode);
    let run = executor.spawn(run);
    reach(&runtime, running).await;
    runtime.close();
    run.await;
    runtime
}

#[test]
fn a_mode_in_the_settings_starts_the_cli_with_it_and_with_no_effort() {
    drive(|executor| async move {
        let processes = Processes::new();
        start_with_mode(&executor, &processes, Arc::new(|| Some("plan".to_owned()))).await;
        let args = &processes.session_args()[0];
        assert_eq!(flag_value(args, "--permission-mode"), Some("plan"));
        assert_eq!(args.iter().filter(|a| *a == "--permission-mode").count(), 1);
        assert!(!args.contains(&"--effort".to_owned()));
    });
}

#[test]
fn no_mode_in_the_settings_leaves_the_argv_as_it_was() {
    drive(|executor| async move {
        let processes = Processes::new();
        start_with_mode(&executor, &processes, Arc::new(|| None)).await;
        assert_eq!(processes.session_args(), [args_with(|_| {})]);
        assert!(!processes.session_args()[0].contains(&"--permission-mode".to_owned()));
    });
}

#[test]
fn the_mode_is_read_each_time_a_session_starts() {
    drive(|executor| async move {
        let mode = Arc::new(Mutex::new(Some("plan".to_owned())));
        let read = Arc::clone(&mode);
        let reader: Arc<dyn Fn() -> Option<String> + Send + Sync> =
            Arc::new(move || read.lock().unwrap_or_else(PoisonError::into_inner).clone());
        let first = Processes::new();
        start_with_mode(&executor, &first, Arc::clone(&reader)).await;
        *mode.lock().unwrap_or_else(PoisonError::into_inner) = Some("auto".to_owned());
        let second = Processes::new();
        start_with_mode(&executor, &second, reader).await;
        assert_eq!(
            flag_value(&first.session_args()[0], "--permission-mode"),
            Some("plan")
        );
        assert_eq!(
            flag_value(&second.session_args()[0], "--permission-mode"),
            Some("auto")
        );
    });
}
