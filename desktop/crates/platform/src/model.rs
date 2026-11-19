//! The window's model: the shell's state, and beside it only what GPUI may keep and lose without
//! changing what is right — each slot's scroller, the cached text states of its rows, the panes'
//! layout and the tasks that wait on the sessions.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use closta_presenter::rows::ThreadRow;
use closta_shell::rows::{RowChange, ScrollDirection, kept, list_top};
use closta_shell::slot::{SlotId, SlotLaunch};
use closta_shell::state::{ShellAction, ShellState};
use gpui_kit::component::message_scroller::MessageScrollerState;
use gpui_kit::component::resizable::ResizableState;
use gpui_kit::component::text::TextViewState;
use gpui_kit::*;

use crate::Measure;
use crate::perf::{IdleStart, Measuring};
use crate::thread::prefetch;

/// How often the presented frames are read from the profiler's journal.
const COLLECT_EVERY: Duration = Duration::from_millis(250);
/// How long after the replays ended a slot that has not refreshed by itself is read once more:
/// it had nothing left to fold.
const QUIET: Duration = Duration::from_secs(1);
/// How long a measured run waits for the refresh after the replays before it gives up.
const TIMEOUT: Duration = Duration::from_secs(180);
/// The part of the idle window left out of the CPU time: what the refresh set going settles.
const IDLE_SETTLE: Duration = Duration::from_secs(2);
/// How far the scroll through goes up a frame.
const SCROLL_STEP: usize = 5;
/// How long after the scroll the last frames are given to be presented before the app quits.
const LAST_FRAMES: Duration = Duration::from_millis(300);

pub(crate) struct ShellModel {
    pub(crate) shell: ShellState,
    pub(crate) scrollers: HashMap<SlotId, Entity<MessageScrollerState>>,
    /// The text states of a slot's text rows, by row key.
    pub(crate) texts: HashMap<SlotId, HashMap<String, Entity<TextViewState>>>,
    pub(crate) panes: Entity<ResizableState>,
    watches: HashMap<SlotId, Task<()>>,
    /// The generation of the session each slot's watch waits on.
    generations: HashMap<SlotId, u64>,
    /// The top row a slot's list showed when last looked at, and which way it last moved.
    scrolled: HashMap<SlotId, (usize, ScrollDirection)>,
    /// Whether a prefetch waits for the next frame.
    prefetch_asked: bool,
    /// The measured run's state, when the run is measured.
    measuring: Option<Measuring>,
    measure_tasks: Vec<Task<()>>,
    _observed: Vec<Subscription>,
}

