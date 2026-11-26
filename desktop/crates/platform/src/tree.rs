//! The left pane's tree under the needs-you list: each project with its sessions while it is
//! open, then the sessions in no project under OTHER. It draws what the shell computes — the
//! rows, the marks, which buttons may be pressed — and keeps nothing but the wait that moves the
//! elapsed times on.

use std::time::Duration;

use closta_shell::copy;
use closta_shell::nav::{NavItem, TreeRow};
use closta_shell::slot::{SlotId, SlotMark, SlotSummary, slot_elapsed};
use closta_shell::state::{ProjectSummary, ShellAction};
use gpui_kit::base::{Disableable as _, h_flex};
use gpui_kit::component::button::{Button, ButtonVariants as _};
use gpui_kit::component::menu::{ContextMenuExt as _, PopupMenuItem};
use gpui_kit::component::tooltip::Tooltip;
use gpui_kit::component::{ActiveTheme as _, IconName, Sizable as _};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

use crate::composer::Dispatch;
use crate::model::ShellModel;

/// How long the elapsed times stand before the pane is drawn again: they count whole minutes.
const ELAPSED_TICK: Duration = Duration::from_secs(30);
const ROW_HEIGHT: f32 = 28.;
const PLUS: &str = "+";
const CHECKING: &str = "⟳";
const OPEN: &str = "▾";
const SHUT: &str = "▸";

/// Which of the theme's colors a mark is drawn in.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Tone {
    Muted,
    Info,
    Warning,
    Success,
    Danger,
}

/// A slot's mark: told apart by its shape as well as by its color.
pub(crate) fn mark_glyph(mark: SlotMark) -> (&'static str, Tone) {
    match mark {
        SlotMark::Starting | SlotMark::Ended | SlotMark::Closed => ("○", Tone::Muted),
        SlotMark::Working => ("●", Tone::Info),
        SlotMark::Waiting => ("⚠", Tone::Warning),
        SlotMark::Ready => ("●", Tone::Success),
        SlotMark::Unread => ("✓", Tone::Success),
        SlotMark::Failed => ("ⓧ", Tone::Danger),
    }
}

/// One entry of a row's right-click menu.
#[derive(Clone, PartialEq, Debug)]
pub(crate) struct MenuChoice {
    pub(crate) label: &'static str,
    pub(crate) action: ShellAction,
    pub(crate) enabled: bool,
    /// Why it cannot be pressed, shown on hover.
    pub(crate) hint: Option<&'static str>,
}

/// A session's menu: Close, unless it is closing; Restart and Copy Session ID when the shell
/// offers them.
pub(crate) fn slot_menu(slot: &SlotSummary) -> Vec<MenuChoice> {
    let id = slot.id;
    let mut choices = vec![MenuChoice {
        label: copy::CLOSE,
        action: ShellAction::CloseSlot { slot: id },
        enabled: !slot.closing,
        hint: None,
    }];
    if slot.can_restart {
        choices.push(MenuChoice {
            label: copy::RESTART,
            action: ShellAction::Restart { slot: id },
            enabled: true,
            hint: None,
        });
    }
    if slot.can_copy_id {
        choices.push(MenuChoice {
            label: copy::COPY_SESSION_ID,
            action: ShellAction::CopySessionId { slot: id },
            enabled: true,
            hint: None,
        });
    }
    choices
}

/// A project's menu: Remove from list, which waits for its sessions to be closed.
pub(crate) fn project_menu(project: &ProjectSummary) -> Vec<MenuChoice> {
    vec![MenuChoice {
        label: copy::REMOVE_FROM_LIST,
        action: ShellAction::RemoveProject {
            project: project.key.clone(),
        },
        enabled: project.can_remove,
        hint: (!project.can_remove).then_some(copy::CLOSE_ITS_SESSIONS),
    }]
}

/// Why a project's plus cannot be pressed, when the reason is the slot limit. While another
/// project's plus is being checked the plus waits without a word: the limit is not the cause.
pub(crate) fn plus_hint(project: &ProjectSummary, slots_full: bool) -> Option<&'static str> {
    (!project.can_add && slots_full).then_some(copy::SLOT_LIMIT)
}

impl ShellModel {
    /// The left list's cursor as it is drawn: only while the left pane has the keyboard.
    pub(crate) fn shown_cursor(&self, window: &Window, cx: &App) -> Option<NavItem> {
        self.focus
            .list
            .contains_focused(window, cx)
            .then(|| self.shell.nav_cursor().cloned())
            .flatten()
    }

