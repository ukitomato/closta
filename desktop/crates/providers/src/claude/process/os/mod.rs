//! A `claude` that runs as an OS child, started with `async-process`. Mirrors
//! ProcessAgentProcess.kt; what differs is noted where it happens.
//!
//! The box handed out owns the child: dropping it kills the child and its descendants even while
//! a line stream or a wait taken from it lives on.

#[cfg(unix)]
mod unix;
#[cfg(unix)]
use unix as platform;
#[cfg(windows)]
pub(crate) mod windows;
#[cfg(windows)]
use windows as platform;

use std::future::Future;
use std::io;
use std::pin::Pin;
use std::process::{ExitStatus, Stdio};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::task::{Context, Poll, Wake, Waker};

use async_process::{ChildStderr, ChildStdin, ChildStdout};
use futures_lite::io::BufReader;
use futures_lite::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, StreamExt, future, stream};

use crate::claude::launch::LaunchError;
use crate::claude::process::{AgentProcess, MAX_LIVE_CHILDREN, ProcessFailure, STDOUT_GRACE};

static LIVE_CHILDREN: AtomicUsize = AtomicUsize::new(0);

/// How many children of this process are alive, as far as the count knows.
pub(crate) fn live_children() -> usize {
    LIVE_CHILDREN.load(Ordering::SeqCst)
}

/// Starts `command` with piped stdin, stdout and stderr. It is refused without starting anything
/// when [`MAX_LIVE_CHILDREN`] are alive.
pub(crate) fn start(
    mut command: std::process::Command,
) -> Result<Box<dyn AgentProcess>, LaunchError> {
    let slot = LiveSlot::take()?;
    platform::configure(&mut command);
    let mut command = async_process::Command::from(command);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = command
        .spawn()
        .map_err(|error| LaunchError::Spawn(error.kind()))?;
    let tree = platform::contain(&mut child).map_err(|error| {
        // Running outside a job, it could not be stopped with its descendants, so it is killed.
        // A grandchild it started before this (the accepted window) is not, and is left.
        _ = child.kill();
        LaunchError::Spawn(error.kind())
    })?;
    // Taken at once: `Child::status` closes a stdin that is still in the child.
    let (Some(stdin), Some(stdout), Some(stderr)) =
        (child.stdin.take(), child.stdout.take(), child.stderr.take())
    else {
        // Unreachable with piped stdio; `kill_on_drop` ends the child.
        return Err(LaunchError::Spawn(io::ErrorKind::Other));
    };
    let shared = Arc::new(Shared {
        pid: child.id(),
        exit: Exit::new(Box::pin(child.status())),
        child: Mutex::new(child),
        tree,
        stdin: Stdin::new(stdin),
        slot,
    });
    Ok(Box::new(OsProcess {
        stdout: Mutex::new(Some(stdout_lines(stdout, Arc::clone(&shared)))),
        stderr: Mutex::new(Some(Box::pin(drain(stderr)))),
        shared,
    }))
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    // A panic elsewhere must not make the kill in `Drop` panic too.
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

/// The box handed out. Only it kills on drop; the parts it hands out share [`Shared`].
struct OsProcess {
    shared: Arc<Shared>,
    // Behind a mutex only so that the process is `Sync`; taking them needs `&mut self`.
    stdout: Mutex<Option<stream::Boxed<Result<String, ProcessFailure>>>>,
    stderr: Mutex<Option<future::Boxed<()>>>,
}

impl AgentProcess for OsProcess {
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
        Box::pin(write_line(Arc::clone(&self.shared), line))
    }

    fn wait(&self) -> future::Boxed<io::Result<i32>> {
        let shared = Arc::clone(&self.shared);
        Box::pin(async move {
            future::poll_fn(|cx| shared.poll_exit(cx))
                .await
                .map_err(io::Error::from)
        })
    }

    fn destroy(&self) {
        self.shared.stdin.close();
    }

    fn destroy_forcibly(&self) {
        self.shared.destroy_forcibly();
    }

    fn id(&self) -> Option<u32> {
        Some(self.shared.pid)
    }
}

impl Drop for OsProcess {
    fn drop(&mut self) {
        self.shared.destroy_forcibly();
        self.shared.slot.release();
    }
}

/// What the box and the parts it hands out (the line stream, waits, writes) share.
struct Shared {
    pid: u32,
    child: Mutex<async_process::Child>,
    tree: platform::Tree,
    stdin: Stdin,
    exit: Exit,
    slot: LiveSlot,
}

impl Shared {
    fn poll_exit(&self, cx: &mut Context<'_>) -> Poll<Result<i32, io::ErrorKind>> {
        let polled = self.exit.poll(cx);
        if let Poll::Ready(Ok(_)) = polled {
            self.slot.release();
        }
        polled
    }

