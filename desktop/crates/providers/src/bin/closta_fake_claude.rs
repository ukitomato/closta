//! A stand-in for the `claude` CLI that the process tests launch. `CLOSTA_FAKE_MODE` picks what it
//! does; `--version` among the arguments answers the version whatever the mode.
//!
//! `--hold <dir>` among the arguments (after `--version`, before the mode) makes it stand in for a
//! stdio MCP server whatever the mode.
//!
//! Every loop that sleeps ends by itself after `CLOSTA_FAKE_LIFETIME_SECS` (60 by default): a
//! child lives in its own process group, so a test run that is killed would otherwise leave it
//! behind.

use std::ffi::OsStr;
use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::process::{Command, ExitCode, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

const DEFAULT_VERSION: &str = "2.1.282 (Claude Code)";
const DEFAULT_LIFETIME_SECS: u64 = 60;
const NAP: Duration = Duration::from_millis(50);
const FLOOD_STDOUT_CHARS: usize = 200_000;
const FLOOD_STDERR_BYTES: usize = 1 << 20;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let ran = if args.iter().any(|arg| arg == "--version") {
        version()
    } else if let Some(dir) = hold_dir(&args) {
        hold(&dir)
    } else {
        match std::env::var("CLOSTA_FAKE_MODE").as_deref() {
            Ok("replay") => replay(),
            Ok("argv") => echo_argv(&args),
            Ok("exit") => Ok(exit_code()),
            Ok("flood") => flood(),
            Ok("tree") => tree(),
            Ok("stubborn") => Ok(stubborn()),
            _ => {
                _ = io::stderr().write_all(b"closta-fake-claude: unknown CLOSTA_FAKE_MODE\n");
                Ok(ExitCode::from(2))
            }
        }
    };
    ran.unwrap_or(ExitCode::FAILURE)
}

/// Writes `CLOSTA_FAKE_VERSION` and ends with 0.
fn version() -> io::Result<ExitCode> {
    let version =
        std::env::var("CLOSTA_FAKE_VERSION").unwrap_or_else(|_| DEFAULT_VERSION.to_owned());
    write_stdout(format!("{version}\n").as_bytes())?;
    Ok(ExitCode::SUCCESS)
}

/// Writes the bytes of `CLOSTA_FAKE_CAPTURE` as they are, reads stdin to its end into
/// `CLOSTA_FAKE_STDIN_LOG` if set, and ends with `CLOSTA_FAKE_EXIT`.
fn replay() -> io::Result<ExitCode> {
    if let Some(capture) = std::env::var_os("CLOSTA_FAKE_CAPTURE") {
        write_stdout(&std::fs::read(capture)?)?;
    }
    let stdin = read_stdin()?;
    if let Some(log) = std::env::var_os("CLOSTA_FAKE_STDIN_LOG") {
        std::fs::write(log, stdin)?;
    }
    Ok(exit_code())
}

/// Writes one JSON line: the arguments, the variables named in `CLOSTA_FAKE_ECHO_ENV` (`null` when
/// unset) and the working folder.
fn echo_argv(args: &[String]) -> io::Result<ExitCode> {
    let names = std::env::var("CLOSTA_FAKE_ECHO_ENV").unwrap_or_default();
    let env: serde_json::Map<String, serde_json::Value> = names
        .split(',')
        .filter(|name| !name.is_empty())
        .map(|name| {
            let value = std::env::var_os(name).map(|value| lossy(&value));
            (name.to_owned(), value.into())
        })
        .collect();
    let cwd = std::env::current_dir()?;
    let line = serde_json::json!({ "argv": args, "env": env, "cwd": lossy(cwd.as_os_str()) });
    write_stdout(format!("{line}\n").as_bytes())?;
    Ok(ExitCode::SUCCESS)
}

