//! One row of the conversation, by its kind (ThreadViews.kt). A row reads only its own data,
//! whether it is open and its cached text state; a click on a row that opens asks the shell to
//! toggle it. The draw makes a text state that is missing and never sets one's text.

use closta_presenter::rows::{
    AskRow, CardRow, ExploredRow, ThinkingRow, ThreadRow, TodoRow, ToolRow, TurnEndRow,
};
use closta_presenter::tool_line::{ToolDetail, ToolLine, ToolLineState};
use closta_shell::copy;
use closta_shell::slot::SlotId;
use closta_shell::state::ShellAction;
use gpui_kit::base::{h_flex, v_flex};
use gpui_kit::component::button::Button;
use gpui_kit::component::menu::{ContextMenuExt as _, PopupMenuItem};
use gpui_kit::component::text::{TextView, TextViewState};
use gpui_kit::component::{ActiveTheme as _, Disableable as _, Icon, IconName};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

use crate::model::ShellModel;

/// The room above a row that opens a message, and above any other.
const OPENS_GAP: f32 = 12.0;
const ROW_GAP: f32 = 4.0;
/// How far a sub-agent's own call stands in, a step of depth, and how far an opened row's
/// body stands in.
const INDENT: f32 = 16.0;
/// The tool lines and the code under them.
const MONO_SIZE: f32 = 12.5;
const ICON_SIZE: f32 = 14.0;

/// Where a row's toggle goes: the window's shell, for the row's slot.
pub(super) struct Toggle {
    model: Entity<ShellModel>,
    slot: SlotId,
}

impl Toggle {
    fn on_click(&self, key: &str) -> impl Fn(&ClickEvent, &mut Window, &mut App) + 'static {
        let (model, slot, key) = (self.model.clone(), self.slot, key.to_owned());
        move |_, window, cx| {
            let key = key.clone();
            model.update(cx, |model, cx| {
                model.act(ShellAction::ToggleRow { slot, key }, window, cx);
            });
        }
    }
}

pub(super) fn row(model: &Entity<ShellModel>, slot: SlotId, at: usize, cx: &mut App) -> AnyElement {
    let shell = &model.read(cx).shell;
    let Some(row) = shell.rows(slot).get(at).cloned() else {
        return div().into_any_element();
    };
    let is_open = shell.is_open(slot, &row);
    let toggle = Toggle {
        model: model.clone(),
        slot,
    };
    let gap = if row.opens() { OPENS_GAP } else { ROW_GAP };
    let (content, label) = match &row {
        ThreadRow::Ask(ask) => (ask_row(ask, cx), ask.text.clone()),
        ThreadRow::Text(text) => {
            let state = text_state(model, slot, &text.key, &text.markdown, cx);
            (
                text_row(&text.key, &state, &text.markdown),
                text.markdown.clone(),
            )
        }
        ThreadRow::Thinking(thinking) => (
            thinking_row(thinking, is_open, &toggle, cx),
            thinking_word(thinking).to_owned(),
        ),
        ThreadRow::Tool(tool) => (tool_row(tool, is_open, &toggle, cx), tool_name(tool)),
        ThreadRow::Explored(explored) => (
            explored_row(explored, is_open, &toggle, cx),
            format!("{} {}", copy::EXPLORED, copy::explored_files(explored)),
        ),
        ThreadRow::Todo(todo) => (todo_row(todo, is_open, &toggle, cx), todo_title(todo)),
        ThreadRow::Card(card) => (card_row(card, cx), copy::card_line(card)),
        ThreadRow::TurnEnd(end) => (turn_end_row(end, cx), copy::turn_end(end, false)),
        ThreadRow::SignIn(_) => (sign_in_row(cx), copy::SIGN_IN_TEXT.to_owned()),
    };
    let id = SharedString::from(format!("row-{}", row.key()));
    div()
        .id(id.clone())
        .accessibility_id(id)
        .aria_label(label)
        .pt(px(gap))
        .child(content)
        .into_any_element()
}

