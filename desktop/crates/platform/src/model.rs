//! The window's model: the shell's state, and beside it only what GPUI may keep and lose without
//! changing what is right — each slot's scroller and input, the cached text states of its rows,
//! the New Session dialog's folder field, the panes' layout, the focus handles and what the
//! waiting cards are drawn with, and the tasks that wait on the sessions.

use std::collections::HashMap;
use std::rc::Rc;
use std::time::{Duration, Instant};

use closta_presenter::cards::ThreadCard;
use closta_presenter::rows::ThreadRow;
use closta_shell::card_keys::{OverlayKey, card_choices, card_kind};
use closta_shell::resume::{ResumeStage, restore_settled};
use closta_shell::rows::{RowChange, ScrollDirection, kept, list_top};
use closta_shell::slot::{SlotId, SlotLaunch};
use closta_shell::state::{
    Acted, FocusTarget, FolderCheck, Overlay, ProjectCheck, ShellAction, ShellState,
};
use gpui_kit::component::input::{InputState, TextareaState};
use gpui_kit::component::message_scroller::MessageScrollerState;
use gpui_kit::component::resizable::ResizableState;
use gpui_kit::component::text::TextViewState;
use gpui_kit::*;

use crate::Measure;
use crate::clock::WallClock;
use crate::composer::{self, Dispatch};
use crate::focus::{self, CardField, FocusMap, ResumeAtKey};
use crate::perf::{IdleStart, Measuring};
use crate::probe::{Probe, Probing};
use crate::thread::cards::CardCache;
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
    /// Each slot's input box; its text is a copy of the slot's draft.
    pub(crate) composers: HashMap<SlotId, Entity<TextareaState>>,
    /// The New Session dialog's folder field, made the first time the dialog opens; its text is
    /// a copy of the dialog's folder.
    pub(crate) folder: Option<Entity<InputState>>,
    /// The wait for the typing in the folder field to settle.
    pub(crate) folder_typing: Option<Task<()>>,
    /// The resume popup's search field, made the first time the popup opens; its text is a copy
    /// of the popup's search.
    pub(crate) resume_field: Option<Entity<InputState>>,
    /// Where the resume popup's rows are scrolled to.
    pub(crate) resume_scroll: ScrollHandle,
    pub(crate) panes: Entity<ResizableState>,
    /// The one clock the shell is handed times from.
    pub(crate) clock: WallClock,
    /// Where the needs-you list is scrolled to and where its rows were laid out.
    pub(crate) needs_you_scroll: ScrollHandle,
    /// The wait before the left pane is drawn again to move its elapsed times on; there only
    /// while a row with one is drawn.
    pub(crate) elapsed_tick: Option<Task<()>>,
    /// Where the keyboard can be: the inputs, the cards, the list, the conversation and the
    /// failure band.
    pub(crate) focus: FocusMap,
    /// What the waiting cards are drawn with besides their focus.
    pub(crate) card_cache: CardCache,
    /// Where the keyboard was before the overlay that is up took it, to give it back.
    pub(crate) focus_before_overlay: Option<FocusHandle>,
    /// The gate every key of the window passes first.
    _keys: Subscription,
    watches: HashMap<SlotId, Task<()>>,
    /// The generation of the session each slot's watch waits on.
    generations: HashMap<SlotId, u64>,
    /// The top row a slot's list showed when last looked at, and which way it last moved.
    scrolled: HashMap<SlotId, (usize, ScrollDirection)>,
    /// Whether a prefetch waits for the next frame.
    prefetch_asked: bool,
    /// How many prefetches were asked for, for a test to see one was.
    #[cfg(test)]
    pub(crate) prefetch_asks: usize,
    /// The measured run's state, when the run is measured.
    measuring: Option<Measuring>,
    measure_tasks: Vec<Task<()>>,
    /// The check's run, when the run is one.
    pub(crate) probing: Option<Probing>,
    probe_close: Option<Task<()>>,
    pub(crate) _observed: Vec<Subscription>,
}

