//! Where the keyboard is, named as the shell's card table names it, and the one gate every key
//! passes before any part of the window sees it. The focus handles live here, apart from the
//! window's model, so a test can build the gate without a session.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use closta_shell::card_keys::{
    CardKey, CardKeyOutcome, CardKind, FocusScene, Key, OverlayKey, Repeats, card_key,
    card_may_take_focus, overlay_key,
};
use closta_shell::hub_keys::{HubKeyOutcome, hub_key};
use closta_shell::nav::NavItem;
use closta_shell::slot::SlotId;
use closta_shell::state::{Overlay, ShellAction};
use gpui_kit::component::input::{InputEvent, InputState};
use gpui_kit::*;

use crate::clock::WallClock;
use crate::composer::Dispatch;

/// A text field of a card: the Deny… or Keep Planning… note, or a question's Other line.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub(crate) enum CardField {
    Note,
    Other(usize),
}

type CardKeyed = (SlotId, String);
type FieldKeyed = (SlotId, String, CardField);

/// The "Session ended" band of a slot and its Restart.
#[derive(Clone)]
pub(crate) struct EndedFocus {
    pub(crate) band: FocusHandle,
    pub(crate) restart: FocusHandle,
}

/// The window's focus handles, by what they belong to.
pub(crate) struct FocusMap {
    /// Each slot's input box.
    pub(crate) composers: HashMap<SlotId, FocusHandle>,
    /// Each waiting card, with its kind and how many buttons it has.
    pub(crate) cards: HashMap<CardKeyed, (FocusHandle, CardKind, usize)>,
    /// A question's options, by question and option.
    pub(crate) options: HashMap<(SlotId, String, usize, usize), FocusHandle>,
    /// The cards' buttons, by name. What keeps Tab off them is each button's `tab_stop(false)`:
    /// the button writes its own `tab_stop` onto the handle it is given at every draw
    /// (gpui-base's button), so the `tab_stop(false)` the handle is made with only holds until
    /// the first draw. A click does not focus one either. They are the window's so the gate can
    /// be shown to hold a key even when one has the keyboard.
    pub(crate) buttons: HashMap<(SlotId, String, String), FocusHandle>,
    /// The cards' text fields; their text is a copy of the shell's.
    pub(crate) card_inputs: HashMap<FieldKeyed, Entity<InputState>>,
    /// The conversation outside any card.
    pub(crate) thread: FocusHandle,
    /// The left pane: the needs-you rows and the tree, which the list's cursor walks.
    pub(crate) list: FocusHandle,
    /// The failure band of the selected slot.
    pub(crate) failure: FocusHandle,
    /// Each slot's "Session ended" band, made when the keyboard is first sent there.
    pub(crate) ended: HashMap<SlotId, EndedFocus>,
    /// Each slot's Bypass band, which takes the keyboard while it asks.
    pub(crate) bypass: HashMap<SlotId, FocusHandle>,
    /// The overlay that is up, as the shell says.
    pub(crate) overlay: Option<Overlay>,
    /// The layer an overlay is drawn on: a key whose focus is outside it reaches nothing.
    pub(crate) overlay_layer: FocusHandle,
    /// The Cancel of the close questions, where the keyboard goes when one is asked.
    pub(crate) overlay_cancel: FocusHandle,
    /// The slot whose conversation is shown, as the shell says: only its cards take keys.
    pub(crate) selected: Option<SlotId>,
    /// What hands each card field's edits to the shell.
    field_watches: HashMap<FieldKeyed, Subscription>,
    /// The keys down and not yet released: the gate's keys carry no repeat flag.
    pub(crate) repeats: Rc<RefCell<Repeats>>,
}

/// Where the keyboard is, with what it belongs to.
#[derive(Clone, PartialEq, Debug)]
enum Located {
    Overlay,
    Composer,
    CardText {
        slot: SlotId,
        request_id: String,
        field: CardField,
        kind: CardKind,
    },
    Option {
        slot: SlotId,
        request_id: String,
        question: usize,
        option: usize,
    },
    Card {
        slot: SlotId,
        request_id: String,
        kind: CardKind,
        choices: usize,
    },
    NeedsYou,
    Nav,
    Thread,
    Other,
}

impl Located {
    fn scene(&self) -> FocusScene {
        match self {
            Located::Overlay => FocusScene::Overlay,
            Located::Composer => FocusScene::Composer,
            Located::CardText { kind, .. } => FocusScene::CardText { kind: *kind },
            Located::Option { .. } => FocusScene::QuestionOption,
            Located::Card { kind, choices, .. } => FocusScene::Card {
                kind: *kind,
                choices: *choices,
            },
            Located::NeedsYou => FocusScene::NeedsYou,
            Located::Nav => FocusScene::Nav,
            Located::Thread => FocusScene::Thread,
            Located::Other => FocusScene::Other,
        }
    }

    /// The card the keyboard is in, if it is in one.
    fn card(&self) -> Option<(SlotId, &str)> {
        match self {
            Located::CardText {
                slot, request_id, ..
            }
            | Located::Option {
                slot, request_id, ..
            }
            | Located::Card {
                slot, request_id, ..
            } => Some((*slot, request_id)),
            _ => None,
        }
    }
}

/// What the gate does with a key: whether it stops it before any part of the window sees it,
/// the action it hands to the shell and where it puts the keyboard.
#[derive(Default)]
pub(crate) struct Gate {
    pub(crate) stop: bool,
    pub(crate) action: Option<ShellAction>,
    pub(crate) focus: Option<FocusHandle>,
    /// The New Session dialog's Cancel or Start, which the window's model carries out: Start
    /// hands the typing over first, and both let go of the wait for it.
    pub(crate) dialog: Option<OverlayKey>,
    /// Tab (`true`) or Shift+Tab inside an overlay: the keyboard goes round the overlay's parts
    /// and never leaves the layer.
    pub(crate) tab: Option<(bool, FocusHandle)>,
}

/// The New Session dialog's Cancel and Start, as the window's model carries them out.
pub(crate) type DialogKeys = Rc<dyn Fn(OverlayKey, &mut Window, &mut App)>;

/// How many parts a Tab passes over at most looking for the next one inside the overlay.
const TAB_STOPS: usize = 64;