/// A right-click menu that copies the whole message: a selection is lost once its first row
/// scrolls out of the list, so this is how a long message is copied.
fn with_copy_menu(key: &str, element: Div, item: &'static str, text: &str) -> AnyElement {
    let text = text.to_owned();
    element
        .id(SharedString::from(format!("message-{key}")))
        .context_menu(move |menu, _, _| {
            let text = text.clone();
            menu.item(PopupMenuItem::new(item).on_click(move |_, _, cx| {
                cx.write_to_clipboard(ClipboardItem::new_string(text.clone()));
            }))
        })
        .into_any_element()
}

/// The user's prompt, in a bordered bubble.
pub(super) fn ask_row(ask: &AskRow, cx: &App) -> AnyElement {
    let theme = cx.theme();
    let bubble = div()
        .w_full()
        .px_3()
        .py_2()
        .rounded(px(8.))
        .border_1()
        .border_color(theme.border)
        .bg(theme.secondary)
        .child(ask.text.clone());
    with_copy_menu(&ask.key, bubble, copy::COPY_ASK, &ask.text)
}

/// A text block of a reply, as Markdown that can be selected across the rows in view.
pub(super) fn text_row(key: &str, state: &Entity<TextViewState>, markdown: &str) -> AnyElement {
    with_copy_menu(
        key,
        div().w_full().child(TextView::new(state)),
        copy::COPY_REPLY,
        markdown,
    )
}

fn thinking_word(row: &ThinkingRow) -> &'static str {
    if row.streaming {
        copy::THINKING
    } else {
        copy::THOUGHT
    }
}

/// "Thought", faint; opened, what was thought.
pub(super) fn thinking_row(
    row: &ThinkingRow,
    is_open: bool,
    toggle: &Toggle,
    cx: &App,
) -> AnyElement {
    let muted = cx.theme().muted_foreground;
    let header = header(
        &row.key,
        is_open,
        toggle,
        cx,
        div().text_color(muted).child(thinking_word(row)),
    );
    v_flex()
        .child(header)
        .when(is_open, |it| {
            it.child(
                div()
                    .pl(px(INDENT))
                    .text_color(muted)
                    .child(row.text.clone()),
            )
        })
        .into_any_element()
}

fn tool_name(row: &ToolRow) -> String {
    match &row.agent {
        Some(summary) => copy::agent_line(summary, &row.line.label),
        None => format!("{} — {}", row.line.label, copy::tool_state(row.line.state)),
    }
}

/// A tool call as its line: the state's mark, the call and its counts. Opened, its input and
/// result in boxes of code. A sub-agent's call is a framed line of its own instead.
pub(super) fn tool_row(row: &ToolRow, is_open: bool, toggle: &Toggle, cx: &App) -> AnyElement {
    let content = match &row.agent {
        Some(summary) => {
            let muted = cx.theme().muted_foreground;
            let line = copy::agent_line(summary, &row.line.label);
            let what = summary.description.as_deref().unwrap_or(&row.line.label);
            let rest = line.strip_prefix(what).unwrap_or_default().to_owned();
            framed(cx)
                .child(
                    h_flex()
                        .gap_1p5()
                        .items_center()
                        .child(icon(IconName::Bot, muted))
                        .child(state_mark(row.line.state, cx))
                        .child(what.to_owned())
                        .child(div().text_color(muted).child(rest)),
                )
                .into_any_element()
        }
        None => {
            let header = header(&row.key, is_open, toggle, cx, tool_line(&row.line, cx));
            let body = is_open
                .then(|| row.detail.as_ref().and_then(|detail| tool_body(detail, cx)))
                .flatten();
            v_flex().child(header).children(body).into_any_element()
        }
    };
    indented(content, row.depth)
}

/// A tool's line: its mark, its call in the code font (red when it failed), and the lines it
/// added and removed.
fn tool_line(line: &ToolLine, cx: &App) -> Div {
    let theme = cx.theme();
    let color = match line.state {
        ToolLineState::Error => theme.danger,
        _ => theme.foreground,
    };
    h_flex()
        .gap_1p5()
        .items_center()
        .child(state_mark(line.state, cx))
        .child(mono(cx).text_color(color).child(line.label.clone()))
        .children(line.added.map(|added| {
            mono(cx)
                .text_color(theme.success)
                .child(format!("+{added}"))
        }))
        .children(line.removed.map(|removed| {
            mono(cx)
                .text_color(theme.danger)
                .child(format!("−{removed}"))
        }))
}

