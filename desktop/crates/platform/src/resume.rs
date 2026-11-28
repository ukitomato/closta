//! The resume popup, drawn over the window while the shell has it open: its project's saved
//! sessions, newest first, filtered by the search field. Its search field is a copy of the
//! popup's search; the reading runs in the background and its answer goes back to the shell.

use closta_shell::copy;
use closta_shell::elapsed::ago_text;
use closta_shell::resume::{ResumeListing, ResumeRowState};
use closta_shell::state::ShellAction;
use gpui_kit::base::{h_flex, v_flex};
use gpui_kit::component::input::{Input, InputEvent, InputState};
use gpui_kit::component::{ActiveTheme as _, Icon, IconName, Sizable as _};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

use crate::dialog::over_window;
use crate::model::ShellModel;

/// The popup's width, and how tall its rows may stand before they scroll.
const WIDTH: f32 = 640.0;
const ROWS_HEIGHT: f32 = 360.0;
const ROW_HEIGHT: f32 = 28.0;
/// The mark before the picked row.
const PICKED: &str = "▸";

impl ShellModel {
    /// Reads the saved sessions in the background, never on the window's thread, and hands the
    /// answer to the shell with the number of its reading.
    pub(crate) fn list_saved(
        &mut self,
        listing: ResumeListing,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let ResumeListing {
            generation,
            listing,
        } = listing;
        let reading = cx.background_executor().spawn(listing);
        cx.spawn_in(window, async move |this, cx| {
            let listing = reading.await;
            _ = this.update_in(cx, |model, window, cx| {
                model.act(
                    ShellAction::SavedListed {
                        generation,
                        listing,
                    },
                    window,
                    cx,
                );
            });
        })
        .detach();
    }

    /// Empties the search field for a popup that just opened, making the field when it has none.
    pub(crate) fn clear_resume_field(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let input = match &self.resume_field {
            Some(input) => input.clone(),
            None => self.new_resume_field(window, cx),
        };
        // `set_value` sends no change: the shell's search is empty already.
        input.update(cx, |state, cx| state.set_value("", window, cx));
        self.resume_scroll = ScrollHandle::new();
    }

