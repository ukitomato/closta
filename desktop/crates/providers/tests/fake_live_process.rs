#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The live fake process the session tests drive line by line, and the spawner that hands it
//! out. Mirrors the FakeProcess and FakeSpawner of the Kotlin session tests (FakeProcesses.kt).

use std::future::Future;
use std::io::ErrorKind;
use std::time::Duration;

use closta_providers::claude::fake::live::{LiveControl, LiveOptions, LiveProcess};
use closta_providers::claude::fake::spawner::FakeSpawner;
use closta_providers::claude::launch::env::SecretEnv;
use closta_providers::claude::launch::{Launch, LaunchError};
use closta_providers::claude::process::{AgentProcess, ProcessFailure, ProcessSpawner};
use futures_lite::{StreamExt, future};

const TIMEOUT: Duration = Duration::from_secs(30);
const NOT_YET: Duration = Duration::from_millis(200);

/// Runs `work` to its end, failing instead of hanging.
fn within<T>(work: impl Future<Output = T>) -> T {
    smol::block_on(future::or(work, async {
        smol::Timer::after(TIMEOUT).await;
        panic!("did not end within {TIMEOUT:?}")
    }))
}

/// Whether `work` is still pending after a short while.
fn still_pending<T>(work: impl Future<Output = T>) -> bool {
    smol::block_on(future::race(
        async {
            work.await;
            false
        },
        async {
            smol::Timer::after(NOT_YET).await;
            true
        },
    ))
}

fn live(options: LiveOptions) -> (LiveProcess, LiveControl) {
    LiveProcess::new(options)
}

fn lines_of(process: &mut LiveProcess) -> Vec<Result<String, ProcessFailure>> {
    let stdout = process.take_stdout_lines().unwrap();
    within(stdout.collect())
}

#[test]
fn a_live_process_streams_what_is_emitted_and_ends_with_its_exit() {
    let (mut process, control) = live(LiveOptions::default());
    control.emit("one");
    control.emit("two");
    control.exit(0);
    assert_eq!(0, control.stdout_lines_read(), "nothing read yet");
    assert_eq!(
        vec![Ok("one".to_string()), Ok("two".to_string())],
        lines_of(&mut process)
    );
    assert_eq!(2, control.stdout_lines_read());
    assert_eq!(0, within(process.wait()).unwrap());
    assert_eq!(0, within(process.wait()).unwrap());
    assert!(control.ended());
    assert_eq!(None, process.id());

    let (mut process, control) = live(LiveOptions::default());
    control.emit("one");
    control.emit("two");
    control.exit(3);
    control.exit(5);
    assert_eq!(
        vec![
            Ok("one".to_string()),
            Ok("two".to_string()),
            Err(ProcessFailure::Exit(3))
        ],
        lines_of(&mut process)
    );
    assert_eq!(3, within(process.wait()).unwrap());
    assert_eq!(3, within(process.wait()).unwrap());
    within(process.take_stderr_drain().unwrap());
}

#[test]
fn stdin_lines_arrive_in_order_and_next_waits_for_one() {
    let (process, control) = live(LiveOptions::default());
    let next = control.next_stdin_line();
    assert!(still_pending(control.next_stdin_line()));
    within(process.write_stdin("first".to_string())).unwrap();
    within(process.write_stdin("second".to_string())).unwrap();
    assert_eq!(Some("first".to_string()), within(next));
    assert_eq!(
        Some("second".to_string()),
        within(control.next_stdin_line())
    );
    assert_eq!(
        vec!["first".to_string(), "second".to_string()],
        control.stdin_lines()
    );

    within(process.write_stdin("third".to_string())).unwrap();
    control.close_stdin();
    assert_eq!(Some("third".to_string()), within(control.next_stdin_line()));
    assert_eq!(None, within(control.next_stdin_line()));
}

#[test]
fn destroy_ends_it_with_its_code_or_only_closes_its_pipes() {
    let (mut process, control) = live(LiveOptions::default());
    process.destroy();
    assert!(control.destroyed());
    assert_eq!(0, within(process.wait()).unwrap());
    assert_eq!(
        Vec::<Result<String, ProcessFailure>>::new(),
        lines_of(&mut process)
    );

    let (mut process, control) = live(LiveOptions {
        exit_on_destroy: None,
        ..LiveOptions::default()
    });
    control.emit("before");
    process.destroy();
    assert!(control.destroyed());
    assert!(still_pending(process.wait()));
    assert!(!control.ended());
    assert_eq!(vec![Ok("before".to_string())], lines_of(&mut process));
    within(process.take_stderr_drain().unwrap());
    assert_eq!(
        ErrorKind::BrokenPipe,
        within(process.write_stdin("late".to_string()))
            .unwrap_err()
            .kind()
    );
    control.exit(0);
    assert_eq!(0, within(process.wait()).unwrap());
}

