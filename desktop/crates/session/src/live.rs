//! The processes one session has created and not yet let go. LiveProcesses.kt.
//!
//! In Rust the owner's `Drop` kills its child, so the list is only the way to stop every
//! process at once from another thread than the session's ([`LiveProcesses::destroy_all`]). It
//! holds each process weakly; [`Tracked`] owns it.

use std::io;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError, Weak};

use closta_providers::claude::process::{AgentProcess, ProcessFailure};
use futures_lite::{future, stream};

#[derive(Default)]
struct List {
    closed: bool,
    held: Vec<Weak<dyn AgentProcess>>,
}

/// The processes a session has started and still owns, as the way to kill each at once.
#[derive(Default)]
pub(crate) struct LiveProcesses {
    list: Mutex<List>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

impl LiveProcesses {
    /// Wraps `process` and holds it weakly; [`LiveProcesses::destroy_all`] kills it while it
    /// lives. After `destroy_all` the process is killed at once, so none can slip in behind it.
    pub(crate) fn track(&self, mut process: Box<dyn AgentProcess>) -> Tracked {
        let stdout = Mutex::new(process.take_stdout_lines());
        let stderr = Mutex::new(process.take_stderr_drain());
        let inner: Arc<dyn AgentProcess> = Arc::from(process);
        let closed = {
            let mut list = lock(&self.list);
            list.held.retain(|held| held.strong_count() > 0);
            list.held.push(Arc::downgrade(&inner));
            list.closed
        };
        if closed {
            inner.destroy_forcibly();
        }
        Tracked {
            inner,
            stdout,
            stderr,
        }
    }

    /// Kills every process still alive, and every process tracked from now on.
    pub(crate) fn destroy_all(&self) {
        let held = {
            let mut list = lock(&self.list);
            list.closed = true;
            std::mem::take(&mut list.held)
        };
        // Killed outside the lock: a kill may take a while on Windows.
        for process in held.iter().filter_map(Weak::upgrade) {
            process.destroy_forcibly();
        }
    }

    #[cfg(test)]
    fn held(&self) -> usize {
        lock(&self.list).held.len()
    }
}

/// A process the list knows of. Its stdout and stderr are taken when it is wrapped and handed
/// out from here; everything else goes to the process inside. Dropping it kills the process.
pub(crate) struct Tracked {
    inner: Arc<dyn AgentProcess>,
    // Behind a mutex only so that the wrapper is `Sync`; taking them needs `&mut self`.
    stdout: Mutex<Option<stream::Boxed<Result<String, ProcessFailure>>>>,
    stderr: Mutex<Option<future::Boxed<()>>>,
}

impl Tracked {
    /// The process inside, for waiting on and destroying it while closing. It is killed when
    /// this wrapper drops, however many handles are left.
    pub(crate) fn handle(&self) -> Arc<dyn AgentProcess> {
        Arc::clone(&self.inner)
    }
}

impl AgentProcess for Tracked {
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
        self.inner.write_stdin(line)
    }

    fn wait(&self) -> future::Boxed<io::Result<i32>> {
        self.inner.wait()
    }

    fn destroy(&self) {
        self.inner.destroy();
    }

    fn destroy_forcibly(&self) {
        self.inner.destroy_forcibly();
    }

    fn id(&self) -> Option<u32> {
        self.inner.id()
    }
}

impl Drop for Tracked {
    fn drop(&mut self) {
        self.inner.destroy_forcibly();
    }
}

#[cfg(test)]
mod tests {
    use closta_providers::claude::fake::live::{LiveOptions, LiveProcess};
    use futures_lite::StreamExt;

    use super::*;

    fn live() -> (
        Box<dyn AgentProcess>,
        closta_providers::claude::fake::live::LiveControl,
    ) {
        let (process, control) = LiveProcess::new(LiveOptions::default());
        (Box::new(process), control)
    }

    #[test]
    fn the_process_list_destroys_what_it_holds_and_at_once_what_arrives_after_it_closed() {
        let live_processes = LiveProcesses::default();
        let (process, early) = live();
        let _early = live_processes.track(process);
        live_processes.destroy_all();
        assert_eq!(early.force_kills(), 1);
        assert!(early.ended());

        let (process, late) = live();
        let _late = live_processes.track(process);
        assert_eq!(late.force_kills(), 1);
        assert!(late.ended());
    }

    #[test]
    fn the_process_list_lets_go_of_what_was_dropped() {
        let live_processes = LiveProcesses::default();
        let (process, first) = live();
        drop(live_processes.track(process));
        assert!(first.ended());
        let (process, second) = live();
        let _tracked = live_processes.track(process);
        assert_eq!(live_processes.held(), 1);
        // Destroying all skips the one that is gone and kills the one that lives.
        live_processes.destroy_all();
        assert_eq!(first.force_kills(), 1);
        assert_eq!(second.force_kills(), 1);
    }

    #[test]
    fn a_tracked_process_is_killed_when_dropped_and_its_handle_still_waits() {
        let live_processes = LiveProcesses::default();
        let (process, control) = live();
        let mut tracked = live_processes.track(process);
        let mut stdout = tracked.take_stdout_lines().expect("stdout once");
        assert!(tracked.take_stdout_lines().is_none());
        let stderr = tracked.take_stderr_drain().expect("stderr once");
        assert!(tracked.take_stderr_drain().is_none());

        smol::block_on(tracked.write_stdin("hello".into())).expect("written");
        assert_eq!(control.stdin_lines(), ["hello"]);
        control.emit("line");

        let handle = tracked.handle();
        drop(tracked);
        assert!(control.ended());
        assert_eq!(control.force_kills(), 1);
        assert_eq!(smol::block_on(handle.wait()).expect("waited"), 137);

        smol::block_on(async {
            assert_eq!(stdout.next().await, Some(Ok("line".to_owned())));
            assert_eq!(stdout.next().await, Some(Err(ProcessFailure::Exit(137))));
            stderr.await;
        });
    }

    #[test]
    fn a_tracked_process_passes_destroy_to_the_process_inside() {
        let live_processes = LiveProcesses::default();
        let (process, control) = live();
        let tracked = live_processes.track(process);
        tracked.destroy();
        assert!(control.destroyed());
        assert_eq!(smol::block_on(tracked.wait()).expect("waited"), 0);
        assert_eq!(tracked.id(), None);
        drop(tracked);
        // The process had ended, so the kill on drop finds nothing to kill.
        assert_eq!(control.force_kills(), 0);
    }
}