/// What an opened tool line shows: the input, then the output (why it failed, when it failed),
/// each in a box of code.
fn tool_body(detail: &ToolDetail, cx: &App) -> Option<AnyElement> {
    let mut boxes = Vec::new();
    if !detail.input.trim().is_empty() {
        boxes.push(code_box(detail.input.clone(), cx));
    }
    if let Some(output) = detail.output.as_deref().filter(|it| !it.trim().is_empty()) {
        let shown = if detail.output_cut {
            format!("…\n{output}")
        } else {
            output.to_owned()
        };
        boxes.push(code_box(shown, cx));
    }
    (!boxes.is_empty()).then(|| {
        v_flex()
            .pl(px(INDENT))
            .pt_1()
            .gap_1()
            .children(boxes)
            .into_any_element()
    })
}

/// Read-only calls folded into one line: "Explored", then the files and tools, faint. Opened,
/// each call's line.
pub(super) fn explored_row(
    row: &ExploredRow,
    is_open: bool,
    toggle: &Toggle,
    cx: &App,
) -> AnyElement {
    let lines = row.lines();
    let state = if lines.iter().any(|it| it.state == ToolLineState::Error) {
        ToolLineState::Error
    } else if lines.iter().any(|it| it.state == ToolLineState::Running) {
        ToolLineState::Running
    } else {
        ToolLineState::Ok
    };
    let line = h_flex()
        .gap_1p5()
        .items_center()
        .child(state_mark(state, cx))
        .child(mono(cx).child(copy::EXPLORED))
        .child(
            mono(cx)
                .text_color(cx.theme().muted_foreground)
                .child(copy::explored_files(row)),
        );
    let header = header(&row.key, is_open, toggle, cx, line);
    let body = is_open.then(|| {
        v_flex()
            .pl(px(INDENT))
            .children(lines.into_iter().map(|line| tool_line(line, cx)))
    });
    indented(
        v_flex().child(header).children(body).into_any_element(),
        row.depth,
    )
}

fn todo_title(row: &TodoRow) -> String {
    let done = row
        .items
        .iter()
        .filter(|item| item.status == "completed")
        .count();
    copy::todo_title(done, row.items.len())
}

/// The to-do list in a frame: its title, and when open each to-do with its mark (done struck
/// through, the one in progress bold).
pub(super) fn todo_row(row: &TodoRow, is_open: bool, toggle: &Toggle, cx: &App) -> AnyElement {
    let theme = cx.theme();
    let title = div()
        .id(SharedString::from(format!("toggle-{}", row.key)))
        .cursor_pointer()
        .font_weight(FontWeight::BOLD)
        .child(todo_title(row))
        .on_click(toggle.on_click(&row.key));
    let items = is_open.then(|| {
        v_flex().children(row.items.iter().map(|item| {
            let line = h_flex().gap_1p5().items_center();
            match item.status.as_str() {
                "completed" => line
                    .child(icon(IconName::Check, theme.muted_foreground))
                    .child(
                        div()
                            .text_color(theme.muted_foreground)
                            .line_through()
                            .child(item.content.clone()),
                    ),
                "in_progress" => line.child(div().text_color(theme.info).child("●")).child(
                    div()
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(item.content.clone()),
                ),
                _ => line
                    .child(div().text_color(theme.muted_foreground).child("○"))
                    .child(item.content.clone()),
            }
        }))
    });
    framed(cx)
        .gap_1()
        .child(title)
        .children(items)
        .into_any_element()
}

/// A card as one framed line in 6a: its title and how it was answered, or that it waits.
pub(super) fn card_row(row: &CardRow, cx: &App) -> AnyElement {
    let theme = cx.theme();
    let waiting = row.card.answered().is_none();
    framed(cx)
        .when(waiting, |it| it.border_color(theme.primary))
        .when(!waiting, |it| it.text_color(theme.muted_foreground))
        .child(copy::card_line(row))
        .into_any_element()
}

