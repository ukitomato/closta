#![allow(clippy::expect_used, clippy::unwrap_used)]
//! How a session closes: the process is told to end, waited for, killed when it does not end,
//! and given up when the kill does not end it either; a close during the version check, during
//! the spawn and after the end; and `destroy_now`. SessionRuntimeCloseTest.kt and the closing
//! tests of SessionRuntimeTest.kt.
//!
//! Where this differs from Kotlin on purpose: every close waits (`destroy`, the close wait, the
//! kill, the kill wait), not only Kotlin's `closeJob`; the caller waits by awaiting the run. A
//! close during the spawn waits for the spawn to finish and closes what it made. `destroy_now`
//! kills (`destroy_forcibly`), and a kill does not fail. Closed is never overwritten.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::io::{self, ErrorKind};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock, PoisonError};
use std::time::{Duration, Instant};

use closta_providers::claude::fake::live::{LiveControl, LiveOptions, LiveProcess};
use closta_providers::claude::fake::process::{FakeProcess, ProcessScript};
use closta_providers::claude::fake::spawner::FakeSpawner;
use closta_providers::claude::launch::{Launch, LaunchError};
use closta_providers::claude::process::{AgentProcess, ProcessFailure};
use closta_session::log::SessionLog;
use closta_session::runtime::SessionRuntime;
use closta_session::status::{SessionFailure, SessionStatus};
use futures_lite::{StreamExt, future, stream};
use smol::Timer;

use support::{GUARD, Processes, VERSION, drive, reach, runtime, runtime_over, statuses, until};

const INIT_MARK: &str = "\"subtype\":\"init\"";
/// The wait of the tests that see a wait run out.
const SHORT: Duration = Duration::from_millis(300);

fn running(status: &SessionStatus) -> bool {
    matches!(status, SessionStatus::Running { .. })
}

/// A process that does not end when told to; only `exit` or a kill ends it.
fn stubborn(ends_on_kill: bool) -> LiveOptions {
    LiveOptions {
        exit_on_destroy: None,
        ends_on_kill,
        wait_fails: false,
    }
}

fn init_line() -> String {
    common::non_blank_lines(&common::text_of("01-baseline-text.ndjson"))
        .into_iter()
        .find(|line| line.contains(INIT_MARK))
        .expect("the capture has a system/init")
}

fn version_process() -> Box<dyn AgentProcess> {
    let (process, _probe) = FakeProcess::new(ProcessScript::replaying(vec![format!(
        "{VERSION} (Claude Code)"
    )]));
    Box::new(process)
}

/// A spawner that answers `--version` with the version and every other launch with `session`.
fn answering(
    session: impl Fn() -> Result<Box<dyn AgentProcess>, LaunchError> + Send + Sync + 'static,
) -> Arc<FakeSpawner> {
    Arc::new(FakeSpawner::answering(move |launch: &Launch| {
        if launch.args == ["--version"] {
            Ok(version_process())
        } else {
            session()
        }
    }))
}

fn has(lines: &[String], part: &str) -> bool {
    lines.iter().any(|line| line.contains(part))
}

/// Waits for `run` and fails if it takes [`GUARD`].
async fn ended<T>(run: impl Future<Output = T>) -> T {
    future::or(run, async {
        Timer::after(GUARD).await;
        panic!("the run did not end within {GUARD:?}")
    })
    .await
}

/// A log that keeps, with each line, how many kills the process had had when it was written.
struct KillCountingLog {
    control: LiveControl,
    lines: Mutex<Vec<(String, usize)>>,
}

impl KillCountingLog {
    fn push(&self, level: &str, line: &str) {
        self.lines
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push((format!("{level} {line}"), self.control.force_kills()));
    }

