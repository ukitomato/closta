#![cfg(unix)]
#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The spawners with real processes: what the native spawner hands the child (arguments,
//! environment, folder), its failures, the cap on live children, and what the WSL spawner decides
//! before `wsl.exe` would start. Mirrors the process tests of FilteringProcessSpawnerTest.kt,
//! Kotlin's `launchClaude…` test in ProcessAgentProcessTest.kt, and WslSpawnerTest.kt.
//!
//! WslSpawnerTest.kt's tests of the arguments, the folder and the case-blind lookup are the pure
//! tests of `wsl_command` and `distro_named` in launch/wsl.rs.

mod common;

use std::collections::BTreeSet;
use std::ffi::OsString;
use std::future::Future;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use closta_providers::claude::launch::env::SecretEnv;
use closta_providers::claude::launch::spawn::{NativeProgram, NativeSpawner};
use closta_providers::claude::launch::spec::{CHECKPOINTING_ENV, LaunchSpec};
use closta_providers::claude::launch::wsl::{WslLocation, WslProgram, WslSpawner};
use closta_providers::claude::launch::{Launch, LaunchError};
use closta_providers::claude::process::{
    AgentProcess, MAX_LIVE_CHILDREN, ProcessSpawner, live_children,
};
use common::{alive, fake_cli, fake_spawner, scratch_dir, spawn_in_background};
use futures_lite::{StreamExt, future};
use serde_json::Value;

const TIMEOUT: Duration = Duration::from_secs(30);
const RELEASED_WITHIN: Duration = Duration::from_secs(5);
const MISSING_PROGRAM: &str = "/nonexistent/closta-no-such-program";

/// Runs `work` to its end, failing instead of hanging.
fn within<T>(work: impl Future<Output = T>) -> T {
    smol::block_on(future::or(work, async {
        smol::Timer::after(TIMEOUT).await;
        panic!("did not end within {TIMEOUT:?}")
    }))
}

fn env(pairs: &[(&str, &str)]) -> SecretEnv {
    pairs
        .iter()
        .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
        .collect()
}

fn launch(env_pairs: &[(&str, &str)], cwd: Option<&Path>) -> Launch {
    Launch {
        args: Vec::new(),
        env: env(env_pairs),
        cwd: cwd.map(|dir| dir.to_str().expect("a UTF-8 path").to_owned()),
    }
}

fn spawn(
    spawner: impl ProcessSpawner + 'static,
    launch: Launch,
) -> Result<Box<dyn AgentProcess>, LaunchError> {
    within(spawn_in_background(Arc::new(spawner), launch))
}

fn names(list: &[&str]) -> BTreeSet<String> {
    list.iter().map(|name| (*name).to_owned()).collect()
}

fn inherited(pairs: &[(&str, &str)]) -> Vec<(OsString, OsString)> {
    pairs
        .iter()
        .map(|(name, value)| (OsString::from(name), OsString::from(value)))
        .collect()
}

/// The fake CLI's `argv` line for `launch`, which must name `echoed` in `CLOSTA_FAKE_ECHO_ENV`.
fn echoed(spawner: impl ProcessSpawner + 'static, launch: Launch) -> Value {
    let mut process = spawn(spawner, launch).expect("the fake starts");
    let lines = process.take_stdout_lines().expect("stdout is there");
    let drain = process.take_stderr_drain().expect("stderr is there");
    let (_, lines) = within(future::zip(drain, lines.collect::<Vec<_>>()));
    let lines: Vec<String> = lines
        .into_iter()
        .map(|line| line.expect("a clean end"))
        .collect();
    assert_eq!(lines.len(), 1, "one argv line");
    serde_json::from_str(&lines[0]).expect("the argv line is JSON")
}

fn argv_launch(echo: &[&str], more: &[(&str, &str)]) -> Launch {
    let echo = echo.join(",");
    let mut pairs = vec![
        ("CLOSTA_FAKE_MODE", "argv"),
        ("CLOSTA_FAKE_ECHO_ENV", &echo),
    ];
    pairs.extend_from_slice(more);
    launch(&pairs, None)
}

