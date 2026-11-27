//! What the window holds: the open slots and their rows, the selected slot, the panes, and
//! which rows were opened or closed by hand.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, UNIX_EPOCH};

use async_channel::Receiver;
use closta_presenter::cards::decisions::offers_destination;
use closta_presenter::cards::plan::plan_go_of;
use closta_presenter::cards::{SUGGESTION_DESTINATIONS, ThreadCard, card_of};
use closta_presenter::composer_state::{PERMISSION_MODES, composer_state};
use closta_presenter::rows::{ThreadRow, ThreadRows};
use closta_presenter::session::SessionView;
use closta_presenter::sessions::groups::{
    SessionAlert, TITLE_MAX, alerts_between, session_summary, session_title, waiting_alerts,
};
use closta_presenter::sessions::window::{GroupSince, group_since_after};
use closta_presenter::text::take_utf16;
use closta_presenter::thread_running::thread_is_running;
use closta_session::history::{SavedListing, SessionOpening};
use closta_session::log::SessionLog;
use closta_session::runtime::{SessionConfig, SessionRuntime};
use closta_session::status::SessionStatus;
use futures_lite::future;

use crate::cards::{CardState, Reply, verdict};
use crate::closing::{CloseQuestion, CloseRun, CloseStage};
use crate::composer::Composer;
use crate::copy;
use crate::header::AppHeader;
use crate::nav::NavItem;
use crate::needs_you::{
    NeedsYouRow, SlotNeeds, attention, card_accepts, jump_target, list_accepts, needs_you_rows,
};
use crate::new_session::{
    LaunchChecks, NewSessionDialog, PlannerFor, Problem, RecentFolders, Runtime, SavedFor,
    default_folder, launch_in, quick_problem, runtime_of,
};
use crate::panes::{Pane, Panes};
use crate::projects::{Project, ProjectKey};
use crate::resume::{ResumeListing, ResumePicker};
use crate::rows::{RowChange, row_changes};
use crate::settings::{Settings, SettingsSink};
use crate::slot::{
    MAX_LIVE_SLOTS, Relaunch, SlotId, SlotLaunch, SlotResume, SlotSummary, Spawn, counts_as_live,
    mark_of, restart_offered,
};
use crate::watch::SlotWatch;

mod cards;
mod closing;
mod nav;
mod needs_you;
mod new_in_project;
mod overlays;
mod projects;
mod resume;

pub use new_in_project::ProjectCheck;
pub use projects::ProjectSummary;

/// The mode that runs every tool without asking.
pub const BYPASS_MODE: &str = "bypassPermissions";

/// What a click or a key asks of the shell.
#[derive(Clone, PartialEq, Debug)]
pub enum ShellAction {
    Select(SlotId),
    TogglePane(Pane),
    ResizePane {
        pane: Pane,
        width: f32,
    },
    ToggleRow {
        slot: SlotId,
        key: String,
    },
    Send {
        slot: SlotId,
    },
    Interrupt {
        slot: SlotId,
    },
    EditDraft {
        slot: SlotId,
        text: String,
    },
    HistoryPrev {
        slot: SlotId,
    },
    HistoryNext {
        slot: SlotId,
    },
    Restart {
        slot: SlotId,
    },
    OpenNewSession,
    /// The dialog, with the folder of the selected slot's project in its field.
    OpenNewSessionHere,
    EditFolder {
        text: String,
    },
    CancelNewSession,
    StartSession {
        folder: String,
    },
    FolderChecked {
        folder: String,
        exists: bool,
    },
    /// The project's plus: starts a session in its folder once the folder is found.
    NewInProject {
        project: ProjectKey,
    },
    /// The answer of the check a plus began.
    ProjectChecked {
        project: ProjectKey,
        exists: bool,
    },
    RequestClose,
    ConfirmClose,
    CancelClose,
    CloseSlot {
        slot: SlotId,
    },
    ConfirmCloseSlot,
    CancelCloseSlot,
    CardShown {
        slot: SlotId,
        request_id: String,
        now_ms: i64,
    },
    /// The needs-you list drew the slot's row, showing `request_id`, as its `index`th row.
    ListShown {
        slot: SlotId,
        request_id: String,
        index: usize,
        now_ms: i64,
    },
    /// Answers the card with its `index`th button, if the card was drawn half a second ago.
    ChooseCard {
        slot: SlotId,
        request_id: String,
        index: usize,
        now_ms: i64,
    },
    DenyCard {
        slot: SlotId,
        request_id: String,
        now_ms: i64,
    },
    OpenNote {
        slot: SlotId,
        request_id: String,
    },
    CloseNote {
        slot: SlotId,
        request_id: String,
    },
    /// `text` is the user's: this action is never logged.
    EditNote {
        slot: SlotId,
        request_id: String,
        text: String,
    },
    SendNote {
        slot: SlotId,
        request_id: String,
        now_ms: i64,
    },
    PickDestination {
        slot: SlotId,
        request_id: String,
        destination: String,
    },
    ToggleOption {
        slot: SlotId,
        request_id: String,
        question: usize,
        option: usize,
    },
    ToggleOther {
        slot: SlotId,
        request_id: String,
        question: usize,
    },
    /// `text` is the user's: this action is never logged.
    EditOther {
        slot: SlotId,
        request_id: String,
        question: usize,
        text: String,
    },
    AnswerQuestion {
        slot: SlotId,
        request_id: String,
        now_ms: i64,
    },
    /// Allows the request the slot's needs-you row shows, if the row was drawn half a second ago.
    AllowFromList {
        slot: SlotId,
        request_id: String,
        now_ms: i64,
    },
    /// Opens the Deny note of the card the slot's row shows, in the conversation.
    DenyFromList {
        slot: SlotId,
        request_id: String,
    },
    /// Selects the slot and puts the keyboard on its card, or on its failure band.
    OpenFromList {
        slot: SlotId,
    },
    /// Goes to the selected slot's waiting card, else to the next slot that waits.
    JumpToWaiting,
    /// Picks a permission mode; Bypass asks first, the rest switch at once.
    PickMode {
        slot: SlotId,
        mode: String,
    },
    /// Switches to Bypass once the slot's banner asked for it.
    ConfirmBypass {
        slot: SlotId,
    },
    /// Takes the slot's Bypass banner down.
    CancelBypass {
        slot: SlotId,
    },
    /// Opens or closes the project's row in the tree, and saves that.
    ToggleProject {
        project: ProjectKey,
    },
    /// Takes the project off the list once none of its sessions is alive; no file is touched.
    RemoveProject {
        project: ProjectKey,
    },
    /// Hands back the id of the slot's session to copy, once the session has ended or failed.
    CopySessionId {
        slot: SlotId,
    },
    /// Puts the left list's cursor on the selected slot's row and the keyboard on the list.
    NavFocus,
    /// Moves the left list's cursor; it stops at both ends.
    NavMove {
        delta: i32,
    },
    /// Puts the left list's cursor on the row that was clicked.
    NavTo(NavItem),
    /// Opens what the cursor's row stands for: the wait, the session, or the project's fold.
    NavEnter,
    /// Leaves the list for where the selected slot can be used: its input, or the band that
    /// says why it cannot.
    NavLeave,
    /// A session's row goes to its project's row; a project's row closes it.
    NavLeft,
    /// A project's row opens it.
    NavRight,
    /// Opens the resume popup on the project and reads its saved sessions in the background.
    OpenResume {
        project: ProjectKey,
    },
    /// The resume popup, on the project the New Session dialog would take.
    OpenResumeHere,
    /// The answer of the popup's reading `generation`; `None` is a reading that was stopped.
    SavedListed {
        generation: u64,
        listing: Option<SavedListing>,
    },
    /// `text` is the user's: this action is never logged.
    EditResumeQuery {
        text: String,
    },
    /// Moves the popup's pick; it stops at both ends.
    MoveResume {
        delta: i32,
    },
    CloseResume,
    /// Opens the popup's saved session `session_id`, or goes to the slot that holds it.
    PickResume {
        session_id: String,
    },
}

