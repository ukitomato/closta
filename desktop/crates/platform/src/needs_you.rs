//! The needs-you list at the top of the left pane: one row a slot that waits, the oldest first.
//! A row says what waits and offers Allow and Deny… when the list may answer it unread, and Open
//! otherwise. Its buttons are for the mouse only: none takes the keyboard, and the digits, Enter
//! and Space are held while the list has it.

use closta_presenter::sessions::groups::AlertKind;
use closta_shell::card_keys::{CardKey, CardKeyOutcome, FocusScene, Key, card_key};
use closta_shell::copy;
use closta_shell::needs_you::{NeedsYouItem, NeedsYouRow};
use closta_shell::slot::SlotId;
use closta_shell::state::ShellAction;
use gpui_kit::base::{h_flex, v_flex};
use gpui_kit::component::button::{Button, ButtonVariants as _};
use gpui_kit::component::{ActiveTheme as _, Sizable as _};
use gpui_kit::*;

use crate::clock::WallClock;
use crate::composer::Dispatch;
use crate::model::ShellModel;

/// How much of a permission's subject the row's second line shows.
const SUBJECT_CHARS: usize = 80;

impl ShellModel {
    /// The list as the shell has it now. The requests its rows show for the first time are told
    /// to the shell at the start of the next frame, once they are on screen; a list hidden with
    /// its pane or behind an overlay shows nothing.
    pub(crate) fn needs_you_list(&self, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let rows = self.shell.needs_you();
        if self.shell.panes().left_open && self.shell.overlay().is_none() {
            self.note_list_shown(&rows, window, cx);
        }
        needs_you_list(&rows, &self.list_focus, Self::dispatch(cx), self.clock, cx)
    }

    fn note_list_shown(&self, rows: &[NeedsYouRow], window: &mut Window, cx: &mut Context<Self>) {
        let unseen: Vec<(SlotId, String)> = rows
            .iter()
            .filter_map(|row| {
                let request_id = row.request_id()?;
                let seen = self.shell.list_shown(row.slot, request_id);
                (!seen).then(|| (row.slot, request_id.to_owned()))
            })
            .collect();
        if unseen.is_empty() {
            return;
        }
        let this = cx.weak_entity();
        window.on_next_frame(move |_, cx| {
            _ = this.update(cx, |model, _| {
                let now_ms = model.clock.now_ms();
                // Only the time is kept, which nothing on screen shows: no redraw is asked for.
                for (slot, request_id) in unseen {
                    model.shell.act(ShellAction::ListShown {
                        slot,
                        request_id,
                        now_ms,
                    });
                }
            });
        });
    }
}

/// The heading and the rows; the heading alone, faint, when nothing waits.
pub(crate) fn needs_you_list(
    rows: &[NeedsYouRow],
    focus: &FocusHandle,
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
    let held = dispatch.clone();
    v_flex()
        .id("needs-you")
        .accessibility_id("needs-you")
        .aria_label(copy::NEEDS_YOU)
        .flex_none()
        .track_focus(focus)
        // Caught on the way down, before a part inside acts on the key; the default is
        // prevented too, so no Enter or Space comes back as a click when the key goes up.
        .capture_key_down(move |event: &KeyDownEvent, window, cx| {
            let Some(key) = card_key_of(&event.keystroke) else {
                return;
            };
            match card_key(&FocusScene::NeedsYou, &key) {
                CardKeyOutcome::Pass => {}
                CardKeyOutcome::NextWaiting => {
                    window.prevent_default();
                    cx.stop_propagation();
                    held(ShellAction::JumpToWaiting, window, cx);
                }
                _ => {
                    window.prevent_default();
                    cx.stop_propagation();
                }
            }
        })
        .child(heading)
        .children(
            rows.iter()
                .map(|row| needs_you_row(row, &dispatch, clock, cx)),
        )
        .into_any_element()
}