    fn destroy_forcibly(&self) {
        self.stdin.close();
        let mut child = lock(&self.child);
        platform::kill_tree(&self.tree, &mut child);
        // Does nothing once the child is reaped, so it never reaches a reused pid.
        _ = child.kill();
    }
}

/// One place among the [`MAX_LIVE_CHILDREN`], given back once.
struct LiveSlot {
    released: AtomicBool,
}

impl LiveSlot {
    fn take() -> Result<LiveSlot, LaunchError> {
        let mut live = LIVE_CHILDREN.load(Ordering::SeqCst);
        loop {
            if live >= MAX_LIVE_CHILDREN {
                return Err(LaunchError::TooManyProcesses);
            }
            match LIVE_CHILDREN.compare_exchange(live, live + 1, Ordering::SeqCst, Ordering::SeqCst)
            {
                Ok(_) => {
                    return Ok(LiveSlot {
                        released: AtomicBool::new(false),
                    });
                }
                Err(now) => live = now,
            }
        }
    }

    fn release(&self) {
        if !self.released.swap(true, Ordering::SeqCst) {
            LIVE_CHILDREN.fetch_sub(1, Ordering::SeqCst);
        }
    }
}

impl Drop for LiveSlot {
    fn drop(&mut self) {
        self.release();
    }
}

/// The child's stdin. While no write runs, the pipe waits in `idle`; a write takes it out and
/// puts it back when the line is written. Closing never waits for a write: it closes the
/// channels, and a running write gives the pipe up as soon as it sees `closing` closed.
struct Stdin {
    idle: (
        async_channel::Sender<ChildStdin>,
        async_channel::Receiver<ChildStdin>,
    ),
    // Never carries a message; closing it ends every `recv` on it.
    closing: (async_channel::Sender<()>, async_channel::Receiver<()>),
}

impl Stdin {
    fn new(pipe: ChildStdin) -> Stdin {
        let idle = async_channel::bounded(1);
        // A new channel with room for one always takes it.
        _ = idle.0.try_send(pipe);
        Stdin {
            idle,
            closing: async_channel::bounded(1),
        }
    }

    fn close(&self) {
        self.closing.0.close();
        self.idle.0.close();
        while let Ok(pipe) = self.idle.1.try_recv() {
            drop(pipe);
        }
    }

    fn is_closed(&self) -> bool {
        self.closing.0.is_closed()
    }
}

/// The pipe while one write holds it. Dropped before the write ended (the write failed, was
/// dropped midway or saw stdin closing), it closes stdin for good: a half-written line cannot be
/// finished, and the next write must not wait for a pipe that never comes back.
struct Lease<'a> {
    stdin: &'a Stdin,
    pipe: Option<ChildStdin>,
}

impl Lease<'_> {
    fn give_back(mut self) {
        if let Some(pipe) = self.pipe.take()
            && let Err(refused) = self.stdin.idle.0.try_send(pipe)
        {
            // stdin was closed meanwhile.
            drop(refused.into_inner());
        }
    }
}

impl Drop for Lease<'_> {
    fn drop(&mut self) {
        if self.pipe.take().is_some() {
            self.stdin.close();
        }
    }
}

async fn write_line(shared: Arc<Shared>, line: String) -> io::Result<()> {
    let stdin = &shared.stdin;
    let Ok(pipe) = stdin.idle.1.recv().await else {
        return Err(io::ErrorKind::BrokenPipe.into());
    };
    let mut lease = Lease {
        stdin,
        pipe: Some(pipe),
    };
    // `close` ran between taking the pipe and here.
    if stdin.is_closed() {
        return Err(io::ErrorKind::BrokenPipe.into());
    }
    let mut bytes = line.into_bytes();
    bytes.push(b'\n');
    let Some(pipe) = lease.pipe.as_mut() else {
        return Err(io::ErrorKind::BrokenPipe.into());
    };
    let closing = &stdin.closing.1;
    // `closing` comes first so that a write after `close` never wins the race.
    future::or(
        async {
            _ = closing.recv().await;
            Err(io::ErrorKind::BrokenPipe.into())
        },
        async {
            pipe.write_all(&bytes).await?;
            pipe.flush().await
        },
    )
    .await?;
    lease.give_back();
    Ok(())
}

/// The child's end, seen once by whichever wait polls first and shared with every other. The
/// status future registers one waker at a time, so it is polled with a waker that wakes them all.
struct Exit {
    state: Mutex<ExitState>,
    waiting: Arc<Waiting>,
}

enum ExitState {
    Running(future::Boxed<io::Result<ExitStatus>>),
    Ended(Result<i32, io::ErrorKind>),
}

