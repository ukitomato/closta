//! What the window holds: the open slots and their rows, the selected slot, the panes, and
//! which rows were opened or closed by hand.

use std::collections::{BTreeMap, HashSet};
use std::sync::Arc;

use async_channel::Receiver;
use closta_presenter::composer_state::composer_state;
use closta_presenter::rows::{ThreadRow, ThreadRows};
use closta_presenter::thread_running::thread_is_running;
use closta_session::launch::{SessionLaunch, SessionLaunchPlanner};
use closta_session::log::SessionLog;
use closta_session::runtime::{SessionConfig, SessionRuntime};
use closta_session::status::{SessionFailure, SessionStatus};
use futures_lite::future;

use crate::composer::Composer;
use crate::copy;
use crate::header::AppHeader;
use crate::new_session::{
    ClaudeOnPath, LaunchChecks, NewSessionDialog, PlannerFor, Problem, RecentFolders, Runtime,
    default_folder, launch_in, quick_problem, runtime_of,
};
use crate::panes::{Pane, Panes};
use crate::rows::{RowChange, row_changes};
use crate::slot::{Relaunch, SlotId, SlotLaunch, SlotSummary, Spawn, mark_of};
use crate::watch::SlotWatch;

/// What a click or a key asks of the shell.
#[derive(Clone, PartialEq, Debug)]
pub enum ShellAction {
    Select(SlotId),
    TogglePane(Pane),
    ResizePane { pane: Pane, width: f32 },
    ToggleRow { slot: SlotId, key: String },
    Send { slot: SlotId },
    Interrupt { slot: SlotId },
    EditDraft { slot: SlotId, text: String },
    HistoryPrev { slot: SlotId },
    HistoryNext { slot: SlotId },
    Restart { slot: SlotId },
    OpenNewSession,
    EditFolder { text: String },
    CancelNewSession,
    StartSession { folder: String },
    FolderChecked { folder: String, exists: bool },
}

/// What the machine is asked: the checks of the New Session dialog and the planner a folder
/// starts with.
#[derive(Clone)]
pub struct Ports {
    pub checks: Arc<dyn LaunchChecks>,
    pub planner_for: Arc<dyn PlannerFor>,
}

impl Ports {
    /// Ports that know nothing: no distribution, `claude.exe` found, no default, no folder.
    /// A stand-in until the platform wires the real ones.
    #[doc(hidden)]
    pub fn inert() -> Ports {
        Ports {
            checks: Arc::new(Inert),
            planner_for: Arc::new(Inert),
        }
    }
}

struct Inert;

impl LaunchChecks for Inert {
    fn installed_distros(&self) -> Vec<String> {
        Vec::new()
    }

    fn claude_on_path(&self) -> ClaudeOnPath {
        ClaudeOnPath::Found
    }

    fn default_distro(&self) -> Option<String> {
        None
    }

    fn folder_exists(&self, _folder: &str) -> future::Boxed<bool> {
        Box::pin(async { false })
    }
}

impl PlannerFor for Inert {
    fn planner(&self, _folder: &str) -> Arc<dyn SessionLaunchPlanner> {
        Arc::new(Inert)
    }
}

impl SessionLaunchPlanner for Inert {
    fn plan(
        &self,
        _session_id: &str,
        _working_directory: Option<&str>,
    ) -> future::Boxed<Result<SessionLaunch, SessionFailure>> {
        Box::pin(async { Err(SessionFailure::PlanFailed) })
    }
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
    /// The dialog's folder field is to be filled again from the dialog.
    pub folder: bool,
    /// The steps that close the window are to run.
    pub close: bool,
}

/// What the composer's second line shows of the session.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ComposerLine {
    pub mode: Option<String>,
    pub model: String,
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
}

/// One slot: its current session and what the last refresh read of it.
struct Slot {
    title: String,
    runtime: SessionRuntime,
    finished: Receiver<()>,
    /// How many times the session was replaced.
    generation: u64,
    builder: ThreadRows,
    rows: Vec<ThreadRow>,
    status: SessionStatus,
    running: bool,
    waiting: bool,
    /// The keys of the rows opened or closed against their default.
    flipped: HashSet<String>,
    /// The draft, its history and the reason it was not sent; they outlive the session.
    composer: Composer,
    /// How to start the same session again; `None` leaves no Restart.
    relaunch: Option<Relaunch>,
    working_directory: Option<String>,
    line: Option<ComposerLine>,
    compacting: bool,
}

