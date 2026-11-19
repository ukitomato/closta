//! The conversation pane: the selected slot's rows in a scroller that follows the tail, the text
//! at most 860 px wide in the middle, and the band under it where the wait is shown.

pub(crate) mod prefetch;
mod rows;

use closta_shell::copy;
use gpui_kit::base::v_flex;
use gpui_kit::component::ActiveTheme as _;
use gpui_kit::component::message_scroller::MessageScroller;
use gpui_kit::component::spinner::Spinner;
use gpui_kit::*;

use crate::model::ShellModel;

/// The widest the conversation's text stands.
const TEXT_WIDTH: f32 = 860.0;
/// The height of the band under the list.
const TAIL_BAND: f32 = 28.0;

/// The selected slot's conversation; the empty pane's words when it has no rows.
pub(crate) fn conversation(model: &ShellModel, cx: &mut Context<ShellModel>) -> AnyElement {
    let theme = cx.theme();
    let pane = v_flex()
        .id("pane-center")
        .accessibility_id("pane-center")
        .aria_label(copy::CONVERSATION)
        .size_full()
        .bg(theme.background);
    let empty = div()
        .size_full()
        .flex()
        .items_center()
        .justify_center()
        .text_color(theme.muted_foreground)
        .child(copy::EMPTY);
    let Some((slot, scroller)) = model
        .shell
        .selected()
        .and_then(|slot| Some((slot, model.scrollers.get(&slot).cloned()?)))
    else {
        return pane.child(empty).into_any_element();
    };
    if model.shell.rows(slot).is_empty() {
        return pane.child(empty).into_any_element();
    }
    let position = model
        .shell
        .slots()
        .iter()
        .position(|summary| summary.id == slot)
        .unwrap_or_default();
    let entity = cx.entity();
    let list = MessageScroller::new(("thread", position), scroller, move |at, _, cx| {
        div().w_full().flex().justify_center().px_4().child(
            div()
                .w_full()
                .max_w(px(TEXT_WIDTH))
                .child(rows::row(&entity, slot, at, cx)),
        )
    })
    .with_jump_button_label(copy::JUMP_TO_LATEST)
    .size_full();
    // The spinner stands outside the list, so turning it never remeasures a row; it shows only
    // while the turn runs with no approval waiting.
    let band = model.shell.running(slot).then(|| {
        div()
            .id("tail-band")
            .accessibility_id("tail-band")
            .aria_label(copy::WORKING)
            .h(px(TAIL_BAND))
            .flex_none()
            .flex()
            .items_center()
            .justify_center()
            .child(Spinner::new())
    });
    pane.child(div().flex_1().min_h_0().child(list))
        .children(band)
        .into_any_element()
}
