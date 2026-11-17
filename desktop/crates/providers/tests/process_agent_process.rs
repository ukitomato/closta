#![cfg(unix)]
#![allow(clippy::expect_used, clippy::unwrap_used)]
//! A real OS child through `AgentProcess`, with the fake CLI and `/bin/sh`. Mirrors
//! ProcessAgentProcessTest.kt.
//!
//! Every child is held by its `Box<dyn AgentProcess>`, whose drop kills it with its group, so a
//! failing test leaves nothing behind. Kotlin's `launchClaude…` test is
//! `the_spawner_passes_the_args_env_and_cwd` in process_spawner.rs, and its "the default
//! destroyForcibly is destroy" has nothing to check here: the trait has no default for it.

mod common;

use std::collections::BTreeSet;
use std::future::Future;
use std::io::ErrorKind;
use std::sync::Arc;
use std::time::{Duration, Instant};

use closta_providers::claude::launch::Launch;
use closta_providers::claude::launch::spawn::{NativeProgram, NativeSpawner};
use closta_providers::claude::process::{AgentProcess, ProcessFailure, STDOUT_GRACE};
use common::{alive, fake_spawner, scratch_dir, spawn_in_background};
use futures_lite::{StreamExt, future};

const TIMEOUT: Duration = Duration::from_secs(30);
const GONE_WITHIN: Duration = Duration::from_secs(2);
const BIG_LINE_CHARS: usize = 200_000;
const SH: &str = "/bin/sh";

/// Runs `work` to its end, failing instead of hanging.
fn within<T>(work: impl Future<Output = T>) -> T {
    smol::block_on(future::or(work, async {
        smol::Timer::after(TIMEOUT).await;
        panic!("did not end within {TIMEOUT:?}")
    }))
}

/// Starts `launch` with `spawner`; the box kills the child when dropped, also when a test fails.
fn start(spawner: NativeSpawner, args: &[&str], env: &[(&str, &str)]) -> Box<dyn AgentProcess> {
    let launch = Launch {
        args: args.iter().map(|arg| (*arg).to_owned()).collect(),
        env: env
            .iter()
            .map(|(name, value)| ((*name).to_owned(), (*value).to_owned()))
            .collect(),
        cwd: None,
    };
    within(spawn_in_background(Arc::new(spawner), launch)).expect("the process starts")
}

fn sh(script: &str) -> Box<dyn AgentProcess> {
    let spawner = NativeSpawner::new(NativeProgram::Path(SH.into()), BTreeSet::new());
    start(spawner, &["-c", script], &[])
}

fn fake(env: &[(&str, &str)]) -> Box<dyn AgentProcess> {
    start(fake_spawner(), &[], env)
}

/// Reads stdout to its end while stderr is drained, as the session's pump does: the lines, and
/// the failure that ended them, if any.
fn read_all(process: &mut dyn AgentProcess) -> (Vec<String>, Option<ProcessFailure>) {
    let mut lines = process.take_stdout_lines().expect("stdout is there");
    let drain = process.take_stderr_drain().expect("stderr is there");
    within(future::or(
        async {
            let mut read = Vec::new();
            while let Some(item) = lines.next().await {
                match item {
                    Ok(line) => read.push(line),
                    Err(failure) => {
                        assert!(lines.next().await.is_none(), "nothing after the failure");
                        return (read, Some(failure));
                    }
                }
            }
            (read, None)
        },
        async {
            drain.await;
            future::pending().await
        },
    ))
}

/// Polls until `pid` is gone, for at most [`GONE_WITHIN`].
fn gone_soon(pid: u32) -> bool {
    let end = Instant::now() + GONE_WITHIN;
    while alive(pid) && Instant::now() < end {
        std::thread::sleep(Duration::from_millis(20));
    }
    !alive(pid)
}

/// A `tree` fake that stays: the child, the first stdout line (the grandchild's pid) and the
/// rest of the lines.
type Tree = (
    Box<dyn AgentProcess>,
    u32,
    futures_lite::stream::Boxed<Result<String, ProcessFailure>>,
);

fn stubborn_tree() -> Tree {
    let mut process = fake(&[
        ("CLOSTA_FAKE_MODE", "tree"),
        ("CLOSTA_FAKE_LIFETIME_SECS", "30"),
    ]);
    let mut lines = process.take_stdout_lines().expect("stdout is there");
    let first = within(lines.next())
        .expect("a line")
        .expect("not a failure");
    let grandchild = first.parse().expect("the grandchild's pid");
    (process, grandchild, lines)
}

#[test]
fn stdout_lines_arrive_in_order_and_end_on_a_clean_exit() {
    let mut process = sh("printf 'a\\nb\\nc\\n'");
    assert_eq!(read_all(&mut *process), (strings(&["a", "b", "c"]), None));
}

