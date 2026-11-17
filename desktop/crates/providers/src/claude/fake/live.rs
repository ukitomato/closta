//! A process the test drives while it runs: it emits stdout lines, reads what was written to
//! stdin and ends the process. Mirrors FakeProcess in the Kotlin session tests
//! (platforms/intellij/session/FakeProcesses.kt).

use std::io;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use futures_lite::{StreamExt, future, stream};

use crate::claude::process::{AgentProcess, ProcessFailure};

/// What a shell reports for a process ended by SIGKILL.
const KILLED_EXIT: i32 = 137;

/// How a [`LiveProcess`] answers being told to end.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct LiveOptions {
    /// The exit code after [`AgentProcess::destroy`]. `None` only closes the pipes and stdin and
    /// keeps the process running until [`LiveControl::exit`]: a process that does not end when
    /// told to (Kotlin's `endsOnDestroy = false`).
    pub exit_on_destroy: Option<i32>,
    /// Whether [`AgentProcess::destroy_forcibly`] ends the process, with 137.
    pub ends_on_kill: bool,
    /// Whether [`AgentProcess::wait`] fails with `ErrorKind::Other` once the process was
    /// destroyed.
    pub wait_fails: bool,
}

impl Default for LiveOptions {
    /// A `claude` whose stdin was closed ends with 0, and a kill ends it with 137.
    fn default() -> LiveOptions {
        LiveOptions {
            exit_on_destroy: Some(0),
            ends_on_kill: true,
            wait_fails: false,
        }
    }
}

#[derive(Default)]
struct State {
    stdin_lines: Vec<String>,
    stdin_closed: bool,
    destroyed: bool,
    exit_code: Option<i32>,
    force_kills: usize,
    refused_writes: usize,
    stdout_lines_read: usize,
}

struct Shared {
    options: LiveOptions,
    state: Mutex<State>,
    stdout: async_channel::Sender<String>,
    // Each line written to stdin, for `next_stdin_line`. Closed with stdin.
    stdin: async_channel::Sender<String>,
    stdin_unread: async_channel::Receiver<String>,
    // Never carries a value: closed when stdout and stderr close.
    pipes: async_channel::Sender<()>,
    pipes_closed: async_channel::Receiver<()>,
    // Never carries a value: closed when the process ends.
    end: async_channel::Sender<()>,
    ended: async_channel::Receiver<()>,
}

fn lock(state: &Mutex<State>) -> MutexGuard<'_, State> {
    // A test that failed while holding the lock must not make the fake's `Drop` panic too.
    state.lock().unwrap_or_else(PoisonError::into_inner)
}

impl Shared {
    fn close_pipes(&self) {
        self.stdout.close();
        self.pipes.close();
    }

    fn close_stdin(&self) {
        lock(&self.state).stdin_closed = true;
        self.stdin.close();
    }

    fn finish(&self, code: i32) {
        {
            let mut state = lock(&self.state);
            if state.exit_code.is_some() {
                return;
            }
            state.exit_code = Some(code);
            state.stdin_closed = true;
        }
        self.stdin.close();
        self.close_pipes();
        self.end.close();
    }

    fn kill(&self, counted: bool) {
        {
            let mut state = lock(&self.state);
            if state.exit_code.is_some() {
                return;
            }
            if counted {
                state.force_kills += 1;
            }
        }
        if self.options.ends_on_kill {
            self.finish(KILLED_EXIT);
        }
    }
}

/// The test's side of a [`LiveProcess`]; it outlives the process.
#[derive(Clone)]
pub struct LiveControl {
    shared: Arc<Shared>,
}

impl LiveControl {
    /// Writes one line to stdout. Ignored once stdout closed.
    pub fn emit(&self, line: &str) {
        _ = self.shared.stdout.try_send(line.to_owned());
    }

    /// Ends the process with `code`: stdout and stderr close, then `wait` returns. Only the first
    /// end counts.
    pub fn exit(&self, code: i32) {
        self.shared.finish(code);
    }

    /// The lines written to stdin so far, in order.
    pub fn stdin_lines(&self) -> Vec<String> {
        lock(&self.shared.state).stdin_lines.clone()
    }

    /// The next stdin line not read yet, waiting for one to arrive. `None` once stdin closed and
    /// every line was read.
    pub fn next_stdin_line(&self) -> future::Boxed<Option<String>> {
        let unread = self.shared.stdin_unread.clone();
        Box::pin(async move { unread.recv().await.ok() })
    }

    /// Closes stdin as a CLI that stops reading would: later writes fail with `BrokenPipe`, and
    /// the process keeps running.
    pub fn close_stdin(&self) {
        self.shared.close_stdin();
    }