    fn lines(&self) -> Vec<(String, usize)> {
        self.lines
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

impl SessionLog for KillCountingLog {
    fn info(&self, line: &str) {
        self.push("INFO", line);
    }

    fn warn(&self, line: &str) {
        self.push("WARN", line);
    }
}

/// A process whose stdout breaks at once while the process itself goes on running.
struct BrokenStdout(LiveProcess);

impl AgentProcess for BrokenStdout {
    fn take_stdout_lines(&mut self) -> Option<stream::Boxed<Result<String, ProcessFailure>>> {
        Some(stream::once(Err(ProcessFailure::Io(ErrorKind::BrokenPipe))).boxed())
    }

    fn take_stderr_drain(&mut self) -> Option<future::Boxed<()>> {
        self.0.take_stderr_drain()
    }

    fn write_stdin(&self, line: String) -> future::Boxed<io::Result<()>> {
        self.0.write_stdin(line)
    }

    fn wait(&self) -> future::Boxed<io::Result<i32>> {
        self.0.wait()
    }

    fn destroy(&self) {
        self.0.destroy();
    }

    fn destroy_forcibly(&self) {
        self.0.destroy_forcibly();
    }

    fn id(&self) -> Option<u32> {
        self.0.id()
    }
}

#[test]
fn closing_a_running_session_destroys_its_process() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (runtime, run, _log) = runtime(&processes, |config| config.close_wait = GUARD);
        let run = executor.spawn(run);
        reach(&runtime, running).await;
        runtime.close();
        ended(run).await;
        assert!(control.destroyed());
        assert!(control.ended());
        assert_eq!(runtime.status(), SessionStatus::Closed);
    });
}

#[test]
fn closing_before_the_run_starts_plans_and_spawns_nothing() {
    drive(|executor| async move {
        let processes = Processes::new();
        // The mode is read first thing in the plan: unread, nothing was begun.
        let reads = Arc::new(AtomicUsize::new(0));
        let counted = Arc::clone(&reads);
        let (runtime, run, log) = runtime(&processes, move |config| {
            config.start_mode = Arc::new(move || {
                counted.fetch_add(1, Ordering::SeqCst);
                None
            });
        });
        runtime.close();
        ended(executor.spawn(run)).await;
        assert_eq!(reads.load(Ordering::SeqCst), 0);
        assert!(
            processes.launches().is_empty(),
            "{:?}",
            processes.launches()
        );
        assert_eq!(runtime.status(), SessionStatus::Closed);
        assert!(log.lines().is_empty(), "{:?}", log.lines());
    });
}

#[test]
fn closing_during_the_version_check_destroys_the_check_and_never_starts_the_session() {
    drive(|executor| async move {
        // `--version` gets a process that prints nothing and does not end by itself.
        let (spawned, spawn_seen) = async_channel::unbounded();
        let checks = Arc::new(Mutex::new(Vec::<LiveControl>::new()));
        let kept = Arc::clone(&checks);
        let spawner = Arc::new(FakeSpawner::answering(move |_: &Launch| {
            let (process, control) = LiveProcess::new(LiveOptions::default());
            kept.lock().unwrap().push(control);
            _ = spawned.try_send(());
            Ok(Box::new(process) as Box<dyn AgentProcess>)
        }));
        let (runtime, run, log) = runtime_over(Arc::clone(&spawner) as _, |_| {});
        let run = executor.spawn(run);
        ended(spawn_seen.recv())
            .await
            .expect("the check is spawned");
        runtime.close();
        ended(run).await;

        let check = checks.lock().unwrap()[0].clone();
        until(|| check.ended()).await;
        assert_eq!(spawner.launches().len(), 1);
        assert_eq!(runtime.status(), SessionStatus::Closed);
        assert!(!has(&log.lines(), "started"), "{:?}", log.lines());
    });
}

#[test]
fn a_close_right_after_the_spawn_still_destroys_the_new_process() {
    drive(|executor| async move {
        let target = Arc::new(OnceLock::<SessionRuntime>::new());
        let controls = Arc::new(Mutex::new(Vec::<LiveControl>::new()));
        let (closer, kept) = (Arc::clone(&target), Arc::clone(&controls));
        let spawner = answering(move || {
            // Closed while the spawn is under way: the process exists, its stdout is not read yet.
            closer.get().expect("the runtime is set").close();
            let (process, control) = LiveProcess::new(LiveOptions::default());
            kept.lock().unwrap().push(control);
            Ok(Box::new(process) as Box<dyn AgentProcess>)
        });
        let (runtime, run, log) = runtime_over(spawner, |config| config.close_wait = GUARD);
        target.set(runtime.clone()).ok().expect("set once");
        ended(executor.spawn(run)).await;

        let control = controls.lock().unwrap()[0].clone();
        assert!(control.destroyed());
        assert!(control.ended());
        assert_eq!(control.force_kills(), 0);
        assert_eq!(runtime.status(), SessionStatus::Closed);
        assert!(runtime.commands().is_none());
        assert!(
            has(&log.lines(), "closed, the process ended"),
            "{:?}",
            log.lines()
        );
    });
}

