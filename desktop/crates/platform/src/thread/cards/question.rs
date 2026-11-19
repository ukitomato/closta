//! Questions from Claude: each its header, its text and its options (one or several), the
//! Other line, then Answer, which waits until every question is answered, and Skip.

use closta_presenter::cards::QuestionCard;
use closta_presenter::cards::decisions::questions_complete;
use closta_shell::cards::CardState;
use closta_shell::copy;
use closta_shell::slot::SlotId;
use closta_shell::state::ShellAction;
use gpui_kit::base::{h_flex, v_flex};
use gpui_kit::component::button::ButtonVariants as _;
use gpui_kit::component::input::Input;
use gpui_kit::component::{ActiveTheme as _, Disableable as _};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::*;

use super::{CardParts, card_button, heading};
use crate::composer::Dispatch;

/// The tool a question card answers.
const QUESTION_TOOL: &str = "AskUserQuestion";

#[allow(clippy::too_many_arguments)]
pub(super) fn body(
    slot: SlotId,
    card: &QuestionCard,
    state: &CardState,
    parts: &CardParts,
    dispatch: &Dispatch,
    window: &Window,
    cx: &App,
) -> Vec<AnyElement> {
    let theme = cx.theme();
    let request_id = &card.request_id;
    let mut body = vec![heading(
        copy::question_title(card.questions.len()),
        QUESTION_TOOL,
        cx,
    )];
    for (at, asked) in card.questions.iter().enumerate() {
        let pick = state.picks.get(at);
        let chosen = |option: usize| pick.is_some_and(|it| it.chosen.contains(&option));
        let mark = |on: bool| match (asked.multi_select, on) {
            (false, false) => "○",
            (false, true) => "●",
            (true, false) => "☐",
            (true, true) => "☑",
        };
        let mut block = v_flex().gap_1();
        if let Some(header) = &asked.header {
            block = block.child(
                div()
                    .text_xs()
                    .text_color(theme.muted_foreground)
                    .child(header.clone()),
            );
        }
        block = block.child(div().child(asked.text.clone()));
        for (option, offered) in asked.options.iter().enumerate() {
            let Some(handle) = parts.options.get(at).and_then(|it| it.get(option)) else {
                continue;
            };
            let id = SharedString::from(format!("card-{request_id}-option-{at}-{option}"));
            let toggle = {
                let dispatch = dispatch.clone();
                let action = ShellAction::ToggleOption {
                    slot,
                    request_id: request_id.clone(),
                    question: at,
                    option,
                };
                move |_: &ClickEvent, window: &mut Window, cx: &mut App| {
                    dispatch(action.clone(), window, cx);
                }
            };
            let description = offered.description.as_ref().map(|it| {
                div()
                    .pl_5()
                    .text_xs()
                    .text_color(theme.muted_foreground)
                    .child(it.clone())
            });
            block = block.child(
                v_flex()
                    .id(id.clone())
                    .accessibility_id(id)
                    .aria_label(offered.label.clone())
                    .track_focus(handle)
                    .px_1()
                    .rounded(px(4.))
                    .cursor_pointer()
                    .when(handle.is_focused(window), |it| it.bg(theme.list_active))
                    .on_click(toggle)
                    .child(
                        h_flex()
                            .gap_2()
                            .child(div().w_4().child(mark(chosen(option))))
                            .child(offered.label.clone()),
                    )
                    .children(description),
            );
        }
        let other_on = pick.is_some_and(|it| it.other);
        let other_id = SharedString::from(format!("card-{request_id}-other-{at}"));
        let toggle_other = {
            let dispatch = dispatch.clone();
            let action = ShellAction::ToggleOther {
                slot,
                request_id: request_id.clone(),
                question: at,
            };
            move |_: &ClickEvent, window: &mut Window, cx: &mut App| {
                dispatch(action.clone(), window, cx);
            }
        };
        let mut other = h_flex().gap_2().items_center().px_1().child(
            h_flex()
                .id(other_id.clone())
                .accessibility_id(other_id)
                .aria_label(copy::QUESTION_OTHER)
                .gap_2()
                .cursor_pointer()
                .on_click(toggle_other)
                .child(div().w_4().child(mark(other_on)))
                .child(copy::QUESTION_OTHER),
        );
        if let Some(line) = parts.others.get(at) {
            other = other.child(
                div().flex_1().child(
                    Input::new(line)
                        .accessibility_id(format!("card-{request_id}-other-{at}-line"))
                        .aria_label(copy::OTHER_PLACEHOLDER),
                ),
            );
        }
        body.push(block.child(other).into_any_element());
    }
    let complete = questions_complete(&state.question_picks(card));
    body.push(
        h_flex()
            .gap_2()
            .justify_end()
            .child(
                card_button(
                    parts,
                    request_id,
                    "answer",
                    copy::QUESTION_ANSWER,
                    ShellAction::AnswerQuestion {
                        slot,
                        request_id: request_id.clone(),
                    },
                    dispatch,
                )
                .primary()
                .disabled(!complete),
            )
            .child(
                card_button(
                    parts,
                    request_id,
                    "skip",
                    copy::QUESTION_SKIP,
                    ShellAction::DenyCard {
                        slot,
                        request_id: request_id.clone(),
                    },
                    dispatch,
                )
                .outline(),
            )
            .into_any_element(),
    );
    body
}
