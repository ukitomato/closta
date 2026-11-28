//! A slot's input box, the line under it with the permission mode's picker, and why the last
//! send did not go; over it, the band that asks before Bypass and the hint of the jump key; in
//! place of all of it, once the session ended, that it ended. The box's text is a copy of the
//! shell's draft: each edit goes to the shell, and the box is filled again only when the shell
//! changed the draft itself.

use std::rc::Rc;

use closta_presenter::composer_state::PERMISSION_MODES;
use closta_shell::card_keys::FocusScene;
use closta_shell::copy;
use closta_shell::slot::SlotId;
use closta_shell::state::{BYPASS_MODE, ComposerLine, ShellAction};
use gpui_kit::base::{Disableable as _, h_flex, v_flex};
use gpui_kit::component::button::{Button, ButtonVariants as _};
use gpui_kit::component::input::{
    BufferPoint, InputEvent, MoveDown, MoveUp, Position, RopeExt as _, Textarea, TextareaState,
};
use gpui_kit::component::menu::{DropdownMenu as _, PopupMenuItem};
use gpui_kit::component::{ActiveTheme as _, Sizable as _};
use gpui_kit::*;

use crate::focus::shows_jump_hint;
use crate::model::ShellModel;

/// How the box grows with its text.
const MIN_ROWS: usize = 2;
const MAX_ROWS: usize = 8;
/// The glyphs on the button beside the mode and model.
const STOP_GLYPH: &str = "■";
const SEND_GLYPH: &str = "▶";

/// Where the box's actions go: the window's shell, or a test's list.
pub(crate) type Dispatch = Rc<dyn Fn(ShellAction, &mut Window, &mut App)>;
/// Whether the box shows a sent message in place of the draft, as the shell says now.
pub(crate) type Browsing = Rc<dyn Fn(&App) -> bool>;

/// Makes a slot's input, 2 to 8 rows tall. Each edit goes to `dispatch` as the new draft;
/// Enter sends it, and Shift+Enter breaks the line.
pub(crate) fn new_input(
    slot: SlotId,
    dispatch: Dispatch,
    window: &mut Window,
    cx: &mut App,
) -> (Entity<TextareaState>, Subscription) {
    let input = cx.new(|cx| {
        TextareaState::new(window, cx)
            .submit_on_enter(true)
            .auto_grow(MIN_ROWS, MAX_ROWS)
            .placeholder(copy::COMPOSER_PLACEHOLDER)
    });
    let subscription = window.subscribe(&input, cx, move |input, event, window, cx| {
        let action = match event {
            InputEvent::Change => ShellAction::EditDraft {
                slot,
                text: input.read(cx).value().to_string(),
            },
            InputEvent::PressEnter { shift: false, .. } => ShellAction::Send { slot },
            _ => return,
        };
        dispatch(action, window, cx);
    });
    (input, subscription)
}

/// Puts `text` in the input with the cursor at its end: `set_value` leaves a multi-line
/// input's cursor at its start.
pub(crate) fn fill(input: &Entity<TextareaState>, text: &str, window: &mut Window, cx: &mut App) {
    input.update(cx, |state, cx| {
        state.set_value(text, window, cx);
        state.set_cursor_position(end_of(text), window, cx);
    });
}

/// Where the cursor stands after the last character of `text`.
fn end_of(text: &str) -> Position {
    let line = text.matches('\n').count();
    let column = text.rsplit('\n').next().unwrap_or_default().chars().count();
    Position::new(
        u32::try_from(line).unwrap_or(u32::MAX),
        u32::try_from(column).unwrap_or(u32::MAX),
    )
}

/// The input box. ↑ on its first row (or in an empty box) asks for the previous send; ↓ on its
/// last row asks for the next only while a sent message is shown. Rows are as drawn, wrapped
/// lines included; elsewhere the arrows move the cursor. The input binds the arrows to its own
/// moves, which run before any key listener, so the moves are caught on their way down.
pub(crate) fn input_box(
    slot: SlotId,
    input: &Entity<TextareaState>,
    dispatch: Dispatch,
    browsing: Browsing,
) -> Div {
    let name = SharedString::from(format!("composer-{slot}"));
    let (up, down) = (input.clone(), input.clone());
    let previous = Rc::clone(&dispatch);
    div()
        .w_full()
        .capture_action(move |_: &MoveUp, window, cx| {
            let state = up.read(cx);
            if state.value().is_empty() || cursor_row(state) == 0 {
                cx.stop_propagation();
                previous(ShellAction::HistoryPrev { slot }, window, cx);
            }
        })
        .capture_action(move |_: &MoveDown, window, cx| {
            let state = down.read(cx);
            let last = state.display_map().display_row_count().saturating_sub(1);
            if browsing(cx) && cursor_row(state) >= last {
                cx.stop_propagation();
                dispatch(ShellAction::HistoryNext { slot }, window, cx);
            }
        })
        .child(
            Textarea::new(input)
                .accessibility_id(name)
                .aria_label(copy::COMPOSER_PLACEHOLDER),
        )
}