/// The one thing that holds the window's attention; what is behind it takes no answer.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Overlay {
    NewSession,
    CloseWindow,
    CloseSlot,
    Closing,
    Resume,
}

/// Where the keyboard goes once an action is done.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum FocusTarget {
    Composer(SlotId),
    Card {
        slot: SlotId,
        request_id: String,
    },
    CardNote {
        slot: SlotId,
        request_id: String,
    },
    FailureBand(SlotId),
    /// The left list.
    Nav,
    /// The "Session ended" band: its Restart, or the band itself without one.
    EndedBand(SlotId),
}

/// What the machine is asked: the checks of the New Session dialog, the planner a folder
/// starts with, and where the list of projects is kept.
#[derive(Clone)]
pub struct Ports {
    pub checks: Arc<dyn LaunchChecks>,
    pub planner_for: Arc<dyn PlannerFor>,
    pub settings: Arc<dyn SettingsSink>,
    pub saved_for: Arc<dyn SavedFor>,
}

/// A folder to look for in the background; its answer comes back as `FolderChecked`.
pub struct FolderCheck {
    pub folder: String,
    pub exists: future::Boxed<bool>,
}

/// What an action changed, for the screen to carry out.
#[derive(Default)]
pub struct Acted {
    /// The slot whose rows changed by hand, and how.
    pub rows: Option<(SlotId, Vec<RowChange>)>,
    /// The slot whose input is to be filled again from [`ShellState::draft`].
    pub draft: Option<SlotId>,
    /// The slot whose session started anew: its scroller is to be made and awaited again.
    pub started: Option<SlotId>,
    /// A folder to look for.
    pub check: Option<FolderCheck>,
    /// A project's folder to look for before a session starts in it.
    pub project_check: Option<ProjectCheck>,
    /// The dialog's folder field is to be filled again from the dialog.
    pub folder: bool,
    /// The steps that close the window are to run.
    pub close: bool,
    /// The slots that were closed or ended and are gone.
    pub removed: Vec<SlotId>,
    /// The text to put on the clipboard.
    pub clipboard: Option<String>,
    /// Where the keyboard is to go.
    pub focus: Option<FocusTarget>,
    /// The resume popup's reading, to run in the background.
    pub listing: Option<ResumeListing>,
}

/// What the composer's second line shows of the session.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ComposerLine {
    pub mode: Option<String>,
    pub model: String,
    /// Whether a model, mode, effort or sandbox switch waits for the CLI's answer.
    pub switching: bool,
}

/// Where a slot's session is after a refresh, and how its rows changed.
#[derive(Clone, PartialEq, Debug)]
pub struct Refresh {
    pub status: SessionStatus,
    /// Whether the session runs and its turn runs with no approval waiting.
    pub running: bool,
    /// Whether an approval waits.
    pub waiting: bool,
    pub changes: Vec<RowChange>,
    /// The ids of the requests that began to wait; a finished turn is not one.
    pub raised: Vec<String>,
    /// Whether something new waits or the session just failed.
    pub attention: bool,
    /// Whether the slot was being closed and its run has returned: it is gone.
    pub removed: bool,
}

/// One slot: its current session and what the last refresh read of it.
struct Slot {
    /// The title the slot was started with.
    title: String,
    /// The first request of the conversation as of the last refresh, once there is one.
    asked_title: Option<String>,
    /// The id of the session the slot holds.
    session_id: String,
    /// Whether the session puts a saved one back.
    resumed: bool,
    /// The title of the saved conversation a resumed session was opened from.
    saved_title: Option<String>,
    /// The project the slot is listed in; `None` is no project.
    project: Option<ProjectKey>,
    runtime: SessionRuntime,
    finished: Receiver<()>,
    /// How many times the session was replaced.
    generation: u64,
    builder: ThreadRows,
    rows: Vec<ThreadRow>,
    status: SessionStatus,
    running: bool,
    waiting: bool,
    /// The tools the pending approvals wait on, as of the last refresh; empty unless live.
    waiting_tools: HashSet<String>,
    /// The keys of the rows opened or closed against their default.
    flipped: HashSet<String>,
    /// The draft, its history and the reason it was not sent; they outlive the session.
    composer: Composer,
    /// How to start the same session again; `None` leaves no Restart.
    relaunch: Option<Relaunch>,
    settles_on_failure: bool,
    working_directory: Option<String>,
    line: Option<ComposerLine>,
    compacting: bool,
    /// The view the last refresh read; `None` before the first and after a replace.
    last: Option<SessionView>,
    /// What a running session waits for, in arrival order, with when each was first seen.
    waits: Vec<(SessionAlert, i64)>,
    /// When the session was first seen failed.
    failed_since: Option<i64>,
    /// Whether the session was told to end and the slot goes once its run has returned.
    closing: bool,
    /// What is kept of each waiting card, by request id.
    cards: HashMap<String, CardState>,
    /// Whether the Bypass banner is up: Bypass is entered only by confirming it.
    bypass_asking: bool,
    /// Whether a mode switch was written since the last refresh, which has not seen it yet.
    mode_sent: bool,
    /// Whether a turn ended while the slot was not shown, and it has not been shown since.
    unread: bool,
    /// When the slot came under its heading, as of the last refresh.
    since: Option<GroupSince>,
}

