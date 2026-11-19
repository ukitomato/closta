//! The New Session dialog, drawn over the window while the shell has it open. Its folder field is
//! a copy of the dialog's folder: typing reaches the shell once it settles, and the field is
//! filled again only when the folder changed another way (opening the dialog, a recent folder,
//! the folder picker).

use std::time::Duration;

use closta_shell::copy;
use closta_shell::new_session::{problem_text, runtime_of};
use closta_shell::state::ShellAction;
use gpui_kit::base::{Disableable as _, h_flex, v_flex};
use gpui_kit::component::ActiveTheme as _;
use gpui_kit::component::button::{Button, ButtonVariants as _};
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::*;

use crate::model::ShellModel;

/// How long the folder field is left still before its text goes to the shell: the shell's check
/// of a Windows folder walks `PATH`, which is not done on each key.
const TYPING_SETTLES: Duration = Duration::from_millis(150);
/// The glyph before what the folder lacks.
const PROBLEM_GLYPH: &str = "ⓧ";
/// The dialog's width and the width of its labels.
const WIDTH: f32 = 640.0;
const LABEL_WIDTH: f32 = 72.0;

impl ShellModel {
    /// Fills the folder field from the dialog, making the field when it has none, and puts the
    /// cursor in it when the dialog was just opened.
    pub(crate) fn fill_folder(
        &mut self,
        opened: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(folder) = self.shell.new_session().map(|dialog| dialog.folder.clone()) else {
            return;
        };
        self.folder_typing = None;
        let input = match &self.folder {
            Some(input) => input.clone(),
            None => self.new_folder_input(window, cx),
        };
        let placeholder = self.shell.default_folder().unwrap_or_default();
        input.update(cx, |state, cx| {
            if opened {
                state.set_placeholder(placeholder, window, cx);
            }
            // A single-line input's `set_value` leaves the cursor at the end.
            state.set_value(folder, window, cx);
            if opened {
                state.focus(window, cx);
            }
        });
    }

    fn new_folder_input(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Entity<InputState> {
        let input = cx.new(|cx| InputState::new(window, cx));
        let changes = cx.subscribe_in(&input, window, |model, _, event, window, cx| {
            if let InputEvent::Change = event {
                model.folder_typed(window, cx);
            }
        });
        self._observed.push(changes);
        self.folder = Some(input.clone());
        input
    }

    /// Waits for the typing to settle, then hands the field's text to the shell. A key typed
    /// meanwhile starts the wait again.
    fn folder_typed(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.folder_typing = Some(cx.spawn_in(window, async move |this, cx| {
            cx.background_executor().timer(TYPING_SETTLES).await;
            _ = this.update(cx, |model, cx| model.settle_folder(cx));
        }));
    }

    /// Hands the field's text to the shell now. The field already shows it, so it is not filled
    /// again.
    fn settle_folder(&mut self, cx: &mut Context<Self>) {
        self.folder_typing = None;
        let Some(text) = self
            .folder
            .as_ref()
            .map(|input| input.read(cx).value().to_string())
        else {
            return;
        };
        let acted = self.shell.act(ShellAction::EditFolder { text });
        // The field already shows the text, so only the folder may have changed.
        debug_assert!(
            acted.rows.is_none()
                && acted.draft.is_none()
                && acted.started.is_none()
                && acted.check.is_none()
                && !acted.close,
            "a folder edit changed more than the folder"
        );
        cx.notify();
    }

    /// A recent folder or the picker's answer: what was typed goes first, so the field and the
    /// shell agree before the shell takes the new folder and the field is filled with it.
    fn choose_folder(&mut self, text: String, window: &mut Window, cx: &mut Context<Self>) {
        self.settle_folder(cx);
        self.act(ShellAction::EditFolder { text }, window, cx);
    }

    fn start(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.settle_folder(cx);
        let Some(folder) = self.shell.new_session().map(|dialog| dialog.folder.clone()) else {
            return;
        };
        self.act(ShellAction::StartSession { folder }, window, cx);
    }

    fn cancel(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.folder_typing = None;
        self.act(ShellAction::CancelNewSession, window, cx);
    }

    /// Opens the system's folder picker and takes the first folder chosen.
    fn pick_folder(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let picked = cx.prompt_for_paths(PathPromptOptions {
            files: false,
            directories: true,
            multiple: false,
            prompt: None,
        });
        cx.spawn_in(window, async move |this, cx| {
            let Ok(Ok(Some(paths))) = picked.await else {
                return;
            };
            let Some(folder) = paths.first() else {
                return;
            };
            let text = folder.to_string_lossy().into_owned();
            _ = this.update_in(cx, |model, window, cx| {
                model.choose_folder(text, window, cx)
            });
        })
        .detach();
    }
}

/// The dialog over the window, while the shell has it open.
pub(crate) fn new_session(model: &ShellModel, cx: &mut Context<ShellModel>) -> Option<AnyElement> {
    let dialog = model.shell.new_session()?.clone();
    let input = model.folder.clone()?;
    let theme = cx.theme();
    let (muted, danger) = (theme.muted_foreground, theme.danger);
    let label = |text: &'static str| {
        div()
            .w(px(LABEL_WIDTH))
            .flex_none()
            .text_color(muted)
            .child(text)
    };