impl Gate {
    /// Stops the key (its default too, so no Enter or Space comes back as a click when the key
    /// goes up), moves the keyboard and hands the action over.
    pub(crate) fn apply(
        self,
        dispatch: &Dispatch,
        dialog: &DialogKeys,
        window: &mut Window,
        cx: &mut App,
    ) {
        if !self.stop {
            return;
        }
        window.prevent_default();
        cx.stop_propagation();
        if let Some(focus) = self.focus {
            window.focus(&focus, cx);
        }
        if let Some((forward, layer)) = self.tab {
            tab_within(&layer, forward, window, cx);
        }
        if let Some(action) = self.action {
            dispatch(action, window, cx);
        }
        if let Some(key) = self.dialog {
            dialog(key, window, cx);
        }
    }
}

/// Moves the keyboard to the next (`forward`) or the previous part that takes Tab, past the
/// parts outside `layer`; onto the layer itself when it holds none.
fn tab_within(layer: &FocusHandle, forward: bool, window: &mut Window, cx: &mut App) {
    for _ in 0..TAB_STOPS {
        if forward {
            window.focus_next(cx);
        } else {
            window.focus_prev(cx);
        }
        if layer.contains_focused(window, cx) {
            return;
        }
    }
    window.focus(layer, cx);
}

/// Puts the gate in front of every key of the window: `gate` reads where the keyboard is when
/// the key comes, before the bindings of the focused part run.
pub(crate) fn hold_keys(
    gate: impl Fn(&Keystroke, &Window, &App) -> Option<Gate> + 'static,
    dispatch: Dispatch,
    dialog: DialogKeys,
    cx: &mut App,
) -> Subscription {
    cx.intercept_keystrokes(move |event, window, cx| {
        if let Some(gate) = gate(&event.keystroke, window, cx) {
            gate.apply(&dispatch, &dialog, window, cx);
        }
    })
}

impl FocusMap {
    pub(crate) fn new(cx: &mut App) -> FocusMap {
        FocusMap {
            composers: HashMap::new(),
            cards: HashMap::new(),
            options: HashMap::new(),
            buttons: HashMap::new(),
            card_inputs: HashMap::new(),
            thread: cx.focus_handle(),
            list: cx.focus_handle(),
            failure: cx.focus_handle(),
            ended: HashMap::new(),
            bypass: HashMap::new(),
            overlay: None,
            overlay_layer: cx.focus_handle(),
            overlay_cancel: cx.focus_handle(),
            selected: None,
            field_watches: HashMap::new(),
            repeats: Rc::default(),
        }
    }

    /// Where the keyboard is: an overlay first, wherever the focus is; then the input boxes,
    /// the bands, the cards' fields and options, the cards, the left pane and the conversation.
    /// The left pane reads as its tree: which of its rows the cursor is on changes neither
    /// where a card may take the keyboard nor the jump hint.
    pub(crate) fn focus_scene(&self, window: &Window, cx: &App) -> FocusScene {
        self.locate(None, window, cx).scene()
    }

    /// Where the keyboard is; on the left pane, a needs-you row or the tree as `cursor` says.
    fn locate(&self, cursor: Option<&NavItem>, window: &Window, cx: &App) -> Located {
        if self.overlay.is_some() {
            return Located::Overlay;
        }
        // A card counts only when it is the selected slot's and was drawn in the conversation
        // in the last frame: the focus GPUI leaves on a card of a slot no longer shown, or on
        // one scrolled out of the list, must never take a key.
        let in_thread = self.thread.contains_focused(window, cx);
        let shown = |slot: &SlotId| in_thread && self.selected == Some(*slot);
        if self
            .composers
            .values()
            .any(|it| it.contains_focused(window, cx))
        {
            return Located::Composer;
        }
        // The Bypass band takes its own Escape and Enter; no card may take the keyboard from it.
        // The failure and "Session ended" bands and their buttons are no card either.
        let on_band = self.failure.contains_focused(window, cx)
            || self
                .bypass
                .values()
                .any(|it| it.contains_focused(window, cx))
            || self.ended.values().any(|it| {
                it.band.contains_focused(window, cx) || it.restart.contains_focused(window, cx)
            });
        if on_band {
            return Located::Other;
        }
        for ((slot, request_id, field), input) in &self.card_inputs {
            if shown(slot) && input.read(cx).focus_handle(cx).contains_focused(window, cx) {
                let kind = match field {
                    CardField::Other(_) => CardKind::Question,
                    CardField::Note => self
                        .cards
                        .get(&(*slot, request_id.clone()))
                        .map_or(CardKind::Permission, |it| it.1),
                };
                return Located::CardText {
                    slot: *slot,
                    request_id: request_id.clone(),
                    field: *field,
                    kind,
                };
            }
        }
        for ((slot, request_id, question, option), handle) in &self.options {
            if shown(slot) && handle.contains_focused(window, cx) {
                return Located::Option {
                    slot: *slot,
                    request_id: request_id.clone(),
                    question: *question,
                    option: *option,
                };
            }
        }
        for ((slot, request_id), (handle, kind, choices)) in &self.cards {
            // A button inside the card has the keyboard too: it is the card's.
            if shown(slot) && handle.contains_focused(window, cx) {
                return Located::Card {
                    slot: *slot,
                    request_id: request_id.clone(),
                    kind: *kind,
                    choices: *choices,
                };
            }
        }
        // The pane itself: a menu opened from one of its rows is drawn as its descendant and
        // takes the keyboard, and its keys are the menu's.
        if self.list.is_focused(window) {
            return match cursor {
                Some(NavItem::NeedsYou(_)) => Located::NeedsYou,
                _ => Located::Nav,
            };
        }
        if in_thread {
            return Located::Thread;
        }
        Located::Other
    }

    /// Shows `slot`: the keyboard goes to its input, or to the conversation when it has none,
    /// so none is left on a card of the slot shown before. While an overlay is up the keyboard
    /// stays in it; where it would have gone is returned, for when the overlay closes.
    pub(crate) fn select(
        &mut self,
        slot: Option<SlotId>,
        window: &mut Window,
        cx: &mut App,
    ) -> FocusHandle {
        self.selected = slot;
        let to = slot
            .and_then(|slot| self.composers.get(&slot))
            .unwrap_or(&self.thread)
            .clone();
        if self.overlay.is_none() {
            window.focus(&to, cx);
        }
        to
    }

    /// The card whose focus holds the keyboard, drawn or not.
    pub(crate) fn holding(&self, window: &Window, cx: &App) -> Option<(SlotId, String)> {
        self.cards
            .iter()
            .find(|(_, (handle, _, _))| handle.contains_focused(window, cx))
            .map(|(keyed, _)| keyed.clone())
            .or_else(|| {
                self.card_inputs
                    .iter()
                    .find(|(_, input)| input.read(cx).focus_handle(cx).contains_focused(window, cx))
                    .map(|((slot, request_id, _), _)| (*slot, request_id.clone()))
            })
            .or_else(|| {
                self.options
                    .iter()
                    .find(|(_, handle)| handle.is_focused(window))
                    .map(|((slot, request_id, _, _), _)| (*slot, request_id.clone()))
            })
            .or_else(|| {
                self.buttons
                    .iter()
                    .find(|(_, handle)| handle.is_focused(window))
                    .map(|((slot, request_id, _), _)| (*slot, request_id.clone()))
            })
    }