impl Slot {
    /// The title the list shows, cut to the length of a session's name.
    fn shown_title(&self) -> String {
        let title = self
            .saved_title
            .as_deref()
            .or(self.asked_title.as_deref())
            .unwrap_or(&self.title);
        take_utf16(title, TITLE_MAX).to_owned()
    }

    /// Whether a running session works or waits on an approval; one told to end does neither.
    fn is_working(&self) -> bool {
        !self.closing
            && matches!(self.status, SessionStatus::Running { .. })
            && (self.running || self.waiting)
    }

    fn is_live(&self) -> bool {
        self.closing || counts_as_live(&self.status)
    }
}

/// The runs that have not returned, by run number. A replaced session stays here until its run
/// returns, and a run of the same session id never hides another.
type Runs = Arc<Mutex<BTreeMap<u64, RunEntry>>>;

struct RunEntry {
    session_id: String,
    /// The handle to kill the run's process.
    runtime: SessionRuntime,
    /// Closes when the run has returned.
    finished: Receiver<()>,
}

/// A session [`ShellState::start`] handed to the spawn.
struct Started {
    runtime: SessionRuntime,
    /// Closes once the run has returned.
    finished: Receiver<()>,
    session_id: String,
    /// Whether it puts a saved session back.
    resumed: bool,
    /// The title of that conversation, if the launch gave one.
    saved_title: Option<String>,
}

pub struct ShellState {
    header: AppHeader,
    spawn: Spawn,
    log: Arc<dyn SessionLog>,
    ports: Ports,
    dialog: Option<NewSessionDialog>,
    recent: RecentFolders,
    last_id: u64,
    /// The number of the run last started.
    last_run: u64,
    slots: BTreeMap<SlotId, Slot>,
    selected: Option<SlotId>,
    /// The projects in the order they were made in.
    projects: Vec<Project>,
    /// What the settings writer was last given, or what was restored: a value equal to it is
    /// not written again.
    saved: Option<Settings>,
    /// The project whose plus waits for its folder check; one at a time.
    pending_new: Option<ProjectKey>,
    /// The left list's cursor: its item and the place it last had.
    nav: Option<(NavItem, usize)>,
    panes: Panes,
    runs: Runs,
    closing: CloseStage,
    slot_close: Option<(SlotId, CloseQuestion)>,
    shown_title: Option<String>,
    resume: Option<ResumePicker>,
    /// The number of the resume popup's last reading; it only goes up.
    last_listing: u64,
}

impl ShellState {
    pub fn new(
        header: AppHeader,
        spawn: Spawn,
        log: Arc<dyn SessionLog>,
        ports: Ports,
    ) -> ShellState {
        ShellState {
            header,
            spawn,
            log,
            ports,
            dialog: None,
            recent: RecentFolders::default(),
            last_id: 0,
            last_run: 0,
            slots: BTreeMap::new(),
            selected: None,
            projects: Vec::new(),
            saved: None,
            pending_new: None,
            nav: None,
            panes: Panes::default(),
            runs: Runs::default(),
            closing: CloseStage::Open,
            slot_close: None,
            shown_title: None,
            resume: None,
            last_listing: 0,
        }
    }

    pub fn header(&self) -> &AppHeader {
        &self.header
    }

    /// Opens a slot and starts its session; the first slot opened is selected.
    pub fn open(&mut self, launch: SlotLaunch) -> SlotId {
        self.last_id += 1;
        let id = SlotId(self.last_id);
        let title = launch.title.clone();
        let relaunch = launch.relaunch.clone();
        let settles_on_failure = launch.settles_on_failure;
        let working_directory = launch.working_directory.clone();
        let project = launch
            .project
            .as_deref()
            .and_then(|folder| self.join_project(folder));
        let Started {
            runtime,
            finished,
            session_id,
            resumed,
            saved_title,
        } = self.start(launch);
        self.slots.insert(
            id,
            Slot {
                title,
                asked_title: None,
                session_id,
                resumed,
                saved_title,
                project,
                runtime,
                finished,
                generation: 0,
                builder: ThreadRows::default(),
                rows: Vec::new(),
                status: SessionStatus::Starting,
                running: false,
                waiting: false,
                waiting_tools: HashSet::new(),
                flipped: HashSet::new(),
                composer: Composer::default(),
                relaunch,
                settles_on_failure,
                working_directory,
                line: None,
                compacting: false,
                last: None,
                waits: Vec::new(),
                failed_since: None,
                closing: false,
                cards: HashMap::new(),
                bypass_asking: false,
                mode_sent: false,
                unread: false,
                since: None,
            },
        );
        self.selected.get_or_insert(id);
        self.settle_nav();
        id
    }