    let folder = h_flex()
        .gap_2()
        .items_center()
        .child(label(copy::FOLDER))
        .child(
            div().flex_1().child(
                Input::new(&input)
                    .accessibility_id("dialog-folder")
                    .aria_label(copy::FOLDER)
                    .disabled(dialog.checking),
            ),
        )
        .child(
            Button::new("dialog-pick")
                .outline()
                .label("…")
                .disabled(dialog.checking)
                .on_click(cx.listener(|model, _: &ClickEvent, window, cx| {
                    model.pick_folder(window, cx);
                })),
        );

    let recent: Vec<AnyElement> = model
        .shell
        .recent_folders()
        .iter()
        .enumerate()
        .map(|(at, folder)| {
            let text = folder.clone();
            Button::new(("dialog-recent", at))
                .ghost()
                .label(folder.clone())
                .disabled(dialog.checking)
                .on_click(cx.listener(move |model, _: &ClickEvent, window, cx| {
                    model.choose_folder(text.clone(), window, cx);
                }))
                .into_any_element()
        })
        .collect();
    let recent = (!recent.is_empty()).then(|| {
        v_flex()
            .pl(px(LABEL_WIDTH + 8.0))
            .items_start()
            .children(recent)
    });

    let runtime = (!dialog.folder.trim().is_empty()).then(|| {
        h_flex()
            .gap_2()
            .child(label(copy::RUNTIME))
            .child(copy::runtime_label(&runtime_of(&dialog.folder)))
    });

    let problem = dialog.problem.as_ref().map(|problem| {
        h_flex()
            .gap_2()
            .text_color(danger)
            .child(PROBLEM_GLYPH)
            .child(problem_text(problem))
    });

    let start_label = if dialog.checking {
        copy::CHECKING
    } else {
        copy::START
    };
    let buttons = h_flex()
        .gap_2()
        .justify_end()
        .child(
            Button::new("dialog-cancel")
                .outline()
                .label(copy::CANCEL)
                .on_click(cx.listener(|model, _: &ClickEvent, window, cx| {
                    model.cancel(window, cx);
                })),
        )
        .child(
            Button::new("dialog-start")
                .accessibility_id("dialog-start")
                .primary()
                .label(start_label)
                .disabled(!dialog.can_start())
                .on_click(cx.listener(|model, _: &ClickEvent, window, cx| {
                    model.start(window, cx);
                })),
        );

    let card = v_flex()
        .id("new-session-dialog")
        .accessibility_id("new-session-dialog")
        .aria_label(copy::NEW_SESSION)
        .w(px(WIDTH))
        .max_w_full()
        .p_4()
        .gap_3()
        .rounded_lg()
        .border_1()
        .border_color(theme.border)
        .bg(theme.popover)
        .text_color(theme.popover_foreground)
        .shadow_lg()
        .child(
            div()
                .font_weight(FontWeight::SEMIBOLD)
                .child(copy::NEW_SESSION),
        )
        .child(folder)
        .children(recent)
        .children(runtime)
        .children(problem)
        .child(buttons);
    Some(over_window(
        "new-session-layer",
        card.into_any_element(),
        cx,
    ))
}

/// A layer over the whole window that takes the mouse and centers `content`.
pub(crate) fn over_window(
    id: &'static str,
    content: AnyElement,
    cx: &mut Context<ShellModel>,
) -> AnyElement {
    div()
        .id(id)
        .absolute()
        .inset_0()
        .flex()
        .items_center()
        .justify_center()
        .p_4()
        .bg(cx.theme().overlay)
        .occlude()
        .child(content)
        .into_any_element()
}
