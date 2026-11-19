//! Closing the window: the close button and Alt+F4 only ask the shell; the window goes once every
//! session was closed and waited for. While the shell asks, its question is drawn over the
//! window; while it closes, "Closing sessions…".

use closta_shell::closing::{CLOSE_LIMIT, CloseStage, DESTROY_GRACE, finish_closing};
use closta_shell::copy;
use closta_shell::state::ShellAction;
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
    /// returned or were killed.
    pub(crate) fn close_sessions(&mut self, cx: &mut Context<Self>) {
        let run = self.shell.close_all();
        let closing =
            cx.background_executor()
                .spawn(finish_closing(run, CLOSE_LIMIT, DESTROY_GRACE));
        cx.spawn(async move |_, cx| {
            closing.await;
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
    Some(over_window("close-layer", content.into_any_element(), cx))
}