    /// Closes the slot's session and starts a new one in its place, in the next generation.
    /// The rows are emptied: the changes that do it are returned. The rows opened by hand, the
    /// selection, the draft and its history stay.
    pub fn replace(&mut self, slot: SlotId, launch: SlotLaunch) -> Option<Vec<RowChange>> {
        // The old runtime stays in `runs` until its run has returned.
        self.slots.get(&slot)?.runtime.close();
        let title = launch.title.clone();
        let relaunch = launch.relaunch.clone();
        let settles_on_failure = launch.settles_on_failure;
        let working_directory = launch.working_directory.clone();
        let started = self.start(launch);
        let held = self.slots.get_mut(&slot)?;
        held.title = title;
        held.asked_title = None;
        held.resumed = started.resumed;
        held.session_id = started.session_id;
        held.saved_title = started.saved_title;
        held.relaunch = relaunch;
        held.settles_on_failure = settles_on_failure;
        held.working_directory = working_directory;
        held.line = None;
        held.compacting = false;
        held.composer.clear_reason();
        held.runtime = started.runtime;
        held.finished = started.finished;
        held.generation += 1;
        held.builder = ThreadRows::default();
        held.status = SessionStatus::Starting;
        held.running = false;
        held.waiting = false;
        held.waiting_tools.clear();
        held.last = None;
        held.waits.clear();
        held.failed_since = None;
        held.cards.clear();
        held.bypass_asking = false;
        held.mode_sent = false;
        held.unread = false;
        held.since = None;
        let emptied = std::mem::take(&mut held.rows).len();
        Some(if emptied == 0 {
            Vec::new()
        } else {
            vec![RowChange::Splice {
                range: 0..emptied,
                count: 0,
            }]
        })
    }

    /// A new session, its run and its companion handed to the spawn.
    fn start(&mut self, launch: SlotLaunch) -> Started {
        let id = launch
            .session_id
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let mut config = SessionConfig::new(
            &id,
            launch.planner,
            launch.working_directory,
            Arc::clone(&self.log),
        );
        let resumed = launch.resume.is_some();
        let mut saved_title = None;
        if let Some(resume) = launch.resume {
            config.opening = SessionOpening::Resume;
            config.saved = Some(resume.saved);
            saved_title = resume.saved_title;
        }
        let (runtime, run) = SessionRuntime::new(config);
        let (done, finished) = async_channel::bounded::<()>(1);
        self.last_run += 1;
        let number = self.last_run;
        lock(&self.runs).insert(
            number,
            RunEntry {
                session_id: id.clone(),
                runtime: runtime.clone(),
                finished: finished.clone(),
            },
        );
        let runs = Arc::clone(&self.runs);
        (self.spawn)(Box::pin(async move {
            run.await;
            lock(&runs).remove(&number);
            drop(done);
        }));
        if let Some(companion) = launch.companion {
            (self.spawn)(companion(runtime.clone()));
        }
        Started {
            runtime,
            finished,
            session_id: id,
            resumed,
            saved_title,
        }
    }

    /// How many runs have not returned, those of replaced sessions included.
    pub fn live_runs(&self) -> usize {
        lock(&self.runs).len()
    }

    /// Whether a run of this session id has not returned.
    pub fn run_alive(&self, session_id: &str) -> bool {
        lock(&self.runs)
            .values()
            .any(|run| run.session_id == session_id)
    }

    /// The slots in the order they were opened.
    pub fn slots(&self) -> Vec<SlotSummary> {
        self.slots
            .iter()
            .map(|(id, slot)| SlotSummary {
                id: *id,
                title: slot.shown_title(),
                mark: mark_of(&slot.status, slot.running, slot.waiting, slot.unread),
                closing: slot.closing,
                project: slot.project.clone(),
                since_ms: slot.since.and_then(|it| it.since_ms),
                can_restart: self.can_restart(*id),
                can_copy_id: self.copyable(*id),
            })
            .collect()
    }

    pub fn selected(&self) -> Option<SlotId> {
        self.selected
    }

    /// The slot's title: the first request as of its last refresh when there is one, else the
    /// title it was started with; `None` for a slot that is not there.
    pub fn slot_title(&self, slot: SlotId) -> Option<String> {
        self.slots.get(&slot).map(Slot::shown_title)
    }

    /// Whether the slot's session puts a saved session back; false for a slot that is not there.
    pub fn resumed(&self, slot: SlotId) -> bool {
        self.slots.get(&slot).is_some_and(|it| it.resumed)
    }

    /// The id of the session the slot holds; `None` for a slot that is not there.
    pub fn session_id(&self, slot: SlotId) -> Option<&str> {
        self.slots.get(&slot).map(|it| it.session_id.as_str())
    }

    /// The slot's rows as of its last refresh; none for a slot that is not there.
    pub fn rows(&self, slot: SlotId) -> &[ThreadRow] {
        self.slots.get(&slot).map_or(&[], |slot| &slot.rows)
    }

    /// The slot's status as of its last refresh.
    pub fn status(&self, slot: SlotId) -> Option<SessionStatus> {
        self.slots.get(&slot).map(|slot| slot.status.clone())
    }

    /// Whether the slot's session and its turn ran with no approval waiting, as of its last
    /// refresh.
    pub fn running(&self, slot: SlotId) -> bool {
        self.slots.get(&slot).is_some_and(|slot| slot.running)
    }

    /// Whether an approval waited, as of the slot's last refresh.
    pub fn waiting(&self, slot: SlotId) -> bool {
        self.slots.get(&slot).is_some_and(|slot| slot.waiting)
    }

    /// The tool calls the slot's pending approvals wait on, as of its last refresh; empty once
    /// the session is no longer live.
    pub fn waiting_tool_ids(&self, slot: SlotId) -> HashSet<String> {
        self.slots
            .get(&slot)
            .map(|slot| slot.waiting_tools.clone())
            .unwrap_or_default()
    }

    /// Whether `row` of the slot is open: a to-do list is open and every other row closed,
    /// unless it was toggled.
    pub fn is_open(&self, slot: SlotId, row: &ThreadRow) -> bool {
        let default = matches!(row, ThreadRow::Todo(_));
        let flipped = self
            .slots
            .get(&slot)
            .is_some_and(|slot| slot.flipped.contains(row.key()));
        default != flipped
    }

    pub fn panes(&self) -> &Panes {
        &self.panes
    }

    /// A watch on the slot's current session.
    pub fn watch(&self, slot: SlotId) -> Option<SlotWatch> {
        let held = self.slots.get(&slot)?;
        Some(SlotWatch::new(
            slot,
            held.generation,
            held.runtime.watch_status(),
            held.runtime.watch_view(),
            held.finished.clone(),
        ))
    }

