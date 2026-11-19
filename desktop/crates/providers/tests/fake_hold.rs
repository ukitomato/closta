#![cfg(target_os = "linux")]
#![allow(clippy::expect_used, clippy::unwrap_used)]
//! `--hold <dir>` makes the fake CLI stand in for a stdio MCP server: it marks itself with a file
//! named after its pid, and stays until its stdin closes or its lifetime is over.

use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

const WITHIN: Duration = Duration::from_secs(5);
const POLL: Duration = Duration::from_millis(20);

/// A child that is killed and waited for when the test ends, on failure paths too.
struct Held(Child);

impl Drop for Held {
    fn drop(&mut self) {
        _ = self.0.kill();
        _ = self.0.wait();
    }
}

struct Dir(PathBuf);

impl Dir {
    fn new(name: &str) -> Self {
        let dir =
            std::env::temp_dir().join(format!("closta-fake-hold-{name}-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("a folder to hold in");
        Self(dir)
    }
}

impl Drop for Dir {
    fn drop(&mut self) {
        _ = std::fs::remove_dir_all(&self.0);
    }
}

fn hold(dir: &Path, envs: &[(&str, &str)]) -> Held {
    let mut command = Command::new(env!("CARGO_BIN_EXE_closta-fake-claude"));
    command
        .arg("--hold")
        .arg(dir)
        .env_remove("CLOSTA_FAKE_MODE")
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    for (name, value) in envs {
        command.env(name, value);
    }
    Held(command.spawn().expect("the fake starts"))
}

fn until<T>(mut check: impl FnMut() -> Option<T>) -> Option<T> {
    let end = Instant::now() + WITHIN;
    while Instant::now() < end {
        if let Some(found) = check() {
            return Some(found);
        }
        std::thread::sleep(POLL);
    }
    None
}

fn ended(held: &mut Held) -> Option<ExitStatus> {
    until(|| held.0.try_wait().expect("the child can be asked"))
}

#[test]
fn hold_writes_its_pid_file_and_waits() {
    let dir = Dir::new("pid");
    let mut held = hold(&dir.0, &[]);
    let file = dir.0.join(format!("hold-{}", held.0.id()));
    assert!(
        until(|| file.exists().then_some(())).is_some(),
        "no pid file"
    );
    std::thread::sleep(Duration::from_millis(300));
    assert!(held.0.try_wait().unwrap().is_none(), "it ended early");
    assert_eq!(std::fs::metadata(&file).unwrap().len(), 0);
}

#[test]
fn hold_ends_when_its_stdin_closes() {
    let dir = Dir::new("stdin");
    let mut held = hold(&dir.0, &[]);
    let file = dir.0.join(format!("hold-{}", held.0.id()));
    assert!(
        until(|| file.exists().then_some(())).is_some(),
        "no pid file"
    );
    drop(held.0.stdin.take());
    let status = ended(&mut held).expect("it ends once stdin closes");
    assert_eq!(status.code(), Some(0));
}

#[test]
fn hold_ends_by_itself_after_its_lifetime() {
    let dir = Dir::new("lifetime");
    let mut held = hold(&dir.0, &[("CLOSTA_FAKE_LIFETIME_SECS", "1")]);
    let status = ended(&mut held).expect("it ends when its lifetime is over");
    assert_eq!(status.code(), Some(0));
}

#[test]
fn hold_needs_no_mode() {
    let dir = Dir::new("mode");
    let held = hold(&dir.0, &[]);
    let file = dir.0.join(format!("hold-{}", held.0.id()));
    assert!(
        until(|| file.exists().then_some(())).is_some(),
        "no pid file"
    );
}

#[test]
fn hold_in_a_missing_folder_ends_with_2() {
    let dir = Dir::new("missing");
    let mut held = hold(&dir.0.join("absent"), &[]);
    let status = ended(&mut held).expect("it ends at once");
    assert_eq!(status.code(), Some(2));
}
