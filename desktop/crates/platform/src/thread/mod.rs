//! The conversation pane: the selected slot's rows in a scroller that follows the tail, the text
//! at most 860 px wide in the middle, and the band under it where the wait is shown.

pub(crate) mod prefetch;
mod rows;

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

/// The selected slot's conversation; an empty pane when there are no rows.
pub(crate) fn conversation(model: &ShellModel, cx: &mut Context<ShellModel>) -> AnyElement {
    let pane = v_flex().size_full().bg(cx.theme().background);
    let Some(slot) = model.shell.selected() else {
        return pane.into_any_element();
    };
    let Some(scroller) = model.scrollers.get(&slot).cloned() else {
        return pane.into_any_element();
    };
    let position = model
        .shell
        .slots()
        .iter()
        .position(|summary| summary.id == slot)
        .unwrap_or_default();
    let list = (!model.shell.rows(slot).is_empty()).then(|| {
        let entity = cx.entity();
        MessageScroller::new(("thread", position), scroller, move |at, _, cx| {
            div().w_full().flex().justify_center().px_4().child(
                div()
                    .w_full()
                    .max_w(px(TEXT_WIDTH))
                    .child(rows::row(&entity, slot, at, cx)),
            )
        })
        .size_full()
    });
    // The spinner stands outside the list, so turning it never remeasures a row.
    let band = model.shell.running(slot).then(|| {
        div()
            .h(px(TAIL_BAND))
            .flex_none()
            .flex()
            .items_center()
            .justify_center()
            .child(Spinner::new())
    });
    pane.child(div().flex_1().min_h_0().children(list))
        .children(band)
        .into_any_element()
}