impl ShellModel {
    pub(crate) fn new(
        shell: ShellState,
        launches: Vec<SlotLaunch>,
        measure: Option<Measure>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> ShellModel {
        let mut model = ShellModel {
            shell,
            scrollers: HashMap::new(),
            texts: HashMap::new(),
            panes: cx.new(|_| ResizableState::default()),
            watches: HashMap::new(),
            generations: HashMap::new(),
            scrolled: HashMap::new(),
            prefetch_asked: false,
            measuring: None,
            measure_tasks: Vec::new(),
            _observed: Vec::new(),
        };
        for launch in launches {
            model.open(launch, window, cx);
        }
        if let Some(measure) = measure {
            model.measure(measure, window, cx);
        }
        model
    }

    /// Opens a slot, gives it a scroller and starts waiting on its session.
    fn open(&mut self, launch: SlotLaunch, window: &mut Window, cx: &mut Context<Self>) {
        let slot = self.shell.open(launch);
        let scroller = cx.new(|cx| MessageScrollerState::new(0, cx));
        // A scroll notifies the scroller: the rows coming into view get their text made.
        let observed = cx.observe_in(&scroller, window, |model, _, window, cx| {
            model.ask_prefetch(window, cx);
        });
        self._observed.push(observed);
        self.scrollers.insert(slot, scroller);
        self.watch(slot, window, cx);
    }

    /// Starts the task that waits on the slot's current session and refreshes on each change,
    /// and once more after the session has ended. A task already waiting on the slot is dropped.
    fn watch(&mut self, slot: SlotId, window: &mut Window, cx: &mut Context<Self>) {
        let Some(mut watch) = self.shell.watch(slot) else {
            return;
        };
        let generation = watch.generation();
        self.generations.insert(slot, generation);
        let task = cx.spawn_in(window, async move |this, cx| {
            while watch.changed().await {
                let refreshed = this.update_in(cx, |model, window, cx| {
                    model.refresh(slot, generation, window, cx);
                });
                if refreshed.is_err() {
                    return;
                }
            }
            _ = this.update_in(cx, |model, window, cx| {
                model.refresh(slot, generation, window, cx);
            });
        });
        self.watches.insert(slot, task);
    }

    /// Reads the slot's session again on a change it was told of.
    fn refresh(
        &mut self,
        slot: SlotId,
        generation: u64,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.refresh_as(slot, generation, false, window, cx);
    }

    /// Reads the slot's session again and hands the changes of its rows to its scroller. The
    /// cached text rows among the remeasured and the newly spliced rows take their new text;
    /// the cached text states outside the kept rows are let go. A `reread` is the measured run's
    /// look after the replays ended, not a change the slot was told of: it is not an update.
    fn refresh_as(
        &mut self,
        slot: SlotId,
        generation: u64,
        reread: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let began = Instant::now();
        let Some(refresh) = self.shell.refresh(slot, generation) else {
            return;
        };
        let Some(scroller) = self.scrollers.get(&slot).cloned() else {
            return;
        };
        let unchanged = refresh.changes.is_empty();
        let rows = self.shell.rows(slot);
        let texts = self.texts.entry(slot).or_default();
        let mut retexts = Vec::new();
        for change in &refresh.changes {
            let changed = match change {
                RowChange::Splice { range, count } => {
                    scroller.update(cx, |state, cx| state.splice(range.clone(), *count, cx));
                    range.start..range.start + count
                }
                RowChange::Remeasure(range) => {
                    scroller.update(cx, |state, cx| state.remeasure_items(range.clone(), cx));
                    range.clone()
                }
            };
            for row in rows.get(changed).unwrap_or_default() {
                if let ThreadRow::Text(text) = row
                    && let Some(state) = texts.get(&text.key)
                {
                    retexts.push((state.clone(), text.markdown.clone()));
                }
            }
        }
        for (state, markdown) in retexts {
            state.update(cx, |state, cx| state.set_text(&markdown, cx));
        }
        self.let_go(slot, window, cx);
        let done = Instant::now();
        // A reread that changed nothing leaves the slot as its last refresh left it.
        let refreshed_at = match &mut self.measuring {
            Some(measuring) if !reread => {
                measuring.record_ms("update_ms", done.saturating_duration_since(began));
                measuring.note_natural_refresh(slot, done);
                done
            }
            Some(measuring) if unchanged => measuring.last_refresh(slot).unwrap_or(done),
            _ => done,
        };
        if self.shell.selected() == Some(slot) && self.prefetch(window, cx) {
            self.ask_prefetch(window, cx);
        }
        if self
            .measuring
            .as_mut()
            .is_some_and(|measuring| measuring.note_refresh(slot, refreshed_at))
        {
            self.refreshed(window, cx);
        }
        cx.notify();
    }

    /// Lets go of the slot's cached text states outside the rows kept around what is visible.
    fn let_go(&mut self, slot: SlotId, window: &Window, cx: &App) {
        let (Some(scroller), Some(texts)) = (self.scrollers.get(&slot), self.texts.get_mut(&slot))
        else {
            return;
        };
        let rows = self.shell.rows(slot);
        let visible = prefetch::visible_rows(window);
        let top = top_of(scroller, visible, rows.len(), cx);
        let kept = kept(top, visible, rows.len());
        let keys: std::collections::HashSet<&str> = rows[kept]
            .iter()
            .filter(|row| matches!(row, ThreadRow::Text(_)))
            .map(ThreadRow::key)
            .collect();
        texts.retain(|key, _| keys.contains(key.as_str()));
    }

    /// Makes the text states of the selected slot's rows about to come into view, a frame's
    /// quota of them. Returns whether rows remain to be made.
    fn prefetch(&mut self, window: &Window, cx: &mut Context<Self>) -> bool {
        let Some(slot) = self.shell.selected() else {
            return false;
        };
        let Some(scroller) = self.scrollers.get(&slot) else {
            return false;
        };
        let visible = prefetch::visible_rows(window);
        let top = top_of(scroller, visible, self.shell.rows(slot).len(), cx);
        let direction = match self.scrolled.get(&slot) {
            Some((was, _)) if top < *was => ScrollDirection::Up,
            Some((was, _)) if top > *was => ScrollDirection::Down,
            Some((_, direction)) => *direction,
            None => ScrollDirection::Up,
        };
        self.scrolled.insert(slot, (top, direction));
        let rows = self.shell.rows(slot);
        let texts = self.texts.entry(slot).or_default();
        let (began, before) = (Instant::now(), texts.len());
        let more = prefetch::make(top, visible, direction, rows, texts, cx);
        let made = texts.len() > before;
        if let Some(measuring) = self.measuring.as_mut().filter(|_| made) {
            measuring.record_ms("prefetch_ms", began.elapsed());
        }
        more
    }

    /// Asks for one prefetch at the start of the next frame, outside the draw; it asks again
    /// while rows remain, and stops asking once none do.
    pub(crate) fn ask_prefetch(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.prefetch_asked {
            return;
        }
        self.prefetch_asked = true;
        let this = cx.weak_entity();
        window.on_next_frame(move |window, cx| {
            _ = this.update(cx, |model, cx| {
                model.prefetch_asked = false;
                if let Some(slot) = model.shell.selected() {
                    model.let_go(slot, window, cx);
                }
                if model.prefetch(window, cx) {
                    model.ask_prefetch(window, cx);
                }
            });
        });
    }

    /// Does what a click asks of the shell and draws again.
    pub(crate) fn act(&mut self, action: ShellAction, window: &mut Window, cx: &mut Context<Self>) {
        let selects = matches!(action, ShellAction::Select(_));
        let toggles = matches!(action, ShellAction::TogglePane(_));
        if let Some((slot, changes)) = self.shell.act(action).rows
            && let Some(scroller) = self.scrollers.get(&slot)
        {
            scroller.update(cx, |state, cx| {
                for change in changes {
                    if let RowChange::Remeasure(range) = change {
                        state.remeasure_items(range, cx);
                    }
                }
            });
        }
        if selects {
            self.ask_prefetch(window, cx);
        }
        if toggles {
            // A pane opened again comes back at the width its layout last had, which a drag on
            // the handle left beside the closed pane can have changed.
            let this = cx.weak_entity();
            window.on_next_frame(move |window, cx| {
                _ = this.update(cx, |model, cx| model.match_pane_widths(window, cx));
            });
        }
        cx.notify();
    }
}

/// The measured run (`Measure`), driven by the window's tasks.
impl ShellModel {
    /// Starts measuring: collects the frames, waits for the replays to end and gives up after
    /// [`TIMEOUT`].
    fn measure(&mut self, measure: Measure, window: &mut Window, cx: &mut Context<Self>) {
        let Measure {
            started,
            perf_log,
            ready_file,
            finished,
            exit_after,
            scroll_through,
        } = measure;
        let measuring = Measuring::new(
            started,
            perf_log.as_deref(),
            ready_file,
            exit_after,
            scroll_through,
            cx,
        );
        if measuring.collects_frames() {
            self.measure_tasks.push(cx.spawn(async move |this, cx| {
                loop {
                    cx.background_executor().timer(COLLECT_EVERY).await;
                    let collected = this.update(cx, |model, _| {
                        if let Some(measuring) = &mut model.measuring {
                            measuring.collect();
                        }
                    });
                    if collected.is_err() {
                        return;
                    }
                }
            }));
        }
        self.measuring = Some(measuring);
        self.measure_tasks
            .push(cx.spawn_in(window, async move |this, cx| {
                if let Some(finished) = finished {
                    finished.await;
                }
                _ = this.update_in(cx, |model, window, cx| model.replays_ended(window, cx));
                cx.background_executor().timer(QUIET).await;
                _ = this.update_in(cx, |model, window, cx| model.refresh_awaited(window, cx));
            }));
        self.measure_tasks.push(cx.spawn(async move |this, cx| {
            let left = TIMEOUT.saturating_sub(started.elapsed());
            cx.background_executor().timer(left).await;
            _ = this.update(cx, |model, cx| model.time_out(cx));
        }));
    }