/// The end of a turn, faint: its time. 6a does not check the files a turn changed.
pub(super) fn turn_end_row(row: &TurnEndRow, cx: &App) -> AnyElement {
    div()
        .text_color(cx.theme().muted_foreground)
        .child(copy::turn_end(row, false))
        .into_any_element()
}

/// The banner after a reply that said the CLI is not signed in. Its button signs in from a
/// terminal, which 6a does not have yet.
pub(super) fn sign_in_row(cx: &App) -> AnyElement {
    let warning = cx.theme().warning;
    h_flex()
        .w_full()
        .px_3()
        .py_2()
        .gap_2()
        .items_center()
        .rounded(px(6.))
        .border_1()
        .border_color(warning)
        .child(icon(IconName::TriangleAlert, warning))
        .child(div().flex_1().child(copy::SIGN_IN_TEXT))
        .child(
            Button::new("sign-in")
                .outline()
                .label(copy::SIGN_IN_ACTION)
                .disabled(true),
        )
        .into_any_element()
}

/// The line that opens and closes row `key`: the arrow, then `line`.
fn header(
    key: &str,
    is_open: bool,
    toggle: &Toggle,
    cx: &App,
    line: impl IntoElement,
) -> AnyElement {
    let arrow = if is_open {
        IconName::ChevronDown
    } else {
        IconName::ChevronRight
    };
    h_flex()
        .id(SharedString::from(format!("toggle-{key}")))
        .gap_1()
        .items_center()
        .cursor_pointer()
        .child(icon(arrow, cx.theme().muted_foreground))
        .child(line)
        .on_click(toggle.on_click(key))
        .into_any_element()
}

/// A tool's state as a mark: done green, failed red, running faint.
fn state_mark(state: ToolLineState, cx: &App) -> Icon {
    let theme = cx.theme();
    match state {
        ToolLineState::Running => icon(IconName::LoaderCircle, theme.muted_foreground),
        ToolLineState::Ok => icon(IconName::CircleCheck, theme.success),
        ToolLineState::Error => icon(IconName::CircleX, theme.danger),
    }
}

fn icon(name: IconName, color: Hsla) -> Icon {
    Icon::new(name).size(px(ICON_SIZE)).text_color(color)
}

fn mono(cx: &App) -> Div {
    div()
        .font_family(cx.theme().mono_font_family.clone())
        .text_size(px(MONO_SIZE))
}

fn code_box(text: String, cx: &App) -> AnyElement {
    let theme = cx.theme();
    mono(cx)
        .w_full()
        .px_2()
        .py_1()
        .rounded(px(4.))
        .border_1()
        .border_color(theme.border)
        .bg(theme.secondary)
        .child(text)
        .into_any_element()
}

/// A frame for a card, a to-do list or a sub-agent.
fn framed(cx: &App) -> Div {
    v_flex()
        .w_full()
        .px_3()
        .py_2()
        .rounded(px(6.))
        .border_1()
        .border_color(cx.theme().border)
}

fn indented(content: AnyElement, depth: i32) -> AnyElement {
    if depth <= 0 {
        return content;
    }
    div()
        .pl(px(INDENT * depth as f32))
        .child(content)
        .into_any_element()
}

/// The row's cached text state, made from its Markdown when it is not cached yet.
fn text_state(
    model: &Entity<ShellModel>,
    slot: SlotId,
    key: &str,
    markdown: &str,
    cx: &mut App,
) -> Entity<TextViewState> {
    let cached = model
        .read(cx)
        .texts
        .get(&slot)
        .and_then(|texts| texts.get(key))
        .cloned();
    cached.unwrap_or_else(|| {
        let state = cx.new(|cx| TextViewState::markdown(markdown, cx));
        model.update(cx, |model, _| {
            model
                .texts
                .entry(slot)
                .or_default()
                .insert(key.to_owned(), state.clone());
        });
        state
    })
}