    /// Reads the slot's current session again, if it is still the one of `generation`, and
    /// returns where it is and how its rows changed.
    pub fn refresh(&mut self, slot: SlotId, generation: u64, now_ms: i64) -> Option<Refresh> {
        let refreshed = self.refresh_inner(slot, generation, now_ms);
        self.settle_nav();
        refreshed
    }

    fn refresh_inner(&mut self, slot: SlotId, generation: u64, now_ms: i64) -> Option<Refresh> {
        let shown = self.selected == Some(slot);
        let held = self.slots.get_mut(&slot)?;
        if held.generation != generation {
            return None;
        }
        let view = held.runtime.view();
        let status = held.runtime.status();
        let rows = held.builder.of(&view.transcript);
        let changes = row_changes(&held.rows, &rows);
        let waiting = !view.conversation.pending_approvals.is_empty();
        // An open turn is never folded closed when the process ends: only a live session runs.
        let live = matches!(status, SessionStatus::Running { .. });
        let running = live && !waiting && thread_is_running(&view.conversation, &view.transcript);
        let waiting_tools = if live {
            view.conversation
                .pending_approvals
                .iter()
                .filter_map(|it| it.tool_use_id.clone())
                .collect()
        } else {
            HashSet::new()
        };
        let composing = composer_state(&view.conversation, &view.transcript);
        held.line = Some(ComposerLine {
            mode: composing.mode,
            model: composing.model.label,
            switching: composing.switching.is_some(),
        });
        held.mode_sent = false;
        held.compacting = view.transcript.operations.compacting;

        let mut change = alerts_between(
            held.last
                .as_ref()
                .map(|it| (&it.conversation, &*it.transcript)),
            (&view.conversation, &*view.transcript),
        );
        if !live {
            // What an ended session left waiting is gone with its process.
            change
                .raised
                .retain(|it| matches!(it, SessionAlert::Finished(_)));
        }
        let finished = change
            .raised
            .iter()
            .any(|it| matches!(it, SessionAlert::Finished(_)));
        held.unread = !shown && (held.unread || finished);
        let raised = change
            .raised
            .iter()
            .filter_map(|it| match it {
                SessionAlert::Permission(alert) => Some(alert.request_id.clone()),
                SessionAlert::OpenOnly(alert) => Some(alert.request_id.clone()),
                SessionAlert::Finished(_) => None,
            })
            .collect();
        let was_failed = matches!(held.status, SessionStatus::Failed(_));
        let failed = matches!(status, SessionStatus::Failed(_));
        let newly_failed = failed && !was_failed;
        let seen: HashMap<String, i64> = held
            .waits
            .iter()
            .filter_map(|(alert, at)| Some((request_of(alert)?.to_owned(), *at)))
            .collect();
        held.waits = if live {
            waiting_alerts(&view.conversation, &view.transcript)
                .into_iter()
                .map(|alert| {
                    let at = request_of(&alert)
                        .and_then(|id| seen.get(id).copied())
                        .unwrap_or(now_ms);
                    (alert, at)
                })
                .collect()
        } else {
            Vec::new()
        };
        held.failed_since = failed.then(|| held.failed_since.unwrap_or(now_ms));
        let waits = &held.waits;
        held.cards.retain(|id, _| {
            waits
                .iter()
                .any(|(alert, _)| request_of(alert) == Some(id.as_str()))
        });
        held.asked_title = session_title(&view.transcript);
        let group = session_summary(&view.conversation, &view.transcript, held.unread).group;
        held.since = Some(group_since_after(held.since.as_ref(), group, now_ms));
        held.last = Some(view);
        held.rows = rows;
        held.status = status.clone();
        held.running = running;
        held.waiting = waiting;
        held.waiting_tools = waiting_tools;
        let removed = held.closing && held.finished.is_closed();
        if removed {
            self.remove(slot);
        }
        Some(Refresh {
            status,
            running,
            waiting,
            changes,
            raised,
            attention: attention(&change, newly_failed),
            removed,
        })
    }

    /// Takes the slot out; the one selected gives way to the first that is left.
    fn remove(&mut self, slot: SlotId) {
        self.slots.remove(&slot);
        if self.selected == Some(slot) {
            self.selected = self.slots.keys().next().copied();
            if let Some(held) = self.selected.and_then(|it| self.slots.get_mut(&it)) {
                held.unread = false;
            }
        }
        if self.slot_close.is_some_and(|(asked, _)| asked == slot) {
            self.slot_close = None;
        }
    }

    /// Whether as many slots as may hold a session do; a slot that is closing still does.
    pub fn slots_full(&self) -> bool {
        self.slots.values().filter(|it| it.is_live()).count() >= MAX_LIVE_SLOTS
    }

    /// Whether the slot's session ended or failed with its run still the slot's own: its id is
    /// of use to resume it elsewhere.
    fn copyable(&self, slot: SlotId) -> bool {
        self.slots.get(&slot).is_some_and(|it| {
            !it.closing && matches!(it.status, SessionStatus::Ended | SessionStatus::Failed(_))
        })
    }

    /// Whether the slot could be restarted but for the limit.
    pub fn restart_blocked(&self, slot: SlotId) -> bool {
        self.restartable(slot) && self.slots_full()
    }

    /// The slot's draft; empty for a slot that is not there.
    pub fn draft(&self, slot: SlotId) -> &str {
        self.slots.get(&slot).map_or("", |it| it.composer.draft())
    }

    /// Whether the slot's input shows a sent message in place of its draft.
    pub fn browsing(&self, slot: SlotId) -> bool {
        self.slots
            .get(&slot)
            .is_some_and(|it| it.composer.browsing())
    }