    /// Every replay was written: each slot's next refresh is awaited.
    fn replays_ended(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let slots: Vec<SlotId> = self.shell.slots().iter().map(|slot| slot.id).collect();
        if self
            .measuring
            .as_mut()
            .is_some_and(|measuring| measuring.ready(slots))
        {
            self.refreshed(window, cx);
        }
    }

    /// Reads once more each slot that has not refreshed since the replays ended: its session
    /// had nothing left to fold, so its last refresh already showed the end.
    fn refresh_awaited(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let awaited = self
            .measuring
            .as_ref()
            .map(Measuring::awaited)
            .unwrap_or_default();
        for slot in awaited {
            if let Some(generation) = self.generations.get(&slot).copied() {
                self.refresh_as(slot, generation, true, window, cx);
            }
        }
    }

    /// Every slot refreshed after the replays ended. With `exit_after`, the idle CPU time is
    /// taken over the window from its 2nd second, then the scroll through or the end follows.
    fn refreshed(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let rows = self
            .shell
            .slots()
            .iter()
            .map(|slot| self.shell.rows(slot.id).len())
            .sum();
        let Some(measuring) = &mut self.measuring else {
            return;
        };
        measuring.write_refreshed(rows);
        let Some(exit_after) = measuring.exit_after else {
            return;
        };
        self.measure_tasks
            .push(cx.spawn_in(window, async move |this, cx| {
                let end = Instant::now() + exit_after;
                let executor = cx.background_executor().clone();
                if exit_after > IDLE_SETTLE {
                    executor.timer(IDLE_SETTLE).await;
                    let idle = IdleStart::now();
                    executor
                        .timer(end.saturating_duration_since(Instant::now()))
                        .await;
                    _ = this.update(cx, |model, _| {
                        if let Some(measuring) = &mut model.measuring {
                            measuring.record_idle(idle);
                        }
                    });
                } else {
                    executor.timer(exit_after).await;
                }
                _ = this.update_in(cx, |model, window, cx| model.after_idle(window, cx));
            }));
    }