#[test]
fn the_spawner_passes_the_args_env_and_cwd() {
    let dir = scratch_dir("spawner_passes_args_env_cwd");
    let mut spec = LaunchSpec::new("s");
    spec.env.insert("CLOSTA_FAKE_MODE", "argv");
    spec.env.insert("CLOSTA_FAKE_ECHO_ENV", CHECKPOINTING_ENV);
    spec.cwd = Some(dir.to_str().expect("a UTF-8 path").to_owned());
    let launch = Launch::of(&spec).expect("a valid spec");
    let args = launch.args.clone();

    let line = echoed(fake_spawner(), launch);
    assert_eq!(line["argv"], serde_json::json!(args));
    assert_eq!(line["env"][CHECKPOINTING_ENV], "true");
    let cwd = PathBuf::from(line["cwd"].as_str().expect("the folder"));
    assert_eq!(
        cwd.canonicalize().expect("the child's folder is there"),
        dir.canonicalize().expect("the scratch folder is there")
    );
}

#[test]
fn the_launch_env_wins_over_what_was_inherited() {
    let spawner = fake_spawner().with_inherited(inherited(&[
        ("AWS_PROFILE", "inherited"),
        ("AWS_ACCESS_KEY_ID", "AKIA_INHERITED"),
    ]));
    let line = echoed(
        spawner,
        argv_launch(
            &["AWS_PROFILE", "AWS_ACCESS_KEY_ID"],
            &[("AWS_ACCESS_KEY_ID", "AKIA_INJECTED")],
        ),
    );
    assert_eq!(line["env"]["AWS_ACCESS_KEY_ID"], "AKIA_INJECTED");
    assert_eq!(line["env"]["AWS_PROFILE"], "inherited");
}

#[test]
fn a_dropped_key_is_not_inherited() {
    let spawner = NativeSpawner::new(
        NativeProgram::Path(fake_cli()),
        names(&["AWS_PROFILE", "SET_BY_THE_LAUNCH"]),
    )
    .with_inherited(inherited(&[
        ("AWS_PROFILE", "inherited"),
        ("SET_BY_THE_LAUNCH", "inherited"),
        ("HTTPS_PROXY", "http://proxy.example:8080"),
    ]));
    let line = echoed(
        spawner,
        argv_launch(
            &["AWS_PROFILE", "SET_BY_THE_LAUNCH", "HTTPS_PROXY"],
            &[("SET_BY_THE_LAUNCH", "launch")],
        ),
    );
    assert_eq!(line["env"]["AWS_PROFILE"], Value::Null, "dropped");
    // A name the launch sets itself is the launch's, even when the inherited one was dropped.
    assert_eq!(line["env"]["SET_BY_THE_LAUNCH"], "launch");
    assert_eq!(line["env"]["HTTPS_PROXY"], "http://proxy.example:8080");
}

#[test]
fn the_spawner_inherits_what_is_not_dropped() {
    let line = echoed(fake_spawner(), argv_launch(&["PATH"], &[]));
    let own = std::env::var("PATH").ok();
    assert!(own.is_some(), "the test runs with a PATH");
    // Compared without printing either value.
    assert!(
        line["env"]["PATH"].as_str() == own.as_deref(),
        "the child does not have this process's PATH"
    );
}

#[test]
fn a_missing_working_folder_is_named_and_only_then() {
    let dir = scratch_dir("missing_working_folder");
    let missing = dir.join("gone");
    let missing_program =
        || NativeSpawner::new(NativeProgram::Path(MISSING_PROGRAM.into()), BTreeSet::new());
    let named = LaunchError::WorkingDirectoryMissing {
        path: missing.to_str().expect("a UTF-8 path").to_owned(),
    };

    let fake_in_missing = spawn(
        fake_spawner(),
        launch(&[("CLOSTA_FAKE_MODE", "argv")], Some(&missing)),
    );
    assert_eq!(fake_in_missing.err(), Some(named.clone()));
    let nothing_in_missing = spawn(missing_program(), launch(&[], Some(&missing)));
    assert_eq!(nothing_in_missing.err(), Some(named));

    // The folder is there, or none was given: the program is what is missing; the failure is plain.
    for folder in [Some(dir.as_path()), None] {
        let plain = spawn(missing_program(), launch(&[], folder));
        assert_eq!(
            plain.err(),
            Some(LaunchError::Spawn(ErrorKind::NotFound)),
            "folder given: {}",
            folder.is_some()
        );
    }
}