    /// The tree's rows from the top. While a row drawn shows an elapsed time in an open pane,
    /// one wait is kept that draws the window again in [`ELAPSED_TICK`]; otherwise none is.
    pub(crate) fn tree(&mut self, window: &Window, cx: &mut Context<Self>) -> Vec<AnyElement> {
        let now_ms = self.clock.now_ms();
        let cursor = self.shown_cursor(window, cx);
        let projects = self.shell.projects();
        let slots = self.shell.slots();
        let selected = self.shell.selected();
        let full = self.shell.slots_full();
        let dispatch = Self::dispatch(cx);
        let mut timed = false;
        let mut rows = Vec::new();
        for row in self.shell.tree_rows() {
            match row {
                TreeRow::Project(key) => {
                    let Some(at) = projects.iter().position(|it| it.key == key) else {
                        continue;
                    };
                    let on_cursor = cursor.as_ref() == Some(&NavItem::Project(key));
                    rows.push(project_row(
                        at + 1,
                        &projects[at],
                        on_cursor,
                        full,
                        &dispatch,
                        cx,
                    ));
                }
                TreeRow::Slot(id) => {
                    let Some(summary) = slots.iter().find(|it| it.id == id) else {
                        continue;
                    };
                    let elapsed = slot_elapsed(summary, now_ms);
                    timed |= elapsed.is_some();
                    let look = SlotLook {
                        selected: selected == Some(id),
                        cursor: cursor.as_ref() == Some(&NavItem::Slot(id)),
                        elapsed,
                    };
                    rows.push(slot_row(summary, look, &dispatch, cx));
                }
                TreeRow::Other => rows.push(heading("other", copy::OTHER_HEADING, cx)),
            }
        }
        self.keep_elapsed_tick(timed && self.shell.panes().left_open, cx);
        rows
    }

    fn keep_elapsed_tick(&mut self, wanted: bool, cx: &mut Context<Self>) {
        if !wanted {
            self.elapsed_tick = None;
            return;
        }
        if self.elapsed_tick.is_some() {
            return;
        }
        self.elapsed_tick = Some(cx.spawn(async move |this, cx| {
            cx.background_executor().timer(ELAPSED_TICK).await;
            _ = this.update(cx, |model, cx| {
                model.elapsed_tick = None;
                cx.notify();
            });
        }));
    }
}

/// A heading of the left pane: small, bold and faint.
pub(crate) fn heading(id: &'static str, text: &'static str, cx: &App) -> AnyElement {
    div()
        .id(id)
        .accessibility_id(id)
        .flex_none()
        .px_3()
        .pt_2()
        .pb_1()
        .text_xs()
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(cx.theme().muted_foreground)
        .child(text)
        .into_any_element()
}

/// The frame of the row the left list's cursor stands on. Every row has it, clear off the
/// cursor, so the cursor moving shifts nothing; it is apart from the selected row's color.
fn cursor_ring(cursor: bool, cx: &App) -> Hsla {
    let ring = cx.theme().ring;
    if cursor { ring } else { ring.opacity(0.) }
}

/// A project's row: the fold, the name, the runtime, the check in progress and the plus; a click
/// opens or closes it and puts the list's cursor on it, a right click offers Remove from list.
fn project_row(
    at: usize,
    project: &ProjectSummary,
    cursor: bool,
    slots_full: bool,
    dispatch: &Dispatch,
    cx: &App,
) -> AnyElement {
    let theme = cx.theme();
    let (muted, hover) = (theme.muted_foreground, theme.list_hover);
    let name = SharedString::from(format!("project-{at}"));
    let key = project.key.clone();
    let toggle = {
        let dispatch = dispatch.clone();
        let key = key.clone();
        move |_: &ClickEvent, window: &mut Window, cx: &mut App| {
            dispatch(
                ShellAction::ToggleProject {
                    project: key.clone(),
                },
                window,
                cx,
            );
            dispatch(
                ShellAction::NavTo(NavItem::Project(key.clone())),
                window,
                cx,
            );
        }
    };
    let plus_id = SharedString::from(format!("project-new-{at}"));
    let plus = {
        let dispatch = dispatch.clone();
        let key = key.clone();
        Button::new(plus_id.clone())
            .accessibility_id(plus_id)
            .accessibility_label(copy::NEW_SESSION)
            .tab_stop(false)
            .ghost()
            .xsmall()
            .label(PLUS)
            .disabled(!project.can_add)
            .when_some(plus_hint(project, slots_full), |button, hint| {
                button.tooltip(hint)
            })
            .on_click(move |_: &ClickEvent, window, cx| {
                // The row under it would open or close the project.
                cx.stop_propagation();
                dispatch(
                    ShellAction::NewInProject {
                        project: key.clone(),
                    },
                    window,
                    cx,
                );
            })
    };
    let checking = project
        .checking
        .then(|| div().flex_none().text_color(muted).child(CHECKING));
    let choices = project_menu(project);
    let menu_dispatch = dispatch.clone();
    h_flex()
        .id(name.clone())
        .accessibility_id(name)
        .aria_label(project.name.clone())
        .aria_expanded(!project.collapsed)
        .h(px(ROW_HEIGHT))
        .px_3()
        .gap_2()
        .items_center()
        .border_1()
        .border_color(cursor_ring(cursor, cx))
        .hover(move |row| row.bg(hover))
        .child(
            div()
                .flex_none()
                .text_color(muted)
                .child(if project.collapsed { SHUT } else { OPEN }),
        )
        .child(
            div()
                .flex_1()
                .min_w_0()
                .truncate()
                .font_weight(FontWeight::SEMIBOLD)
                .child(project.name.clone()),
        )
        .child(
            div()
                .flex_none()
                .text_xs()
                .text_color(muted)
                .child(project.runtime),
        )
        .children(checking)
        .child(plus)
        .on_click(toggle)
        .context_menu(move |menu, _, _| fill_menu(menu, &choices, &menu_dispatch))
        .into_any_element()
}

