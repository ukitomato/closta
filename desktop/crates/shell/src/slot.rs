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
}

/// What the list of slots shows for one.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SlotMark {
    Starting,
    Working,
    Ready,
    Ended,
    Failed,
    Closed,
}

/// The mark of a slot in `status` whose thread is `running` and which is `waiting` on an
/// approval: a running session works while its turn runs and no approval waits.
pub fn mark_of(status: &SessionStatus, running: bool, waiting: bool) -> SlotMark {
    match status {
        SessionStatus::Starting => SlotMark::Starting,
        SessionStatus::Running { .. } if running && !waiting => SlotMark::Working,
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
}

#[cfg(test)]
mod tests {
    use super::SlotId;

    #[test]
    fn a_slot_id_shows_as_its_number() {
        assert_eq!(SlotId(7).to_string(), "7");
    }
}
