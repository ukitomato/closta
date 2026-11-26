//! A card in the conversation. One that waits is drawn whole, in a frame of the primary color:
//! what it asks, its buttons and its fields. One that was answered is a single faint line.
//! Its buttons are for the mouse only and never take the keyboard; the keys reach a card only
//! through the window's gate (`focus.rs`), which maps them by the shell's card table.

mod permission;
mod plan;
mod question;

use std::collections::HashMap;

use closta_presenter::cards::decisions::offers_destination;
use closta_presenter::cards::{SUGGESTION_DESTINATIONS, ThreadCard};
use closta_presenter::edit_diff::EditDiff;
use closta_presenter::rows::CardRow;
use closta_shell::card_keys::{card_choices, card_kind};
use closta_shell::cards::CardState;
use closta_shell::copy;
use closta_shell::edit_patch::edit_patch;
use closta_shell::slot::SlotId;
use closta_shell::state::ShellAction;
use gpui_kit::base::v_flex;
use gpui_kit::component::button::Button;
use gpui_kit::component::diff::{DiffFile, DiffState};
use gpui_kit::component::input::InputState;
use gpui_kit::component::text::TextViewState;
use gpui_kit::component::{ActiveTheme as _, Sizable as _};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

use crate::clock::WallClock;
use crate::composer::Dispatch;
use crate::focus::{CardField, FocusMap};
use crate::model::ShellModel;

/// What GPUI keeps for the waiting cards besides their focus: an edit's diff, read once from
/// its patch (`None` when the patch could not be read), and a plan's text state.
#[derive(Default)]
pub(crate) struct CardCache {
    diffs: HashMap<(SlotId, String), Option<Entity<DiffState>>>,
    plans: HashMap<(SlotId, String), (String, Entity<TextViewState>)>,
}

impl CardCache {
    /// Lets go of what was kept for the slot's cards that no longer wait.
    pub(crate) fn keep_cards(&mut self, slot: SlotId, waiting: &[&str]) {
        let kept = |at: SlotId, request_id: &str| at != slot || waiting.contains(&request_id);
        self.diffs
            .retain(|(at, request_id), _| kept(*at, request_id));
        self.plans
            .retain(|(at, request_id), _| kept(*at, request_id));
    }

    fn diff(
        &mut self,
        slot: SlotId,
        request_id: &str,
        diff: &EditDiff,
        cx: &mut App,
    ) -> Option<Entity<DiffState>> {
        self.diffs
            .entry((slot, request_id.to_owned()))
            .or_insert_with(|| {
                let files = diff_files(diff)?;
                Some(cx.new(|cx| DiffState::new(files, cx).with_context_lines(None)))
            })
            .clone()
    }

    fn plan(
        &mut self,
        slot: SlotId,
        request_id: &str,
        text: &str,
        cx: &mut App,
    ) -> Entity<TextViewState> {
        let (kept, state) = self
            .plans
            .entry((slot, request_id.to_owned()))
            .or_insert_with(|| {
                let state = cx.new(|cx| TextViewState::markdown(text, cx));
                (text.to_owned(), state)
            });
        if kept != text {
            text.clone_into(kept);
            state.update(cx, |state, cx| state.set_text(text, cx));
        }
        state.clone()
    }
}

/// An edit's patch read as the diff view reads it: exactly one file, or `None`.
pub(crate) fn diff_files(diff: &EditDiff) -> Option<Vec<DiffFile>> {
    let patch = edit_patch(diff)?;
    DiffFile::parse(&patch)
        .ok()
        .filter(|files| files.len() == 1)
}

/// The parts of a waiting card GPUI holds, made or found before it is drawn.
pub(crate) struct CardParts {
    pub(crate) card: FocusHandle,
    /// Whether the keyboard is in the card.
    inside: bool,
    /// The Deny… or Keep Planning… note, while it is open.
    note: Option<Entity<InputState>>,
    /// A question's options' focus, by question.
    options: Vec<Vec<FocusHandle>>,
    /// A question's Other lines, by question.
    others: Vec<Entity<InputState>>,
    diff: Option<Entity<DiffState>>,
    plan: Option<Entity<TextViewState>>,
    /// The buttons' focus, by name.
    buttons: HashMap<String, FocusHandle>,
    /// What an answering button reads the time it was pressed from.
    clock: WallClock,
}

/// The names of a card's buttons; a button's id is `card-<request id>-<name>`.
fn button_names(card: &ThreadCard) -> Vec<String> {
    let mut names: Vec<String> = (0..card_choices(card))
        .map(|index| format!("choice-{index}"))
        .collect();
    match card {
        ThreadCard::Permission(permission) => {
            names.extend(["deny-note".to_owned(), "note-send".to_owned()]);
            if offers_destination(&permission.suggestions) {
                names.extend(
                    SUGGESTION_DESTINATIONS
                        .iter()
                        .map(|place| format!("destination-{place}")),
                );
            }
        }
        ThreadCard::Plan(_) => names.push("keep-note".to_owned()),
        ThreadCard::Question(_) => names.extend(["answer".to_owned(), "skip".to_owned()]),
    }
    names
}

