#![cfg(unix)]
#![allow(clippy::expect_used, clippy::unwrap_used)]
//! `claude --version` through the fake CLI: the version it answers, how each way of failing is
//! sorted, and that the process is gone on every path, a timeout and a cancel included. Mirrors
//! ClaudeVersionProbeTest.kt.
//!
//! Kotlin's `runs claude --version with the session's spawner, environment and working directory`
//! is covered by `Launch::version_check`'s unit test (same env and folder, `--version`) and by
//! `the_fake_cli_answers_its_version` here (the native spawner runs it).
//!
//! `live_children()` counts the children of this test process. nextest runs every test in a
//! process of its own, so another test's children never show in it.

mod common;

use std::collections::BTreeSet;
use std::future::Future;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use closta_providers::claude::launch::spawn::{NativeProgram, NativeSpawner};
use closta_providers::claude::launch::version::{
    VersionFailure, check_version, check_version_within,
};
use closta_providers::claude::launch::{Launch, LaunchError};
use closta_providers::claude::process::{AgentProcess, ProcessSpawner, live_children};
use common::{alive, fake_spawner, scratch_dir, spawn_in_background};
use futures_lite::future;

const TIMEOUT: Duration = Duration::from_secs(30);
const GONE_WITHIN: Duration = Duration::from_secs(2);

/// Runs `work` to its end, failing instead of hanging.
fn within<T>(work: impl Future<Output = T>) -> T {
    smol::block_on(future::or(work, async {
        smol::Timer::after(TIMEOUT).await;
        panic!("did not end within {TIMEOUT:?}")
    }))
}

fn launch(args: &[&str], env: &[(&str, &str)], cwd: Option<String>) -> Launch {
    Launch {
        args: args.iter().map(|arg| (*arg).to_owned()).collect(),
        env: env
            .iter()
            .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
            .collect(),
        cwd,
    }
}

fn stubborn() -> Launch {
    launch(
        &[],
        &[
            ("CLOSTA_FAKE_MODE", "stubborn"),
            ("CLOSTA_FAKE_LIFETIME_SECS", "30"),
        ],
        None,
    )
}

/// Checks the version of what `spawner` starts for `launch`.
fn check_with(
    spawner: impl ProcessSpawner + 'static,
    launch: Launch,
) -> Result<String, VersionFailure> {
    within(check_version(spawn_in_background(
        Arc::new(spawner),
        launch,
    )))
}

fn check(launch: Launch) -> Result<String, VersionFailure> {
    check_with(fake_spawner(), launch)
}

/// A spawn that keeps the pid of what it started in `pid`.
async fn spawn_noting(
    launch: Launch,
    pid: Arc<Mutex<Option<u32>>>,
) -> Result<Box<dyn AgentProcess>, LaunchError> {
    let process = spawn_in_background(Arc::new(fake_spawner()), launch).await;
    if let Ok(process) = &process {
        *pid.lock().unwrap() = process.id();
    }
    process
}

/// Waits until the child `pid` noted is gone and nothing is counted live.
fn assert_gone_within(pid: &Mutex<Option<u32>>, limit: Duration) {
    let end = Instant::now() + limit;
    let gone = || {
        let pid = *pid.lock().unwrap();
        live_children() == 0 && pid.is_some_and(|pid| !alive(pid))
    };
    while !gone() && Instant::now() < end {
        std::thread::sleep(Duration::from_millis(20));
    }
    let noted = *pid.lock().unwrap();
    assert!(noted.is_some(), "the child was started");
    assert_eq!(live_children(), 0);
    assert!(!alive(noted.unwrap()), "the child is gone");
}

#[test]
fn the_fake_cli_answers_its_version() {
    let dir = scratch_dir("version_check_answers");
    let session = launch(
        &["--input-format", "stream-json"],
        &[("CLOSTA_FAKE_MODE", "stubborn")],
        Some(dir.to_str().expect("a UTF-8 path").to_owned()),
    );
    assert_eq!(check(session.version_check()), Ok("2.1.282".to_owned()));
    assert_eq!(live_children(), 0);
}