    /// Starts the scroll through from the tail, or ends the run.
    fn after_idle(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let rows = self
            .shell
            .selected()
            .map(|slot| self.shell.rows(slot).len());
        match (&mut self.measuring, rows) {
            (Some(measuring), Some(rows)) if measuring.scroll_through => {
                measuring.record("scroll_start", 1.0);
                measuring.scroll_at = Some(rows);
                self.scroll_step(window, cx);
            }
            _ => self.finish(window, cx),
        }
    }

    /// One frame of the scroll through: up [`SCROLL_STEP`] rows; at the head, the working set
    /// is written and the run ends.
    fn scroll_step(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let scroller = self
            .shell
            .selected()
            .and_then(|slot| self.scrollers.get(&slot).cloned());
        let (Some(measuring), Some(scroller)) = (&mut self.measuring, scroller) else {
            return;
        };
        let Some(at) = measuring.scroll_at else {
            return;
        };
        if at == 0 {
            measuring.record("scroll_end", 1.0);
            measuring.record_working_set();
            self.finish(window, cx);
            return;
        }
        let at = at.saturating_sub(SCROLL_STEP);
        measuring.scroll_at = Some(at);
        scroller.update(cx, |state, cx| {
            state.scroll_to_item(at, cx);
        });
        let this = cx.weak_entity();
        window.on_next_frame(move |window, cx| {
            _ = this.update(cx, |model, cx| model.scroll_step(window, cx));
        });
        cx.notify();
    }

    /// Gives the last frames time to be presented, writes them and quits.
    fn finish(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.measure_tasks
            .push(cx.spawn_in(window, async move |this, cx| {
                cx.background_executor().timer(LAST_FRAMES).await;
                _ = this.update(cx, |model, cx| {
                    if let Some(measuring) = &mut model.measuring {
                        measuring.collect();
                    }
                    cx.quit();
                });
            }));
    }

    /// Gives up on a run that has not refreshed, or has not ended, by [`TIMEOUT`].
    fn time_out(&mut self, cx: &mut Context<Self>) {
        let Some(measuring) = &mut self.measuring else {
            return;
        };
        if measuring.is_refreshed() && measuring.exit_after.is_none() {
            return;
        }
        measuring.record("timeout", 1.0);
        measuring.collect();
        cx.quit();
    }
}

/// The top row of the slot's list to keep and prefetch around.
fn top_of(scroller: &Entity<MessageScrollerState>, visible: usize, len: usize, cx: &App) -> usize {
    let state = scroller.read(cx);
    list_top(
        state.logical_scroll_top().item_ix,
        state.is_following_tail(),
        visible,
        len,
    )
}
