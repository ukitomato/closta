#![allow(clippy::expect_used, clippy::unwrap_used)]
//! Answering permission and edit cards from the shell: the lines the CLI receives are those the
//! encoder makes from what the presenter decides, over captures 36 and 17.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::time::Duration;

use closta_presenter::cards::decisions::kept_suggestions;
use closta_presenter::cards::plan::{PlanAnswer, PlanChoice, PlanGo, plan_answer};
use closta_presenter::cards::{ThreadCard, allow_payload, answer_payload, card_of, passed_on};
use closta_presenter::rows::ThreadRow;
use closta_presenter::transcript::ApprovalRecord;
use closta_providers::claude::fake::replay::ReplayControl;
use closta_providers::claude::protocol::encode;
use closta_session::runtime::SessionRuntime;
use closta_session::status::SessionStatus;
use closta_shell::cards::CardState;
use closta_shell::copy::ANSWER_FAILED;
use closta_shell::rows::RowChange;
use closta_shell::slot::SlotId;
use closta_shell::state::{Acted, FocusTarget, ShellAction, ShellState};
use smol::Timer;
use support::{drive, emit_capture, running, until, waiting_slot, waits_on};

const SANDBOX: &str = "36-sandbox-unavailable.ndjson";
const SANDBOX_ASK: usize = 31;
const SANDBOX_REQUEST: &str = "b4635f8c-7b16-4eac-9934-9ca6b3b1373f";
const PLAN: &str = "29-exit-plan-mode.ndjson";
const PLAN_ASK: usize = 153;
const PLAN_REQUEST: &str = "161f1f49-f46c-419f-b243-329e43da91d4";
const QUESTION: &str = "18-ask-multi-question.ndjson";
const QUESTION_ASK: usize = 46;
const QUESTION_REQUEST: &str = "11d35842-e704-44da-9c36-710ff840b727";
const QUESTION_ONE: &str = "AとBどちらがいいですか？";
const QUESTION_TWO: &str = "XとYどちらにしますか？";
const EDIT: &str = "17-edit-approval.ndjson";
const EDIT_ASK: usize = 64;
const EDIT_REQUEST: &str = "710f9184-6cc9-490c-aff2-9f11516f7a23";

fn answers(control: &ReplayControl) -> Vec<String> {
    control
        .stdin_lines()
        .into_iter()
        .filter(|line| line.contains("\"control_response\""))
        .collect()
}

/// The answers once the first has been written, and a moment after, so a second would show.
async fn written(control: &ReplayControl) -> Vec<String> {
    until(|| !answers(control).is_empty()).await;
    quiet().await;
    answers(control)
}

/// Long enough for a write that was asked for to have been made.
async fn quiet() {
    Timer::after(Duration::from_millis(150)).await;
}

fn approval(runtime: &SessionRuntime, id: &str) -> ApprovalRecord {
    (**runtime.view().transcript.approvals.get(id).unwrap()).clone()
}

fn choose(shell: &mut ShellState, slot: SlotId, id: &str, index: usize) {
    shell.act(ShellAction::ChooseCard {
        slot,
        request_id: id.to_owned(),
        index,
    });
}

fn allow_line(id: &str, a: &ApprovalRecord, permissions: Option<&str>) -> String {
    encode::allow(id, &allow_payload(a), permissions).unwrap()
}

#[test]
fn allow_writes_the_allow_the_presenter_makes() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, runtime) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        let a = approval(&runtime, SANDBOX_REQUEST);
        choose(&mut shell, slot, SANDBOX_REQUEST, 0);
        assert_eq!(
            written(&control).await,
            vec![allow_line(SANDBOX_REQUEST, &a, None)]
        );
    });
}

#[test]
fn always_allow_keeps_the_rules_where_the_card_says() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, runtime) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        let a = approval(&runtime, SANDBOX_REQUEST);
        choose(&mut shell, slot, SANDBOX_REQUEST, 1);
        let kept = passed_on(&a, &kept_suggestions(&a.suggestions, Some("localSettings")))
            .updated_permissions;
        assert!(kept.is_some());
        assert_eq!(
            written(&control).await,
            vec![allow_line(SANDBOX_REQUEST, &a, kept.as_deref())]
        );
    });
}