/// The row the cursor is drawn on, counting the rows a long line wraps into.
fn cursor_row(state: &TextareaState) -> usize {
    let line = state.cursor_position().line as usize;
    let column = state.cursor() - state.text().line_start_offset(line);
    state
        .display_map()
        .buffer_pos_to_display_pos(BufferPoint::new(line, column))
        .row
}

/// What stands under the conversation of `slot`: its input, or that its session ended.
pub(crate) fn composer(
    model: &ShellModel,
    slot: SlotId,
    window: &Window,
    cx: &mut Context<ShellModel>,
) -> Option<AnyElement> {
    if model.shell.ended(slot) {
        return Some(ended(model, slot, cx));
    }
    let input = model.composers.get(&slot)?;
    let dispatch = ShellModel::dispatch(cx);
    let browsing: Browsing = {
        let model = cx.weak_entity();
        Rc::new(move |cx| {
            model
                .upgrade()
                .is_some_and(|model| model.read(cx).shell.browsing(slot))
        })
    };
    let line = model.shell.composer_line(slot);
    let mode = line
        .as_ref()
        .and_then(|line| mode_picker(slot, line, dispatch.clone(), cx));
    let model_text = line.map(|line| line.model).unwrap_or_default();
    let band = model.shell.bypass_asking(slot).then(|| {
        let focus = model.focus.bypass.get(&slot).cloned();
        bypass_band(slot, focus.as_ref(), dispatch.clone(), cx)
    });
    // Only this slot's own wait counts: the hint is about the card above this input.
    let hint = jump_hint(
        model.shell.waiting(slot),
        &model.focus.focus_scene(window, cx),
        cx,
    );
    let theme = cx.theme();
    let muted = theme.muted_foreground;
    let button = if model.shell.running(slot) {
        Button::new("composer-stop")
            .label(format!("{STOP_GLYPH} {}", copy::STOP))
            .on_click(cx.listener(move |model, _: &ClickEvent, window, cx| {
                model.act(ShellAction::Interrupt { slot }, window, cx);
            }))
    } else {
        Button::new("composer-send")
            .label(format!("{SEND_GLYPH} {}", copy::SEND))
            .on_click(cx.listener(move |model, _: &ClickEvent, window, cx| {
                model.act(ShellAction::Send { slot }, window, cx);
            }))
    };
    let reason = model
        .shell
        .composer_reason(slot)
        .map(|reason| div().text_color(theme.warning).child(reason));
    Some(
        v_flex()
            .w_full()
            .gap_1()
            .children(band)
            .children(hint)
            .child(input_box(slot, input, dispatch, browsing))
            .child(
                h_flex()
                    .gap_2()
                    .items_center()
                    .children(mode)
                    .child(
                        div()
                            .flex_1()
                            .truncate()
                            .text_color(muted)
                            .child(model_text),
                    )
                    .child(button.ghost().small()),
            )
            .children(reason)
            .into_any_element(),
    )
}

/// The permission mode's button, once the session said its mode: its short word, on the
/// warning's ground in Bypass. It lists the modes with what each does; one picked goes to the
/// shell. It cannot be pressed while a switch waits for the CLI.
pub(crate) fn mode_picker(
    slot: SlotId,
    line: &ComposerLine,
    dispatch: Dispatch,
    cx: &App,
) -> Option<AnyElement> {
    let look = mode_look(line)?;
    let muted = cx.theme().muted_foreground;
    let button = Button::new("composer-mode")
        .accessibility_id("composer-mode")
        .accessibility_label(look.accessible)
        .label(look.word)
        .small()
        .disabled(look.disabled);
    let button = if look.warning {
        button.warning()
    } else {
        button.ghost()
    };
    let current = look.mode;
    let picker = button.dropdown_menu(move |mut menu, _, _| {
        for choice in mode_choices(slot, &current) {
            let dispatch = dispatch.clone();
            let ModeChoice {
                name,
                hint,
                checked,
                action,
            } = choice;
            let item = PopupMenuItem::element(move |_, _| {
                v_flex()
                    .child(name.clone())
                    .children(hint.map(|hint| div().text_xs().text_color(muted).child(hint)))
            })
            .checked(checked)
            .on_click(move |_, window, cx| dispatch(action.clone(), window, cx));
            menu = menu.item(item);
        }
        menu
    });
    Some(picker.into_any_element())
}

