//! What the window holds: the open slots and their rows, the selected slot, the panes, and
//! which rows were opened or closed by hand.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::{Duration, UNIX_EPOCH};

use async_channel::Receiver;
use closta_presenter::cards::decisions::offers_destination;
use closta_presenter::cards::plan::plan_go_of;
use closta_presenter::cards::{SUGGESTION_DESTINATIONS, card_of};
use closta_presenter::composer_state::composer_state;
use closta_presenter::rows::{ThreadRow, ThreadRows};
use closta_presenter::session::SessionView;
use closta_presenter::sessions::groups::{SessionAlert, alerts_between, waiting_alerts};
use closta_presenter::thread_running::thread_is_running;
use closta_session::log::SessionLog;
use closta_session::runtime::{SessionConfig, SessionRuntime};
use closta_session::status::SessionStatus;
use futures_lite::future;

use crate::cards::{CardState, Reply, verdict};
use crate::closing::{CloseQuestion, CloseRun, CloseStage};
use crate::composer::Composer;
use crate::copy;
use crate::header::AppHeader;
use crate::needs_you::{NeedsYouRow, SlotNeeds, attention, needs_you_rows};
use crate::new_session::{
    LaunchChecks, NewSessionDialog, PlannerFor, Problem, RecentFolders, Runtime, default_folder,
    launch_in, quick_problem, runtime_of,
};
use crate::panes::{Pane, Panes};
use crate::rows::{RowChange, row_changes};
use crate::slot::{
    MAX_LIVE_SLOTS, Relaunch, SlotId, SlotLaunch, SlotSummary, Spawn, counts_as_live, mark_of,
};
use crate::watch::SlotWatch;

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
    ListShown {
        slot: SlotId,
        request_id: String,
        now_ms: i64,
    },
    ChooseCard {
        slot: SlotId,
        request_id: String,
        index: usize,
    },
    DenyCard {
        slot: SlotId,
        request_id: String,
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
    },
    PickDestination {
        slot: SlotId,
        request_id: String,
        destination: String,
    },
}

/// Where the keyboard goes once an action is done.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum FocusTarget {
    Composer(SlotId),
    Card { slot: SlotId, request_id: String },
    CardNote { slot: SlotId, request_id: String },
    FailureBand(SlotId),
}

/// What the machine is asked: the checks of the New Session dialog and the planner a folder
/// starts with.
#[derive(Clone)]
pub struct Ports {
    pub checks: Arc<dyn LaunchChecks>,
    pub planner_for: Arc<dyn PlannerFor>,
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
    /// The slot that was closed and is gone.
    pub removed: Option<SlotId>,
    /// Where the keyboard is to go.
    pub focus: Option<FocusTarget>,
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
    /// The ids of the requests that began to wait; a finished turn is not one.
    pub raised: Vec<String>,
    /// Whether something new waits or the session just failed.
    pub attention: bool,
    /// Whether the slot was being closed and its run has returned: it is gone.
    pub removed: bool,
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
}

impl Slot {
    /// Whether a running session works or waits on an approval.
    fn is_working(&self) -> bool {
        matches!(self.status, SessionStatus::Running { .. }) && (self.running || self.waiting)
    }

    fn is_live(&self) -> bool {
        self.closing || counts_as_live(&self.status)
    }
}