    /// Whether [`AgentProcess::destroy`] ran.
    pub fn destroyed(&self) -> bool {
        lock(&self.shared.state).destroyed
    }

    /// How many [`AgentProcess::destroy_forcibly`] calls arrived before the process ended. Calls
    /// after the end and the kill of `Drop` are not counted: every owner's `Drop` kills, so they
    /// would count one kill after every close.
    pub fn force_kills(&self) -> usize {
        lock(&self.shared.state).force_kills
    }

    /// How many [`AgentProcess::write_stdin`] calls failed.
    pub fn refused_writes(&self) -> usize {
        lock(&self.shared.state).refused_writes
    }

    /// How many emitted stdout lines the process's reader has taken.
    pub fn stdout_lines_read(&self) -> usize {
        lock(&self.shared.state).stdout_lines_read
    }

    /// Whether the process ended.
    pub fn ended(&self) -> bool {
        lock(&self.shared.state).exit_code.is_some()
    }
}

/// An [`AgentProcess`] with no OS process behind it, driven by its [`LiveControl`].
pub struct LiveProcess {
    shared: Arc<Shared>,
    // Behind a mutex only so that the process is `Sync`; taking them needs `&mut self`.
    stdout: Mutex<Option<stream::Boxed<Result<String, ProcessFailure>>>>,
    stderr: Mutex<Option<future::Boxed<()>>>,
}

impl LiveProcess {
    pub fn new(options: LiveOptions) -> (LiveProcess, LiveControl) {
        let (stdout, stdout_lines) = async_channel::unbounded();
        let (stdin, stdin_unread) = async_channel::unbounded();
        let (pipes, pipes_closed) = async_channel::bounded(1);
        let (end, ended) = async_channel::bounded(1);
        let shared = Arc::new(Shared {
            options,
            state: Mutex::new(State::default()),
            stdout,
            stdin,
            stdin_unread,
            pipes,
            pipes_closed,
            end,
            ended,
        });
        let drain = shared.pipes_closed.clone();
        let process = LiveProcess {
            stdout: Mutex::new(Some(stdout_stream(Arc::clone(&shared), stdout_lines))),
            stderr: Mutex::new(Some(Box::pin(async move {
                _ = drain.recv().await;
            }))),
            shared: Arc::clone(&shared),
        };
        (process, LiveControl { shared })
    }
}

/// The emitted lines, then the end the exit code gives: nothing for 0 or for a process still
/// running with its pipes closed, `Err(Exit(code))` for any other code.
fn stdout_stream(
    shared: Arc<Shared>,
    lines: async_channel::Receiver<String>,
) -> stream::Boxed<Result<String, ProcessFailure>> {
    stream::unfold(Some((shared, lines)), |open| async move {
        let (shared, lines) = open?;
        match lines.recv().await {
            Ok(line) => {
                lock(&shared.state).stdout_lines_read += 1;
                Some((Ok(line), Some((shared, lines))))
            }
            Err(_) => match lock(&shared.state).exit_code {
                Some(code) if code != 0 => Some((Err(ProcessFailure::Exit(code)), None)),
                _ => None,
            },
        }
    })
    .boxed()
}

impl AgentProcess for LiveProcess {
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
            let mut state = lock(&self.shared.state);
            if state.stdin_closed {
                state.refused_writes += 1;
                Err(io::Error::from(io::ErrorKind::BrokenPipe))
            } else {
                state.stdin_lines.push(line.clone());
                // Sent under the lock so that the unread lines keep the order of the writes.
                _ = self.shared.stdin.try_send(line);
                Ok(())
            }
        };
        Box::pin(future::ready(result))
    }

    fn wait(&self) -> future::Boxed<io::Result<i32>> {
        let shared = Arc::clone(&self.shared);
        Box::pin(async move {
            if shared.options.wait_fails && lock(&shared.state).destroyed {
                return Err(io::Error::from(io::ErrorKind::Other));
            }
            _ = shared.ended.recv().await;
            lock(&shared.state)
                .exit_code
                .ok_or_else(|| io::Error::from(io::ErrorKind::Other))
        })
    }

    fn destroy(&self) {
        lock(&self.shared.state).destroyed = true;
        match self.shared.options.exit_on_destroy {
            Some(code) => self.shared.finish(code),
            None => {
                self.shared.close_stdin();
                self.shared.close_pipes();
            }
        }
    }

    fn destroy_forcibly(&self) {
        self.shared.kill(true);
    }

    fn id(&self) -> Option<u32> {
        None
    }
}

impl Drop for LiveProcess {
    fn drop(&mut self) {
        self.shared.kill(false);
    }
}