/// How the mode's button looks: its word and accessible name, whether it stands on the
/// warning's ground (Bypass) and whether it cannot be pressed (a switch waits for the CLI).
#[derive(Clone, PartialEq, Eq, Debug)]
pub(crate) struct ModeLook {
    pub(crate) mode: String,
    pub(crate) word: String,
    pub(crate) accessible: String,
    pub(crate) warning: bool,
    pub(crate) disabled: bool,
}

/// The mode's button, once the session said its mode.
pub(crate) fn mode_look(line: &ComposerLine) -> Option<ModeLook> {
    let mode = line.mode.clone()?;
    Some(ModeLook {
        word: copy::mode_label(&mode),
        accessible: copy::mode_accessible(&mode),
        warning: mode == BYPASS_MODE,
        disabled: line.switching,
        mode,
    })
}

/// A row of the mode's list: the mode's name, what it does, whether it is the mode now and
/// what picking it asks of the shell.
#[derive(Clone, PartialEq, Debug)]
pub(crate) struct ModeChoice {
    pub(crate) name: String,
    pub(crate) hint: Option<&'static str>,
    pub(crate) checked: bool,
    pub(crate) action: ShellAction,
}

/// The modes the list offers, in the CLI's order.
pub(crate) fn mode_choices(slot: SlotId, current: &str) -> Vec<ModeChoice> {
    PERMISSION_MODES
        .iter()
        .map(|mode| ModeChoice {
            name: copy::mode_name(mode),
            hint: copy::mode_hint(mode),
            checked: *mode == current,
            action: ShellAction::PickMode {
                slot,
                mode: (*mode).to_owned(),
            },
        })
        .collect()
}

/// The line over the input that names the jump key, while `waiting_here` (a card of this
/// slot waits) and the keyboard is out of the card.
pub(crate) fn jump_hint(waiting_here: bool, scene: &FocusScene, cx: &App) -> Option<AnyElement> {
    shows_jump_hint(waiting_here, scene).then(|| {
        div()
            .id("jump-hint")
            .accessibility_id("jump-hint")
            .aria_label(copy::JUMP_HINT)
            .text_color(cx.theme().muted_foreground)
            .child(copy::JUMP_HINT)
            .test_support()
            .into_any_element()
    })
}

/// The band that asks before Bypass. It takes the keyboard (`focus`) while it asks: Escape
/// takes it down and Enter does nothing, so only a click on Switch goes into Bypass.
pub(crate) fn bypass_band(
    slot: SlotId,
    focus: Option<&FocusHandle>,
    dispatch: Dispatch,
    cx: &App,
) -> AnyElement {
    let theme = cx.theme();
    let (switch, cancel, keys) = (dispatch.clone(), dispatch.clone(), dispatch);
    let band = h_flex()
        .id("bypass-band")
        .accessibility_id("bypass-band")
        .aria_label(copy::BYPASS_CONFIRM)
        .w_full()
        .p_2()
        .gap_2()
        .items_center()
        .rounded_md()
        .border_1()
        .border_color(theme.warning)
        .bg(theme.warning.opacity(0.08))
        .on_key_down(move |event: &KeyDownEvent, window, cx| {
            let key = &event.keystroke;
            match key.key.as_str() {
                "escape" if !key.modifiers.modified() => {
                    window.prevent_default();
                    cx.stop_propagation();
                    keys(ShellAction::CancelBypass { slot }, window, cx);
                }
                // Any Enter: none may go on to a part that would take it as a yes.
                "enter" => {
                    window.prevent_default();
                    cx.stop_propagation();
                }
                _ => {}
            }
        })
        .child(div().flex_1().child(copy::BYPASS_CONFIRM))
        .child(
            Button::new("bypass-switch")
                .accessibility_id("bypass-switch")
                .label(copy::BYPASS_SWITCH)
                .warning()
                .small()
                .tab_stop(false)
                .on_click(move |_, window, cx| {
                    switch(ShellAction::ConfirmBypass { slot }, window, cx);
                }),
        )
        .child(
            Button::new("bypass-cancel")
                .accessibility_id("bypass-cancel")
                .label(copy::CANCEL)
                .outline()
                .small()
                .tab_stop(false)
                .on_click(move |_, window, cx| {
                    cancel(ShellAction::CancelBypass { slot }, window, cx);
                }),
        );
    match focus {
        Some(focus) => band.track_focus(focus).into_any_element(),
        None => band.into_any_element(),
    }
}