#[test]
fn write_stdin_round_trips_through_the_process() {
    let mut process = sh("read x; echo \"got:$x\"");
    within(process.write_stdin("hello".to_owned())).expect("the write goes through");
    assert_eq!(read_all(&mut *process), (strings(&["got:hello"]), None));
}

#[test]
fn wait_returns_the_exit_code_every_time() {
    let clean = sh("exit 0");
    assert_eq!(within(clean.wait()).expect("an exit"), 0);

    let failed = sh("exit 3");
    let (first, second) = within(future::zip(failed.wait(), failed.wait()));
    assert_eq!((first.expect("an exit"), second.expect("an exit")), (3, 3));
    assert_eq!(within(failed.wait()).expect("an exit"), 3);
}

#[test]
fn a_nonzero_exit_ends_the_lines_with_an_exit_failure() {
    let mut process = sh("echo hi; exit 3");
    assert_eq!(
        read_all(&mut *process),
        (strings(&["hi"]), Some(ProcessFailure::Exit(3)))
    );
}

#[test]
fn exit_127_is_told_apart_by_its_code() {
    let exit_127 = [("CLOSTA_FAKE_MODE", "exit"), ("CLOSTA_FAKE_EXIT", "127")];
    assert_eq!(within(fake(&exit_127).wait()).expect("an exit"), 127);
    assert_eq!(
        read_all(&mut *fake(&exit_127)),
        (Vec::new(), Some(ProcessFailure::Exit(127)))
    );
}

// Deliberate difference from Kotlin: there `destroy` ends a long-running process with a signal;
// here it only closes stdin, so a process that reads stdin to its end ends by itself.
#[test]
fn destroy_closes_stdin_and_a_process_reading_it_ends() {
    let dir = scratch_dir("destroy_closes_stdin");
    let capture = dir.join("capture");
    std::fs::write(&capture, "ready\n").expect("the capture is written");
    let mut process = fake(&[
        ("CLOSTA_FAKE_MODE", "replay"),
        (
            "CLOSTA_FAKE_CAPTURE",
            capture.to_str().expect("a UTF-8 path"),
        ),
    ]);
    process.destroy();
    process.destroy();
    assert_eq!(read_all(&mut *process), (strings(&["ready"]), None));
    assert_eq!(within(process.wait()).expect("an exit"), 0);
    let refused = within(process.write_stdin("late".to_owned())).expect_err("stdin is closed");
    assert_eq!(refused.kind(), ErrorKind::BrokenPipe);
}

// The 200,000-character line arrives as one line, which also covers Kotlin's "a 200 KB single
// line arrives whole". The fake writes 1 MiB to stderr after it and only then reads stdin, so
// the end is reached only if the stderr drain runs.
#[test]
fn a_flood_of_stderr_does_not_deadlock_the_stdout_reader() {
    let mut process = fake(&[("CLOSTA_FAKE_MODE", "flood")]);
    let mut lines = process.take_stdout_lines().expect("stdout is there");
    let drain = process.take_stderr_drain().expect("stderr is there");
    let read = within(future::zip(drain, async {
        let mut read = Vec::new();
        while let Some(item) = lines.next().await {
            read.push(item.expect("not a failure"));
            process.destroy();
        }
        read
    }))
    .1;
    assert_eq!(read.len(), 1);
    assert_eq!(read[0].len(), BIG_LINE_CHARS);
    assert!(read[0].bytes().all(|byte| byte == b'x'));
}

#[test]
fn stderr_flooded_after_stdout_closes_does_not_deadlock_the_exit_wait() {
    let mut process = sh("exec 1>&-; head -c 1048576 /dev/zero >&2");
    assert_eq!(read_all(&mut *process), (Vec::new(), None));
    assert_eq!(within(process.wait()).expect("an exit"), 0);
}

#[test]
fn destroy_leaves_a_stubborn_process_and_destroy_forcibly_ends_it_and_its_child() {
    let (process, grandchild, _lines) = stubborn_tree();
    let child = process.id().expect("an OS process");

    process.destroy();
    std::thread::sleep(Duration::from_millis(300));
    assert!(
        alive(child),
        "closing stdin does not end the stubborn child"
    );
    assert!(alive(grandchild), "nor its child");

    process.destroy_forcibly();
    assert!(gone_soon(child), "the child is killed");
    assert!(gone_soon(grandchild), "and its child with it");
    assert_eq!(within(process.wait()).expect("an exit"), 128 + 9);
}

