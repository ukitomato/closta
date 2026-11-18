//! The window's model: the shell's state, and beside it only what GPUI may keep and lose without
//! changing what is right — each slot's scroller, the cached text states of its rows, the panes'
//! layout and the tasks that wait on the sessions.

use std::collections::HashMap;

use closta_presenter::rows::ThreadRow;
use closta_shell::rows::{RowChange, ScrollDirection, kept};
use closta_shell::slot::{SlotId, SlotLaunch};
use closta_shell::state::{ShellAction, ShellState};
use gpui_kit::component::message_scroller::MessageScrollerState;
use gpui_kit::component::resizable::ResizableState;
use gpui_kit::component::text::TextViewState;
use gpui_kit::*;

use crate::thread::prefetch;

pub(crate) struct ShellModel {
    pub(crate) shell: ShellState,
    pub(crate) scrollers: HashMap<SlotId, Entity<MessageScrollerState>>,
    /// The text states of a slot's text rows, by row key.
    pub(crate) texts: HashMap<SlotId, HashMap<String, Entity<TextViewState>>>,
    pub(crate) panes: Entity<ResizableState>,
    watches: HashMap<SlotId, Task<()>>,
    /// The top row a slot's list showed when last looked at, and which way it last moved.
    scrolled: HashMap<SlotId, (usize, ScrollDirection)>,
    /// Whether a prefetch waits for the next frame.
    prefetch_asked: bool,
    _observed: Vec<Subscription>,
}

impl ShellModel {
    pub(crate) fn new(
        shell: ShellState,
        launches: Vec<SlotLaunch>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> ShellModel {
        let mut model = ShellModel {
            shell,
            scrollers: HashMap::new(),
            texts: HashMap::new(),
            panes: cx.new(|_| ResizableState::default()),
            watches: HashMap::new(),
            scrolled: HashMap::new(),
            prefetch_asked: false,
            _observed: Vec::new(),
        };
        for launch in launches {
            model.open(launch, window, cx);
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

    /// Reads the slot's session again and hands the changes of its rows to its scroller. The
    /// cached text rows among the remeasured and the newly spliced rows take their new text;
    /// the cached text states outside the kept rows are let go.
    fn refresh(
        &mut self,
        slot: SlotId,
        generation: u64,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(refresh) = self.shell.refresh(slot, generation) else {
            return;
        };
        let Some(scroller) = self.scrollers.get(&slot).cloned() else {
            return;
        };
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
        if self.shell.selected() == Some(slot) && self.prefetch(window, cx) {
            self.ask_prefetch(window, cx);
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
        let top = scroller.read(cx).logical_scroll_top().item_ix;
        let kept = kept(top, prefetch::visible_rows(window), rows.len());
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
        let top = scroller.read(cx).logical_scroll_top().item_ix;
        let direction = match self.scrolled.get(&slot) {
            Some((was, _)) if top < *was => ScrollDirection::Up,
            Some((was, _)) if top > *was => ScrollDirection::Down,
            Some((_, direction)) => *direction,
            None => ScrollDirection::Up,
        };
        self.scrolled.insert(slot, (top, direction));
        let visible = prefetch::visible_rows(window);
        let rows = self.shell.rows(slot);
        let texts = self.texts.entry(slot).or_default();
        prefetch::make(top, visible, direction, rows, texts, cx)
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
        if let Some((slot, changes)) = self.shell.act(action)
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
        cx.notify();
    }
}