    /// Puts the keyboard on a card that just arrived, only when it is in the conversation and
    /// not on a field or another card; says whether it did.
    pub(crate) fn card_arrived(
        &self,
        card: &FocusHandle,
        window: &mut Window,
        cx: &mut App,
    ) -> bool {
        if !card_may_take_focus(&self.focus_scene(window, cx)) {
            return false;
        }
        window.focus(card, cx);
        true
    }

    /// What `keystroke`, pressed at `now_ms`, does where the keyboard is now, with the left
    /// list's cursor on `cursor`. A key that came again with no release between is held.
    pub(crate) fn gate(
        &self,
        keystroke: &Keystroke,
        now_ms: i64,
        cursor: Option<&NavItem>,
        window: &Window,
        cx: &App,
    ) -> Gate {
        let Some(mut key) = to_card_key(keystroke) else {
            return Gate::default();
        };
        // Each key down must pass here once: a second look would take it for a held key.
        key.held = self.repeats.borrow_mut().pressed(&keystroke.key);
        if let Some(overlay) = self.overlay {
            return self.overlay_gate(overlay, keystroke, &key, window, cx);
        }
        let located = self.locate(cursor, window, cx);
        let scene = located.scene();
        let outcome = card_key(&scene, &key);
        if outcome == CardKeyOutcome::Pass {
            return hub_gate(&scene, &key);
        }
        let mut gate = Gate {
            stop: outcome != CardKeyOutcome::Pass,
            ..Gate::default()
        };
        let card = located
            .card()
            .map(|(slot, request_id)| (slot, request_id.to_owned()));
        match (outcome, card) {
            (CardKeyOutcome::NextWaiting, _) => gate.action = Some(ShellAction::JumpToWaiting),
            (CardKeyOutcome::NavEnter, _) => gate.action = Some(ShellAction::NavEnter),
            (CardKeyOutcome::LeaveList, _) => gate.action = Some(ShellAction::NavLeave),
            (CardKeyOutcome::Choose(index), Some((slot, request_id))) => {
                gate.action = Some(ShellAction::ChooseCard {
                    slot,
                    request_id,
                    index,
                    now_ms,
                });
            }
            (CardKeyOutcome::Deny, Some((slot, request_id))) => {
                gate.action = Some(ShellAction::DenyCard {
                    slot,
                    request_id,
                    now_ms,
                });
            }
            (CardKeyOutcome::Answer, Some((slot, request_id))) => {
                gate.action = Some(ShellAction::AnswerQuestion {
                    slot,
                    request_id,
                    now_ms,
                });
            }
            (CardKeyOutcome::Toggle, Some((slot, request_id))) => {
                if let Located::Option {
                    question, option, ..
                } = located
                {
                    gate.action = Some(ShellAction::ToggleOption {
                        slot,
                        request_id,
                        question,
                        option,
                    });
                }
            }
            (CardKeyOutcome::LeaveText, Some((slot, request_id))) => {
                gate.focus = match located {
                    Located::CardText {
                        field: CardField::Other(question),
                        ..
                    } => self
                        .options
                        .get(&(slot, request_id.clone(), question, 0))
                        .cloned(),
                    _ => None,
                }
                .or_else(|| self.card(slot, &request_id));
                if matches!(
                    located,
                    Located::CardText {
                        field: CardField::Note,
                        ..
                    }
                ) {
                    gate.action = Some(ShellAction::CloseNote { slot, request_id });
                }
            }
            (CardKeyOutcome::ToComposer, Some((slot, _))) => {
                gate.focus = self.composers.get(&slot).cloned();
            }
            _ => {}
        }
        gate
    }

    /// What a key does while `overlay` is up: Escape cancels it and Enter confirms its default;
    /// any other key goes on to the part of the overlay that has the keyboard. A key whose focus
    /// is behind the overlay does nothing and reaches nothing there; it puts the keyboard back
    /// on the overlay.
    fn overlay_gate(
        &self,
        overlay: Overlay,
        keystroke: &Keystroke,
        key: &CardKey,
        window: &Window,
        cx: &App,
    ) -> Gate {
        let mut gate = Gate {
            stop: true,
            ..Gate::default()
        };
        if !self.overlay_layer.contains_focused(window, cx) {
            gate.focus = Some(self.overlay_layer.clone());
            return gate;
        }
        if card_key(&FocusScene::Overlay, key) == CardKeyOutcome::Swallow {
            return gate;
        }
        // Tab would go round the whole window, behind the overlay too.
        if keystroke.key == "tab" && !(key.ctrl || key.alt || key.platform) {
            gate.tab = Some((!key.shift, self.overlay_layer.clone()));
            return gate;
        }
        match (overlay_key(key), overlay) {
            (step @ (OverlayKey::Cancel | OverlayKey::Confirm), Overlay::NewSession) => {
                gate.dialog = Some(step);
            }
            (OverlayKey::Cancel, Overlay::CloseWindow) => {
                gate.action = Some(ShellAction::CancelClose);
            }
            (OverlayKey::Confirm, Overlay::CloseWindow) => {
                gate.action = Some(ShellAction::ConfirmClose);
            }
            (OverlayKey::Cancel, Overlay::CloseSlot) => {
                gate.action = Some(ShellAction::CancelCloseSlot);
            }
            (OverlayKey::Confirm, Overlay::CloseSlot) => {
                gate.action = Some(ShellAction::ConfirmCloseSlot);
            }
            (OverlayKey::Cancel | OverlayKey::Confirm, Overlay::Closing) => {}
            (OverlayKey::Pass, _) => gate.stop = false,
        }
        gate
    }

    fn card(&self, slot: SlotId, request_id: &str) -> Option<FocusHandle> {
        self.cards
            .get(&(slot, request_id.to_owned()))
            .map(|it| it.0.clone())
    }

    /// The card's focus, made the first time it is asked for; the kind and the buttons are
    /// kept as the card has them now.
    pub(crate) fn card_handle(
        &mut self,
        slot: SlotId,
        request_id: &str,
        kind: CardKind,
        choices: usize,
        cx: &mut App,
    ) -> FocusHandle {
        let entry = self
            .cards
            .entry((slot, request_id.to_owned()))
            .or_insert_with(|| (cx.focus_handle(), kind, choices));
        entry.1 = kind;
        entry.2 = choices;
        entry.0.clone()
    }