/// Writes a 200,000-character line to stdout and 1 MiB to stderr before reading stdin, then reads
/// stdin to its end.
fn flood() -> io::Result<ExitCode> {
    let mut line = vec![b'x'; FLOOD_STDOUT_CHARS];
    line.push(b'\n');
    write_stdout(&line)?;
    let mut stderr = io::stderr().lock();
    stderr.write_all(&vec![b'e'; FLOOD_STDERR_BYTES])?;
    stderr.flush()?;
    read_stdin()?;
    Ok(ExitCode::SUCCESS)
}

/// Starts itself as `stubborn` (a grandchild of the test, sharing this stdout and stderr) and
/// writes its pid. With `CLOSTA_FAKE_TREE_EXIT` set it ends at once, leaving the grandchild with
/// stdout open; otherwise it is stubborn too.
fn tree() -> io::Result<ExitCode> {
    let grandchild = Command::new(std::env::current_exe()?)
        .env("CLOSTA_FAKE_MODE", "stubborn")
        .stdin(Stdio::null())
        .spawn()?;
    write_stdout(format!("{}\n", grandchild.id()).as_bytes())?;
    if std::env::var_os("CLOSTA_FAKE_TREE_EXIT").is_some() {
        return Ok(ExitCode::SUCCESS);
    }
    Ok(stubborn())
}

/// Ignores stdin and sleeps until its lifetime is over, then ends with 0.
fn stubborn() -> ExitCode {
    let end = lifetime_end();
    while Instant::now() < end {
        std::thread::sleep(NAP);
    }
    ExitCode::SUCCESS
}

/// The folder after `--hold`, if that argument is there.
fn hold_dir(args: &[String]) -> Option<PathBuf> {
    let at = args.iter().position(|arg| arg == "--hold")?;
    args.get(at + 1).map(PathBuf::from)
}

/// Stands in for a stdio MCP server: creates the empty file `hold-<pid>` in `dir` (ends with 2 if
/// there is no such folder), discards stdin on another thread, and ends with 0 when stdin ends or
/// its lifetime is over.
fn hold(dir: &std::path::Path) -> io::Result<ExitCode> {
    if !dir.is_dir() {
        _ = io::stderr().write_all(b"closta-fake-claude: --hold needs an existing folder\n");
        return Ok(ExitCode::from(2));
    }
    std::fs::File::create(dir.join(format!("hold-{}", std::process::id())))?;
    let drained = Arc::new(AtomicBool::new(false));
    let reader = Arc::clone(&drained);
    std::thread::spawn(move || {
        _ = io::copy(&mut io::stdin().lock(), &mut io::sink());
        reader.store(true, Ordering::Release);
    });
    let end = lifetime_end();
    while Instant::now() < end && !drained.load(Ordering::Acquire) {
        std::thread::sleep(NAP);
    }
    Ok(ExitCode::SUCCESS)
}

/// When `CLOSTA_FAKE_LIFETIME_SECS` (60 by default) from now is over.
fn lifetime_end() -> Instant {
    let lifetime = std::env::var("CLOSTA_FAKE_LIFETIME_SECS")
        .ok()
        .and_then(|secs| secs.parse().ok())
        .unwrap_or(DEFAULT_LIFETIME_SECS);
    Instant::now() + Duration::from_secs(lifetime)
}

/// `CLOSTA_FAKE_EXIT`, 0 when unset or not a byte.
fn exit_code() -> ExitCode {
    let code: u8 = std::env::var("CLOSTA_FAKE_EXIT")
        .ok()
        .and_then(|code| code.parse().ok())
        .unwrap_or(0);
    ExitCode::from(code)
}

fn write_stdout(bytes: &[u8]) -> io::Result<()> {
    let mut stdout = io::stdout().lock();
    stdout.write_all(bytes)?;
    stdout.flush()
}

fn read_stdin() -> io::Result<Vec<u8>> {
    let mut read = Vec::new();
    io::stdin().lock().read_to_end(&mut read)?;
    Ok(read)
}

fn lossy(text: &OsStr) -> String {
    text.to_string_lossy().into_owned()
}