/// How a session's row is drawn besides its summary.
struct SlotLook {
    selected: bool,
    cursor: bool,
    elapsed: Option<String>,
}

/// A session's row: its mark, its title and how long it has stood under its heading; a click
/// does what Enter does on it — the cursor goes there, the slot is selected and the keyboard
/// goes where the slot can be used — the close button shows on hover, a right click offers its
/// menu.
fn slot_row(summary: &SlotSummary, look: SlotLook, dispatch: &Dispatch, cx: &App) -> AnyElement {
    let theme = cx.theme();
    let (glyph, tone) = mark_glyph(summary.mark);
    let color = match tone {
        Tone::Muted => theme.muted_foreground,
        Tone::Info => theme.info,
        Tone::Warning => theme.warning,
        Tone::Success => theme.success,
        Tone::Danger => theme.danger,
    };
    let (active, hover, muted) = (theme.list_active, theme.list_hover, theme.muted_foreground);
    let id = summary.id;
    let name = SharedString::from(format!("slot-{id}"));
    let select = {
        let dispatch = dispatch.clone();
        move |_: &ClickEvent, window: &mut Window, cx: &mut App| {
            dispatch(ShellAction::NavTo(NavItem::Slot(id)), window, cx);
            dispatch(ShellAction::NavEnter, window, cx);
        }
    };
    // Shown while the row is hovered; a slot that is closing has nothing more to close.
    let close = (!summary.closing).then(|| close_button(id, name.clone(), dispatch));
    let elapsed = look
        .elapsed
        .map(|text| div().flex_none().text_xs().text_color(muted).child(text));
    let choices = slot_menu(summary);
    let menu_dispatch = dispatch.clone();
    h_flex()
        .id(name.clone())
        .accessibility_id(name.clone())
        .aria_label(summary.title.clone())
        .group(name)
        .h(px(ROW_HEIGHT))
        .pl_6()
        .pr_3()
        .gap_2()
        .items_center()
        .border_1()
        .border_color(cursor_ring(look.cursor, cx))
        .when(summary.closing, |row| row.opacity(0.5))
        .when(look.selected, |row| row.bg(active))
        .hover(move |row| row.bg(hover))
        .child(div().flex_none().text_color(color).child(glyph))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .truncate()
                .child(summary.title.clone()),
        )
        .children(elapsed)
        .children(close)
        .on_click(select)
        .context_menu(move |menu, _, _| fill_menu(menu, &choices, &menu_dispatch))
        .into_any_element()
}

fn close_button(id: SlotId, group: SharedString, dispatch: &Dispatch) -> impl IntoElement {
    let close_id = SharedString::from(format!("slot-close-{id}"));
    let dispatch = dispatch.clone();
    div()
        .flex_none()
        .invisible()
        .group_hover(group, |style| style.visible())
        .child(
            Button::new(close_id.clone())
                .accessibility_id(close_id)
                .accessibility_label(copy::CLOSE)
                .tab_stop(false)
                .ghost()
                .xsmall()
                .icon(IconName::Close)
                .on_click(move |_: &ClickEvent, window, cx| {
                    // The row under it would select the slot it closes.
                    cx.stop_propagation();
                    dispatch(ShellAction::CloseSlot { slot: id }, window, cx);
                }),
        )
}

