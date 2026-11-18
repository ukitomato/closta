//! What the window holds: the open slots and their rows, the selected slot, the panes, and
//! which rows were opened or closed by hand.

use std::collections::{BTreeMap, HashSet};
use std::sync::Arc;

use async_channel::Receiver;
use closta_presenter::rows::{ThreadRow, ThreadRows};
use closta_presenter::thread_running::thread_is_running;
use closta_session::log::SessionLog;
use closta_session::runtime::{SessionConfig, SessionRuntime};
use closta_session::status::SessionStatus;

use crate::header::AppHeader;
use crate::panes::{Pane, Panes};
use crate::rows::{RowChange, row_changes};
use crate::slot::{SlotId, SlotLaunch, SlotSummary, Spawn, mark_of};
use crate::watch::SlotWatch;

/// What a click or a key asks of the shell.
#[derive(Clone, PartialEq, Debug)]
pub enum ShellAction {
    Select(SlotId),
    TogglePane(Pane),
    ResizePane { pane: Pane, width: f32 },
    ToggleRow { slot: SlotId, key: String },
}

/// Where a slot's session is after a refresh, and how its rows changed.
#[derive(Clone, PartialEq, Debug)]
pub struct Refresh {
    pub status: SessionStatus,
    /// Whether its turn runs with no approval waiting.
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
}

pub struct ShellState {
    header: AppHeader,
    spawn: Spawn,
    log: Arc<dyn SessionLog>,
    last_id: u64,
    slots: BTreeMap<SlotId, Slot>,
    selected: Option<SlotId>,
    panes: Panes,
}

impl ShellState {
    pub fn new(header: AppHeader, spawn: Spawn, log: Arc<dyn SessionLog>) -> ShellState {
        ShellState {
            header,
            spawn,
            log,
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
            },
        );
        self.selected.get_or_insert(id);
        id
    }

    /// Closes the slot's session and starts a new one in its place, in the next generation.
    /// The rows are emptied: the changes that do it are returned. The rows opened by hand and
    /// the selection stay.
    pub fn replace(&mut self, slot: SlotId, launch: SlotLaunch) -> Option<Vec<RowChange>> {
        self.slots.get(&slot)?.runtime.close();
        let title = launch.title.clone();
        let (runtime, finished) = self.start(launch);
        let held = self.slots.get_mut(&slot)?;
        held.title = title;
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

    /// Whether the slot's turn ran with no approval waiting, as of its last refresh.
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
        let running = !waiting && thread_is_running(&view.conversation, &view.transcript);
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

    /// Does what `action` asks. A row toggled returns the slot and the change that remeasures
    /// it; nothing else changes rows.
    pub fn act(&mut self, action: ShellAction) -> Option<(SlotId, Vec<RowChange>)> {
        match action {
            ShellAction::Select(slot) => {
                if self.slots.contains_key(&slot) {
                    self.selected = Some(slot);
                }
                None
            }
            ShellAction::TogglePane(pane) => {
                self.panes.toggle(pane);
                None
            }
            ShellAction::ResizePane { pane, width } => {
                self.panes.resize(pane, width);
                None
            }
            ShellAction::ToggleRow { slot, key } => {
                let held = self.slots.get_mut(&slot)?;
                let at = held.rows.iter().position(|row| row.key() == key);
                if !held.flipped.remove(&key) {
                    held.flipped.insert(key);
                }
                let changes = at.map(|at| RowChange::Remeasure(at..at + 1));
                Some((slot, changes.into_iter().collect()))
            }
        }
    }
}