    /// The focus of a question's option, made the first time it is asked for. Options take the
    /// keyboard by Tab.
    pub(crate) fn option_handle(
        &mut self,
        slot: SlotId,
        request_id: &str,
        question: usize,
        option: usize,
        cx: &mut App,
    ) -> FocusHandle {
        self.options
            .entry((slot, request_id.to_owned(), question, option))
            .or_insert_with(|| cx.focus_handle().tab_stop(true))
            .clone()
    }

    /// The Bypass band that just came up takes the keyboard, unless an overlay holds it; it is
    /// focused again in the next frame, when the band is first drawn.
    pub(crate) fn take_bypass(&mut self, slot: SlotId, window: &mut Window, cx: &mut App) {
        if self.overlay.is_some() {
            return;
        }
        let band = self.bypass_handle(slot, cx);
        window.focus(&band, cx);
        window.on_next_frame(move |window, cx| window.focus(&band, cx));
    }

    /// The slot's Bypass band is gone: the keyboard it held goes to the slot's input, or to the
    /// conversation when it has none.
    pub(crate) fn leave_bypass(&self, slot: SlotId, window: &mut Window, cx: &mut App) {
        let Some(band) = self.bypass.get(&slot) else {
            return;
        };
        if !band.is_focused(window) {
            return;
        }
        let to = self.composers.get(&slot).unwrap_or(&self.thread).clone();
        window.focus(&to, cx);
    }

    /// The focus of the slot's Bypass band, made the first time it is asked for.
    pub(crate) fn bypass_handle(&mut self, slot: SlotId, cx: &mut App) -> FocusHandle {
        self.bypass
            .entry(slot)
            .or_insert_with(|| cx.focus_handle())
            .clone()
    }

    /// Where the keyboard goes on the slot's "Session ended" band: its Restart when the
    /// session `can_restart`, the band otherwise. The handles are made the first time they are
    /// asked for; the Restart, a button, sets its own `tab_stop` at every draw.
    pub(crate) fn ended_focus(
        &mut self,
        slot: SlotId,
        can_restart: bool,
        cx: &mut App,
    ) -> FocusHandle {
        let ended = self.ended.entry(slot).or_insert_with(|| EndedFocus {
            band: cx.focus_handle(),
            restart: cx.focus_handle(),
        });
        if can_restart {
            ended.restart.clone()
        } else {
            ended.band.clone()
        }
    }

    /// Lets the gate know a key went up, from the window's root, before any part can stop it.
    pub(crate) fn release_keys<E: InteractiveElement>(&self, element: E) -> E {
        let repeats = Rc::clone(&self.repeats);
        element.capture_key_up(move |event: &KeyUpEvent, _, _| {
            repeats.borrow_mut().released(&event.keystroke.key);
        })
    }

    /// The focus of a card's button, made the first time it is asked for.
    pub(crate) fn button_handle(
        &mut self,
        slot: SlotId,
        request_id: &str,
        name: &str,
        cx: &mut App,
    ) -> FocusHandle {
        self.buttons
            .entry((slot, request_id.to_owned(), name.to_owned()))
            .or_insert_with(|| cx.focus_handle().tab_stop(false))
            .clone()
    }

    /// A card's text field, made the first time it is asked for with `text` in it: each edit
    /// goes to the shell, and a plain Enter in a note sends it, at the time `clock` reads then.
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn card_input(
        &mut self,
        slot: SlotId,
        request_id: &str,
        field: CardField,
        placeholder: &'static str,
        text: &str,
        dispatch: &Dispatch,
        clock: WallClock,
        window: &mut Window,
        cx: &mut App,
    ) -> Entity<InputState> {
        let keyed = (slot, request_id.to_owned(), field);
        if let Some(input) = self.card_inputs.get(&keyed) {
            return input.clone();
        }
        let input = cx.new(|cx| {
            let mut state = InputState::new(window, cx).placeholder(placeholder);
            state.set_value(text, window, cx);
            state
        });
        let dispatch = dispatch.clone();
        let request_id = request_id.to_owned();
        let watch = window.subscribe(&input, cx, move |input, event, window, cx| {
            let request_id = request_id.clone();
            let action = match (event, field) {
                (InputEvent::Change, CardField::Note) => ShellAction::EditNote {
                    slot,
                    request_id,
                    text: input.read(cx).value().to_string(),
                },
                (InputEvent::Change, CardField::Other(question)) => ShellAction::EditOther {
                    slot,
                    request_id,
                    question,
                    text: input.read(cx).value().to_string(),
                },
                (
                    InputEvent::PressEnter {
                        secondary: false,
                        shift: false,
                    },
                    CardField::Note,
                ) => ShellAction::SendNote {
                    slot,
                    request_id,
                    now_ms: clock.now_ms(),
                },
                _ => return,
            };
            dispatch(action, window, cx);
        });
        self.field_watches.insert(keyed.clone(), watch);
        self.card_inputs.insert(keyed, input.clone());
        input
    }

    /// Lets go of what was kept for the slot's cards that no longer wait.
    pub(crate) fn keep_cards(&mut self, slot: SlotId, waiting: &[&str]) {
        let kept = |at: SlotId, request_id: &str| at != slot || waiting.contains(&request_id);
        self.cards
            .retain(|(at, request_id), _| kept(*at, request_id));
        self.options
            .retain(|(at, request_id, _, _), _| kept(*at, request_id));
        self.buttons
            .retain(|(at, request_id, _), _| kept(*at, request_id));
        self.card_inputs
            .retain(|(at, request_id, _), _| kept(*at, request_id));
        self.field_watches
            .retain(|(at, request_id, _), _| kept(*at, request_id));
    }

    /// Lets go of all that was kept for a slot that is gone.
    pub(crate) fn forget(&mut self, slot: SlotId) {
        self.composers.remove(&slot);
        self.bypass.remove(&slot);
        self.ended.remove(&slot);
        self.keep_cards(slot, &[]);
    }
}

/// What a key `card_key` passed does beyond the cards: the left list's keys, Alt+1 and Ctrl+N.
fn hub_gate(scene: &FocusScene, key: &CardKey) -> Gate {
    let action = match hub_key(scene, key) {
        HubKeyOutcome::ToList => ShellAction::NavFocus,
        HubKeyOutcome::NewSessionHere => ShellAction::OpenNewSessionHere,
        HubKeyOutcome::Move(delta) => ShellAction::NavMove { delta },
        HubKeyOutcome::Left => ShellAction::NavLeft,
        HubKeyOutcome::Right => ShellAction::NavRight,
        HubKeyOutcome::Pass => return Gate::default(),
    };
    Gate {
        stop: true,
        action: Some(action),
        ..Gate::default()
    }
}