pub struct ShellState {
    header: AppHeader,
    spawn: Spawn,
    log: Arc<dyn SessionLog>,
    ports: Ports,
    dialog: Option<NewSessionDialog>,
    recent: RecentFolders,
    last_id: u64,
    slots: BTreeMap<SlotId, Slot>,
    selected: Option<SlotId>,
    panes: Panes,
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
            slots: BTreeMap::new(),
            selected: None,
            panes: Panes::default(),
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
        let working_directory = launch.working_directory.clone();
        let (runtime, finished) = self.start(launch);
        self.slots.insert(
            id,
            Slot {
                title,
                runtime,
                finished,
                generation: 0,
                builder: ThreadRows::default(),
                rows: Vec::new(),
                status: SessionStatus::Starting,
                running: false,
                waiting: false,
                flipped: HashSet::new(),
                composer: Composer::default(),
                relaunch,
                working_directory,
                line: None,
                compacting: false,
            },
        );
        self.selected.get_or_insert(id);
        id
    }

    /// Closes the slot's session and starts a new one in its place, in the next generation.
    /// The rows are emptied: the changes that do it are returned. The rows opened by hand, the
    /// selection, the draft and its history stay.
    pub fn replace(&mut self, slot: SlotId, launch: SlotLaunch) -> Option<Vec<RowChange>> {
        self.slots.get(&slot)?.runtime.close();
        let title = launch.title.clone();
        let relaunch = launch.relaunch.clone();
        let working_directory = launch.working_directory.clone();
        let (runtime, finished) = self.start(launch);
        let held = self.slots.get_mut(&slot)?;
        held.title = title;
        held.relaunch = relaunch;
        held.working_directory = working_directory;
        held.line = None;
        held.compacting = false;
        held.composer.clear_reason();
        held.runtime = runtime;
        held.finished = finished;
        held.generation += 1;
        held.builder = ThreadRows::default();
        held.status = SessionStatus::Starting;
        held.running = false;
        held.waiting = false;
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

    /// A new session, its run and its companion handed to the spawn; with the receiver that
    /// closes once the run has returned.
    fn start(&self, launch: SlotLaunch) -> (SessionRuntime, Receiver<()>) {
        let id = uuid::Uuid::new_v4().to_string();
        let config = SessionConfig::new(
            &id,
            launch.planner,
            launch.working_directory,
            Arc::clone(&self.log),
        );
        let (runtime, run) = SessionRuntime::new(config);
        let (done, finished) = async_channel::bounded::<()>(1);
        (self.spawn)(Box::pin(async move {
            run.await;
            drop(done);
        }));
        if let Some(companion) = launch.companion {
            (self.spawn)(companion(runtime.clone()));
        }
        (runtime, finished)
    }

    /// The slots in the order they were opened.
    pub fn slots(&self) -> Vec<SlotSummary> {
        self.slots
            .iter()
            .map(|(id, slot)| SlotSummary {
                id: *id,
                title: slot.title.clone(),
                mark: mark_of(&slot.status, slot.running, slot.waiting),
            })
            .collect()
    }

    pub fn selected(&self) -> Option<SlotId> {
        self.selected
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
    pub fn refresh(&mut self, slot: SlotId, generation: u64) -> Option<Refresh> {
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
        let running = matches!(status, SessionStatus::Running { .. })
            && !waiting
            && thread_is_running(&view.conversation, &view.transcript);
        let composing = composer_state(&view.conversation, &view.transcript);
        held.line = Some(ComposerLine {
            mode: composing.mode,
            model: composing.model.label,
        });
        held.compacting = view.transcript.operations.compacting;
        held.rows = rows;
        held.status = status.clone();
        held.running = running;
        held.waiting = waiting;
        Some(Refresh {
            status,
            running,
            waiting,
            changes,
        })
    }

    /// The slot's draft; empty for a slot that is not there.
    pub fn draft(&self, slot: SlotId) -> &str {
        self.slots.get(&slot).map_or("", |it| it.composer.draft())
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

    /// Whether a Restart is on offer: the session ended or failed and can be made again.
    pub fn can_restart(&self, slot: SlotId) -> bool {
        self.slots.get(&slot).is_some_and(|it| {
            it.relaunch.is_some()
                && matches!(it.status, SessionStatus::Ended | SessionStatus::Failed(_))
        })
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
        match action {
            ShellAction::Select(slot) => {
                if self.slots.contains_key(&slot) {
                    self.selected = Some(slot);
                }
                Acted::default()
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
            ShellAction::EditFolder { text } => self.edit_folder(text),
            ShellAction::CancelNewSession => {
                self.dialog = None;
                Acted::default()
            }
            ShellAction::StartSession { folder } => self.start_session(folder),
            ShellAction::FolderChecked { folder, exists } => self.folder_checked(&folder, exists),
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
        let Some(relaunch) = self.slots.get(&slot).and_then(|it| it.relaunch.clone()) else {
            return Acted::default();
        };
        let Some(changes) = self.replace(slot, relaunch()) else {
            return Acted::default();
        };
        Acted {
            rows: Some((slot, changes)),
            started: Some(slot),
            ..Acted::default()
        }
    }

    fn edit_folder(&mut self, text: String) -> Acted {
        let Some(dialog) = self.dialog.as_mut() else {
            return Acted::default();
        };
        if dialog.checking || dialog.folder == text {
            return Acted::default();
        }
        dialog.problem = quick_problem(&text, self.ports.checks.as_ref());
        dialog.folder = text;
        Acted {
            folder: true,
            ..Acted::default()
        }
    }

    fn start_session(&mut self, folder: String) -> Acted {
        let Some(dialog) = self.dialog.as_mut() else {
            return Acted::default();
        };
        if dialog.checking
            || folder.trim() != dialog.folder.trim()
            || folder.trim().is_empty()
            || quick_problem(&folder, self.ports.checks.as_ref()).is_some()
        {
            return Acted::default();
        }
        dialog.checking = true;
        let folder = folder.trim().to_owned();
        let exists = self.ports.checks.folder_exists(&folder);
        Acted {
            check: Some(FolderCheck { folder, exists }),
            ..Acted::default()
        }
    }

    fn folder_checked(&mut self, folder: &str, exists: bool) -> Acted {
        let Some(dialog) = self.dialog.as_mut() else {
            return Acted::default();
        };
        if !dialog.checking || folder.trim() != dialog.folder.trim() {
            return Acted::default();
        }
        if !exists {
            dialog.problem = Some(Problem::FolderMissing);
            dialog.checking = false;
            return Acted::default();
        }
        let folder = folder.trim();
        let slot = self.open(launch_in(folder, &self.ports.planner_for));
        self.selected = Some(slot);
        self.recent.push(folder);
        self.dialog = None;
        Acted {
            started: Some(slot),
            ..Acted::default()
        }
    }
}