#[test]
fn closing_one_of_two_sessions_leaves_the_other_running_and_dropping_a_run_ends_its_process() {
    drive(|executor| async move {
        let (first_processes, second_processes) = (Processes::new(), Processes::new());
        let first = first_processes.prepare(LiveOptions::default());
        // The second does not end when told to: only a kill ends it.
        let second = second_processes.prepare(stubborn(true));
        let (a, a_run, _) = runtime(&first_processes, |_| {});
        let (b, b_run, _) = runtime(&second_processes, |_| {});
        let a_run = executor.spawn(a_run);
        let b_run = executor.spawn(b_run);
        reach(&a, running).await;
        reach(&b, running).await;

        a.close();
        ended(a_run).await;
        assert!(first.destroyed());
        assert!(!second.destroyed());
        assert!(!second.ended());
        assert!(running(&b.status()));

        // Dropping a run (the platform's task) kills its process on the spot, with no wait.
        ended(b_run.cancel()).await;
        assert!(second.ended());
        assert_eq!(second.force_kills(), 1);
    });
}

#[test]
fn destroy_now_ends_the_processes_on_the_spot_without_a_close() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        reach(&runtime, running).await;

        runtime.destroy_now();
        // On the calling thread, before the run has looked: a kill, and the status as it was.
        assert!(control.ended());
        assert_eq!(control.force_kills(), 1);
        assert!(!control.destroyed());
        assert!(running(&runtime.status()));

        runtime.close();
        ended(run).await;
    });
}

#[test]
fn the_run_is_not_over_while_the_closed_process_runs_and_is_when_it_ends() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(stubborn(true));
        let (runtime, run, log) = runtime(&processes, |config| config.close_wait = GUARD);
        let run = executor.spawn(run);
        reach(&runtime, running).await;

        runtime.close();
        until(|| control.destroyed()).await;
        Timer::after(Duration::from_millis(100)).await;
        assert!(
            !run.is_finished(),
            "the process has not ended, so the close is not over"
        );

        control.exit(0);
        ended(run).await;
        assert!(
            has(&log.lines(), "closed, the process ended"),
            "{:?}",
            log.lines()
        );
        assert_eq!(control.force_kills(), 0);
    });
}

#[test]
fn close_says_closed_at_once() {
    // Kotlin's `close does not wait for the process, only closeJob does`: here every close waits
    // for the process, in the run; the status and the commands change on the spot.
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(stubborn(true));
        let (runtime, run, _log) = runtime(&processes, |config| config.close_wait = GUARD);
        let run = executor.spawn(run);
        reach(&runtime, running).await;
        let commands = runtime.commands().expect("running");

        runtime.close();
        assert_eq!(runtime.status(), SessionStatus::Closed);
        assert!(runtime.commands().is_none());
        assert!(commands.request_settings().is_err());
        assert!(!control.ended());

        control.exit(0);
        ended(run).await;
    });
}

#[test]
fn a_close_that_lands_while_the_process_is_being_spawned_still_waits_for_it() {
    drive(|executor| async move {
        let (process, control) = LiveProcess::new(stubborn(true));
        let process = Mutex::new(Some(process));
        let (spawning, spawn_seen) = async_channel::unbounded::<()>();
        let (release, released) = async_channel::bounded::<()>(1);
        let spawner = answering(move || {
            _ = spawning.try_send(());
            // Held until the test lets it go; a test that went away ends it as interrupted.
            released
                .recv_blocking()
                .map_err(|_| LaunchError::Spawn(ErrorKind::Interrupted))?;
            let process = process.lock().unwrap().take().expect("one session launch");
            Ok(Box::new(process) as Box<dyn AgentProcess>)
        });
        let (runtime, run, log) = runtime_over(spawner, |config| config.close_wait = GUARD);
        let run = executor.spawn(run);

        ended(spawn_seen.recv()).await.expect("the spawn begins");
        runtime.close();
        release.send(()).await.expect("the spawn waits");
        until(|| control.destroyed()).await;
        Timer::after(Duration::from_millis(100)).await;
        assert!(
            !run.is_finished(),
            "the process the spawn made has not ended, so the close is not over"
        );

        control.exit(0);
        ended(run).await;
        assert!(
            has(&log.lines(), "closed, the process ended"),
            "{:?}",
            log.lines()
        );
        assert_eq!(control.force_kills(), 0);
        assert_eq!(runtime.status(), SessionStatus::Closed);
    });
}