/// Puts the choices in the menu; one that cannot be pressed for a reason says it on hover.
fn fill_menu(
    menu: gpui_kit::component::menu::PopupMenu,
    choices: &[MenuChoice],
    dispatch: &Dispatch,
) -> gpui_kit::component::menu::PopupMenu {
    choices.iter().fold(menu, |menu, choice| {
        let label = choice.label;
        let item = match choice.hint {
            Some(hint) => PopupMenuItem::element(move |_, _| {
                div()
                    .id(label)
                    .child(label)
                    .tooltip(move |window, cx| Tooltip::new(hint).build(window, cx))
            }),
            None => PopupMenuItem::new(label),
        };
        let action = choice.action.clone();
        let dispatch = dispatch.clone();
        menu.item(
            item.disabled(!choice.enabled)
                .on_click(move |_, window, cx| dispatch(action.clone(), window, cx)),
        )
    })
}

#[cfg(test)]
mod tests {
    use closta_shell::copy;
    use closta_shell::nav::NavItem;
    use closta_shell::projects::project_key;
    use closta_shell::slot::{SlotId, SlotMark, SlotSummary};
    use closta_shell::state::{ProjectSummary, ShellAction};
    use gpui_kit::test::TestWindowExt as _;
    use gpui_kit::{AnyWindowHandle, AppContext as _, TestAppContext};

    use super::{mark_glyph, plus_hint, project_menu, slot_menu};
    use crate::test_window::{self, TreeSetup};

    const A: &str = r"C:\dev\alpha";
    const B: &str = r"C:\dev\beta";

    fn ended(id: u64) -> SlotSummary {
        SlotSummary {
            id: SlotId::numbered(id),
            title: String::new(),
            mark: SlotMark::Ended,
            closing: false,
            project: None,
            since_ms: None,
            can_restart: true,
            can_copy_id: true,
        }
    }

    fn project(can_add: bool, can_remove: bool) -> ProjectSummary {
        ProjectSummary {
            key: project_key(A).expect("a key"),
            name: "alpha".to_owned(),
            runtime: "Windows",
            collapsed: false,
            checking: false,
            can_add,
            can_remove,
        }
    }

    /// The tops of the elements, which must all be drawn.
    fn tops(cx: &mut TestAppContext, handle: AnyWindowHandle, ids: &[&str]) -> Vec<f32> {
        cx.update_window(handle, |_, window, _| {
            ids.iter()
                .map(|id| window.find((*id).to_owned()).bounds().top().as_f32())
                .collect()
        })
        .expect("look at the tree")
    }

    #[gpui_kit::test]
    fn the_tree_draws_projects_their_sessions_and_other(cx: &mut TestAppContext) {
        let (handle, model) = test_window::open_tree(
            cx,
            TreeSetup {
                projects: &[(A, false), (B, false)],
                slots: &[Some(A), Some(B), None],
                run: true,
            },
        );
        let order = [
            "project-1",
            "slot-1",
            "project-2",
            "slot-2",
            "other",
            "slot-3",
        ];
        let tops = tops(cx, handle, &order);
        assert!(
            tops.windows(2).all(|pair| pair[0] < pair[1]),
            "{order:?} at {tops:?}"
        );
        let failed = model.read_with(cx, |model, _| {
            model
                .shell
                .slots()
                .iter()
                .filter(|it| it.mark == SlotMark::Failed)
                .count()
        });
        assert_eq!(failed, 3, "the sessions failed to start");
    }

    #[gpui_kit::test]
    fn plus_is_disabled_at_the_limit(cx: &mut TestAppContext) {
        let (handle, _) = test_window::open_tree(
            cx,
            TreeSetup {
                projects: &[(A, false), (B, false)],
                slots: &[Some(A); 8],
                run: false,
            },
        );
        cx.update_window(handle, |_, window, _| {
            for plus in ["project-new-1", "project-new-2"] {
                let plus = window.find(plus.to_owned());
                assert_eq!(plus.disabled(), Some(true));
                assert_eq!(plus.description(), Some(copy::SLOT_LIMIT));
            }
        })
        .expect("look at the plus");
    }

    #[gpui_kit::test]
    fn a_collapsed_project_draws_no_sessions(cx: &mut TestAppContext) {
        let (handle, _) = test_window::open_tree(
            cx,
            TreeSetup {
                projects: &[(A, true), (B, false)],
                slots: &[Some(A), Some(B)],
                run: false,
            },
        );
        cx.update_window(handle, |_, window, _| {
            assert!(window.try_find("project-1".to_owned()).is_some());
            assert!(window.try_find("slot-1".to_owned()).is_none());
            assert!(window.try_find("slot-2".to_owned()).is_some());
            assert!(window.try_find("other".to_owned()).is_none());
        })
        .expect("look at the tree");
    }

