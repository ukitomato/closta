//! A tool the CLI asks to run: what it runs on (or, for an edit, the change), its buttons, where
//! an Always Allow keeps its rule and the Deny… note.

use closta_presenter::cards::decisions::offers_destination;
use closta_presenter::cards::{PermissionCard, SUGGESTION_DESTINATIONS};
use closta_presenter::edit_diff::{DiffKind, EditDiff};
use closta_shell::cards::CardState;
use closta_shell::copy;
use closta_shell::slot::SlotId;
use closta_shell::state::ShellAction;
use gpui_kit::base::{h_flex, v_flex};
use gpui_kit::component::button::ButtonVariants as _;
use gpui_kit::component::diff::{Diff, DiffHunkSeparator, DiffState};
use gpui_kit::component::input::Input;
use gpui_kit::component::{ActiveTheme as _, Selectable as _, Sizable as _};
use gpui_kit::*;

use super::{CardParts, card_button, heading, mono};
use crate::composer::Dispatch;

/// The most rows of a diff the card shows before the diff scrolls.
const DIFF_ROWS: usize = 16;
/// The room the diff's divider takes at the start of its hunk.
const HUNK_DIVIDER: f32 = 4.0;
/// How faint the ground of a changed line is against its color.
const CHANGED_GROUND: f32 = 0.12;

#[allow(clippy::too_many_arguments)]
pub(super) fn body(
    slot: SlotId,
    title: String,
    choices: usize,
    card: &PermissionCard,
    state: &CardState,
    parts: &CardParts,
    dispatch: &Dispatch,
    window: &Window,
    cx: &App,
) -> Vec<AnyElement> {
    let theme = cx.theme();
    let request_id = &card.request_id;
    let mut body = vec![heading(title, &card.tool_name, cx)];
    match &card.diff {
        Some(diff) => body.extend(edit(request_id, diff, parts.diff.as_ref(), window, cx)),
        None => {
            if let Some(subject) = card.subject.as_ref().filter(|_| !card.subject_in_fields) {
                body.push(
                    mono(cx)
                        .w_full()
                        .px_2()
                        .py_1()
                        .rounded(px(4.))
                        .border_1()
                        .border_color(theme.border)
                        .bg(theme.secondary)
                        .child(subject.clone())
                        .into_any_element(),
                );
            }
            for field in &card.input_fields {
                body.push(
                    mono(cx)
                        .child(format!("{}: {}", field.key, field.value))
                        .into_any_element(),
                );
            }
        }
    }
    for line in &card.suggestion_lines {
        body.push(
            div()
                .text_color(theme.muted_foreground)
                .child(copy::suggestion_text(line))
                .into_any_element(),
        );
    }
    if card.hidden_marked {
        body.push(
            div()
                .text_color(theme.warning)
                .child(copy::HIDDEN_MARKED)
                .into_any_element(),
        );
    }
    if card.sandbox_off {
        body.push(
            div()
                .px_2()
                .py_1()
                .rounded(px(4.))
                .bg(theme.danger.opacity(CHANGED_GROUND))
                .text_color(theme.danger)
                .child(copy::SANDBOX_OFF)
                .into_any_element(),
        );
    }

    let offers = offers_destination(&card.suggestions);
    let choose = |index: usize| ShellAction::ChooseCard {
        slot,
        request_id: request_id.clone(),
        index,
    };
    let button = |name: &str, label: SharedString, action: ShellAction| {
        card_button(parts, request_id, name, label, action, dispatch)
    };
    let choice = |index: usize| format!("choice-{index}");
    let mut buttons = vec![
        button(&choice(0), copy::ALLOW.into(), choose(0))
            .primary()
            .into_any_element(),
    ];
    if !card.suggestions.is_empty() {
        let keep = copy::keep_label(offers, state.destination.as_deref());
        buttons.push(
            button(&choice(1), keep.into(), choose(1))
                .outline()
                .into_any_element(),
        );
    }
    let deny = choices - 1;
    buttons.push(
        button(
            &choice(deny),
            copy::deny_button(choices).into(),
            choose(deny),
        )
        .outline()
        .into_any_element(),
    );
    buttons.push(
        button(
            "deny-note",
            copy::DENY_NOTE.into(),
            ShellAction::OpenNote {
                slot,
                request_id: request_id.clone(),
            },
        )
        .ghost()
        .into_any_element(),
    );
    body.push(h_flex().gap_2().children(buttons).into_any_element());

    if offers {
        let places = SUGGESTION_DESTINATIONS.iter().map(|place| {
            button(
                &format!("destination-{place}"),
                copy::destination_name(Some(place)).into(),
                ShellAction::PickDestination {
                    slot,
                    request_id: request_id.clone(),
                    destination: (*place).to_owned(),
                },
            )
            .ghost()
            .xsmall()
            .selected(state.destination.as_deref() == Some(*place))
        });
        body.push(
            h_flex()
                .gap_1()
                .items_center()
                .flex_wrap()
                .child(
                    div()
                        .text_color(theme.muted_foreground)
                        .child(copy::DESTINATION_WORDS),
                )
                .children(places)
                .into_any_element(),
        );
    }

    if let Some(note) = &parts.note {
        let name = format!("card-{request_id}-note");
        body.push(
            h_flex()
                .gap_2()
                .items_center()
                .child(
                    div().flex_1().child(
                        Input::new(note)
                            .accessibility_id(name)
                            .aria_label(copy::DENY_NOTE_PLACEHOLDER),
                    ),
                )
                .child(
                    button(
                        "note-send",
                        copy::DENY_SEND.into(),
                        ShellAction::SendNote {
                            slot,
                            request_id: request_id.clone(),
                        },
                    )
                    .outline(),
                )
                .into_any_element(),
        );
    }
    body
}