    /// Why the slot's last send did not go, under its input.
    pub fn composer_reason(&self, slot: SlotId) -> Option<&'static str> {
        self.slots.get(&slot)?.composer.reason()
    }

    /// The mode and model as of the slot's last refresh.
    pub fn composer_line(&self, slot: SlotId) -> Option<ComposerLine> {
        self.slots.get(&slot)?.line.clone()
    }

    /// Whether the CLI says it compacts, as of the slot's last refresh.
    pub fn compacting(&self, slot: SlotId) -> bool {
        self.slots.get(&slot).is_some_and(|it| it.compacting)
    }

    /// The title and hint of the band of a session that failed, as of the slot's last refresh.
    pub fn failure(&self, slot: SlotId) -> Option<(String, Option<String>)> {
        let held = self.slots.get(&slot)?;
        let SessionStatus::Failed(failure) = &held.status else {
            return None;
        };
        let distro =
            held.working_directory
                .as_deref()
                .and_then(|folder| match runtime_of(folder) {
                    Runtime::Wsl { distro } => Some(distro),
                    Runtime::Win32 => None,
                });
        Some(copy::failure_text(failure, distro.as_deref()))
    }

    /// Whether the slot's session ended with no failure, as of its last refresh.
    pub fn ended(&self, slot: SlotId) -> bool {
        self.slots
            .get(&slot)
            .is_some_and(|it| it.status == SessionStatus::Ended)
    }

    /// Whether a Restart is on offer: the session ended or failed, can be made again and
    /// there is room for it.
    pub fn can_restart(&self, slot: SlotId) -> bool {
        self.restartable(slot) && !self.slots_full()
    }

    fn restartable(&self, slot: SlotId) -> bool {
        self.slots.get(&slot).is_some_and(|it| {
            restart_offered(
                &it.status,
                it.relaunch.is_some(),
                it.closing,
                it.finished.is_closed(),
            )
        })
    }

    /// Whether a Restart continues the slot's conversation with `--resume`: its session sent
    /// a request, or it was opened by resuming. Otherwise it starts the same id again.
    pub fn restart_resumes(&self, slot: SlotId) -> bool {
        self.slots
            .get(&slot)
            .is_some_and(|it| it.runtime.sent() || it.resumed)
    }

    /// What a Restart does, said under its button; `None` while none is on offer.
    pub fn restart_note(&self, slot: SlotId) -> Option<&'static str> {
        self.can_restart(slot).then(|| {
            if self.restart_resumes(slot) {
                copy::RESTART_CONTINUES
            } else {
                copy::RESTART_AGAIN
            }
        })
    }

    /// What the checks' ready file says once every slot has settled, as of each slot's last
    /// refresh: `Running <version>` or `Failed <kind>`, one line a slot in the order they were
    /// opened. `None` while there is no slot or one has not settled; a slot that is meant to
    /// fail settles only once it has failed. No line holds a path.
    pub fn ready_lines(&self) -> Option<Vec<String>> {
        if self.slots.is_empty() {
            return None;
        }
        self.slots
            .values()
            .map(|held| match &held.status {
                SessionStatus::Running { version } if !held.settles_on_failure => {
                    Some(format!("Running {version}"))
                }
                SessionStatus::Failed(failure) => Some(format!("Failed {}", failure.kind())),
                _ => None,
            })
            .collect()
    }

    pub fn new_session(&self) -> Option<&NewSessionDialog> {
        self.dialog.as_ref()
    }

    /// The folders sessions were started in, newest first.
    pub fn recent_folders(&self) -> &[String] {
        self.recent.list()
    }

    /// Where the folder field points when it is empty.
    pub fn default_folder(&self) -> Option<String> {
        default_folder(self.ports.checks.as_ref())
    }

    /// Does what `action` asks and says what the screen is to do about it.
    pub fn act(&mut self, action: ShellAction) -> Acted {
        let acted = self.act_inner(action);
        self.settle_nav();
        acted
    }

    fn act_inner(&mut self, action: ShellAction) -> Acted {
        // Once the close began, nothing may start a run or write to a session: a run started
        // after `close_all` would be left out of its wait.
        if self.closing == CloseStage::Closing
            && matches!(
                action,
                ShellAction::Restart { .. }
                    | ShellAction::StartSession { .. }
                    | ShellAction::OpenNewSession
                    | ShellAction::OpenNewSessionHere
                    | ShellAction::FolderChecked { .. }
                    | ShellAction::NewInProject { .. }
                    | ShellAction::ProjectChecked { .. }
                    | ShellAction::Send { .. }
                    | ShellAction::CloseSlot { .. }
                    | ShellAction::ConfirmCloseSlot
                    | ShellAction::CancelCloseSlot
                    | ShellAction::ChooseCard { .. }
                    | ShellAction::DenyCard { .. }
                    | ShellAction::SendNote { .. }
                    | ShellAction::AnswerQuestion { .. }
                    | ShellAction::RemoveProject { .. }
                    | ShellAction::OpenResume { .. }
                    | ShellAction::OpenResumeHere
                    | ShellAction::SavedListed { .. }
                    | ShellAction::PickResume { .. }
            )
        {
            return Acted::default();
        }
        if let Some(overlay) = self.overlay()
            && behind_overlay(&action, overlay)
        {
            return Acted::default();
        }
        match action {
            ShellAction::Select(slot) => {
                if self.slots.contains_key(&slot) {
                    self.select(slot);
                }
                Acted::default()
            }
            ShellAction::ToggleProject { project } => {
                self.toggle_project(&project);
                Acted::default()
            }
            ShellAction::RemoveProject { project } => self.remove_project(&project),
            ShellAction::NewInProject { project } => self.new_in_project(&project),
            ShellAction::ProjectChecked { project, exists } => {
                self.project_checked(&project, exists)
            }
            ShellAction::CopySessionId { slot } => {
                let id = self.session_id(slot).map(str::to_owned);
                Acted {
                    clipboard: if self.copyable(slot) { id } else { None },
                    ..Acted::default()
                }
            }
            ShellAction::TogglePane(pane) => {
                self.panes.toggle(pane);
                Acted::default()
            }
            ShellAction::ResizePane { pane, width } => {
                self.panes.resize(pane, width);
                Acted::default()
            }
            ShellAction::ToggleRow { slot, key } => self.toggle_row(slot, key),
            ShellAction::Send { slot } => self.send(slot),
            ShellAction::Interrupt { slot } => {
                if let Some(commands) = self.slots.get(&slot).and_then(|it| it.runtime.commands()) {
                    _ = commands.interrupt();
                }
                Acted::default()
            }
            ShellAction::EditDraft { slot, text } => {
                if let Some(held) = self.slots.get_mut(&slot) {
                    held.composer.edit(&text);
                }
                Acted::default()
            }
            ShellAction::HistoryPrev { slot } => self.browse(slot, Composer::previous),
            ShellAction::HistoryNext { slot } => self.browse(slot, Composer::next),
            ShellAction::Restart { slot } => self.restart(slot),
            ShellAction::OpenNewSession => {
                if self.dialog.is_some() {
                    return Acted::default();
                }
                self.dialog = Some(NewSessionDialog::default());
                Acted {
                    folder: true,
                    ..Acted::default()
                }
            }
            ShellAction::OpenNewSessionHere => self.open_new_session_here(),
            ShellAction::EditFolder { text } => self.edit_folder(text),
            ShellAction::CancelNewSession => {
                self.dialog = None;
                Acted::default()
            }
            ShellAction::StartSession { folder } => self.start_session(folder),
            ShellAction::FolderChecked { folder, exists } => self.folder_checked(&folder, exists),
            ShellAction::RequestClose => self.request_close(),
            ShellAction::ConfirmClose => self.begin_close(),
            ShellAction::CloseSlot { slot } => self.close_slot(slot),
            ShellAction::ConfirmCloseSlot => match self.slot_close.take() {
                Some((slot, _)) => self.begin_close_slot(slot),
                None => Acted::default(),
            },
            ShellAction::CancelCloseSlot => {
                self.slot_close = None;
                Acted::default()
            }
            ShellAction::CardShown {
                slot,
                request_id,
                now_ms,
            } => {
                // A card behind an overlay is not on show: it starts no gate.
                if self.overlay().is_none()
                    && let Some(card) = self.card_mut(slot, &request_id)
                {
                    card.shown_ms.get_or_insert(now_ms);
                }
                Acted::default()
            }
            ShellAction::ListShown {
                slot,
                request_id,
                index,
                now_ms,
            } => {
                // Only a row that is on show, in the place the list has it, and shows this
                // request counts: the time of a row behind an overlay, one that shows another
                // request or one drawn where the list no longer has it must not start its gate.
                let shown = self.overlay().is_none()
                    && self.needs_you().get(index).is_some_and(|row| {
                        row.slot == slot && row.request_id() == Some(request_id.as_str())
                    });
                if shown && let Some(card) = self.card_mut(slot, &request_id) {
                    // A row drawn in another place than before starts again: what was under the
                    // pointer there is not what was read.
                    if card.list_shown.is_none_or(|(at, _)| at != index) {
                        card.list_shown = Some((index, now_ms));
                    }
                }
                Acted::default()
            }
            ShellAction::ChooseCard {
                slot,
                request_id,
                index,
                now_ms,
            } => self.answer_shown_card(slot, &request_id, Reply::Choose(index), now_ms),
            ShellAction::DenyCard {
                slot,
                request_id,
                now_ms,
            }
            | ShellAction::SendNote {
                slot,
                request_id,
                now_ms,
            } => self.answer_shown_card(slot, &request_id, Reply::Deny, now_ms),
            ShellAction::OpenNote { slot, request_id } => {
                self.set_note_open(slot, &request_id, true)
            }
            ShellAction::CloseNote { slot, request_id } => {
                self.set_note_open(slot, &request_id, false)
            }
            ShellAction::EditNote {
                slot,
                request_id,
                text,
            } => {
                if let Some(card) = self.card_mut(slot, &request_id) {
                    card.note = text;
                }
                Acted::default()
            }
            ShellAction::PickDestination {
                slot,
                request_id,
                destination,
            } => {
                if !self.offers_place(slot, &request_id, &destination) {
                    return Acted::default();
                }
                let Some(card) = self.card_mut(slot, &request_id) else {
                    return Acted::default();
                };
                card.destination = Some(destination);
                self.remeasured(slot, &request_id)
            }
            ShellAction::ToggleOption {
                slot,
                request_id,
                question,
                option,
            } => self.pick(slot, &request_id, question, Some(option), |card, multi| {
                card.toggle_option(question, option, multi);
            }),
            ShellAction::ToggleOther {
                slot,
                request_id,
                question,
            } => self.pick(slot, &request_id, question, None, |card, multi| {
                card.toggle_other(question, multi);
            }),
            ShellAction::EditOther {
                slot,
                request_id,
                question,
                text,
            } => self.pick(slot, &request_id, question, None, |card, multi| {
                card.edit_other(question, &text, multi);
            }),
            ShellAction::AnswerQuestion {
                slot,
                request_id,
                now_ms,
            } => self.answer_shown_card(slot, &request_id, Reply::Answer, now_ms),
            ShellAction::CancelClose => {
                if matches!(self.closing, CloseStage::Asking(_)) {
                    self.closing = CloseStage::Open;
                }
                Acted::default()
            }
            ShellAction::AllowFromList {
                slot,
                request_id,
                now_ms,
            } => self.allow_from_list(slot, &request_id, now_ms),
            ShellAction::DenyFromList { slot, request_id } => {
                self.deny_from_list(slot, &request_id)
            }
            ShellAction::OpenFromList { slot } => self.open_from_list(slot),
            ShellAction::JumpToWaiting => self.jump_to_waiting(),
            ShellAction::PickMode { slot, mode } => self.pick_mode(slot, &mode),
            ShellAction::ConfirmBypass { slot } => self.confirm_bypass(slot),
            ShellAction::CancelBypass { slot } => {
                if let Some(held) = self.slots.get_mut(&slot) {
                    held.bypass_asking = false;
                }
                Acted::default()
            }
            ShellAction::NavFocus => self.nav_focus(),
            ShellAction::NavMove { delta } => self.nav_move(delta),
            ShellAction::NavTo(item) => self.nav_to(item),
            ShellAction::NavEnter => self.nav_enter(),
            ShellAction::NavLeave => self.nav_leave(),
            ShellAction::NavLeft => self.nav_left(),
            ShellAction::NavRight => self.nav_right(),
            ShellAction::OpenResume { project } => self.open_resume(&project),
            ShellAction::OpenResumeHere => self.open_resume_here(),
            ShellAction::SavedListed {
                generation,
                listing,
            } => self.saved_listed(generation, listing),
            ShellAction::EditResumeQuery { text } => self.edit_resume_query(text),
            ShellAction::MoveResume { delta } => self.move_resume(delta),
            ShellAction::CloseResume => self.close_resume(),
            ShellAction::PickResume { session_id } => self.pick_resume(&session_id),
        }
    }

    fn toggle_row(&mut self, slot: SlotId, key: String) -> Acted {
        let Some(held) = self.slots.get_mut(&slot) else {
            return Acted::default();
        };
        let at = held.rows.iter().position(|row| row.key() == key);
        if !held.flipped.remove(&key) {
            held.flipped.insert(key);
        }
        let changes = at.map(|at| RowChange::Remeasure(at..at + 1));
        Acted {
            rows: Some((slot, changes.into_iter().collect())),
            ..Acted::default()
        }
    }

    /// Sends the slot's draft. The whole send runs inside one action, so nothing can browse the
    /// history between the draft being taken and being put back.
    fn send(&mut self, slot: SlotId) -> Acted {
        let Some(held) = self.slots.get_mut(&slot) else {
            return Acted::default();
        };
        let Some(commands) = held.runtime.commands() else {
            held.composer.not_running();
            return Acted::default();
        };
        let before = held.composer.draft().to_owned();
        if let Some((id, text)) = held.composer.take_for_send()
            && let Err(error) = commands.send_message(id, &text, &[])
        {
            held.composer.failed(text, &error);
        }
        Acted {
            draft: (held.composer.draft() != before).then_some(slot),
            ..Acted::default()
        }
    }

    fn browse(&mut self, slot: SlotId, step: fn(&mut Composer) -> bool) -> Acted {
        let moved = self
            .slots
            .get_mut(&slot)
            .is_some_and(|held| step(&mut held.composer));
        Acted {
            draft: moved.then_some(slot),
            ..Acted::default()
        }
    }

    fn restart(&mut self, slot: SlotId) -> Acted {
        if !self.can_restart(slot) {
            return Acted::default();
        }
        let Some(held) = self.slots.get(&slot) else {
            return Acted::default();
        };
        let Some(relaunch) = held.relaunch.clone() else {
            return Acted::default();
        };
        let mut launch = relaunch();
        launch.session_id = Some(held.session_id.clone());
        if self.restart_resumes(slot) {
            let folder = held
                .project
                .as_ref()
                .and_then(|key| self.folder_of(key))
                .or_else(|| held.working_directory.clone());
            match folder {
                Some(folder) => {
                    launch.resume = Some(SlotResume {
                        saved: self.ports.saved_for.saved(&folder),
                        saved_title: held.saved_title.clone(),
                    });
                }
                // With no folder the saved session cannot be found: a new id starts instead,
                // although the note said the Restart continues. Not reached today: of the slots
                // with a Restart, only the checks' `fail_launch` ones have no folder, and they
                // neither resume nor send a request.
                None => launch.session_id = None,
            }
        }
        let Some(changes) = self.replace(slot, launch) else {
            return Acted::default();
        };
        Acted {
            rows: Some((slot, changes)),
            started: Some(slot),
            ..Acted::default()
        }
    }
}