/// Finds or makes what the waiting `card` is drawn with.
#[allow(clippy::too_many_arguments)]
pub(crate) fn prepare(
    focus: &mut FocusMap,
    cache: &mut CardCache,
    slot: SlotId,
    card: &ThreadCard,
    state: &CardState,
    dispatch: &Dispatch,
    clock: WallClock,
    window: &mut Window,
    cx: &mut App,
) -> CardParts {
    let request_id = card.request_id();
    let handle = focus.card_handle(slot, request_id, card_kind(card), card_choices(card), cx);
    let mut parts = CardParts {
        inside: handle.contains_focused(window, cx),
        card: handle,
        note: None,
        options: Vec::new(),
        others: Vec::new(),
        diff: None,
        plan: None,
        buttons: HashMap::new(),
        clock,
    };
    for name in button_names(card) {
        let handle = focus.button_handle(slot, request_id, &name, cx);
        parts.buttons.insert(name, handle);
    }
    let mut note = |placeholder, window: &mut Window, cx: &mut App| {
        state.note_open.then(|| {
            focus.card_input(
                slot,
                request_id,
                CardField::Note,
                placeholder,
                &state.note,
                dispatch,
                clock,
                window,
                cx,
            )
        })
    };
    match card {
        ThreadCard::Permission(permission) => {
            parts.note = note(copy::DENY_NOTE_PLACEHOLDER, window, cx);
            if let Some(diff) = &permission.diff {
                parts.diff = cache.diff(slot, request_id, diff, cx);
            }
        }
        ThreadCard::Plan(plan) => {
            parts.note = note(copy::PLAN_NOTE_PLACEHOLDER, window, cx);
            parts.plan = plan
                .plan
                .as_deref()
                .map(|text| cache.plan(slot, request_id, text, cx));
        }
        ThreadCard::Question(question) => {
            for (at, asked) in question.questions.iter().enumerate() {
                let options = (0..asked.options.len())
                    .map(|option| focus.option_handle(slot, request_id, at, option, cx))
                    .collect();
                parts.options.push(options);
                let other = state
                    .picks
                    .get(at)
                    .map_or("", |pick| pick.other_text.as_str());
                parts.others.push(focus.card_input(
                    slot,
                    request_id,
                    CardField::Other(at),
                    copy::OTHER_PLACEHOLDER,
                    other,
                    dispatch,
                    clock,
                    window,
                    cx,
                ));
            }
        }
    }
    parts
}

/// The waiting card: its frame, what it asks and its buttons, and under them the keys it takes,
/// shown only while the keyboard is in it (the line keeps its room, so the row's height never
/// changes with the focus).
pub(crate) fn waiting_card(
    slot: SlotId,
    card: &ThreadCard,
    state: &CardState,
    parts: &CardParts,
    dispatch: &Dispatch,
    window: &Window,
    cx: &App,
) -> AnyElement {
    let request_id = card.request_id();
    let (content, keys) = match card {
        ThreadCard::Permission(permission) => (
            permission::body(
                slot,
                copy::card_title(card),
                card_choices(card),
                permission,
                state,
                parts,
                dispatch,
                window,
                cx,
            ),
            copy::permission_keys(card_choices(card)),
        ),
        ThreadCard::Plan(plan) => (
            plan::body(slot, plan, state, parts, dispatch, cx),
            copy::plan_keys(card_choices(card)),
        ),
        ThreadCard::Question(question) => (
            question::body(slot, question, state, parts, dispatch, window, cx),
            copy::QUESTION_KEYS.to_owned(),
        ),
    };
    let theme = cx.theme();
    let failure =
        card_failure(card).map(|failure| div().text_color(theme.danger).child(failure.to_owned()));
    let id = SharedString::from(format!("card-{request_id}"));
    v_flex()
        .id(id.clone())
        .accessibility_id(id)
        .aria_label(copy::card_title(card))
        .track_focus(&parts.card)
        .w_full()
        .px_3()
        .py_2()
        .gap_2()
        .rounded(px(6.))
        .border_1()
        .border_color(theme.primary)
        .children(content)
        .children(failure)
        .child(
            div()
                .text_xs()
                .text_color(theme.muted_foreground)
                .when(!parts.inside, |it| it.invisible())
                .child(keys),
        )
        .into_any_element()
}

fn card_failure(card: &ThreadCard) -> Option<&str> {
    match card {
        ThreadCard::Permission(card) => card.failure.as_deref(),
        ThreadCard::Plan(card) => card.failure.as_deref(),
        ThreadCard::Question(card) => card.failure.as_deref(),
    }
}