impl Exit {
    fn new(status: future::Boxed<io::Result<ExitStatus>>) -> Exit {
        Exit {
            state: Mutex::new(ExitState::Running(status)),
            waiting: Arc::new(Waiting::default()),
        }
    }

    fn poll(&self, cx: &mut Context<'_>) -> Poll<Result<i32, io::ErrorKind>> {
        let mut state = lock(&self.state);
        let status = match &mut *state {
            ExitState::Ended(end) => return Poll::Ready(*end),
            ExitState::Running(status) => status,
        };
        self.waiting.add(cx.waker());
        let all = Waker::from(Arc::clone(&self.waiting));
        let Poll::Ready(status) = Pin::new(status).poll(&mut Context::from_waker(&all)) else {
            return Poll::Pending;
        };
        let end = status
            .map(platform::exit_code)
            .map_err(|error| error.kind());
        *state = ExitState::Ended(end);
        drop(state);
        self.waiting.wake_by_ref_all();
        Poll::Ready(end)
    }
}

/// The wakers of every wait that is still pending.
#[derive(Default)]
struct Waiting(Mutex<Vec<Waker>>);

impl Waiting {
    fn add(&self, waker: &Waker) {
        let mut wakers = lock(&self.0);
        if !wakers.iter().any(|known| known.will_wake(waker)) {
            wakers.push(waker.clone());
        }
    }

    fn wake_by_ref_all(&self) {
        let wakers = std::mem::take(&mut *lock(&self.0));
        for waker in wakers {
            waker.wake();
        }
    }
}

impl Wake for Waiting {
    fn wake(self: Arc<Self>) {
        self.wake_by_ref_all();
    }

    fn wake_by_ref(self: &Arc<Self>) {
        self.wake_by_ref_all();
    }
}

/// The lines of stdout. Once the child has ended, stdout gets [`STDOUT_GRACE`] to reach its end
/// (a grandchild may still hold it) before the whole group is killed, which closes it.
fn stdout_lines(
    stdout: ChildStdout,
    shared: Arc<Shared>,
) -> stream::Boxed<Result<String, ProcessFailure>> {
    let watchdog: future::Boxed<()> = {
        let shared = Arc::clone(&shared);
        Box::pin(async move {
            _ = future::poll_fn(|cx| shared.poll_exit(cx)).await;
            async_io::Timer::after(STDOUT_GRACE).await;
            shared.destroy_forcibly();
            future::pending::<()>().await;
        })
    };
    let reading = Reading {
        reader: BufReader::new(stdout),
        watchdog,
        shared,
    };
    stream::unfold(Some(reading), |reading| async move {
        let mut reading = reading?;
        match reading.next_line().await {
            Ok(Some(line)) => Some((Ok(line), Some(reading))),
            Err(kind) => Some((Err(ProcessFailure::Io(kind)), None)),
            Ok(None) => {
                let shared = &reading.shared;
                match future::poll_fn(|cx| shared.poll_exit(cx)).await {
                    Ok(0) => None,
                    Ok(code) => Some((Err(ProcessFailure::Exit(code)), None)),
                    Err(kind) => Some((Err(ProcessFailure::Io(kind)), None)),
                }
            }
        }
    })
    .boxed()
}

struct Reading {
    reader: BufReader<ChildStdout>,
    // Never ends; polled with every read so that the grace runs while a read waits.
    watchdog: future::Boxed<()>,
    shared: Arc<Shared>,
}

impl Reading {
    /// The next line, or `None` at the end of stdout. A line ends at `\n` only, and one `\r`
    /// before it is dropped. Kotlin's `readLine` also ends a line at a lone `\r`; stream-json
    /// never writes a raw `\r` inside a line, so it is not done here.
    async fn next_line(&mut self) -> Result<Option<String>, io::ErrorKind> {
        let mut bytes = Vec::new();
        let reader = &mut self.reader;
        let watchdog = &mut self.watchdog;
        let read = future::or(reader.read_until(b'\n', &mut bytes), async {
            watchdog.await;
            Ok(0)
        })
        .await
        .map_err(|error| error.kind())?;
        if read == 0 {
            return Ok(None);
        }
        if bytes.last() == Some(&b'\n') {
            bytes.pop();
        }
        if bytes.last() == Some(&b'\r') {
            bytes.pop();
        }
        Ok(Some(match String::from_utf8(bytes) {
            Ok(line) => line,
            Err(bad) => String::from_utf8_lossy(bad.as_bytes()).into_owned(),
        }))
    }
}

/// Reads stderr to its end and throws it away. A read error ends it quietly: stderr is not
/// protocol, so it must not turn a clean end into a failure.
async fn drain(mut stderr: ChildStderr) {
    let mut buffer = vec![0; 8192];
    while let Ok(read) = stderr.read(&mut buffer).await {
        if read == 0 {
            break;
        }
    }
}
