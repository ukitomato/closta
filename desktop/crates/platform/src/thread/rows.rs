//! One row of the conversation, by its kind. A row reads only its own data and its cached text
//! state; the draw makes a text state that is missing and never sets one's text.

use closta_presenter::rows::{AskRow, TextRow, ThreadRow};
use closta_shell::slot::SlotId;
use gpui_kit::component::ActiveTheme as _;
use gpui_kit::component::text::{TextView, TextViewState};
use gpui_kit::*;

use crate::model::ShellModel;

/// The room above a row that opens a message, and above any other.
const OPENS_GAP: f32 = 12.0;
const ROW_GAP: f32 = 4.0;

pub(super) fn row(model: &Entity<ShellModel>, slot: SlotId, at: usize, cx: &mut App) -> AnyElement {
    let Some(row) = model.read(cx).shell.rows(slot).get(at).cloned() else {
        return div().into_any_element();
    };
    let gap = if row.opens() { OPENS_GAP } else { ROW_GAP };
    let content = match &row {
        ThreadRow::Ask(ask) => ask_row(ask, cx),
        ThreadRow::Text(text) => {
            TextView::new(&text_state(model, slot, text, cx)).into_any_element()
        }
        // Drawn as their kind in the next step; until then their key, faint.
        other => div()
            .text_color(cx.theme().muted_foreground)
            .child(other.key().to_owned())
            .into_any_element(),
    };
    div().pt(px(gap)).child(content).into_any_element()
}

/// The user's prompt, in a bordered bubble.
fn ask_row(ask: &AskRow, cx: &App) -> AnyElement {
    let theme = cx.theme();
    div()
        .w_full()
        .px_3()
        .py_2()
        .rounded(px(8.))
        .border_1()
        .border_color(theme.border)
        .bg(theme.secondary)
        .child(ask.text.clone())
        .into_any_element()
}

/// The row's cached text state, made from its Markdown when it is not cached yet.
fn text_state(
    model: &Entity<ShellModel>,
    slot: SlotId,
    text: &TextRow,
    cx: &mut App,
) -> Entity<TextViewState> {
    let cached = model
        .read(cx)
        .texts
        .get(&slot)
        .and_then(|texts| texts.get(&text.key))
        .cloned();
    cached.unwrap_or_else(|| {
        let state = cx.new(|cx| TextViewState::markdown(&text.markdown, cx));
        model.update(cx, |model, _| {
            model
                .texts
                .entry(slot)
                .or_default()
                .insert(text.key.clone(), state.clone());
        });
        state
    })
}
