//! The conversation pane: the band of a failed session over it, the selected slot's rows in a
//! scroller that follows the tail with the text at most 860 px wide in the middle, the band under
//! it where the wait is shown, and the slot's input at the bottom.

pub(crate) mod cards;
pub(crate) mod prefetch;
mod rows;

use closta_shell::copy;
use closta_shell::slot::SlotId;
use closta_shell::state::ShellAction;
use gpui_kit::base::{h_flex, v_flex};
use gpui_kit::component::button::Button;
use gpui_kit::component::message_scroller::MessageScroller;
use gpui_kit::component::spinner::Spinner;
use gpui_kit::component::{ActiveTheme as _, Icon, IconName, Sizable as _};
use gpui_kit::*;

use crate::composer;
use crate::model::ShellModel;

/// The widest the conversation's text stands.
const TEXT_WIDTH: f32 = 860.0;
/// The height of the band under the list.
const TAIL_BAND: f32 = 28.0;
/// How faint the failure band's ground is against the danger color.
const FAILURE_GROUND: f32 = 0.08;

/// The selected slot's conversation, with its input under it; the empty pane's words when it has
/// no rows.
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
    let body = if model.shell.rows(slot).is_empty() {
        empty.into_any_element()
    } else {
        let position = model
            .shell
            .slots()
            .iter()
            .position(|summary| summary.id == slot)
            .unwrap_or_default();
        let entity = cx.entity();
        MessageScroller::new(("thread", position), scroller, move |at, window, cx| {
            centered(rows::row(&entity, slot, at, window, cx))
        })
        .with_jump_button_label(copy::JUMP_TO_LATEST)
        .size_full()
        .into_any_element()
    };
    // The spinner stands outside the list, so turning it never remeasures a row; it shows only
    // while the turn runs with no approval waiting.
    let band = model.shell.running(slot).then(|| {
        let words = copy::band(model.shell.compacting(slot));
        h_flex()
            .id("tail-band")
            .accessibility_id("tail-band")
            .aria_label(words)
            .h(px(TAIL_BAND))
            .flex_none()
            .gap_2()
            .items_center()
            .justify_center()
            .text_color(cx.theme().muted_foreground)
            .child(Spinner::new())
            .child(words)
    });
    let failure = failure_band(model, slot, cx);
    let composer = composer::composer(model, slot, cx)
        .map(|composer| div().flex_none().pt_1().pb_3().child(centered(composer)));
    // A click on the conversation outside any card puts the keyboard there: a card that then
    // arrives may take it.
    pane.children(failure)
        .child(
            div()
                .id("thread")
                .track_focus(&model.focus.thread)
                .flex_1()
                .min_h_0()
                .child(body),
        )
        .children(band)
        .children(composer)
        .into_any_element()
}

/// `content` at most [`TEXT_WIDTH`] wide, in the middle of the pane.
fn centered(content: impl IntoElement) -> Div {
    div()
        .w_full()
        .flex()
        .justify_center()
        .px_4()
        .child(div().w_full().max_w(px(TEXT_WIDTH)).child(content))
}

/// The band over a failed session's conversation: what failed, what to try, and the Restart
/// with what it does when the session can be started again, or why it cannot while eight slots
/// hold a session. The band takes the keyboard when the needs-you list opens it.
fn failure_band(
    model: &ShellModel,
    slot: SlotId,
    cx: &mut Context<ShellModel>,
) -> Option<AnyElement> {
    let (title, hint) = model.shell.failure(slot)?;
    let restart = model.shell.can_restart(slot).then(|| {
        Button::new("failure-restart")
            .outline()
            .small()
            .label(copy::RESTART)
            .on_click(cx.listener(move |model, _: &ClickEvent, window, cx| {
                model.act(ShellAction::Restart { slot }, window, cx);
            }))
    });
    let theme = cx.theme();
    let muted = theme.muted_foreground;
    let note = restart
        .is_some()
        .then(|| div().text_color(muted).child(copy::RESTART_NOTE));
    let limit = model
        .shell
        .restart_blocked(slot)
        .then(|| div().flex_none().text_color(muted).child(copy::SLOT_LIMIT));
    let line = h_flex()
        .gap_2()
        .items_center()
        .child(
            Icon::new(IconName::TriangleAlert)
                .size(px(14.))
                .text_color(theme.danger),
        )
        .child(div().flex_1().child(title.clone()))
        .children(restart)
        .children(limit);
    let band = v_flex()
        .id("failure-band")
        .accessibility_id("failure-band")
        .aria_label(title)
        .track_focus(&model.focus.failure)
        .flex_none()
        .w_full()
        .py_2()
        .gap_1()
        .border_b_1()
        .border_color(theme.danger)
        .bg(theme.danger.opacity(FAILURE_GROUND))
        .child(centered(
            v_flex()
                .gap_1()
                .child(line)
                .children(hint.map(|hint| div().text_color(muted).child(hint)))
                .children(note),
        ));
    Some(band.into_any_element())
}