/// An edit: its counts, then its lines in the diff view at most [`DIFF_ROWS`] rows high, or in
/// rows of its own when its patch could not be read; "…" after a cut diff.
fn edit(
    request_id: &str,
    diff: &EditDiff,
    view: Option<&Entity<DiffState>>,
    window: &Window,
    cx: &App,
) -> Vec<AnyElement> {
    let theme = cx.theme();
    let mut parts = vec![
        mono(cx)
            .text_color(theme.muted_foreground)
            .child(copy::diff_counts(diff.added, diff.removed))
            .into_any_element(),
    ];
    if !diff.lines.is_empty() {
        let lines = match view {
            Some(view) => {
                let row = window.rem_size() * (f32::from(theme.mono_font_size) / 16.) * 1.6;
                let rows = diff.lines.len().min(DIFF_ROWS) as f32;
                div()
                    .w_full()
                    .h(row * rows + px(HUNK_DIVIDER))
                    .rounded(px(4.))
                    .border_1()
                    .border_color(theme.border)
                    .overflow_hidden()
                    .child(
                        Diff::new(view)
                            .line_number(false)
                            .header_visible(false)
                            .hunk_separator(DiffHunkSeparator::Simple)
                            .size_full(),
                    )
                    .into_any_element()
            }
            None => own_lines(request_id, diff, cx),
        };
        parts.push(lines);
    }
    if diff.cut {
        parts.push(
            mono(cx)
                .text_color(theme.muted_foreground)
                .child(copy::DIFF_MORE)
                .into_any_element(),
        );
    }
    if diff.replace_all {
        parts.push(
            div()
                .text_color(theme.muted_foreground)
                .child(copy::REPLACE_ALL)
                .into_any_element(),
        );
    }
    parts
}

/// The edit's lines drawn one by one: removed red and added green, each with its sign.
fn own_lines(request_id: &str, diff: &EditDiff, cx: &App) -> AnyElement {
    let theme = cx.theme();
    let rows = diff.lines.iter().map(|line| {
        let text = line.text.strip_suffix('\r').unwrap_or(&line.text);
        let (sign, color) = match line.kind {
            DiffKind::Same => (' ', None),
            DiffKind::Added => ('+', Some(theme.success)),
            DiffKind::Removed => ('-', Some(theme.danger)),
        };
        let row = mono(cx)
            .px_2()
            .whitespace_nowrap()
            .child(format!("{sign} {text}"));
        match color {
            Some(color) => row.text_color(color).bg(color.opacity(CHANGED_GROUND)),
            None => row,
        }
    });
    v_flex()
        .id(SharedString::from(format!("card-{request_id}-diff")))
        .w_full()
        .max_h(px(DIFF_ROWS as f32 * 20.))
        .overflow_y_scroll()
        .rounded(px(4.))
        .border_1()
        .border_color(theme.border)
        .children(rows)
        .into_any_element()
}