/// "Session ended", and the button that restarts it with what a Restart does when it can be,
/// or why it cannot while eight slots hold a session. Once the left list sent the keyboard here, the band and its
/// Restart take it.
fn ended(model: &ShellModel, slot: SlotId, cx: &mut Context<ShellModel>) -> AnyElement {
    let focus = model.focus.ended.get(&slot);
    let restart = model.shell.can_restart(slot).then(|| {
        let button = Button::new("composer-restart");
        match focus {
            Some(focus) => button.track_focus(&focus.restart),
            None => button,
        }
        .outline()
        .small()
        .label(copy::RESTART)
        .on_click(cx.listener(move |model, _: &ClickEvent, window, cx| {
            model.act(ShellAction::Restart { slot }, window, cx);
        }))
    });
    let muted = cx.theme().muted_foreground;
    let notes = ended_notes(
        model.shell.restart_note(slot),
        model.shell.restart_blocked(slot),
    )
    .into_iter()
    .map(|text| div().text_color(muted).child(text));
    let band = h_flex()
        .id("session-ended")
        .accessibility_id("session-ended")
        .aria_label(copy::SESSION_ENDED)
        .w_full()
        .py_2()
        .gap_3()
        .items_center()
        .justify_center()
        .child(
            div()
                .text_color(cx.theme().muted_foreground)
                .child(copy::SESSION_ENDED),
        )
        .children(restart)
        .children(notes);
    match focus {
        Some(focus) => band.track_focus(&focus.band).into_any_element(),
        None => band.into_any_element(),
    }
}

