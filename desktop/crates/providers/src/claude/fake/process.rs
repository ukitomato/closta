//! A process played from a script in memory. Mirrors FakeAgentProcess.kt.

use std::collections::VecDeque;
use std::io;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use futures_lite::{StreamExt, future, stream};

use crate::claude::process::{AgentProcess, ProcessFailure};

/// What a [`FakeProcess`] plays on stdout and how it ends.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ProcessScript {
    pub beats: Vec<ProcessBeat>,
    pub termination: ProcessTermination,
    /// Every stdin write fails, as for a CLI that has already ended. The attempt still opens the
    /// gate of [`ProcessBeat::AwaitStdin`].
    pub stdin_fails: bool,
}

impl ProcessScript {
    /// Plays `lines` straight through, then ends cleanly.
    pub fn replaying(lines: Vec<String>) -> ProcessScript {
        ProcessScript {
            beats: lines.into_iter().map(ProcessBeat::Line).collect(),
            termination: ProcessTermination::Complete,
            stdin_fails: false,
        }
    }
}

/// One step on stdout.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum ProcessBeat {
    /// One raw stdout line.
    Line(String),
    /// stdout stops until the host writes to stdin (the CLI waiting on an unanswered request).
    /// As in Kotlin there is one gate: the first write, or stdin closing, opens it for good, so
    /// a later `AwaitStdin` waits only if nothing has been written yet.
    AwaitStdin,
}

/// How stdout ends.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum ProcessTermination {
    /// stdout closes and the exit code is 0.
    Complete,
    /// After the beats, stdout ends with this failure.
    Error(ProcessFailure),
    /// stdout fails before any beat, as `Io(NotFound)`: a launch that gave no usable process.
    LaunchFailure,
}

#[derive(Default)]
struct Seen {
    stdin_lines: Vec<String>,
    stdin_closed: bool,
    destroyed: bool,
    forcibly_destroyed: bool,
}

fn lock(seen: &Mutex<Seen>) -> MutexGuard<'_, Seen> {
    // A test that failed while holding the lock must not make the fake's `Drop` panic too.
    seen.lock().unwrap_or_else(PoisonError::into_inner)
}

/// What a test reads back from a [`FakeProcess`], also after the process is gone.
#[derive(Clone)]
pub struct FakeProcessProbe {
    seen: Arc<Mutex<Seen>>,
}

impl FakeProcessProbe {
    /// The lines written to stdin, in order.
    pub fn stdin_lines(&self) -> Vec<String> {
        lock(&self.seen).stdin_lines.clone()
    }

    /// Whether stdin was closed, by [`AgentProcess::destroy`] or by a kill.
    pub fn stdin_closed(&self) -> bool {
        lock(&self.seen).stdin_closed
    }

    /// Whether [`AgentProcess::destroy`] ran.
    pub fn destroyed(&self) -> bool {
        lock(&self.seen).destroyed
    }

    /// Whether [`AgentProcess::destroy_forcibly`] ran (dropping the process runs it).
    pub fn forcibly_destroyed(&self) -> bool {
        lock(&self.seen).forcibly_destroyed
    }
}

/// An [`AgentProcess`] that plays a [`ProcessScript`] instead of running `claude`.
pub struct FakeProcess {
    // Behind a mutex only so that the process is `Sync`; taking them needs `&mut self`.
    stdout: Mutex<Option<stream::Boxed<Result<String, ProcessFailure>>>>,
    stderr: Mutex<Option<future::Boxed<()>>>,
    seen: Arc<Mutex<Seen>>,
    // Closing it opens the gate of every `AwaitStdin`.
    gate: async_channel::Sender<()>,
    stdin_fails: bool,
    exit_code: i32,
}

impl FakeProcess {
    pub fn new(script: ProcessScript) -> (FakeProcess, FakeProcessProbe) {
        let seen = Arc::new(Mutex::new(Seen::default()));
        let (gate, opened) = async_channel::bounded(1);
        let exit_code = match script.termination {
            ProcessTermination::Error(ProcessFailure::Exit(code)) => code,
            _ => 0,
        };
        let process = FakeProcess {
            stdout: Mutex::new(Some(stdout(script.beats, script.termination, opened))),
            stderr: Mutex::new(Some(Box::pin(future::ready(())))),
            seen: Arc::clone(&seen),
            gate,
            stdin_fails: script.stdin_fails,
            exit_code,
        };
        (process, FakeProcessProbe { seen })
    }
}

fn stdout(
    beats: Vec<ProcessBeat>,
    termination: ProcessTermination,
    opened: async_channel::Receiver<()>,
) -> stream::Boxed<Result<String, ProcessFailure>> {
    let (beats, ending) = match termination {
        ProcessTermination::Complete => (beats, None),
        ProcessTermination::Error(failure) => (beats, Some(failure)),
        ProcessTermination::LaunchFailure => (
            Vec::new(),
            Some(ProcessFailure::Io(io::ErrorKind::NotFound)),
        ),
    };
    let beats: VecDeque<ProcessBeat> = beats.into();
    stream::unfold(
        (beats, ending, opened),
        |(mut beats, ending, opened)| async move {
            loop {
                match beats.pop_front() {
                    Some(ProcessBeat::Line(line)) => {
                        return Some((Ok(line), (beats, ending, opened)));
                    }
                    // Ends with an error once the gate is closed.
                    Some(ProcessBeat::AwaitStdin) => _ = opened.recv().await,
                    None => return ending.map(|failure| (Err(failure), (beats, None, opened))),
                }
            }
        },
    )
    .boxed()
}

impl AgentProcess for FakeProcess {
    fn take_stdout_lines(&mut self) -> Option<stream::Boxed<Result<String, ProcessFailure>>> {
        self.stdout
            .get_mut()
            .unwrap_or_else(PoisonError::into_inner)
            .take()
    }

    fn take_stderr_drain(&mut self) -> Option<future::Boxed<()>> {
        self.stderr
            .get_mut()
            .unwrap_or_else(PoisonError::into_inner)
            .take()
    }

    fn write_stdin(&self, line: String) -> future::Boxed<io::Result<()>> {
        let result = {
            let mut seen = lock(&self.seen);
            if seen.stdin_closed || self.stdin_fails {
                Err(io::Error::from(io::ErrorKind::BrokenPipe))
            } else {
                seen.stdin_lines.push(line);
                Ok(())
            }
        };
        self.gate.close();
        Box::pin(future::ready(result))
    }

    fn wait(&self) -> future::Boxed<io::Result<i32>> {
        Box::pin(future::ready(Ok(self.exit_code)))
    }

    fn destroy(&self) {
        {
            let mut seen = lock(&self.seen);
            seen.destroyed = true;
            seen.stdin_closed = true;
        }
        self.gate.close();
    }

    fn destroy_forcibly(&self) {
        {
            let mut seen = lock(&self.seen);
            seen.forcibly_destroyed = true;
            seen.stdin_closed = true;
        }
        self.gate.close();
    }

    fn id(&self) -> Option<u32> {
        None
    }
}

impl Drop for FakeProcess {
    fn drop(&mut self) {
        self.destroy_forcibly();
    }
}
