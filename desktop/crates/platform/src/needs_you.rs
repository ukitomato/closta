//! The needs-you list at the top of the left pane: one row a slot that waits, the oldest first,
//! scrolling once it is taller than a few rows.
//! A row names the project and the session on its first line, and on its second says what waits
//! and offers Allow and Deny… when the list may answer it unread, and Open
//! otherwise. Its buttons are for the mouse only: none takes the keyboard, and the digits, Enter
//! and Space are held while the list has it. Alt+Shift+W is the window's gate's alone.

use closta_presenter::sessions::groups::AlertKind;
use closta_shell::card_keys::{CardKeyOutcome, FocusScene, card_key};
use closta_shell::copy;
use closta_shell::nav::NavItem;
use closta_shell::needs_you::{NeedsYouItem, NeedsYouRow, wholly_shown};
use closta_shell::slot::SlotId;
use closta_shell::state::ShellAction;
use gpui_kit::base::{h_flex, v_flex};
use gpui_kit::component::button::{Button, ButtonVariants as _};
use gpui_kit::component::{ActiveTheme as _, Sizable as _};
use gpui_kit::*;

use crate::clock::WallClock;
use crate::composer::Dispatch;
use crate::focus::to_card_key;
use crate::model::ShellModel;

/// How much of a permission's subject the row's second line shows.
const SUBJECT_CHARS: usize = 80;
/// How tall the rows grow before they scroll.
const ROWS_MAX_HEIGHT: f32 = 220.;

impl ShellModel {
    /// The list as the shell has it now. The rows it draws whole in its frame are told to the
    /// shell, with their place, at the start of the next frame, once they are on screen; a list
    /// hidden with its pane or behind an overlay shows nothing.
    pub(crate) fn needs_you_list(&self, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let rows = self.shell.needs_you();
        if self.shell.panes().left_open && self.shell.overlay().is_none() {
            self.note_list_shown(&rows, window, cx);
        }
        let cursor = match self.shell.nav_cursor() {
            Some(NavItem::NeedsYou(slot)) => Some(*slot),
            _ => None,
        };
        needs_you_list(
            &rows,
            cursor,
            &self.focus.list,
            &self.needs_you_scroll,
            Self::dispatch(cx),
            self.clock,
            cx,
        )
    }

    fn note_list_shown(&self, rows: &[NeedsYouRow], window: &mut Window, cx: &mut Context<Self>) {
        let drawn: Vec<DrawnRow> = rows
            .iter()
            .enumerate()
            .filter_map(|(index, row)| {
                let request_id = row.request_id()?;
                let seen = self.shell.list_shown_at(row.slot, request_id) == Some(index);
                (!seen).then(|| DrawnRow {
                    index,
                    slot: row.slot,
                    request_id: request_id.to_owned(),
                })
            })
            .collect();
        if drawn.is_empty() {
            return;
        }
        let this = cx.weak_entity();
        let scroll = self.needs_you_scroll.clone();
        window.on_next_frame(move |window, cx| {
            let content = (0., window.viewport_size().height.as_f32());
            _ = this.update(cx, |model, _| {
                // Only the time is kept, which nothing on screen shows: no redraw is asked for.
                for action in shown_actions(drawn, &scroll, content, model.clock.now_ms()) {
                    model.shell.act(action);
                }
            });
        });
    }
}

/// A row the list drew, at its place among the rows, that the shell has not seen there.
struct DrawnRow {
    index: usize,
    slot: SlotId,
    request_id: String,
}

/// What the shell is told of the rows drawn: only those laid out whole inside the list's frame
/// as it was last drawn and inside the window's content, `(top, bottom)`. A row scrolled out of
/// the frame, cut by its edge or below the bottom of a low window was not read.
fn shown_actions(
    drawn: Vec<DrawnRow>,
    scroll: &ScrollHandle,
    content: (f32, f32),
    now_ms: i64,
) -> Vec<ShellAction> {
    let frame = scroll.bounds();
    let list = (frame.top().as_f32(), frame.bottom().as_f32());
    // The rows are laid out as if not scrolled; on screen they stand shifted by the offset.
    let offset = scroll.offset().y.as_f32();
    drawn
        .into_iter()
        .filter(|row| {
            scroll.bounds_for_item(row.index).is_some_and(|it| {
                let on_screen = (it.top().as_f32() + offset, it.bottom().as_f32() + offset);
                it.size.height > px(0.) && wholly_shown(on_screen, list, content)
            })
        })
        .map(|row| ShellAction::ListShown {
            slot: row.slot,
            request_id: row.request_id,
            index: row.index,
            now_ms,
        })
        .collect()
}

