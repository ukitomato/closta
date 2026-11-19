//! A plan to approve: its text as Markdown, the three answers and the Keep Planning… note.

use closta_presenter::cards::plan::PlanCard;
use closta_shell::cards::CardState;
use closta_shell::copy;
use closta_shell::slot::SlotId;
use closta_shell::state::ShellAction;
use gpui_kit::base::h_flex;
use gpui_kit::component::ActiveTheme as _;
use gpui_kit::component::button::ButtonVariants as _;
use gpui_kit::component::input::Input;
use gpui_kit::component::text::TextView;
use gpui_kit::*;

use super::{CardParts, card_button, heading};
use crate::composer::Dispatch;

/// The tool a plan card answers.
const PLAN_TOOL: &str = "ExitPlanMode";

pub(super) fn body(
    slot: SlotId,
    card: &PlanCard,
    _state: &CardState,
    parts: &CardParts,
    dispatch: &Dispatch,
    cx: &App,
) -> Vec<AnyElement> {
    let theme = cx.theme();
    let request_id = &card.request_id;
    let text = match &parts.plan {
        Some(plan) => div().w_full().child(TextView::new(plan)).into_any_element(),
        None => div()
            .text_color(theme.muted_foreground)
            .child(copy::PLAN_MISSING)
            .into_any_element(),
    };
    let choose = |index: usize| ShellAction::ChooseCard {
        slot,
        request_id: request_id.clone(),
        index,
    };
    let button = |name: &str, label: &'static str, action: ShellAction| {
        card_button(parts, request_id, name, label, action, dispatch)
    };
    let buttons = h_flex()
        .gap_2()
        .flex_wrap()
        .child(button("choice-0", copy::plan_go(card.go), choose(0)).primary())
        .child(button("choice-1", copy::PLAN_ASK_EDITS, choose(1)).outline())
        .child(button("choice-2", copy::PLAN_KEEP, choose(2)).outline())
        .child(
            button(
                "keep-note",
                copy::PLAN_NOTE,
                ShellAction::OpenNote {
                    slot,
                    request_id: request_id.clone(),
                },
            )
            .ghost(),
        );
    let mut body = vec![
        heading(copy::PLAN_TITLE.to_owned(), PLAN_TOOL, cx),
        text,
        buttons.into_any_element(),
    ];
    if let Some(note) = &parts.note {
        body.push(
            Input::new(note)
                .accessibility_id(format!("card-{request_id}-note"))
                .aria_label(copy::PLAN_NOTE_PLACEHOLDER)
                .into_any_element(),
        );
    }
    body
}
