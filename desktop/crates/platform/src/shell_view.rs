//! The window's three panes under the header line: the slots on the left with the button that
//! opens the New Session dialog under them, the conversation in the middle, and the right pane,
//! which is an empty frame for now. The dialog and the close are drawn over the panes. The panes' widths and
//! whether they are open are the shell's; a drag hands the new width to the shell and takes
//! back the width it allowed.

use std::ops::RangeInclusive;

use closta_shell::copy;
use closta_shell::panes::{LEFT_WIDTH, Pane, RIGHT_WIDTH};
use closta_shell::slot::{SlotId, SlotMark, SlotSummary};
use closta_shell::state::ShellAction;
use gpui_kit::base::{h_flex, v_flex};
use gpui_kit::component::button::{Button, ButtonVariants as _};
use gpui_kit::component::resizable::{ResizableState, h_resizable, resizable_panel};
use gpui_kit::component::{ActiveTheme as _, IconName};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

use crate::closing::close_layer;
use crate::dialog;
use crate::model::ShellModel;
use crate::thread;

/// The height of the header line.
const HEADER: f32 = 36.0;
/// The index of each pane in the group; a closed pane stays in place, hidden.
const LEFT: usize = 0;
const RIGHT: usize = 2;

fn width_range(range: RangeInclusive<f32>) -> std::ops::Range<Pixels> {
    px(*range.start())..px(*range.end())
}

impl Render for ShellModel {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let (background, foreground) = (cx.theme().background, cx.theme().foreground);
        let panes = self.shell.panes().clone();
        let model = cx.entity();
        let header = self.header(cx);
        let slots = self.slot_list(cx);
        let center = thread::conversation(self, cx);
        let right = right_frame(cx);
        let dialog = dialog::new_session(self, cx);
        let close = close_layer(self, cx);
        v_flex()
            .relative()
            .size_full()
            .bg(background)
            .text_color(foreground)
            .child(header)
            .child(
                div().flex_1().min_h_0().child(
                    h_resizable("panes")
                        .with_state(&self.panes)
                        .on_resize(move |state, window, cx| resized(&model, state, window, cx))
                        .child(
                            resizable_panel()
                                .visible(panes.left_open)
                                .size(px(panes.left_width))
                                .size_range(width_range(LEFT_WIDTH))
                                // Keeps the shell's width when the window is resized.
                                .fixed()
                                .child(slots),
                        )
                        .child(resizable_panel().child(center))
                        .child(
                            resizable_panel()
                                .visible(panes.right_open)
                                .size(px(panes.right_width))
                                .size_range(width_range(RIGHT_WIDTH))
                                .fixed()
                                .child(right),
                        ),
                ),
            )
            .children(dialog)
            .children(close)
    }
}

/// Hands the side panes' new widths to the shell and writes back a width it clamped.
fn resized(
    model: &Entity<ShellModel>,
    state: &Entity<ResizableState>,
    window: &mut Window,
    cx: &mut App,
) {
    let sizes = state.read(cx).sizes().clone();
    let clamped = model.update(cx, |model, cx| {
        let open = model.shell.panes().clone();
        let mut clamped = Vec::new();
        for (at, pane, is_open) in [
            (LEFT, Pane::Left, open.left_open),
            (RIGHT, Pane::Right, open.right_open),
        ] {
            let Some(width) = sizes.get(at).map(|size| size.as_f32()) else {
                continue;
            };
            if !is_open {
                continue;
            }
            model.shell.act(ShellAction::ResizePane { pane, width });
            let took = match pane {
                Pane::Left => model.shell.panes().left_width,
                Pane::Right => model.shell.panes().right_width,
            };
            if (took - width).abs() >= 0.5 {
                clamped.push((at, took));
            }
        }
        cx.notify();
        clamped
    });
    for (at, width) in clamped {
        state.update(cx, |state, cx| {
            state.resize_panel(at, px(width), window, cx)
        });
    }
}

impl ShellModel {
    /// Writes the shell's width back to each open side pane whose layout has another.
    pub(crate) fn match_pane_widths(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let panes = self.shell.panes().clone();
        let sizes = self.panes.read(cx).sizes().clone();
        for (at, open, width) in [
            (LEFT, panes.left_open, panes.left_width),
            (RIGHT, panes.right_open, panes.right_width),
        ] {
            let differs = sizes
                .get(at)
                .is_some_and(|size| (size.as_f32() - width).abs() >= 0.5);
            if open && differs {
                self.panes.update(cx, |state, cx| {
                    state.resize_panel(at, px(width), window, cx)
                });
            }
        }
    }