/// The heading and the rows, which scroll past [`ROWS_MAX_HEIGHT`]; the heading alone, faint,
/// when nothing waits.
pub(crate) fn needs_you_list(
    rows: &[NeedsYouRow],
    cursor: Option<SlotId>,
    focus: &FocusHandle,
    scroll: &ScrollHandle,
    dispatch: Dispatch,
    clock: WallClock,
    cx: &App,
) -> AnyElement {
    let theme = cx.theme();
    let heading = div()
        .px_3()
        .py_1()
        .text_xs()
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(if rows.is_empty() {
            theme.muted_foreground.opacity(0.6)
        } else {
            theme.foreground
        })
        .child(copy::NEEDS_YOU);
    v_flex()
        .id("needs-you")
        .accessibility_id("needs-you")
        .aria_label(copy::NEEDS_YOU)
        .flex_none()
        .track_focus(focus)
        // The window's gate holds these keys first; this holds them again on the way down,
        // before a part inside acts on one, and prevents the default, so no Enter or Space
        // comes back as a click when the key goes up. It only holds: the jump is the gate's.
        .capture_key_down(move |event: &KeyDownEvent, window, cx| {
            let Some(key) = to_card_key(&event.keystroke) else {
                return;
            };
            if card_key(&FocusScene::NeedsYou, &key) != CardKeyOutcome::Pass {
                window.prevent_default();
                cx.stop_propagation();
            }
        })
        .child(heading)
        .child(
            // Its children are the rows alone: the scroll handle's items are the rows' places.
            v_flex()
                .id("needs-you-rows")
                .max_h(px(ROWS_MAX_HEIGHT))
                .overflow_y_scroll()
                .track_scroll(scroll)
                .children(
                    rows.iter().map(|row| {
                        needs_you_row(row, cursor == Some(row.slot), &dispatch, clock, cx)
                    }),
                ),
        )
        .into_any_element()
}

/// One row: the mark, the project and the session, and the count of waits on the first line;
/// what waits, a permission's subject and the buttons on the second. A row the left list's
/// cursor stands on is framed.
fn needs_you_row(
    row: &NeedsYouRow,
    cursor: bool,
    dispatch: &Dispatch,
    clock: WallClock,
    cx: &App,
) -> AnyElement {
    let theme = cx.theme();
    let slot = row.slot;
    let glyph_color = match &row.item {
        NeedsYouItem::Permission(_) => theme.warning,
        NeedsYouItem::OpenOnly(alert) if alert.what == AlertKind::Edit => theme.warning,
        NeedsYouItem::OpenOnly(_) => theme.info,
        NeedsYouItem::Failed { .. } => theme.danger,
    };
    let heading = copy::needs_you_heading(row.project.as_deref(), &row.title);
    let line = copy::needs_you_line(&row.item);
    let count = (row.waiting >= 2).then(|| {
        div()
            .flex_none()
            .text_color(theme.muted_foreground)
            .child(row.waiting.to_string())
    });
    let heading_id = SharedString::from(format!("needs-you-heading-{slot}"));
    let first = h_flex()
        .gap_2()
        .items_center()
        .child(
            div()
                .flex_none()
                .text_color(glyph_color)
                .child(copy::needs_you_glyph(&row.item)),
        )
        .child(
            div()
                .id(heading_id.clone())
                .accessibility_id(heading_id)
                .aria_label(heading.clone())
                .flex_1()
                .min_w_0()
                .truncate()
                .child(heading.clone()),
        )
        .children(count);
    let what = div()
        .flex_none()
        .max_w_full()
        .truncate()
        .text_xs()
        .text_color(theme.muted_foreground)
        .child(line.clone());
    let open = || {
        list_button(
            format!("needs-you-open-{slot}"),
            copy::LIST_OPEN,
            ShellAction::OpenFromList { slot },
            dispatch,
        )
        .outline()
        .into_any_element()
    };
    let (subject, buttons): (Option<AnyElement>, Vec<AnyElement>) =
        match (&row.item, row.request_id()) {
            (NeedsYouItem::Permission(alert), Some(request_id)) => {
                let subject = div()
                    .flex_1()
                    .min_w_0()
                    .truncate()
                    .text_xs()
                    .font_family(theme.mono_font_family.clone())
                    .text_color(theme.muted_foreground)
                    .child(cut_subject(&alert.subject))
                    .into_any_element();
                let buttons = if row.may_allow() {
                    let allow = {
                        let request_id = request_id.to_owned();
                        let dispatch = dispatch.clone();
                        Button::new(SharedString::from(format!("needs-you-allow-{slot}")))
                            .accessibility_id(SharedString::from(format!("needs-you-allow-{slot}")))
                            .tab_stop(false)
                            .xsmall()
                            .primary()
                            .label(copy::LIST_ALLOW)
                            .on_click(move |_: &ClickEvent, window, cx| {
                                // The time it was pressed: the shell takes it half a second
                                // after the row first showed this request.
                                let action = ShellAction::AllowFromList {
                                    slot,
                                    request_id: request_id.clone(),
                                    now_ms: clock.now_ms(),
                                };
                                dispatch(action, window, cx);
                            })
                    };
                    let deny = list_button(
                        format!("needs-you-deny-{slot}"),
                        copy::LIST_DENY,
                        ShellAction::DenyFromList {
                            slot,
                            request_id: request_id.to_owned(),
                        },
                        dispatch,
                    )
                    .outline();
                    vec![allow.into_any_element(), deny.into_any_element()]
                } else {
                    vec![open()]
                };
                (Some(subject), buttons)
            }
            _ => (None, vec![open()]),
        };
    let second = h_flex()
        .pl_5()
        .gap_1()
        .items_center()
        .child(what)
        .children(subject)
        // With no subject the buttons still stand at the right end.
        .child(div().flex_1())
        .children(buttons);
    let name = SharedString::from(format!("needs-you-{slot}"));
    // The frame is always there, clear off the cursor, so the cursor moving shifts nothing.
    let ring = if cursor {
        theme.ring
    } else {
        theme.ring.opacity(0.)
    };
    div()
        .id(name.clone())
        .accessibility_id(name)
        .aria_label(format!("{heading} · {line}"))
        .px_3()
        .py_1()
        .border_1()
        .border_color(ring)
        .child(v_flex().gap_1().child(first).child(second))
        .into_any_element()
}