#[test]
fn always_allow_moves_only_the_rules_to_the_chosen_place() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, runtime) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        let a = approval(&runtime, SANDBOX_REQUEST);
        shell.act(ShellAction::PickDestination {
            slot,
            request_id: SANDBOX_REQUEST.to_owned(),
            destination: "userSettings".to_owned(),
        });
        choose(&mut shell, slot, SANDBOX_REQUEST, 1);
        let kept = passed_on(&a, &kept_suggestions(&a.suggestions, Some("userSettings")))
            .updated_permissions
            .unwrap();
        assert!(kept.contains("\"destination\":\"userSettings\""));
        assert!(kept.contains("addDirectories"));
        assert_eq!(kept.matches("\"destination\":\"session\"").count(), 2);
        assert_eq!(
            written(&control).await,
            vec![allow_line(SANDBOX_REQUEST, &a, Some(&kept))]
        );
    });
}

#[test]
fn deny_without_a_note_lets_the_encoder_say_why() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        choose(&mut shell, slot, SANDBOX_REQUEST, 2);
        assert_eq!(
            written(&control).await,
            vec![encode::deny(SANDBOX_REQUEST, "")]
        );
    });
}

#[test]
fn deny_with_a_note_sends_it_trimmed() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        let id = SANDBOX_REQUEST.to_owned();
        shell.act(ShellAction::OpenNote {
            slot,
            request_id: id.clone(),
        });
        shell.act(ShellAction::EditNote {
            slot,
            request_id: id.clone(),
            text: "  not now \n".to_owned(),
        });
        shell.act(ShellAction::SendNote {
            slot,
            request_id: id,
        });
        assert_eq!(
            written(&control).await,
            vec![encode::deny(SANDBOX_REQUEST, "not now")]
        );
    });
}

#[test]
fn a_choice_past_the_last_button_is_ignored() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        choose(&mut shell, slot, SANDBOX_REQUEST, 3);
        quiet().await;
        assert!(answers(&control).is_empty());
    });
}

#[test]
fn the_note_and_the_place_outlive_a_refresh_and_another_selection() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, _control, _) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        let (other, _, _) = waiting_slot(&mut shell, &harness, EDIT, EDIT_ASK, 1000).await;
        let id = SANDBOX_REQUEST.to_owned();
        shell.act(ShellAction::EditNote {
            slot,
            request_id: id.clone(),
            text: "later".to_owned(),
        });
        shell.act(ShellAction::PickDestination {
            slot,
            request_id: id.clone(),
            destination: "projectSettings".to_owned(),
        });
        let before = shell.card_state(slot, &id).cloned().unwrap();
        shell.act(ShellAction::Select(other));
        let generation = shell.watch(slot).unwrap().generation();
        shell.refresh(slot, generation, 5000).unwrap();
        shell.act(ShellAction::Select(slot));
        assert_eq!(shell.card_state(slot, &id), Some(&before));
        assert_eq!(before.note, "later");
        assert_eq!(before.destination.as_deref(), Some("projectSettings"));
    });
}

#[test]
fn a_card_starts_with_the_place_it_offers_first() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, _control, _) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        shell.act(ShellAction::CardShown {
            slot,
            request_id: SANDBOX_REQUEST.to_owned(),
            now_ms: 1500,
        });
        shell.act(ShellAction::CardShown {
            slot,
            request_id: SANDBOX_REQUEST.to_owned(),
            now_ms: 9000,
        });
        let card = shell.card_state(slot, SANDBOX_REQUEST).unwrap();
        assert_eq!(card.destination.as_deref(), Some("localSettings"));
        assert_eq!(card.shown_ms, Some(1500));
        assert!(shell.shown(slot, SANDBOX_REQUEST));
        assert!(!shell.list_shown(slot, SANDBOX_REQUEST));
        assert!(shell.card_state(slot, "no-such-request").is_none());
    });
}

#[test]
fn an_edit_allows_with_its_input() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, runtime) =
            waiting_slot(&mut shell, &harness, EDIT, EDIT_ASK, 1000).await;
        let a = approval(&runtime, EDIT_REQUEST);
        choose(&mut shell, slot, EDIT_REQUEST, 0);
        assert_eq!(
            written(&control).await,
            vec![allow_line(EDIT_REQUEST, &a, None)]
        );
    });
}