fn needs_you_row(row: &NeedsYouRow, dispatch: &Dispatch, clock: WallClock, cx: &App) -> AnyElement {
    let theme = cx.theme();
    let slot = row.slot;
    let glyph_color = match &row.item {
        NeedsYouItem::Permission(_) => theme.warning,
        NeedsYouItem::OpenOnly(alert) if alert.what == AlertKind::Edit => theme.warning,
        NeedsYouItem::OpenOnly(_) => theme.info,
        NeedsYouItem::Failed { .. } => theme.danger,
    };
    let line = format!("{} · {}", row.title, copy::needs_you_line(&row.item));
    let count = (row.waiting >= 2).then(|| {
        div()
            .flex_none()
            .text_color(theme.muted_foreground)
            .child(row.waiting.to_string())
    });
    let open = || {
        list_button(
            format!("needs-you-open-{slot}"),
            copy::LIST_OPEN,
            ShellAction::OpenFromList { slot },
            dispatch,
        )
        .outline()
    };
    let first = h_flex()
        .gap_2()
        .items_center()
        .child(
            div()
                .flex_none()
                .text_color(glyph_color)
                .child(copy::needs_you_glyph(&row.item)),
        )
        .child(div().flex_1().min_w_0().truncate().child(line.clone()))
        .children(count);
    let content = match (&row.item, row.request_id()) {
        (NeedsYouItem::Permission(alert), Some(request_id)) => {
            let buttons: Vec<AnyElement> = if row.may_allow() {
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
                            // The time it was pressed: the shell takes it half a second after
                            // the row first showed this request.
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
                vec![open().into_any_element()]
            };
            let subject = div()
                .flex_1()
                .min_w_0()
                .truncate()
                .text_xs()
                .font_family(theme.mono_font_family.clone())
                .text_color(theme.muted_foreground)
                .child(cut_subject(&alert.subject));
            v_flex().gap_1().child(first).child(
                h_flex()
                    .pl_5()
                    .gap_1()
                    .items_center()
                    .child(subject)
                    .children(buttons),
            )
        }
        _ => v_flex().child(first.child(open())),
    };
    let name = SharedString::from(format!("needs-you-{slot}"));
    div()
        .id(name.clone())
        .accessibility_id(name)
        .aria_label(line)
        .px_3()
        .py_1()
        .child(content)
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

/// A key as the card table names it; `None` for a key the table has no row for.
pub(crate) fn card_key_of(keystroke: &Keystroke) -> Option<CardKey> {
    let key = match keystroke.key.as_str() {
        "escape" => Key::Escape,
        "enter" => Key::Enter,
        "space" => Key::Space,
        "w" => Key::W,
        digit => match digit.strip_prefix("numpad").unwrap_or(digit).parse::<u8>() {
            Ok(n) if n <= 9 => Key::Digit(n),
            _ => Key::Other,
        },
    };
    let modifiers = &keystroke.modifiers;
    Some(CardKey {
        key,
        ctrl: modifiers.control,
        alt: modifiers.alt,
        shift: modifiers.shift,
        platform: modifiers.platform,
    })
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
        ParentElement as _, Point, Render, Styled as _, TestAppContext, Window, WindowBounds,
        WindowOptions, div, open_window, px, size,
    };

    use super::{cut_subject, needs_you_list};
    use crate::clock::WallClock;
    use crate::composer::Dispatch;

    type Acted = Rc<RefCell<Vec<ShellAction>>>;

    struct List {
        rows: Vec<NeedsYouRow>,
        focus: FocusHandle,
        dispatch: Dispatch,
        clock: WallClock,
    }

    impl Render for List {
        fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
            div().size_full().child(needs_you_list(
                &self.rows,
                &self.focus,
                self.dispatch.clone(),
                self.clock,
                cx,
            ))
        }
    }

    fn permission(n: u64, answerable: bool) -> NeedsYouRow {
        NeedsYouRow {
            slot: SlotId::numbered(n),
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
        cx.update(gpui_kit::init);
        let acted = Acted::default();
        let kept = Rc::clone(&acted);
        let dispatch: Dispatch = Rc::new(move |action, _, _| kept.borrow_mut().push(action));
        let clock = WallClock::start();
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
                        dispatch,
                        clock,
                    })
                })
            })
            .expect("open test window");
        let focus = view.read_with(cx, |view, _| view.focus.clone());
        cx.update_window(handle, |_, window, cx| window.render_frame(cx))
            .expect("draw the list");
        (handle, acted, focus, clock)
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
