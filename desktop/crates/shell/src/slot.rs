//! One slot of the shell: the session it holds, how it is launched, and the mark it shows.

use std::fmt;
use std::sync::Arc;

use closta_session::launch::SessionLaunchPlanner;
use closta_session::runtime::SessionRuntime;
use closta_session::status::SessionStatus;
use futures_lite::future;

/// A slot's id, given by the shell from 1 in the order the slots are opened. It stays when the
/// slot's session is replaced.
#[derive(Copy, Clone, PartialEq, Eq, Hash, Ord, PartialOrd, Debug)]
pub struct SlotId(pub(crate) u64);

impl SlotId {
    /// The id of slot number `n`, for what is built without a shell (tests and budgets).
    pub fn numbered(n: u64) -> SlotId {
        SlotId(n)
    }
}

/// The number, as a part's id on the screen names the slot (`slot-1`).
impl fmt::Display for SlotId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Runs a future in the background: the platform's executor, or a test's.
pub type Spawn = Arc<dyn Fn(future::Boxed<()>) + Send + Sync>;

/// Work that runs beside a session with its handle, on the same [`Spawn`].
pub type Companion = Box<dyn FnOnce(SessionRuntime) -> future::Boxed<()> + Send>;

/// Builds the launch that replaces a slot's session: a Restart starts the same folder again.
pub type Relaunch = Arc<dyn Fn() -> SlotLaunch + Send + Sync>;

/// What a slot's session is started with.
pub struct SlotLaunch {
    pub title: String,
    pub planner: Arc<dyn SessionLaunchPlanner>,
    /// The folder the CLI runs in; `None` is the project's root.
    pub working_directory: Option<String>,
    pub companion: Option<Companion>,
    /// How to make this launch again; `None` leaves the slot without a Restart.
    pub relaunch: Option<Relaunch>,
    /// Whether the session is meant to fail: it counts as settled only once it has failed, not
    /// while it passes through running.
    pub settles_on_failure: bool,
}

/// What the list of slots shows for one.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SlotMark {
    Starting,
    Working,
    Waiting,
    Ready,
    Ended,
    Failed,
    Closed,
}

/// The mark of a slot in `status` whose thread is `running` and which is `waiting` on an
/// approval: a running session waits while an approval waits, and works while its turn runs
/// with none.
pub fn mark_of(status: &SessionStatus, running: bool, waiting: bool) -> SlotMark {
    match status {
        SessionStatus::Starting => SlotMark::Starting,
        SessionStatus::Running { .. } if waiting => SlotMark::Waiting,
        SessionStatus::Running { .. } if running => SlotMark::Working,
        SessionStatus::Running { .. } => SlotMark::Ready,
        SessionStatus::Ended => SlotMark::Ended,
        SessionStatus::Failed(_) => SlotMark::Failed,
        SessionStatus::Closed => SlotMark::Closed,
    }
}

/// One line of the list of slots.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct SlotSummary {
    pub id: SlotId,
    pub title: String,
    pub mark: SlotMark,
    /// Whether the slot is being closed: its session was told to end and its run has not
    /// returned.
    pub closing: bool,
}

/// How many slots may hold a live session at once.
pub const MAX_LIVE_SLOTS: usize = 8;

/// Whether a session in `status` counts against [`MAX_LIVE_SLOTS`]: one that has not ended.
pub fn counts_as_live(status: &SessionStatus) -> bool {
    matches!(
        status,
        SessionStatus::Starting | SessionStatus::Running { .. }
    )
}

#[cfg(test)]
mod tests {
    use closta_session::status::SessionStatus;

    use super::{SlotId, SlotMark, mark_of};

    #[test]
    fn a_running_slot_that_waits_is_marked_waiting() {
        let running = SessionStatus::Running {
            version: "2.1.282".into(),
        };
        assert_eq!(mark_of(&running, false, true), SlotMark::Waiting);
        assert_eq!(mark_of(&running, true, true), SlotMark::Waiting);
        assert_eq!(mark_of(&running, true, false), SlotMark::Working);
        assert_eq!(mark_of(&running, false, false), SlotMark::Ready);
    }

    #[test]
    fn a_slot_id_shows_as_its_number() {
        assert_eq!(SlotId(7).to_string(), "7");
    }
}
