//! One slot of the shell: the session it holds, how it is launched, and the mark it shows.

use std::fmt;
use std::sync::Arc;

use crate::copy;
use crate::elapsed::elapsed_text;
use crate::projects::ProjectKey;
use closta_core::ports::SavedSessions;
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

/// What opens a session as a saved one put back: where its earlier conversation is read from,
/// and the title the list shows for it.
#[derive(Clone)]
pub struct SlotResume {
    pub saved: Arc<dyn SavedSessions>,
    pub saved_title: Option<String>,
}

/// The title is a saved conversation's: `Debug` gives its length only.
impl fmt::Debug for SlotResume {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SlotResume")
            .field(
                "saved_title_len",
                &self.saved_title.as_ref().map(String::len),
            )
            .finish()
    }
}

/// What a slot's session is started with.
pub struct SlotLaunch {
    pub title: String,
    pub planner: Arc<dyn SessionLaunchPlanner>,
    /// The folder the CLI runs in; `None` is the project's root.
    pub working_directory: Option<String>,
    pub companion: Option<Companion>,
    /// How to make this launch again; `None` leaves the slot without a Restart.
    pub relaunch: Option<Relaunch>,
    /// The folder of the project the session belongs to; `None` is no project.
    pub project: Option<String>,
    /// Whether the session is meant to fail: it counts as settled only once it has failed, not
    /// while it passes through running.
    pub settles_on_failure: bool,
    /// The session's id; `None` is a new one.
    pub session_id: Option<String>,
    /// Opens the saved session of `session_id` instead of a new conversation; `None` is new.
    pub resume: Option<SlotResume>,
}

/// What the list of slots shows for one.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SlotMark {
    Starting,
    Working,
    Waiting,
    Ready,
    /// A turn ended while the slot was not shown, and it has not been shown since.
    Unread,
    Ended,
    Failed,
    Closed,
}

/// The mark of a slot in `status` whose thread is `running`, which is `waiting` on an approval
/// and whose last turn ended `unread`: a running session waits while an approval waits, works
/// while its turn runs with none, and is unread when idle with a turn nobody saw end.
pub fn mark_of(status: &SessionStatus, running: bool, waiting: bool, unread: bool) -> SlotMark {
    match status {
        SessionStatus::Starting => SlotMark::Starting,
        SessionStatus::Running { .. } if waiting => SlotMark::Waiting,
        SessionStatus::Running { .. } if running => SlotMark::Working,
        SessionStatus::Running { .. } if unread => SlotMark::Unread,
        SessionStatus::Running { .. } => SlotMark::Ready,
        SessionStatus::Ended => SlotMark::Ended,
        SessionStatus::Failed(_) => SlotMark::Failed,
        SessionStatus::Closed => SlotMark::Closed,
    }
}

/// One line of the list of slots.
#[derive(Clone, PartialEq, Eq)]
pub struct SlotSummary {
    pub id: SlotId,
    pub title: String,
    pub mark: SlotMark,
    /// Whether the slot is being closed: its session was told to end and its run has not
    /// returned.
    pub closing: bool,
    /// The project the slot is listed in; `None` is no project.
    pub project: Option<ProjectKey>,
    /// When the slot came under its heading; `None` while the shell has not seen it come.
    pub since_ms: Option<i64>,
    /// Whether a Restart is on offer.
    pub can_restart: bool,
    /// Whether the session's id can be copied: the session ended or failed.
    pub can_copy_id: bool,
}

/// The title is the user's first request and the project is a folder: `Debug` gives the title's
/// length and whether there is a project.
impl fmt::Debug for SlotSummary {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SlotSummary")
            .field("id", &self.id)
            .field("title_len", &self.title.len())
            .field("mark", &self.mark)
            .field("closing", &self.closing)
            .field("in_project", &self.project.is_some())
            .field("since_ms", &self.since_ms)
            .field("can_restart", &self.can_restart)
            .field("can_copy_id", &self.can_copy_id)
            .finish()
    }
}

/// The text of the elapsed-time column of a row: `"new"` for an unread slot, else the time since
/// the slot came under its heading; `None` while that is not known.
pub fn slot_elapsed(summary: &SlotSummary, now_ms: i64) -> Option<String> {
    if summary.mark == SlotMark::Unread {
        return Some(copy::ELAPSED_NEW.to_owned());
    }
    summary.since_ms.map(|since| elapsed_text(since, now_ms))
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

    use super::{SlotId, SlotMark, SlotSummary, mark_of};

    #[test]
    fn a_running_slot_that_waits_is_marked_waiting() {
        let running = SessionStatus::Running {
            version: "2.1.282".into(),
        };
        assert_eq!(mark_of(&running, false, true, false), SlotMark::Waiting);
        assert_eq!(mark_of(&running, true, true, false), SlotMark::Waiting);
        assert_eq!(mark_of(&running, true, false, false), SlotMark::Working);
        assert_eq!(mark_of(&running, false, false, false), SlotMark::Ready);
    }

    #[test]
    fn a_running_slot_whose_turn_ended_unseen_is_unread() {
        let running = SessionStatus::Running {
            version: "2.1.282".into(),
        };
        assert_eq!(mark_of(&running, false, false, true), SlotMark::Unread);
        assert_eq!(mark_of(&running, false, true, true), SlotMark::Waiting);
        assert_eq!(mark_of(&running, true, false, true), SlotMark::Working);
        assert_eq!(
            mark_of(&SessionStatus::Ended, false, false, true),
            SlotMark::Ended
        );
    }

    #[test]
    fn a_summary_shows_no_title_or_project_in_debug() {
        let summary = SlotSummary {
            id: SlotId(2),
            title: "Rotate the secret token".to_owned(),
            mark: SlotMark::Ready,
            closing: false,
            project: crate::projects::project_key(r"C:\work\hidden-project"),
            since_ms: Some(5),
            can_restart: false,
            can_copy_id: false,
        };
        let text = format!("{summary:?}");
        assert!(text.contains("title_len: 23"), "{text}");
        assert!(!text.contains("secret"), "{text}");
        assert!(!text.to_lowercase().contains("hidden"), "{text}");
        assert!(!text.contains("work"), "{text}");
    }

    #[test]
    fn a_slot_id_shows_as_its_number() {
        assert_eq!(SlotId(7).to_string(), "7");
    }
}