#[test]
fn failures_are_sorted_into_their_kinds() {
    let exit = |code: &str| {
        launch(
            &[],
            &[("CLOSTA_FAKE_MODE", "exit"), ("CLOSTA_FAKE_EXIT", code)],
            None,
        )
    };
    assert_eq!(check(exit("3")), Err(VersionFailure::Exit(3)));
    assert_eq!(check(exit("127")), Err(VersionFailure::Exit(127)));
    assert_eq!(check(exit("0")), Err(VersionFailure::NoOutput));

    let hello = launch(&["--version"], &[("CLOSTA_FAKE_VERSION", "hello")], None);
    let failure = check(hello).expect_err("not a version");
    assert_eq!(failure, VersionFailure::NotAVersion);
    assert!(!format!("{failure:?}").contains("hello"));

    let missing = NativeSpawner::new(
        NativeProgram::Path(PathBuf::from("/nonexistent/closta-no-such-program")),
        BTreeSet::new(),
    );
    assert!(matches!(
        check_with(missing, launch(&["--version"], &[], None)),
        Err(VersionFailure::Spawn(LaunchError::Spawn(_)))
    ));
    assert_eq!(live_children(), 0);
}

#[test]
fn a_missing_working_folder_is_that_failure() {
    let dir = scratch_dir("version_check_missing_folder").join("not-there");
    let version = launch(
        &["--version"],
        &[],
        Some(dir.to_str().expect("a UTF-8 path").to_owned()),
    );
    assert!(matches!(
        check(version),
        Err(VersionFailure::Spawn(
            LaunchError::WorkingDirectoryMissing { .. }
        ))
    ));
}

#[test]
fn a_check_that_does_not_answer_in_time_fails_and_its_process_is_gone() {
    let pid = Arc::new(Mutex::new(None));
    let answer = within(check_version_within(
        spawn_noting(stubborn(), Arc::clone(&pid)),
        Duration::from_millis(300),
    ));
    assert_eq!(answer, Err(VersionFailure::NoAnswer));
    // The box was dropped before the check returned.
    assert_eq!(live_children(), 0);
    assert_gone_within(&pid, GONE_WITHIN);
}

#[test]
fn dropping_the_check_destroys_its_process_promptly() {
    let pid = Arc::new(Mutex::new(None));
    let started = Arc::clone(&pid);
    let check = check_version(spawn_noting(stubborn(), Arc::clone(&pid)));
    // Run the check until the child is up, then drop it midway.
    let outcome = within(future::or(async { Some(check.await) }, async move {
        while started.lock().unwrap().is_none() {
            smol::Timer::after(Duration::from_millis(10)).await;
        }
        smol::Timer::after(Duration::from_millis(100)).await;
        None
    }));
    assert_eq!(outcome, None, "a stubborn child does not answer");
    assert_gone_within(&pid, GONE_WITHIN);
}

#[test]
fn a_cancel_that_lands_while_spawning_still_destroys_the_child() {
    let pid = Arc::new(Mutex::new(None));
    let noted = Arc::clone(&pid);
    let spawned = blocking::unblock(move || {
        std::thread::sleep(Duration::from_millis(300));
        let process = fake_spawner().spawn(&stubborn());
        if let Ok(process) = &process {
            *noted.lock().unwrap() = process.id();
        }
        process
    });
    let outcome = within(future::or(
        async { Some(check_version(spawned).await) },
        async {
            smol::Timer::after(Duration::from_millis(50)).await;
            None
        },
    ));
    assert_eq!(outcome, None, "the check is dropped while spawning");
    // The spawn ends after the drop; what it returns is dropped where it lands, which kills it.
    assert_gone_within(&pid, GONE_WITHIN);
}