/// What the "Session ended" band says after its Restart: what a Restart does while one is on
/// offer (`note`), or the slot limit while it is `blocked` by it.
fn ended_notes(note: Option<&'static str>, blocked: bool) -> Vec<&'static str> {
    note.into_iter()
        .chain(blocked.then_some(copy::SLOT_LIMIT))
        .collect()
}

#[cfg(test)]
mod tests {
    use std::cell::{Cell, RefCell};
    use std::rc::Rc;
    use std::sync::Arc;

    use closta_session::launch::{SessionLaunch, SessionLaunchPlanner};
    use closta_session::log::TracingLog;
    use closta_session::status::SessionFailure;
    use closta_shell::header::AppHeader;
    use closta_shell::new_session::{ClaudeOnPath, LaunchChecks, PlannerFor};
    use closta_shell::slot::{SlotId, SlotLaunch};
    use closta_shell::state::{Ports, ShellAction, ShellState};
    use futures_lite::future;
    use gpui_kit::component::input::{Position, TextareaState};
    use gpui_kit::test::TestWindowExt as _;
    // Named one by one: the glob would bring in a `test` that hides the built-in attribute.
    use gpui_kit::{
        AnyWindowHandle, AppContext as _, Bounds, Context, Entity, FocusHandle,
        InteractiveElement as _, IntoElement, KeyDownEvent, ParentElement as _, Point, Render,
        Styled as _, Subscription, TestAppContext, Window, WindowBounds, WindowOptions, div,
        open_window, px, size,
    };

    use closta_presenter::composer_state::PERMISSION_MODES;
    use closta_shell::state::{BYPASS_MODE, ComposerLine};

    use super::{
        Browsing, Dispatch, bypass_band, ended_notes, input_box, jump_hint, mode_choices,
        mode_look, mode_picker, new_input,
    };
    use crate::focus::{self, FocusMap};

    /// A machine with nothing on it, and a planner that never plans.
    struct Nothing;

    impl LaunchChecks for Nothing {
        fn installed_distros(&self) -> Vec<String> {
            Vec::new()
        }

        fn claude_on_path(&self) -> ClaudeOnPath {
            ClaudeOnPath::Missing
        }

        fn default_distro(&self) -> Option<String> {
            None
        }

        fn folder_exists(&self, _folder: &str) -> future::Boxed<bool> {
            Box::pin(async { false })
        }
    }

    impl PlannerFor for Nothing {
        fn planner(&self, _folder: &str) -> Arc<dyn SessionLaunchPlanner> {
            Arc::new(Nothing)
        }
    }

    impl SessionLaunchPlanner for Nothing {
        fn plan(
            &self,
            _session_id: &str,
            _working_directory: Option<&str>,
        ) -> future::Boxed<Result<SessionLaunch, SessionFailure>> {
            Box::pin(async { Err(SessionFailure::PlanFailed) })
        }
    }

    /// A slot's id as the shell gives it; its session never runs.
    fn a_slot() -> SlotId {
        let header = AppHeader {
            title: String::new(),
            headline: String::new(),
        };
        let ports = Ports {
            checks: Arc::new(Nothing),
            planner_for: Arc::new(Nothing),
            settings: Arc::new(closta_shell::settings::MemorySettings),
            saved_for: Arc::new(closta_shell::new_session::NoSaved),
        };
        let mut shell = ShellState::new(header, Arc::new(|_| {}), Arc::new(TracingLog), ports);
        shell.open(SlotLaunch {
            title: String::new(),
            planner: Arc::new(Nothing),
            working_directory: None,
            companion: None,
            relaunch: None,
            project: None,
            settles_on_failure: false,
            session_id: None,
            resume: None,
        })
    }

    struct Composer {
        slot: SlotId,
        input: Entity<TextareaState>,
        dispatch: Dispatch,
        browsing: Browsing,
        _changes: Subscription,
    }

    impl Render for Composer {
        fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
            div().size_full().child(input_box(
                self.slot,
                &self.input,
                self.dispatch.clone(),
                self.browsing.clone(),
            ))
        }
    }

    type Acted = Rc<RefCell<Vec<ShellAction>>>;

    /// A window with one focused input whose actions are kept in the list, and the switch that
    /// says whether the shell is browsing the history.
    fn open(cx: &mut TestAppContext) -> (AnyWindowHandle, Entity<TextareaState>, SlotId, Acted) {
        let (handle, input, slot, acted, _) = open_browsing(cx);
        (handle, input, slot, acted)
    }

    fn open_browsing(
        cx: &mut TestAppContext,
    ) -> (
        AnyWindowHandle,
        Entity<TextareaState>,
        SlotId,
        Acted,
        Rc<Cell<bool>>,
    ) {
        cx.update(gpui_kit::init);
        let slot = a_slot();
        let acted = Acted::default();
        let kept = Rc::clone(&acted);
        let dispatch: Dispatch = Rc::new(move |action, _, _| kept.borrow_mut().push(action));
        let switch = Rc::new(Cell::new(false));
        let browsing: Browsing = {
            let switch = Rc::clone(&switch);
            Rc::new(move |_| switch.get())
        };
        let (handle, view) = cx
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
                    let (input, changes) = new_input(slot, Rc::clone(&dispatch), window, cx);
                    cx.new(|_| Composer {
                        slot,
                        input,
                        dispatch,
                        browsing,
                        _changes: changes,
                    })
                })
            })
            .expect("open test window");
        let input = view.read_with(cx, |view, _| view.input.clone());
        cx.update_window(handle, |_, window, cx| {
            input.update(cx, |state, cx| state.focus(window, cx));
            window.render_frame(cx);
        })
        .expect("focus the input");
        (handle, input, slot, acted, switch)
    }

    fn sends(acted: &Acted, slot: SlotId) -> usize {
        acted
            .borrow()
            .iter()
            .filter(|action| **action == ShellAction::Send { slot })
            .count()
    }

    #[gpui_kit::test]
    fn enter_sends_and_shift_enter_adds_a_line(cx: &mut TestAppContext) {
        let (handle, input, slot, acted) = open(cx);
        cx.update_window(handle, |_, window, cx| {
            window.input("hello", cx);
            window.press("shift-enter", cx);
            window.input("x", cx);
            assert_eq!(input.read(cx).value(), "hello\nx");
        })
        .expect("type");
        cx.run_until_parked();
        assert_eq!(sends(&acted, slot), 0);
        let last_edit = acted.borrow().iter().rev().find_map(|action| match action {
            ShellAction::EditDraft { text, .. } => Some(text.clone()),
            _ => None,
        });
        assert_eq!(last_edit.as_deref(), Some("hello\nx"));

        cx.update_window(handle, |_, window, cx| window.press("enter", cx))
            .expect("press enter");
        cx.run_until_parked();
        assert_eq!(sends(&acted, slot), 1);
        assert_eq!(input.read_with(cx, |state, _| state.value()), "hello\nx");
    }

    fn count(acted: &Acted, wanted: &ShellAction) -> usize {
        acted
            .borrow()
            .iter()
            .filter(|action| *action == wanted)
            .count()
    }

    /// One line long enough to wrap in the 600 px window.
    fn long_line() -> String {
        "wrap ".repeat(80).trim_end().to_owned()
    }

    /// Fills the input with `text`, puts the cursor at `at` and lays the box out.
    fn fill_at(
        cx: &mut TestAppContext,
        handle: AnyWindowHandle,
        input: &Entity<TextareaState>,
        text: &str,
        at: Position,
    ) {
        cx.update_window(handle, |_, window, cx| {
            input.update(cx, |state, cx| {
                state.set_value(text, window, cx);
                state.set_cursor_position(at, window, cx);
            });
            window.render_frame(cx);
        })
        .expect("fill the input");
        cx.run_until_parked();
    }

    fn rows(cx: &mut TestAppContext, input: &Entity<TextareaState>) -> usize {
        input.read_with(cx, |state, _| state.display_map().wrap_row_count())
    }

    fn cursor(cx: &mut TestAppContext, input: &Entity<TextareaState>) -> usize {
        input.read_with(cx, |state, _| state.cursor())
    }

    fn press(cx: &mut TestAppContext, handle: AnyWindowHandle, key: &str) {
        cx.update_window(handle, |_, window, cx| window.press(key, cx))
            .expect("press a key");
        cx.run_until_parked();
    }

    #[gpui_kit::test]
    fn down_in_a_wrapped_draft_moves_the_cursor_when_not_browsing(cx: &mut TestAppContext) {
        let (handle, input, slot, acted) = open(cx);
        fill_at(cx, handle, &input, &long_line(), Position::new(0, 0));
        assert!(rows(cx, &input) > 1, "the line wraps");
        press(cx, handle, "down");
        assert_eq!(count(&acted, &ShellAction::HistoryNext { slot }), 0);
        assert!(cursor(cx, &input) > 0, "the cursor went down a row");

        // On the last row of a draft of several lines, ↓ is still the input's own.
        let end = Position::new(1, 1);
        fill_at(cx, handle, &input, "a\nb", end);
        press(cx, handle, "down");
        assert_eq!(count(&acted, &ShellAction::HistoryNext { slot }), 0);
    }

    #[gpui_kit::test]
    fn down_on_the_last_row_while_browsing_asks_for_the_next_send(cx: &mut TestAppContext) {
        let (handle, input, slot, acted, browsing) = open_browsing(cx);
        browsing.set(true);
        fill_at(cx, handle, &input, "a\nb", Position::new(0, 0));
        press(cx, handle, "down");
        assert_eq!(
            count(&acted, &ShellAction::HistoryNext { slot }),
            0,
            "from the first line ↓ moves the cursor"
        );
        press(cx, handle, "down");
        assert_eq!(count(&acted, &ShellAction::HistoryNext { slot }), 1);
    }

    #[gpui_kit::test]
    fn up_in_an_empty_box_asks_for_the_previous_send(cx: &mut TestAppContext) {
        let (handle, _, slot, acted) = open(cx);
        press(cx, handle, "up");
        assert_eq!(count(&acted, &ShellAction::HistoryPrev { slot }), 1);
    }

    #[gpui_kit::test]
    fn up_below_the_first_row_of_a_wrapped_line_moves_the_cursor(cx: &mut TestAppContext) {
        let (handle, input, slot, acted) = open(cx);
        let text = long_line();
        let end = Position::new(0, u32::try_from(text.len()).expect("short"));
        fill_at(cx, handle, &input, &text, end);
        assert!(rows(cx, &input) > 1, "the line wraps");
        press(cx, handle, "up");
        assert_eq!(count(&acted, &ShellAction::HistoryPrev { slot }), 0);
        assert!(cursor(cx, &input) < text.len(), "the cursor went up a row");
    }

    #[gpui_kit::test]
    fn up_on_the_first_line_asks_for_the_previous_send(cx: &mut TestAppContext) {
        let (handle, _, slot, acted) = open(cx);
        let previous = |acted: &Acted| {
            acted
                .borrow()
                .iter()
                .filter(|action| **action == ShellAction::HistoryPrev { slot })
                .count()
        };
        cx.update_window(handle, |_, window, cx| {
            window.input("a", cx);
            window.press("shift-enter", cx);
            window.input("b", cx);
            // From the second line, ↑ moves the cursor up.
            window.press("up", cx);
        })
        .expect("type and go up");
        cx.run_until_parked();
        assert_eq!(previous(&acted), 0);

        cx.update_window(handle, |_, window, cx| window.press("up", cx))
            .expect("go up from the first line");
        cx.run_until_parked();
        assert_eq!(previous(&acted), 1);
    }

    /// A window with a slot's input, over it its Bypass band (while `asking`) and the jump hint
    /// (while `waiting`), and the mode's button for `line`; all inside a part that takes the
    /// Enter the band lets through as a send; and the window's gate.
    struct Band {
        slot: SlotId,
        focus: FocusMap,
        dispatch: Dispatch,
        composer: FocusHandle,
        asking: bool,
        waiting: bool,
        line: Option<ComposerLine>,
        _keys: Subscription,
    }

    impl Render for Band {
        fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
            let (slot, behind) = (self.slot, self.dispatch.clone());
            let band = self.focus.bypass_handle(slot, cx);
            let scene = self.focus.focus_scene(window, cx);
            let root = div().id("behind");
            self.focus
                .release_keys(root)
                .size_full()
                .on_key_down(move |event: &KeyDownEvent, window, cx| {
                    if event.keystroke.key == "enter" {
                        behind(ShellAction::Send { slot }, window, cx);
                    }
                })
                .children(
                    self.asking
                        .then(|| bypass_band(slot, Some(&band), self.dispatch.clone(), cx)),
                )
                .children(jump_hint(self.waiting, &scene, cx))
                .child(
                    div()
                        .id("composer")
                        .track_focus(&self.composer)
                        .h(px(40.))
                        .w_full(),
                )
                .children(
                    self.line
                        .as_ref()
                        .and_then(|line| mode_picker(slot, line, self.dispatch.clone(), cx)),
                )
        }
    }

    fn open_band(cx: &mut TestAppContext) -> (AnyWindowHandle, Entity<Band>, SlotId, Acted) {
        cx.update(gpui_kit::init);
        let slot = a_slot();
        let acted = Acted::default();
        let kept = Rc::clone(&acted);
        let dispatch: Dispatch = Rc::new(move |action, _, _| kept.borrow_mut().push(action));
        let (handle, view) = cx
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
                    cx.new(|cx: &mut Context<Band>| {
                        let this = cx.weak_entity();
                        let keys = focus::hold_keys(
                            move |keystroke, window, cx| {
                                let band = this.upgrade()?;
                                Some(band.read(cx).focus.gate(
                                    keystroke,
                                    0,
                                    None,
                                    &focus::ResumeAtKey::default(),
                                    window,
                                    cx,
                                ))
                            },
                            Rc::clone(&dispatch),
                            Rc::new(|_, _, _| {}),
                            cx,
                        );
                        let mut focus = FocusMap::new(cx);
                        focus.selected = Some(slot);
                        let composer = cx.focus_handle();
                        focus.composers.insert(slot, composer.clone());
                        Band {
                            slot,
                            focus,
                            dispatch,
                            composer,
                            asking: true,
                            waiting: false,
                            line: None,
                            _keys: keys,
                        }
                    })
                })
            })
            .expect("open test window");
        draw(cx, handle);
        (handle, view, slot, acted)
    }

    fn draw(cx: &mut TestAppContext, handle: AnyWindowHandle) {
        cx.update_window(handle, |_, window, cx| window.render_frame(cx))
            .expect("draw");
        cx.run_until_parked();
    }

    fn is_focused(cx: &mut TestAppContext, handle: AnyWindowHandle, focus: &FocusHandle) -> bool {
        cx.update_window(handle, |_, window, _| focus.is_focused(window))
            .expect("read the focus")
    }

    /// Whether the jump hint was drawn in the last frame.
    fn hint_drawn(cx: &mut TestAppContext, handle: AnyWindowHandle) -> bool {
        cx.update_window(handle, |_, window, _| {
            window.try_find("jump-hint").is_some()
        })
        .expect("look for the hint")
    }

    #[gpui_kit::test]
    fn escape_on_the_bypass_band_cancels_and_enter_does_nothing(cx: &mut TestAppContext) {
        let (handle, view, slot, acted) = open_band(cx);
        let band: FocusHandle = view.update(cx, |view, cx| view.focus.bypass_handle(slot, cx));
        cx.update_window(handle, |_, window, cx| {
            window.focus(&band, cx);
            window.render_frame(cx);
        })
        .expect("focus the band");
        for key in ["enter", "shift-enter", "ctrl-enter", "space"] {
            press(cx, handle, key);
        }
        assert!(acted.borrow().is_empty(), "{:?}", acted.borrow().len());
        press(cx, handle, "escape");
        assert_eq!(*acted.borrow(), [ShellAction::CancelBypass { slot }]);
    }

    #[gpui_kit::test]
    fn the_band_takes_the_keyboard_and_gives_it_back_to_the_input(cx: &mut TestAppContext) {
        let (handle, view, slot, _) = open_band(cx);
        let (band, composer) = view.update(cx, |view, cx| {
            (view.focus.bypass_handle(slot, cx), view.composer.clone())
        });
        cx.update_window(handle, |_, window, cx| {
            window.focus(&composer, cx);
            view.update(cx, |view, cx| view.focus.take_bypass(slot, window, cx));
        })
        .expect("the band comes up");
        draw(cx, handle);
        assert!(is_focused(cx, handle, &band), "the band took the keyboard");

        // A refresh took the band down.
        view.update(cx, |view, cx| {
            view.asking = false;
            cx.notify();
        });
        cx.update_window(handle, |_, window, cx| {
            view.update(cx, |view, cx| view.focus.leave_bypass(slot, window, cx));
        })
        .expect("the band goes");
        draw(cx, handle);
        assert!(
            is_focused(cx, handle, &composer),
            "the input has the keyboard again"
        );
    }

    #[gpui_kit::test]
    fn the_mode_button_says_bypass_and_waits_while_switching(cx: &mut TestAppContext) {
        let (handle, view, _, _) = open_band(cx);
        view.update(cx, |view, cx| {
            view.asking = false;
            view.line = Some(ComposerLine {
                mode: Some(BYPASS_MODE.to_owned()),
                model: String::new(),
                switching: true,
            });
            cx.notify();
        });
        draw(cx, handle);
        let button = cx
            .update_window(handle, |_, window, _| window.find("composer-mode"))
            .expect("find the button");
        assert_eq!(button.disabled(), Some(true));
        // The word itself ("Bypass", not only the color) is `mode_look`'s.
        assert_eq!(button.label(), Some("Permission mode: Bypass Permissions"));
    }

    #[test]
    fn the_mode_look_follows_the_mode_and_the_switch() {
        let line = |mode: &str, switching| ComposerLine {
            mode: Some(mode.to_owned()),
            model: String::new(),
            switching,
        };
        let bypass = mode_look(&line(BYPASS_MODE, false)).expect("a look");
        assert_eq!(
            (bypass.word.as_str(), bypass.warning, bypass.disabled),
            ("Bypass", true, false)
        );
        let plan = mode_look(&line("plan", true)).expect("a look");
        assert_eq!(
            (plan.word.as_str(), plan.warning, plan.disabled),
            ("Plan", false, true)
        );
        let unknown = ComposerLine {
            mode: None,
            model: String::new(),
            switching: false,
        };
        assert_eq!(mode_look(&unknown), None);
    }

    #[test]
    fn the_mode_list_picks_each_mode_and_marks_the_current_one() {
        let slot = SlotId::numbered(1);
        let choices = mode_choices(slot, "plan");
        assert_eq!(choices.len(), PERMISSION_MODES.len());
        let checked: Vec<&str> = choices
            .iter()
            .filter(|it| it.checked)
            .map(|it| it.name.as_str())
            .collect();
        assert_eq!(checked, ["Plan"]);
        let bypass = choices
            .iter()
            .find(|it| it.name == "Bypass Permissions")
            .expect("Bypass is offered");
        assert_eq!(bypass.hint, Some("Ask nothing"));
        assert_eq!(
            bypass.action,
            ShellAction::PickMode {
                slot,
                mode: BYPASS_MODE.to_owned(),
            }
        );
    }

    #[gpui_kit::test]
    fn the_jump_hint_is_drawn_only_while_this_slot_waits(cx: &mut TestAppContext) {
        let (handle, view, _, _) = open_band(cx);
        let composer = view.read_with(cx, |view, _| view.composer.clone());
        cx.update_window(handle, |_, window, cx| window.focus(&composer, cx))
            .expect("focus the input");
        view.update(cx, |view, cx| {
            view.asking = false;
            cx.notify();
        });
        draw(cx, handle);
        assert!(!hint_drawn(cx, handle), "nothing waits here");
        view.update(cx, |view, cx| {
            view.waiting = true;
            cx.notify();
        });
        draw(cx, handle);
        assert!(hint_drawn(cx, handle));
    }

    #[test]
    fn the_ended_band_says_what_restart_does() {
        use closta_shell::copy;

        assert_eq!(
            ended_notes(Some(copy::RESTART_CONTINUES), false),
            [copy::RESTART_CONTINUES]
        );
        assert_eq!(
            ended_notes(Some(copy::RESTART_AGAIN), false),
            [copy::RESTART_AGAIN]
        );
        assert_eq!(ended_notes(None, true), [copy::SLOT_LIMIT]);
        assert!(ended_notes(None, false).is_empty());
    }
}