#[test]
fn an_edit_allows_for_the_session_with_its_set_mode() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, runtime) =
            waiting_slot(&mut shell, &harness, EDIT, EDIT_ASK, 1000).await;
        let a = approval(&runtime, EDIT_REQUEST);
        choose(&mut shell, slot, EDIT_REQUEST, 1);
        let kept = passed_on(&a, &kept_suggestions(&a.suggestions, None))
            .updated_permissions
            .unwrap();
        assert!(kept.starts_with("[{") && kept.contains("setMode"));
        assert_eq!(
            written(&control).await,
            vec![allow_line(EDIT_REQUEST, &a, Some(&kept))]
        );
    });
}

#[test]
fn a_second_answer_writes_nothing() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        choose(&mut shell, slot, SANDBOX_REQUEST, 0);
        choose(&mut shell, slot, SANDBOX_REQUEST, 0);
        shell.act(ShellAction::DenyCard {
            slot,
            request_id: SANDBOX_REQUEST.to_owned(),
        });
        assert_eq!(written(&control).await.len(), 1);
    });
}

#[test]
fn each_slot_gets_its_own_answer() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (first, one, _) = waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        let (second, two, _) = waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        assert_ne!(first, second);
        choose(&mut shell, second, SANDBOX_REQUEST, 0);
        assert_eq!(written(&two).await.len(), 1);
        assert!(answers(&one).is_empty());
    });
}

#[test]
fn an_answer_that_cannot_be_sent_says_so_on_the_card() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, runtime) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        runtime.commands().unwrap().revoke();
        choose(&mut shell, slot, SANDBOX_REQUEST, 0);
        let generation = shell.watch(slot).unwrap().generation();
        shell.refresh(slot, generation, 2000).unwrap();
        let card = shell
            .rows(slot)
            .iter()
            .find_map(|row| match row {
                closta_presenter::rows::ThreadRow::Card(it) => Some(it.card.clone()),
                _ => None,
            })
            .unwrap();
        let closta_presenter::cards::ThreadCard::Permission(card) = card else {
            panic!("a permission card");
        };
        assert_eq!(card.failure.as_deref(), Some(ANSWER_FAILED));
        quiet().await;
        assert!(answers(&control).is_empty());
    });
}

#[test]
fn an_answer_to_a_process_that_exited_writes_nothing() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("slot");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let control = harness.control(0).await;
        emit_capture(&control, SANDBOX, SANDBOX_ASK);
        waits_on(&runtime, 1).await;
        let generation = shell.watch(slot).unwrap().generation();
        shell.refresh(slot, generation, 1000).unwrap();
        let before = control.stdin_lines().len();

        control.exit(0);
        let mut watch = shell.watch(slot).unwrap();
        while watch.changed().await {}
        shell.refresh(slot, watch.generation(), 2000).unwrap();
        assert_eq!(shell.status(slot), Some(SessionStatus::Ended));
        choose(&mut shell, slot, SANDBOX_REQUEST, 0);
        quiet().await;
        assert_eq!(control.stdin_lines().len(), before);
        assert_eq!(control.refused_writes(), 0);
        let failed = shell.rows(slot).iter().any(|row| {
            matches!(row, ThreadRow::Card(it) if matches!(&it.card, ThreadCard::Permission(card) if card.failure.is_some()))
        });
        assert!(!failed);
    });
}

#[test]
fn opening_the_note_asks_for_its_focus_and_a_remeasure() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, _control, _) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        let at = shell.card_at(slot, SANDBOX_REQUEST).unwrap();
        let acted = shell.act(ShellAction::OpenNote {
            slot,
            request_id: SANDBOX_REQUEST.to_owned(),
        });
        assert_eq!(
            acted.focus,
            Some(FocusTarget::CardNote {
                slot,
                request_id: SANDBOX_REQUEST.to_owned()
            })
        );
        let (rows_slot, changes) = acted.rows.unwrap();
        assert_eq!(rows_slot, slot);
        assert_eq!(changes, vec![RowChange::Remeasure(at..at + 1)]);
        assert!(shell.card_state(slot, SANDBOX_REQUEST).unwrap().note_open);

        let closed = shell.act(ShellAction::CloseNote {
            slot,
            request_id: SANDBOX_REQUEST.to_owned(),
        });
        assert_eq!(
            closed.focus,
            Some(FocusTarget::Card {
                slot,
                request_id: SANDBOX_REQUEST.to_owned()
            })
        );
    });
}

