//! Closing the window: the close button and Alt+F4 only ask the shell; the window goes once every
//! session was closed and waited for. While the shell asks, its question is drawn over the
//! window; while it closes, "Closing sessions…". Closing one slot asks the same way, for that
//! slot alone.

use closta_shell::closing::{CLOSE_LIMIT, CloseStage, DESTROY_GRACE, finish_closing};
use closta_shell::copy;
use closta_shell::state::{Overlay, ShellAction};
use gpui_kit::base::{h_flex, v_flex};
use gpui_kit::component::ActiveTheme as _;
use gpui_kit::component::button::{Button, ButtonVariants as _};
use gpui_kit::*;

use crate::dialog::over_window;
use crate::model::ShellModel;

impl ShellModel {
    /// Turns the window's close into a request to the shell; the window itself never closes
    /// from it.
    pub(crate) fn hold_close(window: &Window, cx: &Context<Self>) {
        let this = cx.weak_entity();
        window.on_window_should_close(cx, move |window, cx| {
            _ = this.update(cx, |model, cx| {
                model.act(ShellAction::RequestClose, window, cx);
            });
            false
        });
    }

    /// Closes every session, waits for their runs in the background and quits once they
    /// returned or were killed. A check's run notes in its ready file when the close began and
    /// when it ended.
    pub(crate) fn close_sessions(&mut self, cx: &mut Context<Self>) {
        if let Some(probing) = &mut self.probing {
            probing.closing();
        }
        let run = self.shell.close_all();
        let closing =
            cx.background_executor()
                .spawn(finish_closing(run, CLOSE_LIMIT, DESTROY_GRACE));
        cx.spawn(async move |this, cx| {
            closing.await;
            _ = this.update(cx, |model, _| {
                if let Some(probing) = &mut model.probing {
                    probing.closed();
                }
            });
            cx.update(|cx| cx.quit());
        })
        .detach();
    }
}

/// The question before closing, or that the sessions are closing; nothing while the window is
/// open.
pub(crate) fn close_layer(model: &ShellModel, cx: &mut Context<ShellModel>) -> Option<AnyElement> {
    let theme = cx.theme();
    let (popover, text, border) = (theme.popover, theme.popover_foreground, theme.border);
    let content = match model.shell.close_stage() {
        CloseStage::Open => return None,
        CloseStage::Asking(question) => v_flex()
            .id("close-confirm")
            .accessibility_id("close-confirm")
            .aria_label(copy::close_question(question.working, question.drafts))
            .max_w(px(520.0))
            .p_4()
            .gap_3()
            .rounded_lg()
            .border_1()
            .border_color(border)
            .bg(popover)
            .text_color(text)
            .shadow_lg()
            .child(copy::close_question(question.working, question.drafts))
            .child(
                h_flex()
                    .gap_2()
                    .justify_end()
                    .child(
                        Button::new("close-cancel")
                            .track_focus(&model.focus.overlay_cancel)
                            .outline()
                            .label(copy::CANCEL)
                            .on_click(cx.listener(|model, _: &ClickEvent, window, cx| {
                                model.act(ShellAction::CancelClose, window, cx);
                            })),
                    )
                    .child(
                        Button::new("close-close")
                            .danger()
                            .label(copy::CLOSE)
                            .on_click(cx.listener(|model, _: &ClickEvent, window, cx| {
                                model.act(ShellAction::ConfirmClose, window, cx);
                            })),
                    ),
            ),
        CloseStage::Closing => v_flex()
            .id("closing")
            .accessibility_id("closing")
            .aria_label(copy::CLOSING)
            .p_4()
            .rounded_lg()
            .bg(popover)
            .text_color(text)
            .child(copy::CLOSING),
    };
    Some(over_window(
        "close-layer",
        &model.focus.overlay_layer,
        content.into_any_element(),
        cx,
    ))
}

/// The question before one slot is closed, while the shell asks it.
pub(crate) fn slot_close_layer(
    model: &ShellModel,
    cx: &mut Context<ShellModel>,
) -> Option<AnyElement> {
    if model.shell.overlay() != Some(Overlay::CloseSlot) {
        return None;
    }
    let (_, question) = model.shell.slot_close()?;
    let words = copy::close_question(question.working, question.drafts);
    let theme = cx.theme();
    let content = v_flex()
        .id("slot-close-confirm")
        .accessibility_id("slot-close-confirm")
        .aria_label(words.clone())
        .max_w(px(520.0))
        .p_4()
        .gap_3()
        .rounded_lg()
        .border_1()
        .border_color(theme.border)
        .bg(theme.popover)
        .text_color(theme.popover_foreground)
        .shadow_lg()
        .child(words)
        .child(
            h_flex()
                .gap_2()
                .justify_end()
                .child(
                    Button::new("slot-close-cancel")
                        .track_focus(&model.focus.overlay_cancel)
                        .outline()
                        .label(copy::CANCEL)
                        .on_click(cx.listener(|model, _: &ClickEvent, window, cx| {
                            model.act(ShellAction::CancelCloseSlot, window, cx);
                        })),
                )
                .child(
                    Button::new("slot-close-close")
                        .danger()
                        .label(copy::CLOSE)
                        .on_click(cx.listener(|model, _: &ClickEvent, window, cx| {
                            model.act(ShellAction::ConfirmCloseSlot, window, cx);
                        })),
                ),
        );
    Some(over_window(
        "slot-close-layer",
        &model.focus.overlay_layer,
        content.into_any_element(),
        cx,
    ))
}

#[cfg(test)]
mod tests {
    use closta_shell::closing::CloseStage;
    use closta_shell::state::ShellAction;
    use gpui_kit::{AppContext as _, TestAppContext};

    use crate::test_window::{act, focus_on, focused, open, press};

    #[gpui_kit::test]
    fn escape_cancels_and_enter_closes_in_the_close_question(cx: &mut TestAppContext) {
        let (handle, model, _) = open(cx, 1);
        let slot = model.read_with(cx, |model, _| model.shell.selected().expect("a slot"));
        let text = "x".to_owned();
        act(cx, handle, &model, ShellAction::EditDraft { slot, text });
        let typing = model.read_with(cx, |model, _| model.focus.composers[&slot].clone());
        focus_on(cx, handle, &typing);

        act(cx, handle, &model, ShellAction::RequestClose);
        let cancel = model.read_with(cx, |model, _| model.focus.overlay_cancel.clone());
        assert!(focused(cx, handle, &cancel), "Cancel has the keyboard");
        press(cx, handle, "escape");
        let stage = model.read_with(cx, |model, _| *model.shell.close_stage());
        assert_eq!(stage, CloseStage::Open);
        assert!(
            focused(cx, handle, &typing),
            "the input has the keyboard again"
        );

        act(cx, handle, &model, ShellAction::RequestClose);
        let layer = model.read_with(cx, |model, _| model.focus.overlay_layer.clone());
        for key in ["tab"; 4].into_iter().chain(["shift-tab"; 4]) {
            press(cx, handle, key);
            let inside = cx
                .update_window(handle, |_, window, cx| layer.contains_focused(window, cx))
                .expect("read the focus");
            assert!(inside, "{key} left the question");
        }
        // Tab may have left the keyboard on Close: Enter still confirms, it never clicks Cancel.
        press(cx, handle, "enter");
        let stage = model.read_with(cx, |model, _| *model.shell.close_stage());
        assert_eq!(stage, CloseStage::Closing);
        assert!(
            focused(cx, handle, &layer),
            "the closing layer has the keyboard, not the Cancel no longer drawn"
        );
    }
}