/// A card that was answered, as one framed faint line.
fn answered_card(row: &CardRow, cx: &App) -> AnyElement {
    let theme = cx.theme();
    v_flex()
        .w_full()
        .px_3()
        .py_2()
        .rounded(px(6.))
        .border_1()
        .border_color(theme.border)
        .text_color(theme.muted_foreground)
        .child(copy::card_line(row))
        .into_any_element()
}

/// A card row of the slot: whole while it waits, a line once answered. A waiting card drawn for
/// the first time is told to the shell at the start of the next frame, once it is on screen.
pub(in crate::thread) fn card_row(
    model: &Entity<ShellModel>,
    slot: SlotId,
    row: &CardRow,
    window: &mut Window,
    cx: &mut App,
) -> AnyElement {
    if row.card.answered().is_some() {
        return answered_card(row, cx);
    }
    let request_id = row.card.request_id().to_owned();
    let (state, shown) = {
        let shell = &model.read(cx).shell;
        let state = shell
            .card_state(slot, &request_id)
            .cloned()
            .unwrap_or_else(|| CardState::for_card(&row.card));
        (state, shell.shown(slot, &request_id))
    };
    let (parts, dispatch) = model.update(cx, |model, cx| {
        let dispatch = ShellModel::dispatch(cx);
        let parts = prepare(
            &mut model.focus,
            &mut model.card_cache,
            slot,
            &row.card,
            &state,
            &dispatch,
            model.clock,
            window,
            cx,
        );
        (parts, dispatch)
    });
    if !shown {
        let model = model.downgrade();
        window.on_next_frame(move |_, cx| {
            _ = model.update(cx, |model, _| {
                let now_ms = model.clock.now_ms();
                // Only the time is kept, which nothing on screen shows: no redraw is asked for.
                model.shell.act(ShellAction::CardShown {
                    slot,
                    request_id,
                    now_ms,
                });
            });
        });
    }
    waiting_card(slot, &row.card, &state, &parts, &dispatch, window, cx)
}

/// The card's button `name` that hands `action` over when clicked; the keyboard never reaches
/// it. Its `tab_stop(false)` is what keeps Tab off it: the button writes it onto its handle.
fn card_button(
    parts: &CardParts,
    request_id: &str,
    name: &str,
    label: impl Into<SharedString>,
    action: ShellAction,
    dispatch: &Dispatch,
) -> Button {
    answer_button(
        parts,
        request_id,
        name,
        label,
        move |_| action.clone(),
        dispatch,
    )
}

/// A card button that answers: the action is made with the time it was pressed, which the
/// shell holds against when the card was first drawn.
fn answer_button(
    parts: &CardParts,
    request_id: &str,
    name: &str,
    label: impl Into<SharedString>,
    answer: impl Fn(i64) -> ShellAction + 'static,
    dispatch: &Dispatch,
) -> Button {
    let dispatch = dispatch.clone();
    let clock = parts.clock;
    let id = SharedString::from(format!("card-{request_id}-{name}"));
    let button = match parts.buttons.get(name) {
        Some(handle) => Button::new(id.clone()).track_focus(handle),
        None => Button::new(id.clone()),
    };
    button
        .accessibility_id(id)
        .tab_stop(false)
        .small()
        .label(label)
        .on_click(move |_: &ClickEvent, window, cx| {
            dispatch(answer(clock.now_ms()), window, cx);
        })
}

/// The card's title on its own line, with the tool's name faint after it.
fn heading(title: String, tool: &str, cx: &App) -> AnyElement {
    gpui_kit::base::h_flex()
        .gap_2()
        .items_center()
        .child(div().font_weight(FontWeight::SEMIBOLD).child(title))
        .child(
            div()
                .text_color(cx.theme().muted_foreground)
                .child(tool.to_owned()),
        )
        .into_any_element()
}