/// Whether an overlay holds the action back: nothing answers, edits a card, closes or starts
/// anything behind it. Selecting, opening a row, the panes, the draft and the overlay's own
/// steps go through.
fn behind_overlay(action: &ShellAction, overlay: Overlay) -> bool {
    match action {
        ShellAction::ChooseCard { .. }
        | ShellAction::DenyCard { .. }
        | ShellAction::SendNote { .. }
        | ShellAction::AnswerQuestion { .. }
        | ShellAction::AllowFromList { .. }
        | ShellAction::DenyFromList { .. }
        | ShellAction::OpenFromList { .. }
        | ShellAction::JumpToWaiting
        | ShellAction::PickMode { .. }
        | ShellAction::ConfirmBypass { .. }
        | ShellAction::EditNote { .. }
        | ShellAction::EditOther { .. }
        | ShellAction::PickDestination { .. }
        | ShellAction::OpenNote { .. }
        | ShellAction::CloseNote { .. }
        | ShellAction::ToggleOption { .. }
        | ShellAction::ToggleOther { .. }
        | ShellAction::CloseSlot { .. }
        | ShellAction::Send { .. }
        | ShellAction::Restart { .. }
        | ShellAction::Interrupt { .. }
        | ShellAction::HistoryPrev { .. }
        | ShellAction::HistoryNext { .. }
        | ShellAction::RemoveProject { .. }
        | ShellAction::NewInProject { .. }
        | ShellAction::NavFocus
        | ShellAction::NavMove { .. }
        | ShellAction::NavTo(_)
        | ShellAction::NavEnter
        | ShellAction::NavLeave
        | ShellAction::NavLeft
        | ShellAction::NavRight
        | ShellAction::OpenResume { .. }
        | ShellAction::OpenResumeHere => true,
        ShellAction::EditResumeQuery { .. }
        | ShellAction::MoveResume { .. }
        | ShellAction::CloseResume
        | ShellAction::PickResume { .. } => overlay != Overlay::Resume,
        ShellAction::OpenNewSession
        | ShellAction::OpenNewSessionHere
        | ShellAction::StartSession { .. } => overlay != Overlay::NewSession,
        _ => false,
    }
}

fn lock(runs: &Runs) -> std::sync::MutexGuard<'_, BTreeMap<u64, RunEntry>> {
    runs.lock().unwrap_or_else(PoisonError::into_inner)
}

/// The request an alert waits on; a finished turn has none.
fn request_of(alert: &SessionAlert) -> Option<&str> {
    match alert {
        SessionAlert::Permission(it) => Some(&it.request_id),
        SessionAlert::OpenOnly(it) => Some(&it.request_id),
        SessionAlert::Finished(_) => None,
    }
}

#[cfg(test)]
mod tests;