/// A small button of the list that hands `action` over when clicked; the keyboard never
/// reaches it.
fn list_button(
    id: String,
    label: &'static str,
    action: ShellAction,
    dispatch: &Dispatch,
) -> Button {
    let dispatch = dispatch.clone();
    let id = SharedString::from(id);
    Button::new(id.clone())
        .accessibility_id(id)
        .tab_stop(false)
        .xsmall()
        .label(label)
        .on_click(move |_: &ClickEvent, window, cx| dispatch(action.clone(), window, cx))
}

/// The subject on one line, cut at [`SUBJECT_CHARS`] characters.
fn cut_subject(subject: &str) -> String {
    let line: String = subject
        .chars()
        .map(|it| if it.is_control() { ' ' } else { it })
        .collect();
    if line.chars().count() <= SUBJECT_CHARS {
        return line;
    }
    let mut cut: String = line.chars().take(SUBJECT_CHARS).collect();
    cut.push('…');
    cut
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::rc::Rc;

    use closta_presenter::sessions::groups::{AlertKind, OpenOnlyAlert, PermissionAlert};
    use closta_shell::needs_you::{NeedsYouItem, NeedsYouRow};
    use closta_shell::slot::SlotId;
    use closta_shell::state::ShellAction;
    use gpui_kit::test::TestWindowExt as _;
    // Named one by one: the glob would bring in a `test` that hides the built-in attribute.
    use gpui_kit::{
        AnyWindowHandle, AppContext as _, Bounds, Context, FocusHandle, IntoElement,
        ParentElement as _, Point, Render, ScrollHandle, Styled as _, TestAppContext, Window,
        WindowBounds, WindowOptions, div, open_window, point, px, size,
    };

    use super::{DrawnRow, cut_subject, needs_you_list, shown_actions};
    use crate::clock::WallClock;
    use crate::composer::Dispatch;

    type Acted = Rc<RefCell<Vec<ShellAction>>>;

    struct List {
        rows: Vec<NeedsYouRow>,
        focus: FocusHandle,
        scroll: ScrollHandle,
        dispatch: Dispatch,
        clock: WallClock,
    }

    impl Render for List {
        fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
            div().size_full().child(needs_you_list(
                &self.rows,
                None,
                &self.focus,
                &self.scroll,
                self.dispatch.clone(),
                self.clock,
                cx,
            ))
        }
    }

    fn permission(n: u64, answerable: bool) -> NeedsYouRow {
        NeedsYouRow {
            slot: SlotId::numbered(n),
            project: None,
            title: format!("s{n}"),
            item: NeedsYouItem::Permission(PermissionAlert {
                key: format!("k{n}"),
                request_id: format!("r{n}"),
                tool_name: "Bash".to_owned(),
                subject: "git status --short".to_owned(),
                answerable,
            }),
            waiting: 1,
            since_ms: 0,
        }
    }

    fn question(n: u64) -> NeedsYouRow {
        NeedsYouRow {
            slot: SlotId::numbered(n),
            project: None,
            title: format!("s{n}"),
            item: NeedsYouItem::OpenOnly(OpenOnlyAlert {
                key: format!("k{n}"),
                request_id: format!("r{n}"),
                what: AlertKind::Question,
            }),
            waiting: 2,
            since_ms: 0,
        }
    }

    /// A window with only the list, whose actions are kept, and the list's focus.
    fn open(
        cx: &mut TestAppContext,
        rows: Vec<NeedsYouRow>,
    ) -> (AnyWindowHandle, Acted, FocusHandle, WallClock) {
        let (handle, acted, focus, clock, _) = open_scrolled(cx, rows);
        (handle, acted, focus, clock)
    }

    /// [`open`], with the handle the rows scroll by.
    fn open_scrolled(
        cx: &mut TestAppContext,
        rows: Vec<NeedsYouRow>,
    ) -> (AnyWindowHandle, Acted, FocusHandle, WallClock, ScrollHandle) {
        cx.update(gpui_kit::init);
        let acted = Acted::default();
        let kept = Rc::clone(&acted);
        let dispatch: Dispatch = Rc::new(move |action, _, _| kept.borrow_mut().push(action));
        let clock = WallClock::start();
        let scroll = ScrollHandle::new();
        let tracked = scroll.clone();
        let (handle, view) = cx
            .update(|cx| {
                let bounds = Bounds {
                    origin: Point::default(),
                    size: size(px(400.), px(400.)),
                };
                let options = WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(bounds)),
                    ..Default::default()
                };
                open_window(options, cx, move |_, cx| {
                    let focus = cx.focus_handle();
                    cx.new(|_| List {
                        rows,
                        focus,
                        scroll: tracked,
                        dispatch,
                        clock,
                    })
                })
            })
            .expect("open test window");
        let focus = view.read_with(cx, |view, _| view.focus.clone());
        cx.update_window(handle, |_, window, cx| window.render_frame(cx))
            .expect("draw the list");
        (handle, acted, focus, clock, scroll)
    }

    fn drawn(rows: &[NeedsYouRow]) -> Vec<DrawnRow> {
        rows.iter()
            .enumerate()
            .map(|(index, row)| DrawnRow {
                index,
                slot: row.slot,
                request_id: row.request_id().expect("a request").to_owned(),
            })
            .collect()
    }

    /// The rows noted in a window whose content is 400 px high, as the test window's is.
    fn noted(rows: &[NeedsYouRow], scroll: &ScrollHandle) -> Vec<usize> {
        noted_in(rows, scroll, (0., 400.))
    }

    fn noted_in(rows: &[NeedsYouRow], scroll: &ScrollHandle, content: (f32, f32)) -> Vec<usize> {
        shown_actions(drawn(rows), scroll, content, 7)
            .into_iter()
            .map(|action| match action {
                ShellAction::ListShown { index, now_ms, .. } => {
                    assert_eq!(now_ms, 7);
                    index
                }
                _ => panic!("only ListShown"),
            })
            .collect()
    }

    #[gpui_kit::test]
    fn only_the_rows_drawn_whole_in_the_lists_frame_are_noted(cx: &mut TestAppContext) {
        let rows: Vec<NeedsYouRow> = (1..=12).map(|n| permission(n, true)).collect();
        let (handle, _, _, _, scroll) = open_scrolled(cx, rows.clone());
        let first = noted(&rows, &scroll);
        assert!(!first.is_empty(), "the top rows are in view");
        assert_eq!(first, (0..first.len()).collect::<Vec<_>>());
        assert!(
            first.len() < rows.len(),
            "the list scrolls: {}",
            first.len()
        );

        // Scrolled to the bottom, the top rows are out of view and the last are in it.
        scroll.set_offset(point(px(0.), -scroll.max_offset().y));
        cx.update_window(handle, |_, window, cx| window.render_frame(cx))
            .expect("draw the list again");
        let last = noted(&rows, &scroll);
        assert!(last.contains(&(rows.len() - 1)), "{last:?}");
        assert!(!last.contains(&0), "{last:?}");
    }

    #[gpui_kit::test]
    fn a_row_partly_outside_the_window_is_not_noted(cx: &mut TestAppContext) {
        let rows: Vec<NeedsYouRow> = (1..=12).map(|n| permission(n, true)).collect();
        let (_, _, _, _, scroll) = open_scrolled(cx, rows.clone());
        let in_frame = noted(&rows, &scroll);
        assert!(in_frame.len() >= 2, "{in_frame:?}");
        // A window whose content ends inside the list's frame, partway down its second row.
        let second = scroll
            .bounds_for_item(1)
            .expect("the second row was laid out");
        let cut = (second.top() + second.size.height / 2.).as_f32();
        let in_window = noted_in(&rows, &scroll, (0., cut));
        assert_eq!(in_window, [0], "only the first row is whole on screen");
    }

    #[gpui_kit::test]
    fn the_first_line_names_the_project_and_the_title(cx: &mut TestAppContext) {
        let mut row = permission(1, true);
        row.project = Some("closta".to_owned());
        row.title = "Retry login".to_owned();
        let (handle, _, _, _) = open(cx, vec![row, permission(2, true)]);
        cx.update_window(handle, |_, window, _| {
            let first = window.find("needs-you-heading-1");
            assert_eq!(first.label(), Some("closta · Retry login"));
            let alone = window.find("needs-you-heading-2");
            assert_eq!(
                alone.label(),
                Some("s2"),
                "a slot in no project shows its title"
            );
        })
        .expect("look at the rows");
    }

    #[gpui_kit::test]
    fn only_a_row_the_list_may_allow_offers_allow_and_deny(cx: &mut TestAppContext) {
        let rows = vec![permission(1, true), permission(2, false), question(3)];
        let (handle, _, _, _) = open(cx, rows);
        cx.update_window(handle, |_, window, _| {
            let has = |id: &str| window.try_find(id.to_owned()).is_some();
            assert!(has("needs-you-allow-1") && has("needs-you-deny-1"));
            assert!(!has("needs-you-open-1"));
            for n in [2, 3] {
                assert!(!has(&format!("needs-you-allow-{n}")), "row {n}");
                assert!(!has(&format!("needs-you-deny-{n}")), "row {n}");
                assert!(has(&format!("needs-you-open-{n}")), "row {n}");
            }
        })
        .expect("look at the rows");
    }

    #[gpui_kit::test]
    fn allow_carries_the_time_it_was_pressed(cx: &mut TestAppContext) {
        let (handle, acted, _, clock) = open(cx, vec![permission(1, true)]);
        let before = clock.now_ms();
        cx.update_window(handle, |_, window, cx| {
            window.click("needs-you-allow-1".to_owned(), cx);
        })
        .expect("click Allow");
        cx.run_until_parked();
        let after = clock.now_ms();
        let acted = acted.borrow();
        let [
            ShellAction::AllowFromList {
                slot,
                request_id,
                now_ms,
            },
        ] = acted.as_slice()
        else {
            panic!("one Allow, got {}", acted.len());
        };
        assert_eq!(*slot, SlotId::numbered(1));
        assert_eq!(request_id, "r1");
        assert!((before..=after).contains(now_ms));
    }

    #[gpui_kit::test]
    fn keys_on_the_list_press_none_of_its_buttons(cx: &mut TestAppContext) {
        let (handle, acted, focus, _) = open(cx, vec![permission(1, true), question(2)]);
        cx.update_window(handle, |_, window, cx| {
            focus.focus(window, cx);
            for key in [
                "1", "enter", "space", "tab", "enter", "space", "tab", "2", "enter",
            ] {
                window.press(key, cx);
            }
        })
        .expect("press keys on the list");
        cx.run_until_parked();
        assert!(
            acted.borrow().is_empty(),
            "{} actions",
            acted.borrow().len()
        );
    }

    #[test]
    fn a_long_subject_is_cut_on_one_line() {
        assert_eq!(cut_subject("git status\n--short"), "git status --short");
        let long = "x".repeat(100);
        let cut = cut_subject(&long);
        assert_eq!(cut.chars().count(), 81);
        assert!(cut.ends_with('…'));
    }
}
