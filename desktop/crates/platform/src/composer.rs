//! A slot's input box, the line under it and why the last send did not go; in place of all of
//! it, once the session ended, that it ended. The box's text is a copy of the shell's draft:
//! each edit goes to the shell, and the box is filled again only when the shell changed the
//! draft itself.

use std::rc::Rc;

use closta_shell::copy;
use closta_shell::slot::SlotId;
use closta_shell::state::{ComposerLine, ShellAction};
use gpui_kit::base::{h_flex, v_flex};
use gpui_kit::component::button::{Button, ButtonVariants as _};
use gpui_kit::component::input::{InputEvent, MoveDown, MoveUp, Position, Textarea, TextareaState};
use gpui_kit::component::{ActiveTheme as _, Sizable as _};
use gpui_kit::*;

use crate::model::ShellModel;

/// How the box grows with its text.
const MIN_ROWS: usize = 2;
const MAX_ROWS: usize = 8;
/// The glyphs on the button beside the mode and model.
const STOP_GLYPH: &str = "■";
const SEND_GLYPH: &str = "▶";

/// Where the box's actions go: the window's shell, or a test's list.
pub(crate) type Dispatch = Rc<dyn Fn(ShellAction, &mut Window, &mut App)>;

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

/// The input box. ↑ on its first line (or in an empty box) asks for the previous send and ↓ on
/// its last line for the next; elsewhere they move the cursor. The input binds the arrows to
/// its own moves, which run before any key listener, so the moves are caught on their way down.
pub(crate) fn input_box(slot: SlotId, input: &Entity<TextareaState>, dispatch: Dispatch) -> Div {
    let name = SharedString::from(format!("composer-{slot}"));
    let (up, down) = (input.clone(), input.clone());
    let previous = Rc::clone(&dispatch);
    div()
        .w_full()
        .capture_action(move |_: &MoveUp, window, cx| {
            let state = up.read(cx);
            if state.value().is_empty() || state.cursor_position().line == 0 {
                cx.stop_propagation();
                previous(ShellAction::HistoryPrev { slot }, window, cx);
            }
        })
        .capture_action(move |_: &MoveDown, window, cx| {
            let state = down.read(cx);
            let last = state.value().matches('\n').count();
            if state.cursor_position().line as usize >= last {
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

/// What stands under the conversation of `slot`: its input, or that its session ended.
pub(crate) fn composer(
    model: &ShellModel,
    slot: SlotId,
    cx: &mut Context<ShellModel>,
) -> Option<AnyElement> {
    if model.shell.ended(slot) {
        return Some(ended(model, slot, cx));
    }
    let input = model.composers.get(&slot)?;
    let dispatch = ShellModel::dispatch(cx);
    let theme = cx.theme();
    let muted = theme.muted_foreground;
    let line = model
        .shell
        .composer_line(slot)
        .map(|line| line_text(&line))
        .unwrap_or_default();
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
            .child(input_box(slot, input, dispatch))
            .child(
                h_flex()
                    .gap_2()
                    .items_center()
                    .child(div().flex_1().truncate().text_color(muted).child(line))
                    .child(button.ghost().small()),
            )
            .children(reason)
            .into_any_element(),
    )
}

/// The mode and the model, `mode · model`, leaving out the one not known.
fn line_text(line: &ComposerLine) -> String {
    [line.mode.as_deref(), Some(line.model.as_str())]
        .into_iter()
        .flatten()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" · ")
}

/// "Session ended", and the button that restarts it when it can be.
fn ended(model: &ShellModel, slot: SlotId, cx: &mut Context<ShellModel>) -> AnyElement {
    let restart = model.shell.can_restart(slot).then(|| {
        Button::new("composer-restart")
            .outline()
            .small()
            .label(copy::RESTART)
            .on_click(cx.listener(move |model, _: &ClickEvent, window, cx| {
                model.act(ShellAction::Restart { slot }, window, cx);
            }))
    });
    h_flex()
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
        .into_any_element()
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
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
    use gpui_kit::component::input::TextareaState;
    use gpui_kit::test::TestWindowExt as _;
    // Named one by one: the glob would bring in a `test` that hides the built-in attribute.
    use gpui_kit::{
        AnyWindowHandle, AppContext as _, Bounds, Context, Entity, IntoElement, ParentElement as _,
        Point, Render, Styled as _, Subscription, TestAppContext, Window, WindowBounds,
        WindowOptions, div, open_window, px, size,
    };

    use super::{Dispatch, input_box, new_input};

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
        };
        let mut shell = ShellState::new(header, Arc::new(|_| {}), Arc::new(TracingLog), ports);
        shell.open(SlotLaunch {
            title: String::new(),
            planner: Arc::new(Nothing),
            working_directory: None,
            companion: None,
            relaunch: None,
            settles_on_failure: false,
        })
    }

    struct Composer {
        slot: SlotId,
        input: Entity<TextareaState>,
        dispatch: Dispatch,
        _changes: Subscription,
    }

    impl Render for Composer {
        fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
            div()
                .size_full()
                .child(input_box(self.slot, &self.input, self.dispatch.clone()))
        }
    }

    type Acted = Rc<RefCell<Vec<ShellAction>>>;

    /// A window with one focused input whose actions are kept in the list.
    fn open(cx: &mut TestAppContext) -> (AnyWindowHandle, Entity<TextareaState>, SlotId, Acted) {
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
                open_window(options, cx, move |window, cx| {
                    let (input, changes) = new_input(slot, Rc::clone(&dispatch), window, cx);
                    cx.new(|_| Composer {
                        slot,
                        input,
                        dispatch,
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
        (handle, input, slot, acted)
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
}