    #[gpui_kit::test]
    fn a_click_on_a_session_does_what_enter_does_and_on_a_project_keeps_the_list(
        cx: &mut TestAppContext,
    ) {
        let (handle, model) = test_window::open_tree(
            cx,
            TreeSetup {
                projects: &[(A, false)],
                slots: &[Some(A), Some(A)],
                run: false,
            },
        );
        let shown = |cx: &mut TestAppContext| {
            cx.update_window(handle, |_, window, cx| {
                model.read(cx).shown_cursor(window, cx)
            })
            .expect("read the cursor")
        };
        let second = SlotId::numbered(2);
        let asks = |cx: &mut TestAppContext| model.read_with(cx, |model, _| model.prefetch_asks);
        // Twice: the second click lands on the slot already selected.
        for round in 0..2 {
            let before = asks(cx);
            cx.update_window(handle, |_, window, cx| {
                window.click("slot-2".to_owned(), cx)
            })
            .expect("click a session");
            test_window::draw(cx, handle);
            if round == 0 {
                assert!(asks(cx) > before, "the slot shown has its rows made");
            }
            let (input, selected, cursor) = model.read_with(cx, |model, _| {
                (
                    model.focus.composers[&second].clone(),
                    model.shell.selected(),
                    model.shell.nav_cursor().cloned(),
                )
            });
            assert_eq!(selected, Some(second));
            assert_eq!(cursor, Some(NavItem::Slot(second)));
            assert!(
                test_window::focused(cx, handle, &input),
                "the input to type in"
            );
            assert_eq!(shown(cx), None, "no ring while the input has the keyboard");
        }

        cx.update_window(handle, |_, window, cx| {
            window.click("project-1".to_owned(), cx)
        })
        .expect("click the project");
        test_window::draw(cx, handle);
        let list = model.read_with(cx, |model, _| model.focus.list.clone());
        assert!(test_window::focused(cx, handle, &list));
        let key = project_key(A).expect("a key");
        assert_eq!(shown(cx), Some(NavItem::Project(key)));
    }

    #[test]
    fn the_menu_of_an_ended_slot_offers_copy_session_id() {
        let slot = ended(4);
        let labels: Vec<&str> = slot_menu(&slot).iter().map(|it| it.label).collect();
        assert_eq!(labels, [copy::CLOSE, copy::RESTART, copy::COPY_SESSION_ID]);
        let copy_id = slot_menu(&slot).pop().expect("a choice");
        assert_eq!(
            copy_id.action,
            ShellAction::CopySessionId {
                slot: SlotId::numbered(4)
            }
        );
        let live = SlotSummary {
            mark: SlotMark::Working,
            can_restart: false,
            can_copy_id: false,
            ..ended(4)
        };
        let labels: Vec<&str> = slot_menu(&live).iter().map(|it| it.label).collect();
        assert_eq!(labels, [copy::CLOSE]);
    }

    #[test]
    fn remove_from_list_waits_for_the_sessions_and_says_why() {
        let [kept] = project_menu(&project(true, false)).try_into().expect("one");
        assert_eq!(kept.label, copy::REMOVE_FROM_LIST);
        assert!(!kept.enabled);
        assert_eq!(kept.hint, Some(copy::CLOSE_ITS_SESSIONS));
        let [free] = project_menu(&project(true, true)).try_into().expect("one");
        assert!(free.enabled);
        assert_eq!(free.hint, None);
    }

    #[test]
    fn the_plus_names_the_limit_only_when_the_limit_is_why() {
        assert_eq!(
            plus_hint(&project(false, true), true),
            Some(copy::SLOT_LIMIT)
        );
        assert_eq!(
            plus_hint(&project(false, true), false),
            None,
            "another check"
        );
        assert_eq!(plus_hint(&project(true, true), false), None);
    }

    #[test]
    fn every_mark_has_its_own_shape_or_color() {
        let marks = [
            SlotMark::Starting,
            SlotMark::Working,
            SlotMark::Waiting,
            SlotMark::Ready,
            SlotMark::Unread,
            SlotMark::Failed,
        ];
        let looks: Vec<_> = marks.into_iter().map(mark_glyph).collect();
        for (at, look) in looks.iter().enumerate() {
            assert!(!looks[..at].contains(look), "{look:?}");
        }
        assert_eq!(mark_glyph(SlotMark::Failed).0, "ⓧ");
        assert_eq!(mark_glyph(SlotMark::Unread).0, "✓");
    }
}