#[test]
fn a_wait_for_the_end_that_fails_is_logged_with_its_kind_not_as_an_end() {
    drive(|executor| async move {
        let processes = Processes::new();
        processes.prepare(LiveOptions {
            wait_fails: true,
            ..stubborn(true)
        });
        let (runtime, run, log) = runtime(&processes, |config| config.close_wait = GUARD);
        let run = executor.spawn(run);
        reach(&runtime, running).await;

        runtime.close();
        ended(run).await;

        let lines = log.lines();
        assert!(
            lines.iter().any(|line| line
                == "WARN claude session session-1: closed, waiting for the process failed (Other)"),
            "{lines:?}"
        );
        assert!(!has(&lines, "the process ended"), "{lines:?}");
    });
}

#[test]
fn a_process_that_does_not_end_lets_the_run_finish_when_the_waits_run_out_and_the_log_says_so() {
    drive(|executor| async move {
        let processes = Processes::new();
        processes.prepare(stubborn(false));
        let (runtime, run, log) = runtime(&processes, |config| {
            config.close_wait = SHORT;
            config.kill_wait = SHORT;
        });
        let run = executor.spawn(run);
        reach(&runtime, running).await;

        let begun = Instant::now();
        runtime.close();
        ended(run).await;

        assert!(
            begun.elapsed() >= SHORT * 2,
            "it waited: {:?}",
            begun.elapsed()
        );
        let lines = log.lines();
        assert!(
            lines.iter().any(|line| line
                == "WARN claude session session-1: closed, the process did not end in 300ms"),
            "{lines:?}"
        );
    });
}

#[test]
fn a_session_that_fails_does_not_wait_for_its_process() {
    // Kotlin's fork whose init names another id is not in this stage; a stdout that breaks while
    // the process goes on running fails the session the same way.
    drive(|executor| async move {
        let (process, control) = LiveProcess::new(stubborn(false));
        let process = Mutex::new(Some(process));
        let spawner = answering(move || {
            let process = process.lock().unwrap().take().expect("one session launch");
            Ok(Box::new(BrokenStdout(process)) as Box<dyn AgentProcess>)
        });
        let (runtime, run, log) = runtime_over(spawner, |config| {
            config.close_wait = GUARD;
            config.kill_wait = GUARD;
        });
        let begun = Instant::now();
        let run = executor.spawn(run);

        let failed = reach(&runtime, |status| {
            matches!(status, SessionStatus::Failed(_))
        })
        .await;
        assert_eq!(
            failed,
            SessionStatus::Failed(SessionFailure::from_exit(ProcessFailure::Io(
                ErrorKind::BrokenPipe
            )))
        );
        ended(run).await;
        assert!(begun.elapsed() < GUARD, "no wait: {:?}", begun.elapsed());
        assert!(control.destroyed(), "the process was told to end");
        assert!(!control.ended());
        assert!(
            !has(&log.lines(), "closed, the process"),
            "{:?}",
            log.lines()
        );
    });
}

#[test]
fn a_process_that_does_not_end_in_the_wait_is_killed_once_and_a_kill_that_ends_it_is_logged() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(stubborn(true));
        let (runtime, run, log) = runtime(&processes, |config| config.close_wait = SHORT);
        let run = executor.spawn(run);
        reach(&runtime, running).await;

        runtime.close();
        ended(run).await;

        assert_eq!(control.force_kills(), 1);
        let lines = log.lines();
        let warn = lines
            .iter()
            .position(|line| line.contains("did not end in 300ms"));
        let killed = lines.iter().position(|line| {
            line == "WARN claude session session-1: killed, the process ended; the end of its \
                     saved record may be missing"
        });
        assert!(
            matches!((warn, killed), (Some(warn), Some(killed)) if killed > warn),
            "{lines:?}"
        );
        assert!(!has(&lines, "did not end after a kill"), "{lines:?}");
    });
}