impl ShellModel {
    pub(crate) fn new(
        shell: ShellState,
        launches: Vec<SlotLaunch>,
        measure: Option<Measure>,
        probe: Option<Probe>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> ShellModel {
        let keys = Self::hold_keys(cx);
        let mut model = ShellModel {
            shell,
            scrollers: HashMap::new(),
            texts: HashMap::new(),
            composers: HashMap::new(),
            folder: None,
            folder_typing: None,
            resume_field: None,
            resume_scroll: ScrollHandle::new(),
            panes: cx.new(|_| ResizableState::default()),
            clock: WallClock::start(),
            needs_you_scroll: ScrollHandle::new(),
            elapsed_tick: None,
            focus: FocusMap::new(cx),
            card_cache: CardCache::default(),
            focus_before_overlay: None,
            _keys: keys,
            watches: HashMap::new(),
            generations: HashMap::new(),
            scrolled: HashMap::new(),
            prefetch_asked: false,
            #[cfg(test)]
            prefetch_asks: 0,
            measuring: None,
            measure_tasks: Vec::new(),
            probing: probe.map(Probing::new),
            probe_close: None,
            _observed: Vec::new(),
        };
        Self::hold_close(window, cx);
        // A key released while another window had the keyboard is never seen going up.
        let activation = cx.observe_window_activation(window, |model, _, _| {
            model.focus.repeats.borrow_mut().clear();
        });
        model._observed.push(activation);
        for launch in launches {
            model.open(launch, window, cx);
        }
        if let Some(measure) = measure {
            model.measure(measure, window, cx);
        }
        model.show_title(window);
        model.focus.selected = model.shell.selected();
        model
    }

    /// Opens a slot, gives it a scroller and an input and starts waiting on its session.
    fn open(&mut self, launch: SlotLaunch, window: &mut Window, cx: &mut Context<Self>) {
        let slot = self.shell.open(launch);
        self.prepare(slot, window, cx);
        self.watch(slot, window, cx);
    }

    /// Gives the slot a scroller and an input, unless it has them.
    fn prepare(&mut self, slot: SlotId, window: &mut Window, cx: &mut Context<Self>) {
        if !self.scrollers.contains_key(&slot) {
            let scroller = cx.new(|cx| MessageScrollerState::new(0, cx));
            // A scroll notifies the scroller: the rows coming into view get their text made.
            let observed = cx.observe_in(&scroller, window, |model, _, window, cx| {
                model.ask_prefetch(window, cx);
            });
            self._observed.push(observed);
            self.scrollers.insert(slot, scroller);
        }
        if !self.composers.contains_key(&slot) {
            let (input, changes) = composer::new_input(slot, Self::dispatch(cx), window, cx);
            self._observed.push(changes);
            let handle = input.read(cx).focus_handle(cx);
            self.focus.composers.insert(slot, handle);
            self.composers.insert(slot, input);
        }
    }

    /// Puts the gate in front of every key: what a key does is read from where the keyboard is,
    /// by the shell's card table, before the focused part's bindings run.
    fn hold_keys(cx: &mut Context<Self>) -> Subscription {
        let this = cx.weak_entity();
        let dialog = cx.weak_entity();
        focus::hold_keys(
            move |keystroke, window, cx| {
                let model = this.upgrade()?;
                let (field, picked) = {
                    let model = model.read(cx);
                    let up = model.shell.resume().is_some();
                    let field = model.resume_field.clone().filter(|_| up);
                    (field, model.shell.resume_picked())
                };
                // Read before the model is: the field reads it only with both to change.
                let resume = ResumeAtKey {
                    composing: field.is_some_and(|field| focus::composing(&field, window, cx)),
                    picked,
                };
                let model = model.read(cx);
                let cursor = model.shell.nav_cursor();
                Some(
                    model
                        .focus
                        .gate(keystroke, model.clock.now_ms(), cursor, &resume, window, cx),
                )
            },
            Self::dispatch(cx),
            Rc::new(move |key, window, cx| {
                _ = dialog.update(cx, |model, cx| match key {
                    OverlayKey::Cancel => model.cancel(window, cx),
                    OverlayKey::Confirm => model.start(window, cx),
                    OverlayKey::Pass => {}
                });
            }),
            cx,
        )
    }

    /// Hands an action to the window's model.
    pub(crate) fn dispatch(cx: &Context<Self>) -> Dispatch {
        let this = cx.weak_entity();
        Rc::new(move |action, window, cx| {
            _ = this.update(cx, |model, cx| model.act(action, window, cx));
        })
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
        let Some(refresh) = self.shell.refresh(slot, generation, self.clock.now_ms()) else {
            return;
        };
        if refresh.attention {
            window.request_attention();
        }
        self.show_title(window);
        self.sync_focus(window.focused(cx), window, cx);
        // A band the session took down (a restart, a mode it switched to) gives the keyboard back.
        if !self.shell.bypass_asking(slot) {
            self.focus.leave_bypass(slot, window, cx);
        }
        if refresh.removed {
            self.forget(slot, window, cx);
            cx.notify();
            return;
        }
        self.probe_settled(window, cx);
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
        self.keep_waiting_cards(slot, window, cx);
        if self.shell.selected() == Some(slot)
            && let Some(request_id) = refresh.raised.first()
        {
            self.card_arrived(slot, request_id, window, cx);
        }
        self.let_go(slot, window, cx);
        let done = Instant::now();
        // A reread that changed nothing leaves the slot as its last refresh left it.
        let refreshed_at = match &mut self.measuring {
            Some(measuring) if !reread => {
                measuring.record_ms("update_ms", done.saturating_duration_since(began));
                measuring.note_natural_refresh(slot, done);
                if restore_settled(self.shell.status(slot).as_ref()) {
                    measuring.resume_restored(slot);
                }
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
        #[cfg(test)]
        {
            self.prefetch_asks += 1;
        }
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

    /// Does what a click or a key asks of the shell, carries out what the shell says the screen
    /// is to do about it, and draws again.
    pub(crate) fn act(&mut self, action: ShellAction, window: &mut Window, cx: &mut Context<Self>) {
        // Whatever selected it — a click, Enter on the list, a jump to a wait — another slot
        // shown needs its rows made.
        let selected_before = self.shell.selected();
        let panes_before = {
            let panes = self.shell.panes();
            (panes.left_open, panes.right_open)
        };
        let opens = matches!(
            action,
            ShellAction::OpenNewSession | ShellAction::OpenNewSessionHere
        );
        let bypass = match action {
            ShellAction::PickMode { slot, .. }
            | ShellAction::ConfirmBypass { slot }
            | ShellAction::CancelBypass { slot } => Some(slot),
            _ => None,
        };
        let resume_before = self.shell.resume().is_some();
        let is_pick = matches!(action, ShellAction::PickResume { .. });
        let opens_resume = matches!(action, ShellAction::OpenResume { .. });
        let lists_resume = matches!(action, ShellAction::SavedListed { .. });
        let moves_pick = matches!(
            action,
            ShellAction::MoveResume { .. } | ShellAction::EditResumeQuery { .. }
        );
        // Taken before the dialog's field takes the keyboard, to give it back once it closes.
        let focused = window.focused(cx);
        let Acted {
            rows,
            draft,
            started,
            check,
            project_check,
            folder,
            close,
            removed,
            clipboard,
            focus,
            listing,
        } = self.shell.act(action);
        let selects = self.shell.selected() != selected_before;
        if let Some(measuring) = &mut self.measuring {
            if opens_resume {
                measuring.resume_opened();
            }
            // A stale answer leaves the stage as it was, which is not yet listed.
            if lists_resume
                && self
                    .shell
                    .resume()
                    .is_some_and(|it| it.stage != ResumeStage::Loading)
            {
                measuring.resume_listed();
            }
            if let Some(slot) = started.filter(|_| is_pick) {
                measuring.resume_picked(slot);
            }
        }
        // Whatever opened or shut a pane — its button, or the key that goes to the list.
        let toggles = {
            let panes = self.shell.panes();
            (panes.left_open, panes.right_open) != panes_before
        };
        self.show_title(window);
        for slot in removed {
            self.forget(slot, window, cx);
        }
        // A restarted slot's rows are new: the text states of the old ones are let go.
        if let Some(slot) = started.filter(|slot| self.scrollers.contains_key(slot)) {
            self.texts.remove(&slot);
            self.scrolled.remove(&slot);
            self.keep_cards(slot, &[], window, cx);
        }
        if let Some((slot, changes)) = rows
            && let Some(scroller) = self.scrollers.get(&slot)
        {
            scroller.update(cx, |state, cx| {
                for change in changes {
                    match change {
                        RowChange::Splice { range, count } => {
                            state.splice(range, count, cx);
                        }
                        RowChange::Remeasure(range) => {
                            state.remeasure_items(range, cx);
                        }
                    }
                }
            });
        }
        if let Some(slot) = draft
            && let Some(input) = self.composers.get(&slot)
        {
            composer::fill(input, self.shell.draft(slot), window, cx);
        }
        if let Some(slot) = started {
            self.prepare(slot, window, cx);
            self.watch(slot, window, cx);
        }
        if let Some(check) = check {
            self.check(check, window, cx);
        }
        if let Some(check) = project_check {
            self.check_project(check, window, cx);
        }
        if let Some(text) = clipboard {
            cx.write_to_clipboard(ClipboardItem::new_string(text));
        }
        if folder {
            self.fill_folder(opens, window, cx);
        }
        if close {
            self.close_sessions(cx);
        }
        if let Some(listing) = listing {
            self.list_saved(listing, window, cx);
        }
        if !resume_before && self.shell.resume().is_some() {
            self.clear_resume_field(window, cx);
        }
        // Only when the pick moved: a wheel over the rows scrolls them freely.
        if let Some(picker) = self.shell.resume().filter(|_| moves_pick) {
            self.resume_scroll.scroll_to_item(picker.selected);
        }
        // After the close began too: the overlay it puts up holds the keys from then on.
        self.sync_focus(focused, window, cx);
        if let Some(slot) = bypass {
            self.focus_bypass(slot, window, cx);
        }
        if selects || started.is_some() {
            self.ask_prefetch(window, cx);
        }
        if let Some(focus) = focus {
            self.focus_target(focus, window, cx);
        }
        if toggles {
            // A key released while the pane it went to was hidden may go unseen.
            self.focus.repeats.borrow_mut().clear();
            // A pane opened again comes back at the width its layout last had, which a drag on
            // the handle left beside the closed pane can have changed.
            let this = cx.weak_entity();
            window.on_next_frame(move |window, cx| {
                _ = this.update(cx, |model, cx| model.match_pane_widths(window, cx));
            });
        }
        cx.notify();
    }

    /// Sets the window's title when the shell says it changed.
    fn show_title(&mut self, window: &mut Window) {
        if let Some(title) = self.shell.title_change() {
            window.set_window_title(&title);
        }
    }

    /// Lets go of all that was kept for a slot that is gone. A measured run stops awaiting it.
    fn forget(&mut self, slot: SlotId, window: &mut Window, cx: &mut Context<Self>) {
        self.scrollers.remove(&slot);
        self.texts.remove(&slot);
        self.composers.remove(&slot);
        self.watches.remove(&slot);
        self.generations.remove(&slot);
        self.scrolled.remove(&slot);
        self.focus.forget(slot);
        self.card_cache.keep_cards(slot, &[]);
        if self
            .measuring
            .as_mut()
            .is_some_and(|measuring| measuring.forget(slot))
        {
            self.refreshed(window, cx);
        }
    }

    /// Puts the keyboard where the shell says: on a card or its note once its row is scrolled
    /// to (a question's first option rather than the card), on the input or on the band.
    pub(crate) fn focus_target(
        &mut self,
        target: FocusTarget,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let handle = match target {
            FocusTarget::Composer(slot) => {
                if let Some(input) = self.composers.get(&slot) {
                    input.update(cx, |state, cx| state.focus(window, cx));
                }
                return;
            }
            FocusTarget::Nav => self.focus.list.clone(),
            // Its Restart, or the band itself when the session cannot be restarted.
            FocusTarget::EndedBand(slot) => {
                let can_restart = self.shell.can_restart(slot);
                self.focus.ended_focus(slot, can_restart, cx)
            }
            FocusTarget::FailureBand(_) => self.focus.failure.clone(),
            FocusTarget::Card { slot, request_id } => {
                let Some(handle) = self.card_focus(slot, &request_id, cx) else {
                    return;
                };
                self.scroll_to_card(slot, &request_id, cx);
                handle
            }
            FocusTarget::CardNote { slot, request_id } => {
                let placeholder = match self.card(slot, &request_id) {
                    Some(ThreadCard::Plan(_)) => closta_shell::copy::PLAN_NOTE_PLACEHOLDER,
                    Some(_) => closta_shell::copy::DENY_NOTE_PLACEHOLDER,
                    None => return,
                };
                let note = self
                    .shell
                    .card_state(slot, &request_id)
                    .map(|it| it.note.clone())
                    .unwrap_or_default();
                let dispatch = Self::dispatch(cx);
                let input = self.focus.card_input(
                    slot,
                    &request_id,
                    CardField::Note,
                    placeholder,
                    &note,
                    &dispatch,
                    self.clock,
                    window,
                    cx,
                );
                self.scroll_to_card(slot, &request_id, cx);
                input.read(cx).focus_handle(cx)
            }
        };
        window.focus(&handle, cx);
        // The row scrolled to is drawn only in the next frame; the focus is put again then, in
        // case the first went to a part not yet on screen.
        window.on_next_frame(move |window, cx| window.focus(&handle, cx));
    }

    /// The waiting card of the request among the slot's rows.
    fn card(&self, slot: SlotId, request_id: &str) -> Option<&ThreadCard> {
        let at = self.shell.card_at(slot, request_id)?;
        match self.shell.rows(slot).get(at)? {
            ThreadRow::Card(row) if row.card.answered().is_none() => Some(&row.card),
            _ => None,
        }
    }

    /// Where the keyboard goes for a card: a question's first option, any other card itself.
    fn card_focus(
        &mut self,
        slot: SlotId,
        request_id: &str,
        cx: &mut Context<Self>,
    ) -> Option<FocusHandle> {
        let card = self.card(slot, request_id)?.clone();
        let handle =
            self.focus
                .card_handle(slot, request_id, card_kind(&card), card_choices(&card), cx);
        Some(match &card {
            ThreadCard::Question(question)
                if question
                    .questions
                    .first()
                    .is_some_and(|it| !it.options.is_empty()) =>
            {
                self.focus.option_handle(slot, request_id, 0, 0, cx)
            }
            _ => handle,
        })
    }

    fn scroll_to_card(&self, slot: SlotId, request_id: &str, cx: &mut Context<Self>) {
        if let (Some(at), Some(scroller)) = (
            self.shell.card_at(slot, request_id),
            self.scrollers.get(&slot),
        ) {
            scroller.update(cx, |state, cx| {
                state.scroll_to_item(at, cx);
            });
        }
    }

    /// A card began to wait in the selected slot: it takes the keyboard only from the
    /// conversation.
    fn card_arrived(
        &mut self,
        slot: SlotId,
        request_id: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        // A card out of view never takes the keyboard: it would take keys it does not show.
        let Some(scroller) = self.scrollers.get(&slot) else {
            return;
        };
        let (Some(at), len) = (
            self.shell.card_at(slot, request_id),
            self.shell.rows(slot).len(),
        ) else {
            return;
        };
        let following = scroller.read(cx).is_following_tail();
        if !focus::on_screen(following, at, len, prefetch::visible_rows(window)) {
            return;
        }
        if let Some(handle) = self.card_focus(slot, request_id, cx) {
            self.focus.card_arrived(&handle, window, cx);
        }
    }

    /// Copies what the gate reads from the shell: the overlay that is up and which slot is
    /// shown. A slot shown anew takes the keyboard to its input. An overlay that comes up takes
    /// the keyboard, and gives it back to where it was (`focused`, before the action) once it
    /// closes, or to the input of a slot shown meanwhile.
    fn sync_focus(
        &mut self,
        focused: Option<FocusHandle>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let (was, overlay) = (self.focus.overlay, self.shell.overlay());
        if was.is_none() && overlay.is_some() {
            self.focus_before_overlay = focused;
        }
        self.focus.overlay = overlay;
        let selected = self.shell.selected();
        let selects = selected != self.focus.selected;
        if selects {
            let to = self.focus.select(selected, window, cx);
            if overlay.is_some() {
                self.focus_before_overlay = Some(to);
            }
        }
        match overlay {
            Some(overlay) if was != Some(overlay) => self.focus_overlay(overlay, window, cx),
            None if was.is_some() => {
                let back = self.focus_before_overlay.take();
                if let Some(back) = back.filter(|_| !selects) {
                    window.focus(&back, cx);
                }
            }
            _ => {}
        }
    }

    /// Puts the keyboard in the overlay that just came up: the dialog's folder field, the resume
    /// popup's search field, the Cancel of a close question, or the layer that says the sessions are closing. A part
    /// first drawn in the next frame is focused again then.
    fn focus_overlay(&mut self, overlay: Overlay, window: &mut Window, cx: &mut Context<Self>) {
        let handle = match overlay {
            Overlay::NewSession => match &self.folder {
                Some(input) => input.read(cx).focus_handle(cx),
                None => return,
            },
            Overlay::Resume => match &self.resume_field {
                Some(input) => input.read(cx).focus_handle(cx),
                None => self.focus.overlay_layer.clone(),
            },
            Overlay::CloseWindow | Overlay::CloseSlot => self.focus.overlay_cancel.clone(),
            Overlay::Closing => self.focus.overlay_layer.clone(),
        };
        window.focus(&handle, cx);
        window.on_next_frame(move |window, cx| window.focus(&handle, cx));
    }

    /// The Bypass band takes the keyboard while it asks; once it is gone, the keyboard it held
    /// goes back to the slot's input.
    fn focus_bypass(&mut self, slot: SlotId, window: &mut Window, cx: &mut Context<Self>) {
        if self.shell.bypass_asking(slot) {
            self.focus.take_bypass(slot, window, cx);
        } else {
            self.focus.leave_bypass(slot, window, cx);
        }
    }

    /// Lets go of the focus and the cache of the slot's cards that no longer wait.
    fn keep_waiting_cards(&mut self, slot: SlotId, window: &mut Window, cx: &mut Context<Self>) {
        let waiting: Vec<String> = self
            .shell
            .rows(slot)
            .iter()
            .filter_map(|row| match row {
                ThreadRow::Card(row) if row.card.answered().is_none() => {
                    Some(row.card.request_id().to_owned())
                }
                _ => None,
            })
            .collect();
        let waiting: Vec<&str> = waiting.iter().map(String::as_str).collect();
        self.keep_cards(slot, &waiting, window, cx);
    }

    /// Lets go of what is kept for the slot's cards but `waiting`. When the keyboard was on one
    /// that goes, it goes back to the conversation.
    fn keep_cards(
        &mut self,
        slot: SlotId,
        waiting: &[&str],
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let held = self.focus.holding(window, cx);
        self.focus.keep_cards(slot, waiting);
        self.card_cache.keep_cards(slot, waiting);
        if let Some((at, request_id)) = held
            && at == slot
            && !waiting.contains(&request_id.as_str())
        {
            window.focus(&self.focus.thread, cx);
        }
    }

    /// Looks for the folder in the background and hands the answer back to the shell.
    fn check(&mut self, check: FolderCheck, window: &mut Window, cx: &mut Context<Self>) {
        let FolderCheck { folder, exists } = check;
        cx.spawn_in(window, async move |this, cx| {
            let exists = exists.await;
            _ = this.update_in(cx, |model, window, cx| {
                model.act(ShellAction::FolderChecked { folder, exists }, window, cx);
            });
        })
        .detach();
    }

    /// Looks for a project's folder in the background and hands the answer back to the shell.
    fn check_project(&mut self, check: ProjectCheck, window: &mut Window, cx: &mut Context<Self>) {
        let ProjectCheck { project, exists } = check;
        cx.spawn_in(window, async move |this, cx| {
            let exists = exists.await;
            _ = this.update_in(cx, |model, window, cx| {
                model.act(ShellAction::ProjectChecked { project, exists }, window, cx);
            });
        })
        .detach();
    }
}

/// A check's run (`Probe`): the ready file after each refresh, and the timed close.
impl ShellModel {
    /// Writes how the slots settled, and the first time they all did, sets the close going
    /// after `close_after`, through the same close as the confirmed one.
    fn probe_settled(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(probing) = &mut self.probing else {
            return;
        };
        let Some(after) = probing.settled(self.shell.ready_lines()) else {
            return;
        };
        self.probe_close = Some(cx.spawn_in(window, async move |this, cx| {
            cx.background_executor().timer(after).await;
            _ = this.update_in(cx, |model, window, cx| {
                model.act(ShellAction::ConfirmClose, window, cx);
            });
        }));
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