    fn new_resume_field(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Entity<InputState> {
        let input = cx.new(|cx| InputState::new(window, cx).placeholder(copy::RESUME_SEARCH));
        let changes = cx.subscribe_in(&input, window, |model, input, event, window, cx| {
            if let InputEvent::Change = event {
                let text = input.read(cx).value().to_string();
                model.act(ShellAction::EditResumeQuery { text }, window, cx);
            }
        });
        self._observed.push(changes);
        self.resume_field = Some(input.clone());
        input
    }

    /// Opens the popup on the first project, as `--open resume` asks; nothing without one.
    pub(crate) fn open_first_resume(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(project) = self.shell.projects().first().map(|it| it.key.clone()) else {
            return;
        };
        self.act(ShellAction::OpenResume { project }, window, cx);
    }
}

/// The popup over the window, while the shell has it open: its title, the search field, then
/// the rows or what stands in their place, and the slot limit while eight slots are open. A
/// click on a row opens it; a click outside closes the popup.
pub(crate) fn resume_popup(model: &ShellModel, cx: &mut Context<ShellModel>) -> Option<AnyElement> {
    let picker = model.shell.resume()?;
    let input = model.resume_field.clone()?;
    let title = model.shell.resume_title().unwrap_or_default();
    let now_ms = model.clock.now_ms();
    let theme = cx.theme();
    let (muted, active, hover, danger) = (
        theme.muted_foreground,
        theme.list_active,
        theme.list_hover,
        theme.danger,
    );

    let field = Input::new(&input)
        .accessibility_id("resume-search")
        .aria_label(copy::RESUME_SEARCH)
        .prefix(Icon::new(IconName::Search).small().text_color(muted));

    let rows: Vec<AnyElement> = model
        .shell
        .resume_rows()
        .into_iter()
        .enumerate()
        .map(|(at, row)| {
            let picked = at == picker.selected;
            let id = SharedString::from(format!("resume-row-{at}"));
            let age_id = SharedString::from(format!("resume-age-{at}"));
            let age = ago_text(row.updated_at_ms, now_ms);
            let state = match row.state {
                ResumeRowState::Closed => None,
                ResumeRowState::OpenHere(_) => Some(copy::RESUME_OPEN),
                ResumeRowState::Closing => Some(copy::RESUME_CLOSING),
            };
            let closing = row.state == ResumeRowState::Closing;
            let session_id = row.id.clone();
            h_flex()
                .id(id.clone())
                .accessibility_id(id)
                .aria_label(row.title.clone())
                .h(px(ROW_HEIGHT))
                .flex_none()
                .px_2()
                .gap_2()
                .items_center()
                .rounded_md()
                .when(picked, |row| row.bg(active))
                .when(closing, |row| row.text_color(muted))
                .when(!closing, |row| {
                    row.hover(move |row| row.bg(hover)).on_click(cx.listener(
                        move |model, _: &ClickEvent, window, cx| {
                            model.act(
                                ShellAction::PickResume {
                                    session_id: session_id.clone(),
                                },
                                window,
                                cx,
                            );
                        },
                    ))
                })
                .child(
                    div()
                        .w(px(12.))
                        .flex_none()
                        .text_color(muted)
                        .child(if picked { PICKED } else { "" }),
                )
                .child(div().flex_1().min_w_0().truncate().child(row.title))
                .child(
                    div()
                        .id(age_id.clone())
                        .accessibility_id(age_id)
                        .aria_label(age.clone())
                        .flex_none()
                        .text_color(muted)
                        .child(age),
                )
                .children(state.map(|state| {
                    let state_id = SharedString::from(format!("resume-state-{at}"));
                    div()
                        .id(state_id.clone())
                        .accessibility_id(state_id)
                        .aria_label(state)
                        .flex_none()
                        .text_color(muted)
                        .child(state)
                }))
                .into_any_element()
        })
        .collect();
    let rows = (!rows.is_empty()).then(|| {
        v_flex()
            .id("resume-rows")
            .max_h(px(ROWS_HEIGHT))
            .overflow_y_scroll()
            .track_scroll(&model.resume_scroll)
            .children(rows)
    });
    let message = picker.message().map(|text| {
        div()
            .id("resume-message")
            .accessibility_id("resume-message")
            .aria_label(text)
            .px_2()
            .text_color(muted)
            .child(text)
    });
    // Eight slots hold a session: no row opens a new one until one is closed.
    let limit = model.shell.slots_full().then(|| {
        div()
            .id("resume-limit")
            .accessibility_id("resume-limit")
            .aria_label(copy::SLOT_LIMIT)
            .px_2()
            .text_color(danger)
            .child(copy::SLOT_LIMIT)
    });

    let card = v_flex()
        .id("resume-popup")
        .accessibility_id("resume-popup")
        .aria_label(title.clone())
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
        // The layer under it would take the keyboard from the search field.
        .on_mouse_down(MouseButton::Left, |_, window, _| window.prevent_default())
        .on_mouse_down_out(cx.listener(|model, _: &MouseDownEvent, window, cx| {
            model.act(ShellAction::CloseResume, window, cx);
        }))
        .child(div().font_weight(FontWeight::SEMIBOLD).child(title))
        .child(field)
        .children(rows)
        .children(message)
        .children(limit);
    Some(over_window(
        "resume-layer",
        &model.focus.overlay_layer,
        card.into_any_element(),
        cx,
    ))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::AtomicBool;

    use closta_session::history::SavedListing;
    use closta_shell::copy;
    use closta_shell::new_session::{NoSaved, SavedFor, SavedSessions};
    use closta_shell::projects::project_key;
    use closta_shell::resume::SavedSessionSummary;
    use closta_shell::state::ShellAction;
    use futures_lite::future;
    use gpui_kit::test::TestWindowExt as _;
    // Named one by one: the glob would bring in a `test` that hides the built-in attribute.
    use gpui_kit::{
        AnyWindowHandle, AppContext as _, Entity, Focusable as _, TestAppContext, point, px,
    };

    use crate::model::ShellModel;
    use crate::test_window::{self, TreeSetup};

    const A: &str = r"C:\dev\alpha";
    const X: &str = "0b1f4c52-6a1e-4a43-9a53-7f0d2a4b8c11";
    const Y: &str = "1c2a5d63-7b2f-4b54-8b64-8a1e3b5c9d22";
    const HOUR_MS: i64 = 60 * 60 * 1000;
    const DAY_MS: i64 = 24 * HOUR_MS;

    /// Every project has the same saved sessions.
    struct Saved(Vec<SavedSessionSummary>);

    impl SavedFor for Saved {
        fn saved(&self, folder: &str) -> Arc<dyn SavedSessions> {
            NoSaved.saved(folder)
        }

        fn list(
            &self,
            _folder: &str,
            _stop: Arc<AtomicBool>,
        ) -> future::Boxed<Option<SavedListing>> {
            let sessions = self.0.clone();
            Box::pin(async move {
                Some(SavedListing {
                    sessions,
                    unreadable: false,
                })
            })
        }
    }

    fn now_ms() -> i64 {
        crate::clock::WallClock::start().now_ms()
    }

    /// Two saved sessions, two hours and three days old.
    fn two() -> Vec<SavedSessionSummary> {
        let now = now_ms();
        vec![
            SavedSessionSummary {
                id: X.to_owned(),
                title: "Retry up to 3 times when login fails".to_owned(),
                updated_at_ms: now - 2 * HOUR_MS - 1000,
                bytes: 10,
            },
            SavedSessionSummary {
                id: Y.to_owned(),
                title: "Split AuthService into TokenStore".to_owned(),
                updated_at_ms: now - 3 * DAY_MS - 1000,
                bytes: 10,
            },
        ]
    }

    /// The window with project `A`, `slots` slots in it, and the popup open on it once its
    /// saved sessions were read.
    fn opened(cx: &mut TestAppContext, slots: usize) -> (AnyWindowHandle, Entity<ShellModel>) {
        let (handle, model) = test_window::open_tree_saved(
            cx,
            TreeSetup {
                projects: &[(A, false)],
                slots: &vec![Some(A); slots],
                run: false,
            },
            Arc::new(Saved(two())),
        );
        let project = project_key(A).expect("a key");
        test_window::act(cx, handle, &model, ShellAction::OpenResume { project });
        test_window::draw(cx, handle);
        (handle, model)
    }

    fn label(cx: &mut TestAppContext, handle: AnyWindowHandle, id: &str) -> Option<String> {
        cx.update_window(handle, |_, window, _| {
            window
                .try_find(id.to_owned())
                .and_then(|it| it.label().map(str::to_owned))
        })
        .expect("look at the popup")
    }

    #[gpui_kit::test]
    fn the_popup_lists_rows_with_their_age(cx: &mut TestAppContext) {
        let (handle, model) = opened(cx, 0);
        assert_eq!(
            label(cx, handle, "resume-popup").as_deref(),
            Some("Resume a session · alpha")
        );
        assert_eq!(
            label(cx, handle, "resume-row-0").as_deref(),
            Some("Retry up to 3 times when login fails")
        );
        assert_eq!(
            label(cx, handle, "resume-age-0").as_deref(),
            Some("2 h ago")
        );
        assert_eq!(
            label(cx, handle, "resume-age-1").as_deref(),
            Some("3 d ago")
        );
        assert_eq!(label(cx, handle, "resume-message"), None);
        assert_eq!(
            label(cx, handle, "resume-state-0"),
            None,
            "no slot holds it"
        );

        let field = model.read_with(cx, |model, cx| {
            model
                .resume_field
                .as_ref()
                .map(|it| it.read(cx).focus_handle(cx))
        });
        assert!(
            test_window::focused(cx, handle, &field.expect("the search field")),
            "the search field has the keyboard"
        );
        test_window::input(cx, handle, "nothing like it");
        test_window::draw(cx, handle);
        assert_eq!(label(cx, handle, "resume-row-0"), None);
        assert_eq!(
            label(cx, handle, "resume-message").as_deref(),
            Some(copy::RESUME_NO_MATCHES)
        );
    }

    #[gpui_kit::test]
    fn a_row_of_an_open_slot_says_open(cx: &mut TestAppContext) {
        let (handle, model) = opened(cx, 0);
        test_window::press(cx, handle, "enter");
        test_window::draw(cx, handle);
        let (popup, slots) = model.read_with(cx, |model, _| {
            (model.shell.resume().is_some(), model.shell.slots().len())
        });
        assert!(!popup, "Enter opened the picked row");
        assert_eq!(slots, 1);

        let project = project_key(A).expect("a key");
        test_window::act(cx, handle, &model, ShellAction::OpenResume { project });
        test_window::draw(cx, handle);
        assert_eq!(
            label(cx, handle, "resume-state-0").as_deref(),
            Some(copy::RESUME_OPEN)
        );
        assert_eq!(label(cx, handle, "resume-state-1"), None);
    }

    #[gpui_kit::test]
    fn the_limit_is_said_under_the_rows(cx: &mut TestAppContext) {
        let (handle, model) = opened(cx, 8);
        assert!(model.read_with(cx, |model, _| model.shell.slots_full()));
        assert_eq!(
            label(cx, handle, "resume-limit").as_deref(),
            Some(copy::SLOT_LIMIT)
        );
        assert!(label(cx, handle, "resume-row-0").is_some(), "the rows stay");
    }

    #[gpui_kit::test]
    fn a_click_outside_closes_it(cx: &mut TestAppContext) {
        let (handle, model) = opened(cx, 0);
        // On the popup itself it stays.
        cx.update_window(handle, |_, window, cx| {
            window.click_at("resume-popup".to_owned(), point(px(4.), px(4.)), cx)
        })
        .expect("click the popup");
        test_window::draw(cx, handle);
        assert!(model.read_with(cx, |model, _| model.shell.resume().is_some()));
        let field = model.read_with(cx, |model, cx| {
            model
                .resume_field
                .as_ref()
                .map(|it| it.read(cx).focus_handle(cx))
        });
        assert!(
            test_window::focused(cx, handle, &field.expect("the search field")),
            "the search field keeps the keyboard"
        );
        cx.update_window(handle, |_, window, cx| {
            window.click_at("resume-layer".to_owned(), point(px(4.), px(4.)), cx)
        })
        .expect("click outside");
        test_window::draw(cx, handle);
        assert!(model.read_with(cx, |model, _| model.shell.resume().is_none()));
    }
}