#[test]
fn what_a_card_holds_never_shows_in_debug() {
    let card = CardState {
        note: "secret note".to_owned(),
        picks: vec![closta_shell::cards::OptionPicks {
            chosen: vec![0],
            other: true,
            other_text: "secret other".to_owned(),
        }],
        ..CardState::default()
    };
    let shown = format!("{card:?} {:?}", card.picks[0]);
    assert!(!shown.contains("secret"));
}

#[test]
fn an_untouched_card_keeps_its_rules_where_it_starts_out() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("slot");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let control = harness.control(0).await;
        control.emit(
            &serde_json::json!({
                "type": "control_request",
                "request_id": "two-places",
                "request": {
                    "subtype": "can_use_tool",
                    "tool_name": "Bash",
                    "display_name": "Bash",
                    "input": { "command": "ls" },
                    "description": "ls",
                    "permission_suggestions": [
                        { "type": "addRules", "behavior": "allow", "destination": "localSettings",
                          "rules": [{ "toolName": "Bash", "ruleContent": "ls" }] },
                        { "type": "addRules", "behavior": "allow", "destination": "userSettings",
                          "rules": [{ "toolName": "Bash", "ruleContent": "pwd" }] }
                    ],
                    "tool_use_id": "toolu_x"
                }
            })
            .to_string(),
        );
        waits_on(&runtime, 1).await;
        let generation = shell.watch(slot).unwrap().generation();
        shell.refresh(slot, generation, 1000).unwrap();
        let a = approval(&runtime, "two-places");
        let before = control.stdin_lines().len();
        choose(&mut shell, slot, "two-places", 1);
        let kept = passed_on(&a, &kept_suggestions(&a.suggestions, Some("localSettings")))
            .updated_permissions
            .unwrap();
        assert_eq!(kept.matches("\"destination\":\"localSettings\"").count(), 2);
        until(|| control.stdin_lines().len() > before).await;
        quiet().await;
        assert_eq!(
            control.stdin_lines()[before..],
            [allow_line("two-places", &a, Some(&kept))]
        );
    });
}

#[test]
fn a_slot_being_closed_takes_no_answer() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        harness.stubborn();
        let (slot, control, _) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        shell.act(ShellAction::CloseSlot { slot });
        shell.act(ShellAction::ConfirmCloseSlot);
        choose(&mut shell, slot, SANDBOX_REQUEST, 0);
        quiet().await;
        assert!(answers(&control).is_empty());
    });
}

#[test]
fn a_note_of_blanks_denies_without_one() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        shell.act(ShellAction::EditNote {
            slot,
            request_id: SANDBOX_REQUEST.to_owned(),
            text: "   \n ".to_owned(),
        });
        shell.act(ShellAction::SendNote {
            slot,
            request_id: SANDBOX_REQUEST.to_owned(),
        });
        assert_eq!(
            written(&control).await,
            vec![encode::deny(SANDBOX_REQUEST, "")]
        );
    });
}

#[test]
fn a_place_the_card_does_not_offer_is_ignored() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, _control, _) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        let (edit, _edit_control, _) =
            waiting_slot(&mut shell, &harness, EDIT, EDIT_ASK, 1000).await;
        let pick = |shell: &mut ShellState, slot, id: &str, place: &str| {
            shell.act(ShellAction::PickDestination {
                slot,
                request_id: id.to_owned(),
                destination: place.to_owned(),
            });
        };
        pick(&mut shell, slot, SANDBOX_REQUEST, "/etc/elsewhere");
        pick(&mut shell, edit, EDIT_REQUEST, "userSettings");
        for (slot, id) in [(slot, SANDBOX_REQUEST), (edit, EDIT_REQUEST)] {
            shell.act(ShellAction::CardShown {
                slot,
                request_id: id.to_owned(),
                now_ms: 1,
            });
        }
        let place = |slot, id| shell.card_state(slot, id).unwrap().destination.clone();
        assert_eq!(
            place(slot, SANDBOX_REQUEST).as_deref(),
            Some("localSettings")
        );
        assert_eq!(place(edit, EDIT_REQUEST).as_deref(), Some("session"));
    });
}

fn toggle(shell: &mut ShellState, slot: SlotId, question: usize, option: usize) -> Acted {
    shell.act(ShellAction::ToggleOption {
        slot,
        request_id: QUESTION_REQUEST.to_owned(),
        question,
        option,
    })
}

fn answer_question(shell: &mut ShellState, slot: SlotId) {
    shell.act(ShellAction::AnswerQuestion {
        slot,
        request_id: QUESTION_REQUEST.to_owned(),
    });
}