/// The line under a field of the code font.
fn mono(cx: &App) -> Div {
    div()
        .font_family(cx.theme().mono_font_family.clone())
        .text_size(px(12.5))
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::rc::Rc;
    use std::sync::Arc;

    use closta_presenter::cards::{
        PermissionCard, QuestionCard, QuestionOption, QuestionView, ThreadCard,
    };
    use closta_presenter::edit_diff::{DiffKind, DiffLine, EditDiff};
    use closta_shell::cards::CardState;
    use closta_shell::slot::SlotId;
    use closta_shell::state::{Overlay, ShellAction};
    use gpui_kit::component::input::Textarea;
    use gpui_kit::component::input::TextareaState;
    use gpui_kit::test::TestWindowExt as _;
    // Named one by one: the glob would bring in a `test` that hides the built-in attribute.
    use gpui_kit::{
        AnyWindowHandle, AppContext as _, Bounds, Context, Entity, FocusHandle, Focusable as _,
        InteractiveElement as _, IntoElement, ParentElement as _, Point, Render, ScrollHandle,
        Styled as _, Subscription, TestAppContext, Window, WindowBounds, WindowOptions, div,
        open_window, px, size,
    };

    use closta_presenter::sessions::groups::PermissionAlert;
    use closta_shell::needs_you::{NeedsYouItem, NeedsYouRow};

    use super::{CardCache, diff_files, prepare, waiting_card};
    use crate::clock::WallClock;
    use crate::composer::Dispatch;
    use crate::focus::{self, CardField, FocusMap};
    use crate::needs_you::needs_you_list;

    type Acted = Rc<RefCell<Vec<ShellAction>>>;

    fn slot() -> SlotId {
        SlotId::numbered(1)
    }

    fn lines(lines: &[(DiffKind, &str)]) -> Vec<DiffLine> {
        lines
            .iter()
            .map(|(kind, text)| DiffLine {
                kind: *kind,
                text: (*text).to_owned(),
            })
            .collect()
    }

    fn edit(path: &str, lines: Vec<DiffLine>, cut: bool) -> EditDiff {
        EditDiff {
            file_path: path.to_owned(),
            lines,
            // Counted before the cut: never compared with the patch.
            added: 9999,
            removed: 9999,
            replace_all: false,
            cut,
        }
    }

    #[test]
    fn the_card_patch_parses_into_one_file() {
        use DiffKind::{Added, Removed, Same};
        let many: Vec<(DiffKind, String)> =
            (0..2000).map(|n| (Added, format!("line {n}"))).collect();
        let many: Vec<(DiffKind, &str)> = many
            .iter()
            .map(|(kind, text)| (*kind, text.as_str()))
            .collect();
        let diffs = [
            edit(
                "src/auth.rs",
                lines(&[
                    (Same, "fn login() {"),
                    (Removed, "    api.login(c)"),
                    (Added, "    retry(3, || api.login(c))"),
                    (Same, ""),
                    (Same, "}"),
                ]),
                false,
            ),
            edit(
                "C:\\work\\new.txt",
                lines(&[(Added, "a"), (Added, "b")]),
                false,
            ),
            edit(
                "notes/crlf.txt",
                lines(&[(Same, "keep\r"), (Removed, "old\r"), (Added, "new\r")]),
                false,
            ),
            edit("README.md", lines(&many), true),
            edit(
                "dashes.sql",
                lines(&[(Removed, "-- a comment"), (Added, "++ counter")]),
                false,
            ),
        ];
        for diff in &diffs {
            let files = diff_files(diff).unwrap_or_else(|| panic!("{} parses", diff.file_path));
            let [file] = files.as_slice() else {
                panic!("{} is one file", diff.file_path);
            };
            let count = |kind| diff.lines.iter().filter(|it| it.kind == kind).count();
            assert_eq!(file.additions(), count(Added), "{}", diff.file_path);
            assert_eq!(file.deletions(), count(Removed), "{}", diff.file_path);
        }
    }

    fn permission(request_id: &str) -> ThreadCard {
        ThreadCard::Permission(PermissionCard {
            request_id: request_id.to_owned(),
            tool_name: "Bash".to_owned(),
            subject: Some("git status --short".to_owned()),
            suggestions: Arc::from(Vec::new()),
            answered: None,
            failure: None,
            diff: None,
            input_fields: Vec::new(),
            hidden_marked: false,
            subject_in_fields: false,
            sandbox_off: false,
            raw_path: None,
            suggestion_lines: Vec::new(),
        })
    }

    fn question(request_id: &str) -> ThreadCard {
        let option = |label: &str| QuestionOption {
            label: label.to_owned(),
            description: None,
        };
        ThreadCard::Question(QuestionCard {
            request_id: request_id.to_owned(),
            questions: vec![QuestionView {
                text: "Which?".to_owned(),
                header: None,
                multi_select: false,
                options: vec![option("A"), option("B")],
            }],
            answered: None,
            failure: None,
        })
    }

    /// A window with the conversation's focus around the cards, an input box when asked for,
    /// a focusable part before and after the conversation, and the window's gate.
    struct Host {
        focus: FocusMap,
        cache: CardCache,
        cards: Vec<(ThreadCard, CardState)>,
        composer: Option<Entity<TextareaState>>,
        /// The needs-you list's rows, drawn over the conversation.
        list: Vec<NeedsYouRow>,
        scroll: ScrollHandle,
        before: FocusHandle,
        after: FocusHandle,
        dispatch: Dispatch,
        clock: WallClock,
        _keys: Subscription,
    }

    impl Render for Host {
        fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
            let mut thread = gpui_kit::base::v_flex()
                .id("thread")
                .track_focus(&self.focus.thread)
                .w_full()
                .gap_2()
                .p_2();
            for (card, state) in &self.cards {
                let parts = prepare(
                    &mut self.focus,
                    &mut self.cache,
                    slot(),
                    card,
                    state,
                    &self.dispatch,
                    self.clock,
                    window,
                    cx,
                );
                thread = thread.child(waiting_card(
                    slot(),
                    card,
                    state,
                    &parts,
                    &self.dispatch,
                    window,
                    cx,
                ));
            }
            let stop = |name: &'static str, handle: &FocusHandle| {
                div().id(name).track_focus(handle).h(px(20.)).w_full()
            };
            let list = needs_you_list(
                &self.list,
                &self.focus.list,
                &self.scroll,
                self.dispatch.clone(),
                self.clock,
                cx,
            );
            gpui_kit::base::v_flex()
                .size_full()
                .child(list)
                .child(stop("before", &self.before))
                .child(thread)
                .children(self.composer.as_ref().map(Textarea::new))
                .child(stop("after", &self.after))
        }
    }

    /// Opens the host with `cards`, an input box when `composer`, and draws it once.
    fn open(
        cx: &mut TestAppContext,
        cards: Vec<(ThreadCard, CardState)>,
        composer: bool,
    ) -> (AnyWindowHandle, Entity<Host>, Acted) {
        cx.update(gpui_kit::init);
        let acted = Acted::default();
        let kept = Rc::clone(&acted);
        let dispatch: Dispatch = Rc::new(move |action, _, _| kept.borrow_mut().push(action));
        let (handle, host) = cx
            .update(|cx| {
                let bounds = Bounds {
                    origin: Point::default(),
                    size: size(px(800.), px(600.)),
                };
                let options = WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(bounds)),
                    ..Default::default()
                };
                open_window(options, cx, move |window, cx| {
                    let composer = composer.then(|| cx.new(|cx| TextareaState::new(window, cx)));
                    cx.new(|cx: &mut Context<Host>| {
                        let this = cx.weak_entity();
                        let keys = focus::hold_keys(
                            move |keystroke, window, cx| {
                                let host = this.upgrade()?;
                                let host = host.read(cx);
                                Some(host.focus.gate(keystroke, host.clock.now_ms(), window, cx))
                            },
                            Rc::clone(&dispatch),
                            Rc::new(|_, _, _| {}),
                            cx,
                        );
                        let mut focus = FocusMap::new(cx);
                        focus.selected = Some(slot());
                        if let Some(input) = &composer {
                            focus
                                .composers
                                .insert(slot(), input.read(cx).focus_handle(cx));
                        }
                        Host {
                            focus,
                            cache: CardCache::default(),
                            cards,
                            composer,
                            list: vec![listed()],
                            scroll: ScrollHandle::new(),
                            before: cx.focus_handle().tab_stop(true),
                            after: cx.focus_handle().tab_stop(true),
                            dispatch,
                            clock: WallClock::start(),
                            _keys: keys,
                        }
                    })
                })
            })
            .expect("open test window");
        draw(cx, handle);
        (handle, host, acted)
    }

    fn draw(cx: &mut TestAppContext, handle: AnyWindowHandle) {
        cx.update_window(handle, |_, window, cx| window.render_frame(cx))
            .expect("draw");
        cx.run_until_parked();
    }

    fn press(cx: &mut TestAppContext, handle: AnyWindowHandle, key: &str) {
        cx.update_window(handle, |_, window, cx| window.press(key, cx))
            .expect("press a key");
        cx.run_until_parked();
    }

    fn card_focus(cx: &mut TestAppContext, host: &Entity<Host>, request_id: &str) -> FocusHandle {
        host.read_with(cx, |host, _| {
            host.focus.cards[&(slot(), request_id.to_owned())].0.clone()
        })
    }

    fn focus_on(cx: &mut TestAppContext, handle: AnyWindowHandle, focus: &FocusHandle) {
        cx.update_window(handle, |_, window, cx| {
            window.focus(focus, cx);
            window.render_frame(cx);
        })
        .expect("focus");
        cx.run_until_parked();
    }

    /// A row of the list for another slot that waits on a permission.
    fn listed() -> NeedsYouRow {
        NeedsYouRow {
            slot: SlotId::numbered(2),
            project: None,
            title: "s2".to_owned(),
            item: NeedsYouItem::Permission(PermissionAlert {
                key: "k2".to_owned(),
                request_id: "r2".to_owned(),
                tool_name: "Bash".to_owned(),
                subject: "ls".to_owned(),
                answerable: true,
            }),
            waiting: 1,
            since_ms: 0,
        }
    }

    /// Presses each of `keys` in turn.
    fn press_all(cx: &mut TestAppContext, handle: AnyWindowHandle, keys: &[&str]) {
        for key in keys {
            press(cx, handle, key);
        }
    }

    fn waiting(card: ThreadCard) -> (ThreadCard, CardState) {
        let state = CardState::for_card(&card);
        (card, state)
    }

    #[gpui_kit::test]
    fn one_on_a_focused_permission_card_chooses_allow(cx: &mut TestAppContext) {
        let (handle, host, acted) = open(cx, vec![waiting(permission("r1"))], false);
        let card = card_focus(cx, &host, "r1");
        focus_on(cx, handle, &card);
        let before = host.read_with(cx, |host, _| host.clock.now_ms());
        press(cx, handle, "1");
        let after = host.read_with(cx, |host, _| host.clock.now_ms());
        let acted = acted.borrow();
        let [
            ShellAction::ChooseCard {
                slot: chosen,
                request_id,
                index: 0,
                now_ms,
            },
        ] = acted.as_slice()
        else {
            panic!("one Choose of the first button, got {}", acted.len());
        };
        assert_eq!((*chosen, request_id.as_str()), (slot(), "r1"));
        assert!((before..=after).contains(now_ms), "the time it was pressed");
    }

    #[gpui_kit::test]
    fn a_card_arriving_while_typing_leaves_the_key_in_the_composer(cx: &mut TestAppContext) {
        let (handle, host, acted) = open(cx, vec![waiting(permission("r1"))], true);
        let card = card_focus(cx, &host, "r1");
        let input = host.read_with(cx, |host, _| host.composer.clone().expect("an input"));
        let typing = input.read_with(cx, |input, cx| input.focus_handle(cx));
        focus_on(cx, handle, &typing);
        let took = cx
            .update_window(handle, |_, window, cx| {
                host.update(cx, |host, cx| host.focus.card_arrived(&card, window, cx))
            })
            .expect("a card arrives");
        assert!(!took);
        press(cx, handle, "1");
        assert_eq!(input.read_with(cx, |input, _| input.value()), "1");
        let typing_focused = cx
            .update_window(handle, |_, window, _| typing.is_focused(window))
            .expect("read the focus");
        assert!(typing_focused);
        assert!(
            acted.borrow().is_empty(),
            "{} actions",
            acted.borrow().len()
        );

        let thread = host.read_with(cx, |host, _| host.focus.thread.clone());
        focus_on(cx, handle, &thread);
        let took = cx
            .update_window(handle, |_, window, cx| {
                let took = host.update(cx, |host, cx| host.focus.card_arrived(&card, window, cx));
                (took, card.is_focused(window))
            })
            .expect("a card arrives");
        assert_eq!(took, (true, true));
    }

    #[gpui_kit::test]
    fn escape_in_the_note_returns_to_the_card_and_escape_on_the_card_denies(
        cx: &mut TestAppContext,
    ) {
        let card = permission("r1");
        let state = CardState {
            note_open: true,
            ..CardState::for_card(&card)
        };
        let (handle, host, acted) = open(cx, vec![(card, state)], false);
        let card = card_focus(cx, &host, "r1");
        let note = host.read_with(cx, |host, cx| {
            host.focus.card_inputs[&(slot(), "r1".to_owned(), CardField::Note)]
                .read(cx)
                .focus_handle(cx)
        });
        focus_on(cx, handle, &note);
        press(cx, handle, "escape");
        let on_card = cx
            .update_window(handle, |_, window, _| card.is_focused(window))
            .expect("read the focus");
        assert!(on_card, "the keyboard went back to the card");
        press(cx, handle, "escape");
        let acted = acted.borrow();
        assert_eq!(acted.len(), 2);
        assert_eq!(
            acted[0],
            ShellAction::CloseNote {
                slot: slot(),
                request_id: "r1".to_owned(),
            }
        );
        assert!(
            matches!(&acted[1], ShellAction::DenyCard { slot: at, request_id, now_ms }
                if *at == slot() && request_id == "r1" && *now_ms > 0),
            "{:?}",
            acted[1]
        );
    }

    /// Whether one of the card's buttons, not the card itself, has the keyboard.
    fn on_a_button(cx: &mut TestAppContext, handle: AnyWindowHandle, card: &FocusHandle) -> bool {
        cx.update_window(handle, |_, window, cx| {
            card.contains_focused(window, cx) && !card.is_focused(window)
        })
        .expect("read the focus")
    }

    #[gpui_kit::test]
    fn enter_after_tab_does_nothing_on_a_card(cx: &mut TestAppContext) {
        let (handle, host, acted) = open(cx, vec![waiting(permission("r1"))], false);
        let card = card_focus(cx, &host, "r1");
        focus_on(cx, handle, &card);
        // Two stops around the card and its three buttons: four Tabs would reach a button that
        // took the keyboard.
        for _ in 0..4 {
            press(cx, handle, "tab");
            assert!(!on_a_button(cx, handle, &card), "Tab reached a button");
            press(cx, handle, "enter");
            press(cx, handle, "space");
        }
        assert!(
            acted.borrow().is_empty(),
            "{} actions",
            acted.borrow().len()
        );
    }

    #[gpui_kit::test]
    fn a_focused_card_button_takes_no_enter_space_or_digit(cx: &mut TestAppContext) {
        let (handle, host, acted) = open(cx, vec![waiting(permission("r1"))], false);
        let card = card_focus(cx, &host, "r1");
        let allow = host.read_with(cx, |host, _| {
            host.focus.buttons[&(slot(), "r1".to_owned(), "choice-0".to_owned())].clone()
        });
        focus_on(cx, handle, &allow);
        assert!(on_a_button(cx, handle, &card));
        for key in ["enter", "space", "9", "0"] {
            press(cx, handle, key);
        }
        assert!(
            acted.borrow().is_empty(),
            "{} actions",
            acted.borrow().len()
        );
    }

    #[gpui_kit::test]
    fn alt_shift_w_jumps_once_and_leaves_a_card_for_the_composer(cx: &mut TestAppContext) {
        let (handle, host, acted) = open(cx, vec![waiting(permission("r1"))], true);
        let thread = host.read_with(cx, |host, _| host.focus.thread.clone());
        focus_on(cx, handle, &thread);
        press(cx, handle, "alt-shift-w");
        assert_eq!(*acted.borrow(), [ShellAction::JumpToWaiting]);

        let card = card_focus(cx, &host, "r1");
        let typing = host.read_with(cx, |host, cx| {
            host.composer
                .as_ref()
                .expect("an input")
                .read(cx)
                .focus_handle(cx)
        });
        focus_on(cx, handle, &card);
        press(cx, handle, "alt-shift-w");
        let typing_focused = cx
            .update_window(handle, |_, window, _| typing.is_focused(window))
            .expect("read the focus");
        assert!(typing_focused, "the keyboard went to the input");
        assert_eq!(acted.borrow().len(), 1, "no second jump");
    }

    #[gpui_kit::test]
    fn space_toggles_a_focused_option(cx: &mut TestAppContext) {
        let (handle, host, acted) = open(cx, vec![waiting(question("q1"))], false);
        let option = host.read_with(cx, |host, _| {
            host.focus.options[&(slot(), "q1".to_owned(), 0, 1)].clone()
        });
        focus_on(cx, handle, &option);
        press(cx, handle, "space");
        assert_eq!(
            *acted.borrow(),
            [ShellAction::ToggleOption {
                slot: slot(),
                request_id: "q1".to_owned(),
                question: 0,
                option: 1,
            }]
        );
    }

    #[gpui_kit::test]
    fn keys_reach_no_card_of_a_slot_not_selected(cx: &mut TestAppContext) {
        let (handle, host, acted) = open(cx, vec![waiting(permission("r1"))], false);
        let card = card_focus(cx, &host, "r1");
        focus_on(cx, handle, &card);
        // The card is still drawn and focused, but another slot is the one shown.
        host.update(cx, |host, _| {
            host.focus.selected = Some(SlotId::numbered(2))
        });
        press_all(cx, handle, &["1", "enter", "space", "escape"]);
        assert!(
            acted.borrow().is_empty(),
            "{} actions",
            acted.borrow().len()
        );
    }

    #[gpui_kit::test]
    fn keys_reach_no_card_that_is_not_drawn(cx: &mut TestAppContext) {
        let (handle, host, acted) = open(cx, vec![waiting(permission("r1"))], false);
        let card = card_focus(cx, &host, "r1");
        focus_on(cx, handle, &card);
        // GPUI keeps the focus on a card that is no longer drawn, as when it scrolls out.
        host.update(cx, |host, cx| {
            host.cards.clear();
            cx.notify();
        });
        draw(cx, handle);
        let still = cx
            .update_window(handle, |_, window, _| card.is_focused(window))
            .expect("read the focus");
        assert!(still, "the focus stays on the card no longer drawn");
        press_all(cx, handle, &["1", "enter", "space", "escape"]);
        assert!(
            acted.borrow().is_empty(),
            "{} actions",
            acted.borrow().len()
        );
    }

    #[gpui_kit::test]
    fn showing_another_slot_takes_the_keyboard_off_the_card(cx: &mut TestAppContext) {
        let (handle, host, acted) = open(cx, vec![waiting(permission("r1"))], true);
        let allow = host.read_with(cx, |host, _| {
            host.focus.buttons[&(slot(), "r1".to_owned(), "choice-0".to_owned())].clone()
        });
        focus_on(cx, handle, &allow);
        cx.update_window(handle, |_, window, cx| {
            host.update(cx, |host, cx| {
                host.focus.select(Some(SlotId::numbered(2)), window, cx);
            });
        })
        .expect("show another slot");
        let thread = host.read_with(cx, |host, _| host.focus.thread.clone());
        let (on_allow, on_thread) = cx
            .update_window(handle, |_, window, _| {
                (allow.is_focused(window), thread.is_focused(window))
            })
            .expect("read the focus");
        assert!(!on_allow && on_thread, "the keyboard left the card");
        press_all(cx, handle, &["1", "enter", "space"]);
        assert!(
            acted.borrow().is_empty(),
            "{} actions",
            acted.borrow().len()
        );
    }

    #[gpui_kit::test]
    fn a_card_arriving_while_typing_in_a_card_field_leaves_the_keyboard(cx: &mut TestAppContext) {
        let first = permission("r1");
        let state = CardState {
            note_open: true,
            ..CardState::for_card(&first)
        };
        let cards = vec![(first, state), waiting(permission("r2"))];
        let (handle, host, _) = open(cx, cards, false);
        let note = host.read_with(cx, |host, cx| {
            host.focus.card_inputs[&(slot(), "r1".to_owned(), CardField::Note)]
                .read(cx)
                .focus_handle(cx)
        });
        let second = card_focus(cx, &host, "r2");
        focus_on(cx, handle, &note);
        let (took, on_note) = cx
            .update_window(handle, |_, window, cx| {
                let took = host.update(cx, |host, cx| host.focus.card_arrived(&second, window, cx));
                (took, note.is_focused(window))
            })
            .expect("a card arrives");
        assert_eq!((took, on_note), (false, true));
    }

    #[gpui_kit::test]
    fn keys_behind_an_overlay_reach_no_card(cx: &mut TestAppContext) {
        let (handle, host, acted) = open(cx, vec![waiting(permission("r1"))], false);
        let card = card_focus(cx, &host, "r1");
        focus_on(cx, handle, &card);
        host.update(cx, |host, _| host.focus.overlay = Some(Overlay::NewSession));
        press_all(cx, handle, &["1", "2", "enter", "space"]);
        assert!(
            acted.borrow().is_empty(),
            "{} actions",
            acted.borrow().len()
        );
    }

    #[gpui_kit::test]
    fn alt_shift_w_on_the_list_jumps_once(cx: &mut TestAppContext) {
        let (handle, host, acted) = open(cx, vec![waiting(permission("r1"))], false);
        let list = host.read_with(cx, |host, _| host.focus.list.clone());
        focus_on(cx, handle, &list);
        press(cx, handle, "alt-shift-w");
        assert_eq!(*acted.borrow(), [ShellAction::JumpToWaiting]);
    }

    /// Whether the line over the input names the jump key, with the keyboard where it is now.
    fn hint_shown(cx: &mut TestAppContext, handle: AnyWindowHandle, host: &Entity<Host>) -> bool {
        cx.update_window(handle, |_, window, cx| {
            let scene = host.read(cx).focus.focus_scene(window, cx);
            focus::shows_jump_hint(true, &scene)
        })
        .expect("read the focus")
    }

    #[gpui_kit::test]
    fn the_jump_hint_shows_only_while_the_keyboard_is_out_of_the_card(cx: &mut TestAppContext) {
        let (handle, host, _) = open(cx, vec![waiting(question("q1"))], true);
        let typing = host.read_with(cx, |host, cx| {
            host.composer
                .as_ref()
                .expect("an input")
                .read(cx)
                .focus_handle(cx)
        });
        focus_on(cx, handle, &typing);
        assert!(hint_shown(cx, handle, &host), "typing in the input");
        let thread = host.read_with(cx, |host, _| host.focus.thread.clone());
        focus_on(cx, handle, &thread);
        assert!(hint_shown(cx, handle, &host), "reading the conversation");

        let card = card_focus(cx, &host, "q1");
        focus_on(cx, handle, &card);
        assert!(!hint_shown(cx, handle, &host), "on the card");
        let option = host.read_with(cx, |host, _| {
            host.focus.options[&(slot(), "q1".to_owned(), 0, 0)].clone()
        });
        focus_on(cx, handle, &option);
        assert!(!hint_shown(cx, handle, &host), "on an option");
        let other = host.read_with(cx, |host, cx| {
            host.focus.card_inputs[&(slot(), "q1".to_owned(), CardField::Other(0))]
                .read(cx)
                .focus_handle(cx)
        });
        focus_on(cx, handle, &other);
        assert!(!hint_shown(cx, handle, &host), "in the Other field");
        let shown = cx
            .update_window(handle, |_, window, cx| {
                let scene = host.read(cx).focus.focus_scene(window, cx);
                focus::shows_jump_hint(false, &scene)
            })
            .expect("read the focus");
        assert!(!shown, "no card waits");
    }

    #[gpui_kit::test]
    fn showing_a_slot_behind_an_overlay_leaves_the_keyboard_in_it(cx: &mut TestAppContext) {
        let (handle, host, _) = open(cx, vec![waiting(permission("r1"))], true);
        let held = host.read_with(cx, |host, _| host.before.clone());
        focus_on(cx, handle, &held);
        host.update(cx, |host, _| host.focus.overlay = Some(Overlay::CloseSlot));
        let still = cx
            .update_window(handle, |_, window, cx| {
                host.update(cx, |host, cx| {
                    host.focus.select(Some(SlotId::numbered(2)), window, cx);
                });
                held.is_focused(window)
            })
            .expect("show another slot");
        assert!(still, "the keyboard stayed where the overlay holds it");
        let selected = host.read_with(cx, |host, _| host.focus.selected);
        assert_eq!(selected, Some(SlotId::numbered(2)));
    }
}