/// Makes `pane` the left list: it takes the keyboard, and holds again on the way down the keys
/// the list takes, before a part inside acts on one, preventing the default so no Enter or
/// Space comes back as a click when the key goes up. It only holds: what a key does is the
/// window's gate's.
pub(crate) fn left_list<E: InteractiveElement>(pane: E, list: &FocusHandle) -> E {
    let pane_itself = list.clone();
    pane.track_focus(list)
        .capture_key_down(move |event: &KeyDownEvent, window, cx| {
            // A menu opened from a row has the keyboard inside the pane: its keys are its own.
            if !pane_itself.is_focused(window) {
                return;
            }
            let Some(key) = to_card_key(&event.keystroke) else {
                return;
            };
            if card_key(&FocusScene::Nav, &key) != CardKeyOutcome::Pass {
                window.prevent_default();
                cx.stop_propagation();
            }
        })
}

/// Whether the line over the input names the jump key: a card of the shown slot waits and the
/// keyboard is not in one.
pub(crate) fn shows_jump_hint(waiting: bool, scene: &FocusScene) -> bool {
    waiting
        && !matches!(
            scene,
            FocusScene::Card { .. } | FocusScene::CardText { .. } | FocusScene::QuestionOption
        )
}

/// Whether the row at `at` of `len` is in view: only while the list follows its tail, among
/// its last `visible` rows. A list scrolled up shows rows the screen cannot place, so none
/// counts.
pub(crate) fn on_screen(following_tail: bool, at: usize, len: usize, visible: usize) -> bool {
    following_tail && at < len && at + visible >= len
}