    /// The header line: the headline and the buttons that open and close the side panes.
    fn header(&self, cx: &mut Context<Self>) -> AnyElement {
        let (border, bar) = (cx.theme().border, cx.theme().title_bar);
        let toggle = |id: &'static str, icon: IconName, pane: Pane, cx: &mut Context<Self>| {
            Button::new(id).ghost().icon(icon).on_click(cx.listener(
                move |model, _: &ClickEvent, window, cx| {
                    model.act(ShellAction::TogglePane(pane), window, cx);
                },
            ))
        };
        let left = toggle("toggle-left", IconName::PanelLeft, Pane::Left, cx);
        let right = toggle("toggle-right", IconName::PanelRight, Pane::Right, cx);
        h_flex()
            .h(px(HEADER))
            .flex_none()
            .px_3()
            .gap_2()
            .items_center()
            .border_b_1()
            .border_color(border)
            .bg(bar)
            .child(left)
            .child(div().flex_1().child(self.shell.header().headline.clone()))
            .child(right)
            .into_any_element()
    }

    /// The slots, each its mark and title, a click selecting it; under them, the button that
    /// opens the New Session dialog.
    fn slot_list(&self, cx: &mut Context<Self>) -> AnyElement {
        let selected = self.shell.selected();
        let rows: Vec<AnyElement> = self
            .shell
            .slots()
            .into_iter()
            .map(|summary| slot_row(summary, selected, cx))
            .collect();
        v_flex()
            .id("pane-left")
            .accessibility_id("pane-left")
            .aria_label(copy::SESSIONS)
            .size_full()
            .py_1()
            .bg(cx.theme().sidebar)
            .border_r_1()
            .border_color(cx.theme().sidebar_border)
            .child(
                v_flex()
                    .id("slots")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .children(rows),
            )
            .child(
                div().flex_none().p_2().child(
                    Button::new("new-session")
                        .accessibility_id("new-session")
                        .ghost()
                        .w_full()
                        .label(copy::NEW_SESSION_BUTTON)
                        .on_click(cx.listener(|model, _: &ClickEvent, window, cx| {
                            model.act(ShellAction::OpenNewSession, window, cx);
                        })),
                ),
            )
            .into_any_element()
    }
}

fn slot_row(
    summary: SlotSummary,
    selected: Option<SlotId>,
    cx: &mut Context<ShellModel>,
) -> AnyElement {
    let theme = cx.theme();
    let (glyph, color) = match summary.mark {
        SlotMark::Starting => ("○", theme.muted_foreground),
        SlotMark::Working => ("●", theme.info),
        SlotMark::Ready => ("●", theme.success),
        SlotMark::Ended => ("○", theme.muted_foreground),
        SlotMark::Failed => ("●", theme.danger),
        SlotMark::Closed => ("○", theme.muted_foreground),
    };
    let (active, hover) = (theme.list_active, theme.list_hover);
    let id = summary.id;
    let name = SharedString::from(format!("slot-{id}"));
    let select = cx.listener(move |model, _: &ClickEvent, window, cx| {
        model.act(ShellAction::Select(id), window, cx);
    });
    h_flex()
        .id(name.clone())
        .accessibility_id(name)
        .aria_label(summary.title.clone())
        .h(px(28.))
        .px_3()
        .gap_2()
        .items_center()
        .when(selected == Some(id), |row| row.bg(active))
        .hover(move |row| row.bg(hover))
        .child(div().text_color(color).child(glyph))
        .child(div().flex_1().truncate().child(summary.title))
        .on_click(select)
        .into_any_element()
}

/// The right pane: its title and the button that closes it.
fn right_frame(cx: &mut Context<ShellModel>) -> AnyElement {
    let (background, border) = (cx.theme().sidebar, cx.theme().sidebar_border);
    let close = cx.listener(|model, _: &ClickEvent, window, cx| {
        model.act(ShellAction::TogglePane(Pane::Right), window, cx);
    });
    v_flex()
        .id("pane-right")
        .accessibility_id("pane-right")
        .aria_label(copy::SESSION)
        .size_full()
        .bg(background)
        .border_l_1()
        .border_color(border)
        .child(
            h_flex()
                .h(px(32.))
                .px_3()
                .items_center()
                .child(div().flex_1().child(copy::SESSION))
                .child(
                    Button::new("close-right")
                        .ghost()
                        .icon(IconName::Close)
                        .on_click(close),
                ),
        )
        .into_any_element()
}