#[test]
fn a_missing_program_is_a_spawn_failure() {
    let missing = NativeSpawner::new(NativeProgram::Path(MISSING_PROGRAM.into()), BTreeSet::new());
    assert_eq!(
        spawn(missing, launch(&[], None)).err(),
        Some(LaunchError::Spawn(ErrorKind::NotFound))
    );

    // `claude` is looked up on the child's PATH, here a folder without it.
    let empty = scratch_dir("missing_program_path");
    let path = empty.to_str().expect("a UTF-8 path");
    let claude = NativeSpawner::new(NativeProgram::Claude, BTreeSet::new())
        .with_inherited(inherited(&[("PATH", path)]));
    assert_eq!(
        spawn(claude, launch(&[], None)).err(),
        Some(LaunchError::Spawn(ErrorKind::NotFound))
    );
}

#[test]
fn claude_is_found_on_the_childs_path() {
    let dir = scratch_dir("claude_on_path");
    std::os::unix::fs::symlink(fake_cli(), dir.join("claude")).expect("the link is made");
    let path = dir.to_str().expect("a UTF-8 path");
    let claude = NativeSpawner::new(NativeProgram::Claude, BTreeSet::new())
        .with_inherited(inherited(&[("PATH", path)]));
    let mut launch = argv_launch(&[], &[]);
    launch.args = vec!["-p".to_owned()];
    assert_eq!(echoed(claude, launch)["argv"], serde_json::json!(["-p"]));
}

// The count is per test process. nextest runs every test in a process of its own, so no other
// test's children are counted here.
#[test]
fn the_seventeenth_live_child_is_refused() {
    assert_eq!(live_children(), 0);
    let spawner: Arc<dyn ProcessSpawner> = Arc::new(fake_spawner());
    let stubborn = launch(
        &[
            ("CLOSTA_FAKE_MODE", "stubborn"),
            ("CLOSTA_FAKE_LIFETIME_SECS", "30"),
        ],
        None,
    );
    let held: Vec<Box<dyn AgentProcess>> = (0..MAX_LIVE_CHILDREN)
        .map(|_| {
            within(spawn_in_background(Arc::clone(&spawner), stubborn.clone()))
                .expect("below the cap")
        })
        .collect();
    assert_eq!(live_children(), MAX_LIVE_CHILDREN);
    assert_eq!(
        within(spawn_in_background(Arc::clone(&spawner), stubborn.clone())).err(),
        Some(LaunchError::TooManyProcesses)
    );

    let pids: Vec<u32> = held
        .iter()
        .map(|process| process.id().expect("an OS process"))
        .collect();
    drop(held);
    let end = Instant::now() + RELEASED_WITHIN;
    while (live_children() > 0 || pids.iter().any(|pid| alive(*pid))) && Instant::now() < end {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert_eq!(live_children(), 0);
    assert!(!pids.iter().any(|pid| alive(*pid)), "every child is gone");
}

fn wsl_spawner(installed: &[&str]) -> WslSpawner {
    WslSpawner::new(
        WslLocation {
            distro: "ubuntu".to_owned(),
            linux_path: "/home/someone/p".to_owned(),
        },
        WslProgram::Path("/home/someone/fake".to_owned()),
        BTreeSet::new(),
    )
    .with_installed(installed.iter().map(|name| (*name).to_owned()).collect())
}

#[test]
fn a_distribution_that_is_not_installed_is_wsl_unavailable_with_its_name() {
    let spawner = wsl_spawner(&["Debian"]);
    assert_eq!(spawner.distro(), "ubuntu");
    let failure = spawn(spawner, launch(&[], None))
        .err()
        .expect("not installed");
    assert_eq!(
        failure,
        LaunchError::WslUnavailable {
            distro: "ubuntu".to_owned()
        }
    );
    assert!(failure.to_string().contains("ubuntu"), "{failure}");
}

#[test]
fn the_wsl_spawner_debug_names_the_distribution_only() {
    let spawner = wsl_spawner(&["Ubuntu"]);
    let shown = format!("{spawner:?}");
    assert_eq!(shown, "WslSpawner(distro=ubuntu)");
    // Its program's path is hidden as well.
    assert_eq!(
        format!("{:?}", WslProgram::Path("/home/someone/fake".to_owned())),
        "Path(..)"
    );
    assert_eq!(
        format!("{:?}", NativeProgram::Path("/home/someone/fake".into())),
        "Path(..)"
    );
}
