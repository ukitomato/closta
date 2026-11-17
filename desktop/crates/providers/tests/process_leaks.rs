#![cfg(target_os = "linux")]
#![allow(clippy::expect_used, clippy::unwrap_used)]
//! Children started and ended many times, in every way they can end, leave no process, no live
//! count and no thread behind; and the cap on live children holds and frees each slot once.
//!
//! `live_children()` and `/proc/self/task` are per process. nextest runs every test in a process
//! of its own, so neither test here sees the other's children or threads.

mod common;

use std::future::Future;
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use closta_providers::claude::launch::{Launch, LaunchError};
use closta_providers::claude::process::{
    AgentProcess, MAX_LIVE_CHILDREN, ProcessSpawner, live_children,
};
use closta_providers::claude::session::{ClaudeSession, PumpEnd, StartedSession};
use common::{alive, fake_spawner, fixtures_dir, spawn_in_background};
use futures_lite::{StreamExt, future};

const TIMEOUT: Duration = Duration::from_secs(30);
const ROUNDS: usize = 50;
const SETTLE: Duration = Duration::from_secs(1);
const GONE_WITHIN: Duration = Duration::from_secs(5);
const RECHECK: Duration = Duration::from_millis(100);
/// 128 + SIGKILL.
const KILLED: i32 = 137;

/// Runs `work` to its end, failing instead of hanging.
fn within<T>(work: impl Future<Output = T>) -> T {
    smol::block_on(future::or(work, async {
        smol::Timer::after(TIMEOUT).await;
        panic!("did not end within {TIMEOUT:?}")
    }))
}

fn path_text(path: &Path) -> &str {
    path.to_str().expect("a UTF-8 path")
}

fn launch(env: &[(&str, &str)]) -> Launch {
    Launch {
        args: Vec::new(),
        env: env
            .iter()
            .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
            .collect(),
        cwd: None,
    }
}

fn spawn(spawner: &Arc<dyn ProcessSpawner>, env: &[(&str, &str)]) -> Box<dyn AgentProcess> {
    within(spawn_in_background(Arc::clone(spawner), launch(env))).expect("the fake starts")
}

fn threads() -> usize {
    std::fs::read_dir("/proc/self/task")
        .expect("/proc/self/task is there")
        .count()
}

/// Checks `holds` every 100 ms until it does or `limit` is over; whether it held.
fn eventually(limit: Duration, holds: impl Fn() -> bool) -> bool {
    let end = Instant::now() + limit;
    while !holds() {
        if Instant::now() >= end {
            return false;
        }
        std::thread::sleep(RECHECK);
    }
    true
}

/// Starts one child and ends it the way `round` picks; the pids it started.
fn one_round(spawner: &Arc<dyn ProcessSpawner>, round: usize) -> Vec<u32> {
    let capture = fixtures_dir().join("01-baseline-text.ndjson");
    let replay = [
        ("CLOSTA_FAKE_MODE", "replay"),
        ("CLOSTA_FAKE_CAPTURE", path_text(&capture)),
    ];
    let lifetime = ("CLOSTA_FAKE_LIFETIME_SECS", "30");
    match round % 5 {
        // Ends by itself: a session replays a capture, its handle is dropped, stdin closes.
        0 => {
            let process = spawn(spawner, &replay);
            let pid = process.id().expect("an OS process");
            let StartedSession {
                session,
                events,
                pump,
            } = ClaudeSession::start(process, "leak");
            drop(session);
            let (end, events) = within(future::zip(pump, events.collect::<Vec<_>>()));
            assert_eq!(end, PumpEnd::Ended);
            assert!(!events.is_empty());
            vec![pid]
        }
        // Asked to end: destroy closes stdin and the fake ends with 0.
        1 => {
            let process = spawn(spawner, &[("CLOSTA_FAKE_MODE", "replay")]);
            let pid = process.id().expect("an OS process");
            process.destroy();
            assert_eq!(within(process.wait()).expect("an exit code"), 0);
            vec![pid]
        }
        // Dropped while it waits on stdin, with its stdout unread.
        2 => {
            let process = spawn(spawner, &replay);
            let pid = process.id().expect("an OS process");
            drop(process);
            vec![pid]
        }
        // Killed: a stubborn child ignores stdin closing.
        3 => {
            let process = spawn(spawner, &[("CLOSTA_FAKE_MODE", "stubborn"), lifetime]);
            let pid = process.id().expect("an OS process");
            process.destroy_forcibly();
            assert_eq!(within(process.wait()).expect("an exit code"), KILLED);
            vec![pid]
        }
        // The child ends at once and its grandchild keeps stdout open until the grace is over.
        _ => {
            let mut process = spawn(
                spawner,
                &[
                    ("CLOSTA_FAKE_MODE", "tree"),
                    ("CLOSTA_FAKE_TREE_EXIT", "1"),
                    lifetime,
                ],
            );
            let pid = process.id().expect("an OS process");
            let lines = process.take_stdout_lines().expect("stdout is there");
            let drain = process.take_stderr_drain().expect("stderr is there");
            let (_, lines) = within(future::zip(drain, lines.collect::<Vec<_>>()));
            let grandchild: u32 = lines
                .first()
                .and_then(|line| line.as_ref().ok())
                .and_then(|line| line.parse().ok())
                .expect("the grandchild's pid comes first");
            assert_eq!(lines.len(), 1, "one line, then a clean end");
            vec![pid, grandchild]
        }
    }
}