/// The runs that have not returned, by session id: with the handle to kill their processes and
/// the receiver that closes when the run has returned. A replaced session stays here until then.
type Runs = Arc<Mutex<BTreeMap<String, (SessionRuntime, Receiver<()>)>>>;

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
    runs: Runs,
    closing: CloseStage,
    slot_close: Option<(SlotId, CloseQuestion)>,
    shown_title: Option<String>,
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
            runs: Runs::default(),
            closing: CloseStage::Open,
            slot_close: None,
            shown_title: None,
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
                settles_on_failure,
                working_directory,
                line: None,
                compacting: false,
                last: None,
                waits: Vec::new(),
                failed_since: None,
                closing: false,
                cards: HashMap::new(),
            },
        );
        self.selected.get_or_insert(id);
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
        let (runtime, finished) = self.start(launch);
        let held = self.slots.get_mut(&slot)?;
        held.title = title;
        held.relaunch = relaunch;
        held.settles_on_failure = settles_on_failure;
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
        held.last = None;
        held.waits.clear();
        held.failed_since = None;
        held.cards.clear();
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
        lock(&self.runs).insert(id.clone(), (runtime.clone(), finished.clone()));
        let runs = Arc::clone(&self.runs);
        (self.spawn)(Box::pin(async move {
            run.await;
            lock(&runs).remove(&id);
            drop(done);
        }));
        if let Some(companion) = launch.companion {
            (self.spawn)(companion(runtime.clone()));
        }
        (runtime, finished)
    }

    /// How many runs have not returned, those of replaced sessions included.
    pub fn live_runs(&self) -> usize {
        lock(&self.runs).len()
    }

    pub fn close_stage(&self) -> &CloseStage {
        &self.closing
    }

    /// Closes every slot's session. The run is over once every run that has not returned has,
    /// those of replaced sessions too; `destroy` kills the processes of those still left.
    pub fn close_all(&mut self) -> CloseRun {
        for held in self.slots.values() {
            held.runtime.close();
        }
        let waits: Vec<Receiver<()>> = lock(&self.runs)
            .values()
            .map(|(_, finished)| finished.clone())
            .collect();
        let runs = Arc::clone(&self.runs);
        CloseRun {
            returned: Box::pin(async move {
                for finished in waits {
                    // Nothing is ever sent: the receiver closes when the run has returned.
                    _ = finished.recv().await;
                }
            }),
            destroy: Box::new(move || {
                let left: Vec<SessionRuntime> = lock(&runs)
                    .values()
                    .map(|(runtime, _)| runtime.clone())
                    .collect();
                for runtime in left {
                    runtime.destroy_now();
                }
            }),
        }
    }

    /// The slots in the order they were opened.
    pub fn slots(&self) -> Vec<SlotSummary> {
        self.slots
            .iter()
            .map(|(id, slot)| SlotSummary {
                id: *id,
                title: slot.title.clone(),
                mark: mark_of(&slot.status, slot.running, slot.waiting),
                closing: slot.closing,
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
    pub fn refresh(&mut self, slot: SlotId, generation: u64, now_ms: i64) -> Option<Refresh> {
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
        let composing = composer_state(&view.conversation, &view.transcript);
        held.line = Some(ComposerLine {
            mode: composing.mode,
            model: composing.model.label,
        });
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
        held.last = Some(view);
        held.rows = rows;
        held.status = status.clone();
        held.running = running;
        held.waiting = waiting;
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
        }
        if self.slot_close.is_some_and(|(asked, _)| asked == slot) {
            self.slot_close = None;
        }
    }

    /// What waits for the user, one row a slot, the oldest first. A slot that is being closed
    /// shows nothing.
    pub fn needs_you(&self) -> Vec<NeedsYouRow> {
        let slots: Vec<SlotNeeds> = self
            .slots
            .iter()
            .filter(|(_, held)| !held.closing)
            .map(|(id, held)| SlotNeeds {
                slot: *id,
                title: held.title.clone(),
                waits: held.waits.clone(),
                failed: self
                    .failure(*id)
                    .zip(held.failed_since)
                    .map(|((title, _), at)| (title, at)),
            })
            .collect();
        needs_you_rows(&slots)
    }

    /// How many requests the listed slots wait on, for the window's title.
    pub fn waiting_count(&self) -> usize {
        self.slots
            .values()
            .filter(|held| !held.closing)
            .map(|held| held.waits.len())
            .sum()
    }

    /// The window's title if it differs from the one this last returned; the first call
    /// always returns one.
    pub fn title_change(&mut self) -> Option<String> {
        let title = copy::window_title(&self.header.title, self.waiting_count());
        if self.shown_title.as_ref() == Some(&title) {
            return None;
        }
        self.shown_title = Some(title.clone());
        Some(title)
    }

    /// Whether as many slots as may hold a session do; a slot that is closing still does.
    pub fn slots_full(&self) -> bool {
        self.slots.values().filter(|it| it.is_live()).count() >= MAX_LIVE_SLOTS
    }

    /// Whether the slot could be restarted but for the limit.
    pub fn restart_blocked(&self, slot: SlotId) -> bool {
        self.restartable(slot) && self.slots_full()
    }

    /// The slot being asked about before it is closed, and what is at stake.
    pub fn slot_close(&self) -> Option<(SlotId, CloseQuestion)> {
        self.slot_close
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
            it.relaunch.is_some()
                && !it.closing
                && matches!(it.status, SessionStatus::Ended | SessionStatus::Failed(_))
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
        // Once the close began, nothing may start a run or write to a session: a run started
        // after `close_all` would be left out of its wait.
        if self.closing == CloseStage::Closing
            && matches!(
                action,
                ShellAction::Restart { .. }
                    | ShellAction::StartSession { .. }
                    | ShellAction::OpenNewSession
                    | ShellAction::FolderChecked { .. }
                    | ShellAction::Send { .. }
                    | ShellAction::CloseSlot { .. }
                    | ShellAction::ConfirmCloseSlot
                    | ShellAction::CancelCloseSlot
                    | ShellAction::ChooseCard { .. }
                    | ShellAction::DenyCard { .. }
                    | ShellAction::SendNote { .. }
            )
        {
            return Acted::default();
        }
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
                if let Some(card) = self.card_mut(slot, &request_id) {
                    card.shown_ms.get_or_insert(now_ms);
                }
                Acted::default()
            }
            ShellAction::ListShown {
                slot,
                request_id,
                now_ms,
            } => {
                if let Some(card) = self.card_mut(slot, &request_id) {
                    card.list_shown_ms.get_or_insert(now_ms);
                }
                Acted::default()
            }
            ShellAction::ChooseCard {
                slot,
                request_id,
                index,
            } => self.answer_card(slot, &request_id, Reply::Choose(index)),
            ShellAction::DenyCard { slot, request_id }
            | ShellAction::SendNote { slot, request_id } => {
                self.answer_card(slot, &request_id, Reply::Deny)
            }
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
            ShellAction::CancelClose => {
                if matches!(self.closing, CloseStage::Asking(_)) {
                    self.closing = CloseStage::Open;
                }
                Acted::default()
            }
        }
    }

    /// What is kept of the card of a request the slot waits on.
    pub fn card_state(&self, slot: SlotId, request_id: &str) -> Option<&CardState> {
        self.slots.get(&slot)?.cards.get(request_id)
    }

    /// Where the card of `request_id` stands among the slot's rows.
    pub fn card_at(&self, slot: SlotId, request_id: &str) -> Option<usize> {
        self.slots.get(&slot)?.rows.iter().position(
            |row| matches!(row, ThreadRow::Card(it) if it.card.request_id() == request_id),
        )
    }

    /// Whether the card was drawn in the conversation.
    pub fn shown(&self, slot: SlotId, request_id: &str) -> bool {
        self.card_state(slot, request_id)
            .is_some_and(|it| it.shown_ms.is_some())
    }

    /// Whether the card's row was drawn in the needs-you list.
    pub fn list_shown(&self, slot: SlotId, request_id: &str) -> bool {
        self.card_state(slot, request_id)
            .is_some_and(|it| it.list_shown_ms.is_some())
    }

    /// The card's state, made from the card when it is first touched; `None` unless the slot
    /// waits on the request.
    fn card_mut(&mut self, slot: SlotId, request_id: &str) -> Option<&mut CardState> {
        let held = self.slots.get_mut(&slot)?;
        if !held.cards.contains_key(request_id) {
            held.waits
                .iter()
                .find(|(alert, _)| request_of(alert) == Some(request_id))?;
            let view = held.runtime.view();
            let approval = view.transcript.approvals.get(request_id)?;
            let card = card_of(approval, plan_go_of(&view.transcript.operations));
            held.cards
                .insert(request_id.to_owned(), CardState::for_card(&card));
        }
        held.cards.get_mut(request_id)
    }

    /// Whether the card of the request keeps rules somewhere and `place` is one of the places it
    /// offers.
    fn offers_place(&self, slot: SlotId, request_id: &str, place: &str) -> bool {
        let Some(held) = self.slots.get(&slot) else {
            return false;
        };
        let view = held.runtime.view();
        view.transcript
            .approvals
            .get(request_id)
            .is_some_and(|it| offers_destination(&it.suggestions))
            && SUGGESTION_DESTINATIONS.contains(&place)
    }

    fn set_note_open(&mut self, slot: SlotId, request_id: &str, open: bool) -> Acted {
        let Some(card) = self.card_mut(slot, request_id) else {
            return Acted::default();
        };
        card.note_open = open;
        let focus = if open {
            FocusTarget::CardNote {
                slot,
                request_id: request_id.to_owned(),
            }
        } else {
            FocusTarget::Card {
                slot,
                request_id: request_id.to_owned(),
            }
        };
        Acted {
            focus: Some(focus),
            ..self.remeasured(slot, request_id)
        }
    }

    /// The card's row is to be measured again.
    fn remeasured(&self, slot: SlotId, request_id: &str) -> Acted {
        let changes = self
            .card_at(slot, request_id)
            .map(|at| RowChange::Remeasure(at..at + 1));
        Acted {
            rows: Some((slot, changes.into_iter().collect())),
            ..Acted::default()
        }
    }

    /// Answers the card of `request_id` as `reply` says, if the session is running and waits on
    /// it. The first time it was seen is when the answer was asked for. A card whose answer
    /// could not be sent says so and stays.
    fn answer_card(&mut self, slot: SlotId, request_id: &str, reply: Reply) -> Acted {
        let Some(held) = self.slots.get_mut(&slot).filter(|it| !it.closing) else {
            return Acted::default();
        };
        let Some(commands) = held.runtime.commands() else {
            return Acted::default();
        };
        if !matches!(held.runtime.status(), SessionStatus::Running { .. }) {
            return Acted::default();
        }
        let Some(first_seen) = held
            .waits
            .iter()
            .find(|(alert, _)| request_of(alert) == Some(request_id))
            .map(|(_, at)| *at)
        else {
            return Acted::default();
        };
        let view = held.runtime.view();
        if !view
            .conversation
            .pending_approvals
            .iter()
            .any(|it| it.request_id == request_id)
        {
            return Acted::default();
        }
        let Some(approval) = view.transcript.approvals.get(request_id) else {
            return Acted::default();
        };
        let go = plan_go_of(&view.transcript.operations);
        // A card never touched still keeps its rules where it starts out.
        let untouched;
        let state = match held.cards.get(request_id) {
            Some(state) => state,
            None => {
                untouched = CardState::for_card(&card_of(approval, go));
                &untouched
            }
        };
        let Some(answer) = verdict(approval, go, Some(state), reply) else {
            return Acted::default();
        };
        let requested_at =
            UNIX_EPOCH + Duration::from_millis(u64::try_from(first_seen).unwrap_or(0));
        match commands.respond_to_approval(
            &answer.decision,
            requested_at,
            answer.payload.as_deref(),
            answer.passed_on,
        ) {
            Ok(()) => {
                held.cards.remove(request_id);
            }
            Err(_) => commands.answer_failed(request_id, copy::ANSWER_FAILED),
        }
        Acted::default()
    }

    /// Asks before closing a slot that works or holds a draft; closes one that does not.
    fn close_slot(&mut self, slot: SlotId) -> Acted {
        // One overlay at a time: the window's question stands, and a slot closes once.
        if self.closing != CloseStage::Open || self.slot_close.is_some() {
            return Acted::default();
        }
        let Some(held) = self.slots.get(&slot).filter(|it| !it.closing) else {
            return Acted::default();
        };
        let question = CloseQuestion {
            working: usize::from(held.is_working()),
            drafts: usize::from(held.composer.has_draft()),
        };
        if question.working == 0 && question.drafts == 0 {
            return self.begin_close_slot(slot);
        }
        self.slot_close = Some((slot, question));
        Acted::default()
    }

    /// Tells the slot's session to end; the slot goes at once if its run has returned, else with
    /// the refresh that sees it return.
    fn begin_close_slot(&mut self, slot: SlotId) -> Acted {
        let Some(held) = self.slots.get_mut(&slot).filter(|it| !it.closing) else {
            return Acted::default();
        };
        held.runtime.close();
        held.closing = true;
        if !held.finished.is_closed() {
            return Acted::default();
        }
        self.remove(slot);
        Acted {
            removed: Some(slot),
            ..Acted::default()
        }
    }

    fn request_close(&mut self) -> Acted {
        self.slot_close = None;
        if self.closing != CloseStage::Open {
            return Acted::default();
        }
        let question = CloseQuestion {
            working: self.slots.values().filter(|it| it.is_working()).count(),
            drafts: self
                .slots
                .values()
                .filter(|it| it.composer.has_draft())
                .count(),
        };
        if question.working == 0 && question.drafts == 0 {
            return self.begin_close();
        }
        self.closing = CloseStage::Asking(question);
        Acted::default()
    }

    /// Enters the closing stage from Open or Asking; from the closing stage it does nothing.
    fn begin_close(&mut self) -> Acted {
        if self.closing == CloseStage::Closing {
            return Acted::default();
        }
        self.closing = CloseStage::Closing;
        Acted {
            close: true,
            ..Acted::default()
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
        if self.slots_full() {
            return Acted::default();
        }
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
        if self.slots_full() {
            return Acted::default();
        }
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

fn lock(
    runs: &Runs,
) -> std::sync::MutexGuard<'_, BTreeMap<String, (SessionRuntime, Receiver<()>)>> {
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