#[test]
fn a_wait_dropped_while_stdout_is_closed_and_the_process_runs_returns_at_once() {
    let mut process = sh("exec 1>&-; exec sleep 30");
    let mut lines = process.take_stdout_lines().expect("stdout is there");
    let started = Instant::now();
    let waited = within(future::or(async { Some(lines.next().await) }, async {
        smol::Timer::after(Duration::from_millis(200)).await;
        None
    }));
    assert!(
        waited.is_none(),
        "the line stream waits for the running process"
    );
    drop(lines);
    assert!(started.elapsed() < Duration::from_secs(1));
    assert!(alive(process.id().expect("an OS process")));
}

// Not in Kotlin, where the lines last as long as the grandchild does: once the child has ended,
// stdout gets STDOUT_GRACE to close, and then the group is killed.
#[test]
fn a_child_that_ends_while_its_grandchild_holds_stdout_ends_after_the_grace() {
    let started = Instant::now();
    let mut process = fake(&[
        ("CLOSTA_FAKE_MODE", "tree"),
        ("CLOSTA_FAKE_TREE_EXIT", "1"),
        ("CLOSTA_FAKE_LIFETIME_SECS", "30"),
    ]);
    let (lines, end) = read_all(&mut *process);
    let took = started.elapsed();
    assert_eq!(end, None, "the child's own exit code, 0");
    assert!(took >= STDOUT_GRACE, "ended after {took:?}");
    assert!(
        took < STDOUT_GRACE + Duration::from_secs(3),
        "ended after {took:?}"
    );
    let grandchild: u32 = lines[0].parse().expect("the grandchild's pid");
    assert!(gone_soon(grandchild), "the grandchild is killed");
}

// Deliberate difference from Kotlin: a line ends at `\n` only. Kotlin's `readLine` also ends one
// at a lone `\r`, which stream-json never writes inside a line.
#[test]
fn a_cr_lf_line_loses_one_cr_and_bad_bytes_become_replacements() {
    let dir = scratch_dir("cr_lf_line");
    let capture = dir.join("capture");
    std::fs::write(&capture, b"a\r\n\xffb\nc\r\r\n").expect("the capture is written");
    let mut process = fake(&[
        ("CLOSTA_FAKE_MODE", "replay"),
        (
            "CLOSTA_FAKE_CAPTURE",
            capture.to_str().expect("a UTF-8 path"),
        ),
    ]);
    process.destroy();
    assert_eq!(
        read_all(&mut *process),
        (strings(&["a", "\u{FFFD}b", "c\r"]), None)
    );
}

#[test]
fn dropping_the_process_kills_its_group() {
    let (process, grandchild, lines) = stubborn_tree();
    let child = process.id().expect("an OS process");
    drop(process);
    assert!(gone_soon(child), "the child is killed");
    assert!(
        gone_soon(grandchild),
        "and its child, while the lines are still held"
    );
    drop(lines);
}

#[test]
fn a_stubborn_fake_ends_by_itself_after_its_lifetime() {
    let process = fake(&[
        ("CLOSTA_FAKE_MODE", "stubborn"),
        ("CLOSTA_FAKE_LIFETIME_SECS", "1"),
    ]);
    let started = Instant::now();
    assert_eq!(within(process.wait()).expect("an exit"), 0);
    assert!(started.elapsed() < Duration::from_secs(3));
}

/// More than a pipe holds, so a write to a child that does not read stays in flight.
fn more_than_a_pipe_holds() -> String {
    "y".repeat(4 << 20)
}

#[test]
fn a_stuck_write_neither_holds_up_destroy_nor_outlives_it() {
    let process = sh("exec sleep 30");
    let mut writing = process.write_stdin(more_than_a_pipe_holds());
    let early = within(future::or(async { Some((&mut writing).await) }, async {
        smol::Timer::after(Duration::from_millis(200)).await;
        None
    }));
    assert!(
        early.is_none(),
        "the child does not read, so the write waits"
    );
    // Synchronous; it must not wait for the write that holds the pipe.
    process.destroy();
    let failed = within(writing).expect_err("the write gives up when stdin closes");
    assert_eq!(failed.kind(), ErrorKind::BrokenPipe);
}

#[test]
fn a_write_dropped_midway_closes_stdin_for_good() {
    let process = sh("exec sleep 30");
    let mut writing = process.write_stdin(more_than_a_pipe_holds());
    let early = within(future::or(async { Some((&mut writing).await) }, async {
        smol::Timer::after(Duration::from_millis(200)).await;
        None
    }));
    assert!(
        early.is_none(),
        "the child does not read, so the write waits"
    );
    drop(writing);
    // Half a line went out, so the next line could not be read whole: stdin is closed instead.
    let refused = within(process.write_stdin("next".to_owned())).expect_err("stdin is closed");
    assert_eq!(refused.kind(), ErrorKind::BrokenPipe);
}

fn strings(lines: &[&str]) -> Vec<String> {
    lines.iter().map(|line| (*line).to_owned()).collect()
}