#[test]
fn a_kill_ends_it_unless_told_otherwise_and_is_counted() {
    let (process, control) = live(LiveOptions::default());
    process.destroy_forcibly();
    assert_eq!(137, within(process.wait()).unwrap());
    assert_eq!(1, control.force_kills());

    let (process, control) = live(LiveOptions {
        ends_on_kill: false,
        ..LiveOptions::default()
    });
    process.destroy_forcibly();
    process.destroy_forcibly();
    assert!(still_pending(process.wait()));
    assert!(!control.ended());
    assert_eq!(2, control.force_kills());
    control.exit(0);
}

#[test]
fn kills_after_the_end_and_on_drop_are_not_counted() {
    let (process, control) = live(LiveOptions::default());
    control.exit(0);
    process.destroy_forcibly();
    assert_eq!(0, control.force_kills());
    assert_eq!(0, within(process.wait()).unwrap());

    let (process, control) = live(LiveOptions::default());
    let boxed: Box<dyn AgentProcess> = Box::new(process);
    drop(boxed);
    assert_eq!(0, control.force_kills());
    assert!(control.ended(), "dropping the box kills the process");
}

#[test]
fn refused_writes_count_the_failed_writes() {
    let (process, control) = live(LiveOptions::default());
    within(process.write_stdin("taken".to_string())).unwrap();
    assert_eq!(0, control.refused_writes());
    control.exit(0);
    for line in ["one", "two"] {
        let refused = within(process.write_stdin(line.to_string())).unwrap_err();
        assert_eq!(ErrorKind::BrokenPipe, refused.kind());
    }
    assert_eq!(2, control.refused_writes());
    assert_eq!(vec!["taken".to_string()], control.stdin_lines());
}

#[test]
fn a_failing_wait_fails_once_destroyed() {
    let (process, _control) = live(LiveOptions {
        wait_fails: true,
        ..LiveOptions::default()
    });
    process.destroy();
    assert_eq!(ErrorKind::Other, within(process.wait()).unwrap_err().kind());

    let (process, control) = live(LiveOptions {
        wait_fails: true,
        ..LiveOptions::default()
    });
    control.exit(0);
    assert_eq!(0, within(process.wait()).unwrap());
}

#[test]
fn close_stdin_breaks_writes_and_keeps_the_process_running() {
    let (process, control) = live(LiveOptions::default());
    control.close_stdin();
    let refused = within(process.write_stdin("late".to_string())).unwrap_err();
    assert_eq!(ErrorKind::BrokenPipe, refused.kind());
    assert_eq!(1, control.refused_writes());
    assert!(!control.ended());
    assert!(still_pending(process.wait()));
    control.exit(0);
    assert_eq!(0, within(process.wait()).unwrap());
}

fn launch(arg: &str) -> Launch {
    Launch {
        args: vec![arg.to_string()],
        env: SecretEnv::default(),
        cwd: None,
    }
}

#[test]
fn the_spawner_hands_out_answers_and_says_its_distro() {
    let spawner = FakeSpawner::answering(|launch| match launch.args[0].as_str() {
        "first" => {
            let (process, control) = LiveProcess::new(LiveOptions::default());
            control.emit("hello");
            control.exit(0);
            Ok(Box::new(process) as Box<dyn AgentProcess>)
        }
        _ => Err(LaunchError::TooManyProcesses),
    });
    assert_eq!(None, spawner.wsl_distro());
    let mut first = spawner.spawn(&launch("first")).unwrap();
    assert_eq!(
        Some(LaunchError::TooManyProcesses),
        spawner.spawn(&launch("second")).err()
    );
    let args: Vec<Vec<String>> = spawner.launches().into_iter().map(|l| l.args).collect();
    assert_eq!(
        vec![vec!["first".to_string()], vec!["second".to_string()]],
        args
    );
    assert!(
        spawner.probes().is_empty(),
        "only scripted processes leave probes"
    );
    let lines: Vec<_> = within(first.take_stdout_lines().unwrap().collect());
    assert_eq!(vec![Ok("hello".to_string())], lines);

    let spawner = spawner.with_wsl_distro("Ubuntu");
    assert_eq!(Some("Ubuntu"), spawner.wsl_distro());
}