fn plan_line(a: &ApprovalRecord, choice: PlanChoice, note: &str) -> (PlanAnswer, String) {
    let ThreadCard::Plan(card) = card_of(a, PlanGo::Auto) else {
        panic!("not a plan");
    };
    let answer = plan_answer(&card, a, choice, note);
    let line = encode::allow(
        PLAN_REQUEST,
        &answer.payload,
        answer.passed_on.updated_permissions.as_deref(),
    )
    .unwrap();
    (answer, line)
}

#[test]
fn approving_a_plan_allows_with_its_mode_and_then_switches() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, runtime) =
            waiting_slot(&mut shell, &harness, PLAN, PLAN_ASK, 1000).await;
        let a = approval(&runtime, PLAN_REQUEST);
        choose(&mut shell, slot, PLAN_REQUEST, 0);
        let (_, allow) = plan_line(&a, PlanChoice::Go, "");
        until(|| {
            control
                .stdin_lines()
                .iter()
                .any(|it| it.contains("set_permission_mode"))
        })
        .await;
        quiet().await;
        let lines = control.stdin_lines();
        let at = lines.iter().position(|it| *it == allow).expect("the allow");
        let after: Vec<serde_json::Value> = lines[at + 1..]
            .iter()
            .map(|it| serde_json::from_str(it).unwrap())
            .collect();
        assert_eq!(after.len(), 1);
        assert_eq!(after[0]["type"], "control_request");
        assert_eq!(after[0]["request"]["subtype"], "set_permission_mode");
        assert_eq!(after[0]["request"]["mode"], "auto");
        assert_eq!(answers(&control), vec![allow]);
    });
}

#[test]
fn approve_and_review_edits_allows_without_a_switch() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, runtime) =
            waiting_slot(&mut shell, &harness, PLAN, PLAN_ASK, 1000).await;
        let a = approval(&runtime, PLAN_REQUEST);
        choose(&mut shell, slot, PLAN_REQUEST, 1);
        let (answer, allow) = plan_line(&a, PlanChoice::AskEdits, "");
        assert!(answer.passed_on.updated_permissions.is_none());
        assert_eq!(written(&control).await, vec![allow.clone()]);
        assert!(!allow.contains("updatedPermissions"));
        assert!(
            !control
                .stdin_lines()
                .iter()
                .any(|it| it.contains("set_permission_mode"))
        );
    });
}

#[test]
fn keep_planning_sends_the_note() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) = waiting_slot(&mut shell, &harness, PLAN, PLAN_ASK, 1000).await;
        let id = PLAN_REQUEST.to_owned();
        shell.act(ShellAction::OpenNote {
            slot,
            request_id: id.clone(),
        });
        shell.act(ShellAction::EditNote {
            slot,
            request_id: id.clone(),
            text: "shorter".to_owned(),
        });
        choose(&mut shell, slot, PLAN_REQUEST, 2);
        assert_eq!(
            written(&control).await,
            vec![encode::deny(PLAN_REQUEST, "shorter")]
        );
        assert!(
            !control
                .stdin_lines()
                .iter()
                .any(|it| it.contains("set_permission_mode"))
        );
    });
}

#[test]
fn a_note_sent_on_a_plan_keeps_planning() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) = waiting_slot(&mut shell, &harness, PLAN, PLAN_ASK, 1000).await;
        let id = PLAN_REQUEST.to_owned();
        shell.act(ShellAction::EditNote {
            slot,
            request_id: id.clone(),
            text: "  shorter ".to_owned(),
        });
        shell.act(ShellAction::SendNote {
            slot,
            request_id: id,
        });
        assert_eq!(
            written(&control).await,
            vec![encode::deny(PLAN_REQUEST, "shorter")]
        );
    });
}

#[test]
fn escape_on_a_plan_keeps_planning_without_a_note() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) = waiting_slot(&mut shell, &harness, PLAN, PLAN_ASK, 1000).await;
        shell.act(ShellAction::DenyCard {
            slot,
            request_id: PLAN_REQUEST.to_owned(),
        });
        assert_eq!(
            written(&control).await,
            vec![encode::deny(PLAN_REQUEST, "")]
        );
    });
}

#[test]
fn a_plan_has_no_fourth_button() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) = waiting_slot(&mut shell, &harness, PLAN, PLAN_ASK, 1000).await;
        let before = control.stdin_lines().len();
        choose(&mut shell, slot, PLAN_REQUEST, 3);
        quiet().await;
        assert_eq!(control.stdin_lines().len(), before);
    });
}

