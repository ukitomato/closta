//! The Unix side of a child: its own process group, killed as a whole.

use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::process::ExitStatus;

use rustix::process::{self, Pid, Signal};

/// Puts the child in a new process group whose id is its pid, so that its descendants can be
/// killed with it.
pub(super) fn configure(command: &mut std::process::Command) {
    command.process_group(0);
}

/// Sends `SIGKILL` to the child's group, but only while the group surely is the child's: the
/// child is not reaped yet (its pid, and so the group id, cannot be reused), or someone is still
/// in the group (a group id stays taken while it has members). A signal to an empty group after
/// the reap could reach whoever took the number later.
pub(super) fn kill_tree(child: &mut async_process::Child) {
    let Some(group) = i32::try_from(child.id()).ok().and_then(Pid::from_raw) else {
        return;
    };
    let unreaped = matches!(child.try_status(), Ok(None));
    if unreaped || process::test_kill_process_group(group).is_ok() {
        _ = process::kill_process_group(group, Signal::KILL);
    }
}

/// The exit code, or `128 + the signal` for a process a signal ended (as the JDK reports it).
pub(super) fn exit_code(status: ExitStatus) -> i32 {
    status
        .code()
        .or_else(|| status.signal().map(|signal| 128 + signal))
        .unwrap_or(-1)
}
