#![cfg(unix)]
#![allow(clippy::expect_used, clippy::unwrap_used, clippy::print_stdout)]
//! The real `claude` on PATH, run by hand with `cargo xtask real-cli` and never by `check`.
//!
//! It costs nothing: no user message is sent, so no model is called. Only `initialize` and then
//! `mcp_status` are written, the order capture 24 recorded; the CLI answers both without a turn.
//! `--strict-mcp-config` and `--setting-sources ""` keep the user's MCP servers and settings out.
//! The exit code after stdin closes is 0 (measured with claude 2.1.326) and is asserted. The time
//! of each stage is printed.

mod common;

use std::collections::BTreeSet;
use std::future::Future;
use std::sync::Arc;
use std::time::{Duration, Instant};

use closta_model::AgentEvent;
use closta_providers::claude::launch::Launch;
use closta_providers::claude::launch::spawn::{NativeProgram, NativeSpawner};
use closta_providers::claude::launch::spec::LaunchSpec;
use closta_providers::claude::launch::version::check_version_within;
use closta_providers::claude::process::{AgentProcess, ProcessSpawner};
use closta_providers::claude::protocol::{decode, encode};
use common::{scratch_dir, spawn_in_background};
use futures_lite::{StreamExt, future};

/// Under nextest's kill at 60 s x 2.
const LIMIT: Duration = Duration::from_secs(90);

/// `work`, or `None` once `deadline` has passed.
async fn before<T>(deadline: Instant, work: impl Future<Output = T>) -> Option<T> {
    future::or(async { Some(work.await) }, async {
        smol::Timer::at(deadline).await;
        None
    })
    .await
}

#[test]
#[ignore = "real-cli"]
fn a_real_claude_answers_its_version_and_mcp_status_then_ends_when_stdin_closes() {
    let start = Instant::now();
    let deadline = start + LIMIT;
    let spawner: Arc<dyn ProcessSpawner> =
        Arc::new(NativeSpawner::new(NativeProgram::Claude, BTreeSet::new()));
    let dir = scratch_dir("real_cli");
    let mut spec = LaunchSpec::new(&uuid::Uuid::new_v4().to_string());
    spec.permission_prompt_tool_stdio = true;
    spec.cwd = Some(dir.to_str().expect("a UTF-8 path").to_owned());
    let mut launch = Launch::of(&spec).expect("a valid spec");
    launch
        .args
        .extend(["--strict-mcp-config", "--setting-sources", ""].map(str::to_owned));

    let version = smol::block_on(check_version_within(
        spawn_in_background(Arc::clone(&spawner), launch.version_check()),
        deadline.saturating_duration_since(Instant::now()),
    ))
    .expect("claude answers its version");
    assert!(version.starts_with("2."), "{version}");
    println!("claude --version: {version} ({:?})", start.elapsed());

    let spawn_began = Instant::now();
    let mut process = smol::block_on(before(
        deadline,
        spawn_in_background(Arc::clone(&spawner), launch),
    ))
    .expect("claude starts in time")
    .expect("claude starts");
    let mut lines = process.take_stdout_lines().expect("stdout is there");
    let drain = process.take_stderr_drain().expect("stderr is there");
    println!("spawned in {:?}", spawn_began.elapsed());
    let process: &dyn AgentProcess = &*process;
    let talk_began = Instant::now();

    let talk = async {
        process
            .write_stdin(encode::initialize("i1", &[]))
            .await
            .expect("initialize is written");
        process
            .write_stdin(encode::mcp_status("m1"))
            .await
            .expect("mcp_status is written");
        let mut answered = BTreeSet::new();
        while answered.len() < 2 {
            let line = lines
                .next()
                .await
                .expect("stdout stays open until both are answered")
                .expect("stdout reads cleanly");
            if let AgentEvent::ControlResponse {
                request_id: Some(id),
                ..
            } = decode(&line)
                && (id == "i1" || id == "m1")
            {
                println!("{id} answered after {:?}", talk_began.elapsed());
                answered.insert(id);
            }
        }
        let closed = Instant::now();
        process.destroy();
        let code = process.wait().await.expect("an exit code");
        println!("exited {:?} after stdin closed", closed.elapsed());
        code
    };
    let draining = async {
        drain.await;
        future::pending().await
    };
    let Some(code) = smol::block_on(before(deadline, future::race(talk, draining))) else {
        process.destroy_forcibly();
        panic!("claude did not answer and end within {LIMIT:?}");
    };
    println!("claude ended with exit code {code} after stdin closed");
    assert_eq!(code, 0, "a clean exit after stdin closes");
}