#[test]
fn a_question_answers_every_question() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, runtime) =
            waiting_slot(&mut shell, &harness, QUESTION, QUESTION_ASK, 1000).await;
        let a = approval(&runtime, QUESTION_REQUEST);
        toggle(&mut shell, slot, 0, 0);
        toggle(&mut shell, slot, 1, 1);
        answer_question(&mut shell, slot);
        let payload = answer_payload(
            &a,
            &[
                (QUESTION_ONE.to_owned(), "A".to_owned()),
                (QUESTION_TWO.to_owned(), "Y".to_owned()),
            ],
        );
        assert_eq!(
            written(&control).await,
            vec![encode::allow(QUESTION_REQUEST, &payload, None).unwrap()]
        );
    });
}

#[test]
fn a_question_with_an_unanswered_question_is_not_sent() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) =
            waiting_slot(&mut shell, &harness, QUESTION, QUESTION_ASK, 1000).await;
        let before = control.stdin_lines().len();
        toggle(&mut shell, slot, 0, 0);
        answer_question(&mut shell, slot);
        quiet().await;
        assert_eq!(control.stdin_lines().len(), before);
        assert!(shell.card_state(slot, QUESTION_REQUEST).is_some());
    });
}

#[test]
fn other_is_an_answer_of_its_own() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, runtime) =
            waiting_slot(&mut shell, &harness, QUESTION, QUESTION_ASK, 1000).await;
        let a = approval(&runtime, QUESTION_REQUEST);
        shell.act(ShellAction::EditOther {
            slot,
            request_id: QUESTION_REQUEST.to_owned(),
            question: 0,
            text: " C ".to_owned(),
        });
        toggle(&mut shell, slot, 1, 0);
        answer_question(&mut shell, slot);
        let payload = answer_payload(
            &a,
            &[
                (QUESTION_ONE.to_owned(), "C".to_owned()),
                (QUESTION_TWO.to_owned(), "X".to_owned()),
            ],
        );
        assert_eq!(
            written(&control).await,
            vec![encode::allow(QUESTION_REQUEST, &payload, None).unwrap()]
        );
    });
}

#[test]
fn skip_says_no_to_the_question() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) =
            waiting_slot(&mut shell, &harness, QUESTION, QUESTION_ASK, 1000).await;
        toggle(&mut shell, slot, 0, 0);
        shell.act(ShellAction::DenyCard {
            slot,
            request_id: QUESTION_REQUEST.to_owned(),
        });
        assert_eq!(
            written(&control).await,
            vec![encode::deny(QUESTION_REQUEST, "")]
        );
    });
}

#[test]
fn the_picks_outlive_a_refresh() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, _control, _) =
            waiting_slot(&mut shell, &harness, QUESTION, QUESTION_ASK, 1000).await;
        let at = shell.card_at(slot, QUESTION_REQUEST).unwrap();
        let acted = toggle(&mut shell, slot, 1, 1);
        let (rows_slot, changes) = acted.rows.unwrap();
        assert_eq!(rows_slot, slot);
        assert_eq!(changes, vec![RowChange::Remeasure(at..at + 1)]);
        toggle(&mut shell, slot, 0, 1);
        shell.act(ShellAction::ToggleOther {
            slot,
            request_id: QUESTION_REQUEST.to_owned(),
            question: 1,
        });
        let generation = shell.watch(slot).unwrap().generation();
        let _ = shell.refresh(slot, generation, 2000);
        let picks = &shell.card_state(slot, QUESTION_REQUEST).unwrap().picks;
        assert_eq!(picks[0].chosen, vec![1]);
        assert!(picks[1].other);
        assert!(picks[1].chosen.is_empty());
    });
}

#[test]
fn a_pick_the_card_does_not_have_is_ignored() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, _control, _) =
            waiting_slot(&mut shell, &harness, QUESTION, QUESTION_ASK, 1000).await;
        for (question, option) in [(2, 0), (0, 2)] {
            let acted = toggle(&mut shell, slot, question, option);
            assert!(acted.rows.is_none());
        }
        let picks = &shell.card_state(slot, QUESTION_REQUEST);
        assert!(picks.is_none_or(|it| it.picks.iter().all(|p| p.chosen.is_empty())));
    });
}