#[test]
fn a_process_that_survives_the_kill_is_given_up_after_the_kill_wait() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(stubborn(false));
        let log = Arc::new(KillCountingLog {
            control: control.clone(),
            lines: Mutex::new(Vec::new()),
        });
        let kept = Arc::clone(&log);
        let (runtime, run, _) = runtime(&processes, move |config| {
            config.log = kept;
            config.close_wait = SHORT;
            config.kill_wait = SHORT;
        });
        let run = executor.spawn(run);
        reach(&runtime, running).await;

        runtime.close();
        ended(run).await;

        let lines = log.lines();
        // Counted when the close gave up: the kill of the wrapper's `Drop` comes after it.
        let given_up = lines.iter().find(|(line, _)| {
            line == "WARN claude session session-1: the process did not end after a kill"
        });
        assert!(
            matches!(given_up, Some((_, 1))),
            "one kill before giving up: {lines:?}"
        );
        assert!(
            !lines
                .iter()
                .any(|(line, _)| line.contains("killed, the process ended")),
            "{lines:?}"
        );
        assert!(!control.ended());
    });
}

#[test]
fn a_close_that_the_process_answers_is_never_a_kill() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (runtime, run, log) = runtime(&processes, |config| config.close_wait = GUARD);
        let run = executor.spawn(run);
        reach(&runtime, running).await;

        runtime.close();
        ended(run).await;

        assert!(control.destroyed());
        assert_eq!(control.force_kills(), 0, "{:?}", log.lines());
        assert!(
            log.lines()
                .iter()
                .any(|line| line == "INFO claude session session-1: closed, the process ended"),
            "{:?}",
            log.lines()
        );
    });
}

#[test]
fn stdout_is_still_read_while_a_close_waits() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(stubborn(true));
        let (runtime, run, _log) = runtime(&processes, |config| config.close_wait = GUARD);
        let run = executor.spawn(run);
        reach(&runtime, running).await;
        let before = runtime.view();

        runtime.close();
        // Written after the close and before the run has looked: read, and not folded.
        control.emit(&init_line());
        control.emit(&init_line());
        until(|| control.destroyed()).await;
        Timer::after(Duration::from_millis(100)).await;
        assert!(!run.is_finished());
        assert_eq!(runtime.view(), before);

        control.exit(0);
        ended(run).await;
        assert_eq!(runtime.view(), before);
        assert!(runtime.view().conversation.session.is_none());
    });
}

#[test]
fn closing_twice_or_after_the_end_only_says_closed() {
    drive(|executor| async move {
        // Twice: the second close does nothing.
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (runtime, run, log) = runtime(&processes, |config| config.close_wait = GUARD);
        let run = executor.spawn(run);
        reach(&runtime, running).await;
        runtime.close();
        ended(run).await;
        let lines = log.lines();
        runtime.close();
        assert_eq!(log.lines(), lines);
        assert_eq!(runtime.status(), SessionStatus::Closed);
        assert_eq!(control.force_kills(), 0);

        // After the end: Closed, and neither the process nor the log is touched.
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (after_end, run, log) =
            support::runtime(&processes, |config| config.close_wait = GUARD);
        let watched = after_end.watch_status();
        let run = executor.spawn(run);
        reach(&after_end, running).await;
        control.exit(0);
        ended(run).await;
        assert_eq!(after_end.status(), SessionStatus::Ended);
        after_end.close();
        assert_eq!(after_end.status(), SessionStatus::Closed);
        assert_eq!(control.force_kills(), 0);
        assert!(!has(&log.lines(), "closed"), "{:?}", log.lines());
        assert_eq!(
            statuses(&watched).last(),
            Some(&SessionStatus::Closed),
            "Ended, then Closed"
        );
    });
}