#[test]
fn fifty_children_leave_no_process_and_no_thread_behind() {
    let spawner: Arc<dyn ProcessSpawner> = Arc::new(fake_spawner());
    let mut pids = one_round(&spawner, 0);
    // The first round wakes the reactor, the reaper and the spawn pool; idle pool threads go.
    std::thread::sleep(SETTLE);
    let baseline = threads();
    for round in 1..ROUNDS {
        pids.extend(one_round(&spawner, round));
    }
    assert_eq!(pids.len(), ROUNDS + ROUNDS / 5);

    assert_eq!(live_children(), 0);
    assert!(
        eventually(GONE_WITHIN, || !pids.iter().any(|pid| alive(*pid))),
        "still alive: {:?}",
        pids.iter().filter(|pid| alive(**pid)).collect::<Vec<_>>()
    );
    assert!(
        eventually(GONE_WITHIN, || threads() <= baseline),
        "{} threads, {baseline} after the first round",
        threads()
    );
}

#[test]
fn the_cap_is_reached_and_each_slot_is_freed_once() {
    assert_eq!(live_children(), 0);
    let spawner: Arc<dyn ProcessSpawner> = Arc::new(fake_spawner());
    let stubborn = [
        ("CLOSTA_FAKE_MODE", "stubborn"),
        ("CLOSTA_FAKE_LIFETIME_SECS", "30"),
    ];
    let refused = |spawner: &Arc<dyn ProcessSpawner>| {
        within(spawn_in_background(Arc::clone(spawner), launch(&stubborn))).err()
            == Some(LaunchError::TooManyProcesses)
    };

    // One child that ends by itself, the rest held up to the cap.
    let quick = spawn(&spawner, &[("CLOSTA_FAKE_MODE", "exit")]);
    let mut held: Vec<Box<dyn AgentProcess>> = (1..MAX_LIVE_CHILDREN)
        .map(|_| spawn(&spawner, &stubborn))
        .collect();
    assert_eq!(live_children(), MAX_LIVE_CHILDREN);
    assert!(refused(&spawner), "the cap is reached");

    // A wait that sees the end frees the slot while the box is still held; a second wait does not
    // free it again.
    assert_eq!(within(quick.wait()).expect("an exit code"), 0);
    assert_eq!(live_children(), MAX_LIVE_CHILDREN - 1);
    assert_eq!(within(quick.wait()).expect("an exit code"), 0);
    assert_eq!(live_children(), MAX_LIVE_CHILDREN - 1);
    held.push(spawn(&spawner, &stubborn));
    assert_eq!(live_children(), MAX_LIVE_CHILDREN);

    // Dropping the box whose slot the wait freed frees nothing more.
    drop(quick);
    assert_eq!(live_children(), MAX_LIVE_CHILDREN);
    assert!(refused(&spawner), "still at the cap");

    // A drop frees the slot of a child that is still running.
    let pids: Vec<u32> = held
        .iter()
        .map(|p| p.id().expect("an OS process"))
        .collect();
    drop(held.pop());
    assert_eq!(live_children(), MAX_LIVE_CHILDREN - 1);
    held.push(spawn(&spawner, &stubborn));
    assert_eq!(live_children(), MAX_LIVE_CHILDREN);

    let pids: Vec<u32> = pids
        .into_iter()
        .chain(held.iter().map(|p| p.id().expect("an OS process")))
        .collect();
    drop(held);
    assert_eq!(live_children(), 0);
    assert!(
        eventually(GONE_WITHIN, || !pids.iter().any(|pid| alive(*pid))),
        "every child is gone"
    );
}
