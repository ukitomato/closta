//! The Windows side of a child: a Job Object of its own, killed as a whole. The only module of
//! this crate with `unsafe`.
//!
//! The job is made and the child put in it right after the child starts; until then the child
//! is outside it. `claude` takes far longer to start its own children than this takes, so the
//! window is accepted rather than starting the child suspended.
//!
//! The job is `KILL_ON_JOB_CLOSE`: when its last handle closes (this process drops it, or this
//! process dies and the OS closes it), what is still in it is killed. Only the child's job is
//! one; this process is never put in a job, so what it opens otherwise outlives it as usual.

#![allow(unsafe_code)]

use std::io;
use std::os::windows::io::AsRawHandle;
use std::os::windows::process::CommandExt;
use std::process::ExitStatus;

use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
    SetInformationJobObject, TerminateJobObject,
};
use windows::core::PCWSTR;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The exit code a terminated job gives its processes, as `TerminateProcess` from the JDK's
/// `destroyForcibly` does.
const KILLED_EXIT_CODE: u32 = 1;

/// What the child's descendants are killed through.
pub(super) type Tree = Job;

/// Starts the child without a console window.
pub(super) fn configure(command: &mut std::process::Command) {
    command.creation_flags(CREATE_NO_WINDOW);
}

/// Puts the just-started child in a job of its own. A child that has already ended cannot join
/// one; it keeps the empty job and goes on, so that its exit code and output are still read
/// (a `claude.exe` that fails at once is an exit, not a failure to start).
pub(super) fn contain(child: &mut async_process::Child) -> io::Result<Job> {
    let job = Job::new()?;
    match job.assign(child) {
        Ok(()) => Ok(job),
        Err(_) if matches!(child.try_status(), Ok(Some(_))) => Ok(job),
        Err(error) => Err(error),
    }
}

/// Kills the child and everything it started that is still in its job.
pub(super) fn kill_tree(job: &Job, _child: &mut async_process::Child) {
    job.terminate();
}

pub(super) fn exit_code(status: ExitStatus) -> i32 {
    status.code().unwrap_or(-1)
}

/// A Job Object holding one child and its descendants. Dropping it closes the handle, which kills
/// whatever is still in the job.
pub(crate) struct Job(HANDLE);

// SAFETY: a job handle is a kernel handle, usable from any thread. `Job` owns it alone and only
// passes it to calls that take a shared handle (terminate) or end its life (close, in `Drop`).
unsafe impl Send for Job {}
// SAFETY: as for `Send`; `TerminateJobObject` may be called on one handle from several threads,
// and `Drop`'s `CloseHandle` takes `&mut self`, so it never runs while a `terminate` does.
unsafe impl Sync for Job {}

impl Job {
    /// A new, empty `KILL_ON_JOB_CLOSE` job. On failure the job, if made, is closed.
    pub(crate) fn new() -> io::Result<Job> {
        // SAFETY: no security attributes and no name; the handle returned is owned by `job`
        // from here on, which closes it on every path.
        let handle = unsafe { CreateJobObjectW(None, PCWSTR::null()) }.map_err(io::Error::from)?;
        let job = Job(handle);
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let size = u32::try_from(size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>())
            .map_err(|_| io::Error::from(io::ErrorKind::InvalidInput))?;
        // SAFETY: the pointer is to `limits`, alive for the call, of the type the class names
        // and of the size given; the call only reads it.
        unsafe {
            SetInformationJobObject(
                job.0,
                JobObjectExtendedLimitInformation,
                (&raw const limits).cast(),
                size,
            )
        }
        .map_err(io::Error::from)?;
        Ok(job)
    }

    /// Puts `child` in this job, and with it whatever `child` starts from now on.
    pub(crate) fn assign(&self, child: &async_process::Child) -> io::Result<()> {
        let process = HANDLE(child.as_raw_handle());
        // SAFETY: `child` is borrowed for the call, so its process handle is open; the job
        // handle is ours and open.
        unsafe { AssignProcessToJobObject(self.0, process) }.map_err(io::Error::from)
    }

    /// Kills every process in the job. Does nothing more once they are gone; may be called any
    /// number of times.
    pub(crate) fn terminate(&self) {
        // SAFETY: the handle is ours and open until `Drop`. A failure (the job already empty)
        // leaves nothing to do.
        _ = unsafe { TerminateJobObject(self.0, KILLED_EXIT_CODE) };
    }
}

impl Drop for Job {
    fn drop(&mut self) {
        // SAFETY: the handle is ours, open, and closed only here, once.
        _ = unsafe { CloseHandle(self.0) };
    }
}
