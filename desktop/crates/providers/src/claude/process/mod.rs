//! The port to a launched `claude` process. Mirrors AgentProcess.kt, with one step less: Kotlin's
//! `ProcessSpawner` handed out a JDK `Process` that another type wrapped, while here the spawner
//! hands out the [`AgentProcess`] itself.

pub(crate) mod os;

use std::io;
use std::time::Duration;

use futures_lite::{future, stream};

use crate::claude::launch::{Launch, LaunchError};

/// How many children may be alive at once. A launch beyond it is refused with
/// [`LaunchError::TooManyProcesses`], so that a bug that launches again and again stops at a
/// number instead of at the system's process limit.
pub const MAX_LIVE_CHILDREN: usize = 16;

/// How many children started here are alive now. A child counts until its end has been seen by
/// a wait or its box has been dropped, whichever comes first.
pub fn live_children() -> usize {
    os::live_children()
}

/// Starts `command` as an OS child, for the tests until a spawner builds the command itself.
#[doc(hidden)]
pub fn spawn_for_tests(
    command: std::process::Command,
) -> Result<Box<dyn AgentProcess>, LaunchError> {
    os::start(command)
}

/// How long stdout may stay open after the child has ended (a grandchild holds it) before the
/// whole group is killed. Kotlin has no such rule and waits for as long as the grandchild lives.
pub const STDOUT_GRACE: Duration = Duration::from_secs(2);

/// Why stdout ended other than cleanly. It names only the kind: never what the process wrote.
#[derive(Clone, Copy, PartialEq, Eq, Debug, thiserror::Error)]
pub enum ProcessFailure {
    /// stdout closed and the process ended with a code other than 0.
    #[error("the process ended with exit code {0}")]
    Exit(i32),
    /// stdout could not be read.
    #[error("the process output could not be read ({0})")]
    Io(io::ErrorKind),
}

/// A launched `claude` process, as a session talks to it.
///
/// Whoever owns it last kills it: dropping the value must call
/// [`AgentProcess::destroy_forcibly`].
pub trait AgentProcess: Send + Sync {
    /// The stdout lines, in order. A line ends at `\n`, and one trailing `\r` is dropped. The
    /// stream ends with `None` when stdout closed and the exit code is 0; otherwise its last item
    /// is one `Err`. It can be taken once; later calls give `None`.
    fn take_stdout_lines(&mut self) -> Option<stream::Boxed<Result<String, ProcessFailure>>>;

    /// The work of reading stderr and throwing it away. It ends when stderr reaches end of file,
    /// which is when the child ends. It can be taken once; later calls give `None`. Whoever reads
    /// stdout must run it too, or a full stderr pipe stops the child.
    fn take_stderr_drain(&mut self) -> Option<future::Boxed<()>>;

    /// Writes one line and a newline to stdin, then flushes.
    fn write_stdin(&self, line: String) -> future::Boxed<io::Result<()>>;

    /// Waits for the process to end and gives its exit code; the same value on every call.
    fn wait(&self) -> future::Boxed<io::Result<i32>>;

    /// Asks the process to end by closing its stdin. It sends no signal. Safe to call again.
    fn destroy(&self);

    /// Kills the process with all its descendants (the Job Object on Windows, the process group
    /// on Unix). Safe to call again.
    fn destroy_forcibly(&self);

    /// The OS process id, or `None` where there is no OS process.
    fn id(&self) -> Option<u32>;
}

/// Starts processes.
pub trait ProcessSpawner: Send + Sync {
    /// Starts one process for `launch`. It is synchronous and on Windows takes up to a few
    /// seconds, so it must not run on the UI thread.
    fn spawn(&self, launch: &Launch) -> Result<Box<dyn AgentProcess>, LaunchError>;
}