/// A key as the card table names it: the digits 0 to 9 (the numpad's come with the same names),
/// Escape, Enter, Space, the arrows, N, O and W, any other key as `Other`; `None` for a
/// modifier pressed alone. It is never held: the gate tells that from the keys still down.
pub(crate) fn to_card_key(keystroke: &Keystroke) -> Option<CardKey> {
    if keystroke.is_modifier_key() {
        return None;
    }
    let key = match keystroke.key.as_str() {
        "escape" => Key::Escape,
        "enter" => Key::Enter,
        "space" => Key::Space,
        "w" => Key::W,
        "up" => Key::Up,
        "down" => Key::Down,
        "left" => Key::Left,
        "right" => Key::Right,
        "n" => Key::N,
        "o" => Key::O,
        digit => match digit.parse::<u8>() {
            Ok(n @ 0..=9) => Key::Digit(n),
            _ => Key::Other,
        },
    };
    let modifiers = &keystroke.modifiers;
    Some(CardKey {
        key,
        ctrl: modifiers.control,
        alt: modifiers.alt,
        shift: modifiers.shift,
        platform: modifiers.platform,
        held: false,
    })
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::rc::Rc;

    use closta_shell::card_keys::{CardKey, CardKind, Key, OverlayKey};
    use closta_shell::nav::NavItem;
    use closta_shell::slot::SlotId;
    use closta_shell::state::{Overlay, ShellAction};
    use gpui_kit::component::button::Button;
    use gpui_kit::component::input::{Input, InputState, TextareaState};
    use gpui_kit::test::TestWindowExt as _;
    // Named one by one: the glob would bring in a `test` that hides the built-in attribute.
    use gpui_kit::{
        AnyWindowHandle, AppContext as _, Bounds, ClickEvent, Context, Entity, FocusHandle,
        Focusable as _, InteractiveElement as _, IntoElement, KeyDownEvent, KeyUpEvent, Keystroke,
        ParentElement as _, PlatformInput, Point, Render, Styled as _, Subscription,
        TestAppContext, Window, WindowBounds, WindowOptions, div, open_window, px, size,
    };

    use super::{FocusMap, hold_keys, left_list, on_screen, to_card_key};
    use crate::composer::{Dispatch, new_input};
    use crate::test_window;

    type Acted = Rc<RefCell<Vec<ShellAction>>>;
    type DialogKeyed = Rc<RefCell<Vec<OverlayKey>>>;

    /// A window with a slot's input and a part that takes Tab behind an overlay's layer that
    /// holds a field and a part that takes Tab, and the window's gate.
    struct Behind {
        focus: FocusMap,
        composer: Entity<TextareaState>,
        field: Entity<InputState>,
        stops: [FocusHandle; 2],
        _changes: Subscription,
        _keys: Subscription,
    }

    impl Render for Behind {
        fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
            let stop = |name: &'static str, handle: &FocusHandle| {
                div().id(name).track_focus(handle).h(px(20.)).w_full()
            };
            self.focus
                .release_keys(div())
                .size_full()
                .child(stop("behind-stop", &self.stops[0]))
                .child(gpui_kit::component::input::Textarea::new(&self.composer))
                .child(
                    div()
                        .id("layer")
                        .track_focus(&self.focus.overlay_layer)
                        .child(Input::new(&self.field))
                        .child(stop("layer-stop", &self.stops[1])),
                )
        }
    }

    fn slot() -> SlotId {
        SlotId::numbered(1)
    }

    /// Opens the window with the overlay up; the dialog's Cancel and Start are kept.
    fn open_behind(
        cx: &mut TestAppContext,
    ) -> (AnyWindowHandle, Entity<Behind>, Acted, DialogKeyed) {
        cx.update(gpui_kit::init);
        let acted = Acted::default();
        let kept = Rc::clone(&acted);
        let dispatch: Dispatch = Rc::new(move |action, _, _| kept.borrow_mut().push(action));
        let started = DialogKeyed::default();
        let starts = Rc::clone(&started);
        let (handle, host) = cx
            .update(|cx| {
                let bounds = Bounds {
                    origin: Point::default(),
                    size: size(px(600.), px(400.)),
                };
                let options = WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(bounds)),
                    ..Default::default()
                };
                open_window(options, cx, move |window, cx| {
                    let (composer, changes) = new_input(slot(), Rc::clone(&dispatch), window, cx);
                    let field = cx.new(|cx| InputState::new(window, cx));
                    cx.new(|cx: &mut Context<Behind>| {
                        let this = cx.weak_entity();
                        let keys = hold_keys(
                            move |keystroke, window, cx| {
                                let host = this.upgrade()?;
                                Some(host.read(cx).focus.gate(keystroke, 0, None, window, cx))
                            },
                            dispatch,
                            Rc::new(move |key, _, _| starts.borrow_mut().push(key)),
                            cx,
                        );
                        let mut focus = FocusMap::new(cx);
                        focus.selected = Some(slot());
                        focus.overlay = Some(Overlay::NewSession);
                        focus
                            .composers
                            .insert(slot(), composer.read(cx).focus_handle(cx));
                        Behind {
                            focus,
                            composer,
                            field,
                            stops: [
                                cx.focus_handle().tab_stop(true),
                                cx.focus_handle().tab_stop(true),
                            ],
                            _changes: changes,
                            _keys: keys,
                        }
                    })
                })
            })
            .expect("open test window");
        (handle, host, acted, started)
    }

    fn focus_on(cx: &mut TestAppContext, handle: AnyWindowHandle, focus: &FocusHandle) {
        cx.update_window(handle, |_, window, cx| {
            window.focus(focus, cx);
            window.render_frame(cx);
        })
        .expect("focus");
        cx.run_until_parked();
    }

    fn composer_focus(cx: &mut TestAppContext, host: &Entity<Behind>) -> FocusHandle {
        host.read_with(cx, |host, cx| host.composer.read(cx).focus_handle(cx))
    }

    #[gpui_kit::test]
    fn enter_behind_the_dialog_sends_nothing(cx: &mut TestAppContext) {
        let (handle, host, acted, started) = open_behind(cx);
        let typing = composer_focus(cx, &host);
        focus_on(cx, handle, &typing);
        cx.update_window(handle, |_, window, cx| window.press("enter", cx))
            .expect("press enter");
        cx.run_until_parked();
        let sends = acted
            .borrow()
            .iter()
            .filter(|action| matches!(action, ShellAction::Send { .. }))
            .count();
        assert_eq!(sends, 0);
        assert!(started.borrow().is_empty(), "the dialog took a key");
        let layer = host.read_with(cx, |host, _| host.focus.overlay_layer.clone());
        let back = cx
            .update_window(handle, |_, window, cx| layer.contains_focused(window, cx))
            .expect("read the focus");
        assert!(back, "the keyboard went back to the overlay");
    }

    #[gpui_kit::test]
    fn a_letter_typed_behind_the_dialog_lands_nowhere(cx: &mut TestAppContext) {
        let (handle, host, acted, _) = open_behind(cx);
        let typing = composer_focus(cx, &host);
        focus_on(cx, handle, &typing);
        cx.update_window(handle, |_, window, cx| window.input("a", cx))
            .expect("type a letter");
        cx.run_until_parked();
        let text = host.read_with(cx, |host, cx| host.composer.read(cx).value().to_string());
        assert_eq!(text, "");
        assert!(
            acted.borrow().is_empty(),
            "{} actions",
            acted.borrow().len()
        );
    }

    #[gpui_kit::test]
    fn keys_in_the_dialog_type_cancel_and_start(cx: &mut TestAppContext) {
        let (handle, host, acted, started) = open_behind(cx);
        let field = host.read_with(cx, |host, cx| host.field.read(cx).focus_handle(cx));
        focus_on(cx, handle, &field);
        cx.update_window(handle, |_, window, cx| window.input("C:", cx))
            .expect("type in the field");
        cx.run_until_parked();
        let text = host.read_with(cx, |host, cx| host.field.read(cx).value().to_string());
        assert_eq!(text, "C:");
        cx.update_window(handle, |_, window, cx| window.press("enter", cx))
            .expect("press enter");
        cx.update_window(handle, |_, window, cx| window.press("escape", cx))
            .expect("press escape");
        cx.run_until_parked();
        assert_eq!(*started.borrow(), [OverlayKey::Confirm, OverlayKey::Cancel]);
        assert!(
            acted.borrow().is_empty(),
            "{} actions",
            acted.borrow().len()
        );
    }

    #[gpui_kit::test]
    fn tab_goes_round_the_overlay_and_never_behind_it(cx: &mut TestAppContext) {
        let (handle, host, acted, _) = open_behind(cx);
        let (field, layer) = host.read_with(cx, |host, cx| {
            (
                host.field.read(cx).focus_handle(cx),
                host.focus.overlay_layer.clone(),
            )
        });
        focus_on(cx, handle, &field);
        let inside = |cx: &mut TestAppContext| {
            cx.update_window(handle, |_, window, cx| layer.contains_focused(window, cx))
                .expect("read the focus")
        };
        let mut moved = false;
        for key in [
            "tab",
            "tab",
            "tab",
            "tab",
            "shift-tab",
            "shift-tab",
            "shift-tab",
        ] {
            cx.update_window(handle, |_, window, cx| window.press(key, cx))
                .expect("press tab");
            cx.run_until_parked();
            assert!(inside(cx), "{key} left the overlay");
            moved |= !cx
                .update_window(handle, |_, window, _| field.is_focused(window))
                .expect("read the focus");
        }
        assert!(moved, "Tab moved the keyboard inside the overlay");
        let text = host.read_with(cx, |host, cx| host.composer.read(cx).value().to_string());
        assert_eq!(text, "");
        assert!(
            acted.borrow().is_empty(),
            "{} actions",
            acted.borrow().len()
        );
    }

    #[gpui_kit::test]
    fn escape_and_enter_answer_the_close_questions(cx: &mut TestAppContext) {
        let (handle, host, acted, _) = open_behind(cx);
        let layer = host.read_with(cx, |host, _| host.focus.overlay_layer.clone());
        focus_on(cx, handle, &layer);
        for overlay in [Overlay::CloseWindow, Overlay::CloseSlot, Overlay::Closing] {
            host.update(cx, |host, _| host.focus.overlay = Some(overlay));
            for key in ["escape", "enter", "alt-shift-w"] {
                cx.update_window(handle, |_, window, cx| window.press(key, cx))
                    .expect("press a key");
            }
        }
        cx.run_until_parked();
        assert_eq!(
            *acted.borrow(),
            [
                ShellAction::CancelClose,
                ShellAction::ConfirmClose,
                ShellAction::CancelCloseSlot,
                ShellAction::ConfirmCloseSlot,
            ]
        );
    }

    /// A window with the left list, a slot's input, a waiting permission card in the
    /// conversation and the slot's "Session ended" band with a Restart that keeps its presses;
    /// and the window's gate, which reads the list's cursor from `cursor`.
    struct Left {
        focus: FocusMap,
        cursor: Option<NavItem>,
        card: FocusHandle,
        restarts: Rc<RefCell<usize>>,
        _keys: Subscription,
    }

    impl Render for Left {
        fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
            let restarts = Rc::clone(&self.restarts);
            let list = left_list(div().id("list"), &self.focus.list)
                .h(px(40.))
                .w_full();
            let thread = div()
                .id("thread")
                .track_focus(&self.focus.thread)
                .child(div().id("card").track_focus(&self.card).h(px(40.)));
            let composer = div()
                .id("composer")
                .track_focus(&self.focus.composers[&slot()])
                .h(px(40.));
            let ended = &self.focus.ended[&slot()];
            let band = div().id("ended").track_focus(&ended.band).child(
                Button::new("restart")
                    .track_focus(&ended.restart)
                    .label("Restart")
                    .on_click(move |_: &ClickEvent, _, _| *restarts.borrow_mut() += 1),
            );
            self.focus
                .release_keys(div())
                .size_full()
                .child(list)
                .child(thread)
                .child(composer)
                .child(band)
        }
    }

    /// Opens [`Left`] with the list's cursor on `cursor`. NavEnter puts the keyboard where the
    /// window puts it for a slot whose session ended and can be restarted.
    fn open_left(
        cx: &mut TestAppContext,
        cursor: Option<NavItem>,
    ) -> (AnyWindowHandle, Entity<Left>, Acted) {
        cx.update(gpui_kit::init);
        let acted = Acted::default();
        let kept = Rc::clone(&acted);
        let (handle, host) = cx
            .update(|cx| {
                let bounds = Bounds {
                    origin: Point::default(),
                    size: size(px(600.), px(400.)),
                };
                let options = WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(bounds)),
                    ..Default::default()
                };
                open_window(options, cx, move |_, cx| {
                    let mut focus = FocusMap::new(cx);
                    let to_restart = focus.ended_focus(slot(), true, cx);
                    let dispatch: Dispatch = Rc::new(move |action, window, cx| {
                        if action == ShellAction::NavEnter {
                            window.focus(&to_restart, cx);
                        }
                        kept.borrow_mut().push(action);
                    });
                    cx.new(|cx: &mut Context<Left>| {
                        let this = cx.weak_entity();
                        let keys = hold_keys(
                            move |keystroke, window, cx| {
                                let host = this.upgrade()?;
                                let host = host.read(cx);
                                let cursor = host.cursor.as_ref();
                                Some(host.focus.gate(keystroke, 0, cursor, window, cx))
                            },
                            dispatch,
                            Rc::new(|_, _, _| {}),
                            cx,
                        );
                        focus.selected = Some(slot());
                        focus.composers.insert(slot(), cx.focus_handle());
                        let card = focus.card_handle(slot(), "r1", CardKind::Permission, 2, cx);
                        Left {
                            focus,
                            cursor,
                            card,
                            restarts: Rc::default(),
                            _keys: keys,
                        }
                    })
                })
            })
            .expect("open test window");
        test_window::draw(cx, handle);
        (handle, host, acted)
    }

    /// A key going down and never up, as Windows sends a key held down.
    fn key_down(cx: &mut TestAppContext, handle: AnyWindowHandle, source: &'static str) {
        let keystroke = Keystroke::parse(source).expect("a keystroke");
        cx.update_window(handle, |_, window, cx| {
            window.dispatch_event(
                PlatformInput::KeyDown(KeyDownEvent {
                    keystroke,
                    is_held: false,
                    prefer_character_input: false,
                }),
                cx,
            );
            window.render_frame(cx);
        })
        .expect("a key down");
        cx.run_until_parked();
    }

    fn key_up(cx: &mut TestAppContext, handle: AnyWindowHandle, source: &'static str) {
        let keystroke = Keystroke::parse(source).expect("a keystroke");
        cx.update_window(handle, |_, window, cx| {
            window.dispatch_event(PlatformInput::KeyUp(KeyUpEvent { keystroke }), cx);
            window.render_frame(cx);
        })
        .expect("a key up");
        cx.run_until_parked();
    }

    fn choices(acted: &Acted) -> usize {
        acted
            .borrow()
            .iter()
            .filter(|it| matches!(it, ShellAction::ChooseCard { .. }))
            .count()
    }

    #[gpui_kit::test]
    fn alt_one_takes_the_keyboard_to_the_left_pane(cx: &mut TestAppContext) {
        let (handle, model) = test_window::open_tree(
            cx,
            test_window::TreeSetup {
                projects: &[],
                slots: &[None, None],
                run: false,
            },
        );
        test_window::press(cx, handle, "alt-1");
        let (list, cursor) = model.read_with(cx, |model, _| {
            (model.focus.list.clone(), model.shell.nav_cursor().cloned())
        });
        assert!(test_window::focused(cx, handle, &list));
        assert_eq!(cursor, Some(NavItem::Slot(slot())));
    }

    #[gpui_kit::test]
    fn arrows_on_the_left_pane_move_the_cursor_and_never_the_history(cx: &mut TestAppContext) {
        let (handle, model) = test_window::open_tree(
            cx,
            test_window::TreeSetup {
                projects: &[],
                slots: &[None, None],
                run: false,
            },
        );
        test_window::press(cx, handle, "alt-1");
        test_window::press(cx, handle, "down");
        let cursor = model.read_with(cx, |model, _| model.shell.nav_cursor().cloned());
        assert_eq!(cursor, Some(NavItem::Slot(SlotId::numbered(2))));
        test_window::press(cx, handle, "up");
        test_window::press(cx, handle, "up");
        let (cursor, browsing, list) = model.read_with(cx, |model, _| {
            (
                model.shell.nav_cursor().cloned(),
                model.shell.browsing(slot()),
                model.focus.list.clone(),
            )
        });
        assert_eq!(cursor, Some(NavItem::Slot(slot())), "it stops at the top");
        assert!(!browsing, "the input's history did not move");
        assert!(test_window::focused(cx, handle, &list));
    }

    #[gpui_kit::test]
    fn escape_on_the_left_pane_goes_back_to_the_input(cx: &mut TestAppContext) {
        let (handle, model) = test_window::open_tree(
            cx,
            test_window::TreeSetup {
                projects: &[],
                slots: &[None, None],
                run: false,
            },
        );
        test_window::press(cx, handle, "alt-1");
        test_window::press(cx, handle, "escape");
        let input = model.read_with(cx, |model, _| model.focus.composers[&slot()].clone());
        assert!(test_window::focused(cx, handle, &input));
    }

    #[gpui_kit::test]
    fn on_a_needs_you_row_digits_and_space_answer_nothing_and_enter_opens_it(
        cx: &mut TestAppContext,
    ) {
        let (handle, host, acted) = open_left(cx, Some(NavItem::NeedsYou(slot())));
        let list = host.read_with(cx, |host, _| host.focus.list.clone());
        focus_on(cx, handle, &list);
        for key in ["1", "space", "enter"] {
            test_window::press(cx, handle, key);
        }
        assert_eq!(*acted.borrow(), [ShellAction::NavEnter]);
    }

    #[gpui_kit::test]
    fn alt_one_in_a_card_does_nothing(cx: &mut TestAppContext) {
        let (handle, host, acted) = open_left(cx, None);
        let card = host.read_with(cx, |host, _| host.card.clone());
        focus_on(cx, handle, &card);
        test_window::press(cx, handle, "alt-1");
        assert!(
            acted.borrow().is_empty(),
            "{} actions",
            acted.borrow().len()
        );
        assert!(test_window::focused(cx, handle, &card));
    }

    #[gpui_kit::test]
    fn a_held_digit_answers_once(cx: &mut TestAppContext) {
        let (handle, host, acted) = open_left(cx, None);
        let card = host.read_with(cx, |host, _| host.card.clone());
        focus_on(cx, handle, &card);
        key_down(cx, handle, "1");
        key_down(cx, handle, "1");
        key_down(cx, handle, "1");
        key_up(cx, handle, "1");
        assert_eq!(choices(&acted), 1);
    }

    #[gpui_kit::test]
    fn a_released_key_is_pressed_afresh(cx: &mut TestAppContext) {
        let (handle, host, acted) = open_left(cx, None);
        let card = host.read_with(cx, |host, _| host.card.clone());
        focus_on(cx, handle, &card);
        test_window::press(cx, handle, "1");
        test_window::press(cx, handle, "1");
        assert_eq!(choices(&acted), 2, "a released key is pressed afresh");
    }

    #[gpui_kit::test]
    fn a_held_enter_after_nav_enter_restarts_nothing(cx: &mut TestAppContext) {
        let (handle, host, acted) = open_left(cx, Some(NavItem::Slot(slot())));
        let (list, restart) = host.read_with(cx, |host, _| {
            (
                host.focus.list.clone(),
                host.focus.ended[&slot()].restart.clone(),
            )
        });
        focus_on(cx, handle, &list);
        key_down(cx, handle, "enter");
        assert!(test_window::focused(cx, handle, &restart));
        key_down(cx, handle, "enter");
        key_down(cx, handle, "enter");
        key_up(cx, handle, "enter");
        let restarts = host.read_with(cx, |host, _| *host.restarts.borrow());
        assert_eq!(restarts, 0);
        assert_eq!(*acted.borrow(), [ShellAction::NavEnter]);
        let scene = cx
            .update_window(handle, |_, window, cx| {
                host.read(cx).focus.focus_scene(window, cx)
            })
            .expect("read the focus");
        assert_eq!(scene, closta_shell::card_keys::FocusScene::Other, "a band");
        // Pressed afresh, the Restart that has the keyboard is pressed.
        test_window::press(cx, handle, "enter");
        let restarts = host.read_with(cx, |host, _| *host.restarts.borrow());
        assert_eq!(restarts, 1);
    }

    #[gpui_kit::test]
    fn keys_in_a_rows_menu_are_the_menus(cx: &mut TestAppContext) {
        let (handle, model) = test_window::open_tree(
            cx,
            test_window::TreeSetup {
                projects: &[],
                slots: &[None, None],
                run: false,
            },
        );
        test_window::press(cx, handle, "alt-1");
        cx.update_window(handle, |_, window, cx| {
            window.right_click("slot-2".to_owned(), cx)
        })
        .expect("open the row's menu");
        test_window::draw(cx, handle);
        let (list, input) = model.read_with(cx, |model, _| {
            (
                model.focus.list.clone(),
                model.focus.composers[&slot()].clone(),
            )
        });
        assert!(
            !test_window::focused(cx, handle, &list),
            "the menu has the keyboard"
        );
        for key in ["down", "up", "escape"] {
            test_window::press(cx, handle, key);
            let cursor = model.read_with(cx, |model, _| model.shell.nav_cursor().cloned());
            assert_eq!(cursor, Some(NavItem::Slot(slot())), "{key}");
        }
        assert!(
            !test_window::focused(cx, handle, &input),
            "Escape closed the menu, not the list"
        );
    }

    fn key(source: &'static str) -> Option<CardKey> {
        to_card_key(&Keystroke::parse(source).expect("a keystroke"))
    }

    #[test]
    fn only_a_row_at_the_followed_tail_is_on_screen() {
        assert!(on_screen(true, 9, 10, 5));
        assert!(on_screen(true, 5, 10, 5));
        assert!(!on_screen(true, 4, 10, 5));
        assert!(!on_screen(false, 9, 10, 5));
        assert!(!on_screen(true, 10, 10, 5));
    }

    #[test]
    fn digits_and_the_named_keys_map_to_the_table() {
        assert_eq!(key("1"), Some(CardKey::plain(Key::Digit(1))));
        assert_eq!(key("9"), Some(CardKey::plain(Key::Digit(9))));
        assert_eq!(key("0"), Some(CardKey::plain(Key::Digit(0))));
        assert_eq!(key("escape"), Some(CardKey::plain(Key::Escape)));
        assert_eq!(key("enter"), Some(CardKey::plain(Key::Enter)));
        assert_eq!(key("space"), Some(CardKey::plain(Key::Space)));
        assert_eq!(key("tab"), Some(CardKey::plain(Key::Other)));
        let jump = key("alt-shift-w").expect("a key");
        assert_eq!((jump.key, jump.alt, jump.shift), (Key::W, true, true));
        assert!(!jump.ctrl && !jump.platform);
        assert_eq!(key("shift"), None);
    }

    #[test]
    fn the_new_keys_map_to_the_table() {
        for (source, wanted) in [
            ("up", Key::Up),
            ("down", Key::Down),
            ("left", Key::Left),
            ("right", Key::Right),
            ("n", Key::N),
            ("o", Key::O),
        ] {
            assert_eq!(key(source), Some(CardKey::plain(wanted)), "{source}");
        }
        let new = key("ctrl-n").expect("a key");
        assert_eq!((new.key, new.ctrl, new.shift), (Key::N, true, false));
        let resume = key("ctrl-shift-o").expect("a key");
        assert_eq!(
            (resume.key, resume.ctrl, resume.shift),
            (Key::O, true, true)
        );
        let list = key("alt-1").expect("a key");
        assert_eq!(
            (list.key, list.alt, list.held),
            (Key::Digit(1), true, false)
        );
    }
}
