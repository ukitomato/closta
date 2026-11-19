#![allow(clippy::expect_used, clippy::unwrap_used)]
//! Answering and opening waits from the needs-you list, the jump to the next wait, and the keys
//! an overlay holds back, over captures 36, 17, 18 and 29 and in-memory processes.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::time::Duration;

use closta_presenter::cards::allow_payload;
use closta_providers::claude::fake::live::LiveControl;
use closta_providers::claude::protocol::encode;
use closta_session::runtime::SessionRuntime;
use closta_session::status::SessionStatus;
use closta_shell::needs_you::NeedsYouItem;
use closta_shell::slot::SlotId;
use closta_shell::state::{FocusTarget, Overlay, ShellAction, ShellState};
use smol::Timer;
use support::{
    Harness, can_use_tool, drive, emit_capture, relaunchable, running, until, waiting_slot,
    waits_on,
};

const SANDBOX: &str = "36-sandbox-unavailable.ndjson";
const SANDBOX_ASK: usize = 31;
const SANDBOX_REQUEST: &str = "b4635f8c-7b16-4eac-9934-9ca6b3b1373f";
const PLAN: &str = "29-exit-plan-mode.ndjson";
const PLAN_ASK: usize = 153;
const QUESTION: &str = "18-ask-multi-question.ndjson";
const QUESTION_ASK: usize = 46;
const QUESTION_REQUEST: &str = "11d35842-e704-44da-9c36-710ff840b727";
const EDIT: &str = "17-edit-approval.ndjson";
const EDIT_ASK: usize = 64;

fn answers_of(lines: Vec<String>) -> Vec<String> {
    lines
        .into_iter()
        .filter(|line| line.contains("\"control_response\""))
        .collect()
}

async fn quiet() {
    Timer::after(Duration::from_millis(150)).await;
}

fn list_shown(shell: &mut ShellState, slot: SlotId, id: &str, now_ms: i64) {
    shell.act(ShellAction::ListShown {
        slot,
        request_id: id.to_owned(),
        now_ms,
    });
}

fn card_shown(shell: &mut ShellState, slot: SlotId, id: &str, now_ms: i64) {
    shell.act(ShellAction::CardShown {
        slot,
        request_id: id.to_owned(),
        now_ms,
    });
}

fn allow_from_list(shell: &mut ShellState, slot: SlotId, id: &str, now_ms: i64) {
    shell.act(ShellAction::AllowFromList {
        slot,
        request_id: id.to_owned(),
        now_ms,
    });
}

fn refresh(shell: &mut ShellState, slot: SlotId, now_ms: i64) {
    let generation = shell.watch(slot).unwrap().generation();
    shell.refresh(slot, generation, now_ms).unwrap();
}

/// One slot whose process asks two permissions, `R1` then `R2`, refreshed at `now_ms`.
async fn two_waits(
    shell: &mut ShellState,
    harness: &Harness,
    now_ms: i64,
) -> (SlotId, LiveControl, SessionRuntime) {
    let (launch, runtime) = harness.launch("slot");
    let slot = shell.open(launch);
    let runtime = runtime.recv().await.unwrap();
    running(&runtime).await;
    let control = harness.control(0).await;
    control.emit(&can_use_tool("R1", "ls"));
    control.emit(&can_use_tool("R2", "pwd"));
    waits_on(&runtime, 2).await;
    refresh(shell, slot, now_ms);
    (slot, control, runtime)
}

#[test]
fn allow_from_the_list_waits_half_a_second_after_the_row_showed() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, runtime) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        list_shown(&mut shell, slot, SANDBOX_REQUEST, 1000);
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 1499);
        quiet().await;
        assert!(answers_of(control.stdin_lines()).is_empty());
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 1500);
        until(|| !answers_of(control.stdin_lines()).is_empty()).await;
        quiet().await;
        let approval = runtime
            .view()
            .transcript
            .approvals
            .get(SANDBOX_REQUEST)
            .unwrap()
            .clone();
        assert_eq!(
            answers_of(control.stdin_lines()),
            vec![encode::allow(SANDBOX_REQUEST, &allow_payload(&approval), None).unwrap()]
        );
    });
}

#[test]
fn a_card_shown_in_the_conversation_does_not_open_the_list_gate() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, runtime) = two_waits(&mut shell, &harness, 0).await;
        card_shown(&mut shell, slot, "R1", 0);
        card_shown(&mut shell, slot, "R2", 0);
        list_shown(&mut shell, slot, "R1", 0);
        allow_from_list(&mut shell, slot, "R1", 600);
        until(|| answers_of(control.stdin_lines()).len() == 1).await;
        until(|| runtime.view().conversation.pending_approvals.len() == 1).await;
        refresh(&mut shell, slot, 700);

        let rows = shell.needs_you();
        assert_eq!(rows[0].request_id(), Some("R2"));
        list_shown(&mut shell, slot, "R2", 1000);
        allow_from_list(&mut shell, slot, "R2", 1100);
        quiet().await;
        assert_eq!(answers_of(control.stdin_lines()).len(), 1);
        assert_eq!(control.refused_writes(), 0);
        allow_from_list(&mut shell, slot, "R2", 1500);
        until(|| answers_of(control.stdin_lines()).len() == 2).await;
        assert_eq!(control.refused_writes(), 0);
    });
}

#[test]
fn allow_from_the_list_needs_the_request_the_row_showed() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) = two_waits(&mut shell, &harness, 0).await;
        assert_eq!(shell.needs_you()[0].request_id(), Some("R1"));
        list_shown(&mut shell, slot, "R2", 0);
        allow_from_list(&mut shell, slot, "R2", 1000);
        quiet().await;
        assert!(answers_of(control.stdin_lines()).is_empty());
        assert_eq!(control.refused_writes(), 0);
        // The row shows R1, which was never shown for its half second.
        allow_from_list(&mut shell, slot, "R1", 1000);
        quiet().await;
        assert!(answers_of(control.stdin_lines()).is_empty());
    });
}

#[test]
fn allow_without_a_shown_row_does_nothing() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) = waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 100_000);
        card_shown(&mut shell, slot, SANDBOX_REQUEST, 0);
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 100_000);
        allow_from_list(&mut shell, slot, "not-a-request", 100_000);
        quiet().await;
        assert!(answers_of(control.stdin_lines()).is_empty());
    });
}

#[test]
fn what_cannot_be_allowed_from_the_list_is_refused() {
    drive(|harness| async move {
        for (fixture, ask) in [(EDIT, EDIT_ASK), (QUESTION, QUESTION_ASK), (PLAN, PLAN_ASK)] {
            let mut shell = harness.shell();
            let (slot, control, _) = waiting_slot(&mut shell, &harness, fixture, ask, 0).await;
            let row = shell.needs_you().remove(0);
            assert!(!row.may_allow(), "{fixture}");
            let id = row.request_id().unwrap().to_owned();
            list_shown(&mut shell, slot, &id, 1000);
            allow_from_list(&mut shell, slot, &id, 2000);
            quiet().await;
            assert!(answers_of(control.stdin_lines()).is_empty(), "{fixture}");
        }
    });
}

#[test]
fn a_second_shown_keeps_the_first_time_and_a_clock_that_went_back_waits() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) = waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        list_shown(&mut shell, slot, SANDBOX_REQUEST, 1000);
        list_shown(&mut shell, slot, SANDBOX_REQUEST, 2000);
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 1600);
        until(|| answers_of(control.stdin_lines()).len() == 1).await;

        let mut shell = harness.shell();
        let (slot, control, _) = waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        list_shown(&mut shell, slot, SANDBOX_REQUEST, 5000);
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 4000);
        quiet().await;
        assert!(answers_of(control.stdin_lines()).is_empty());
    });
}

#[test]
fn deny_from_the_list_opens_the_note_in_the_conversation() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (first, _, _) = waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        let (second, _, _) = waiting_slot(&mut shell, &harness, QUESTION, QUESTION_ASK, 0).await;
        shell.act(ShellAction::Select(second));
        let acted = shell.act(ShellAction::DenyFromList {
            slot: first,
            request_id: SANDBOX_REQUEST.to_owned(),
        });
        assert_eq!(shell.selected(), Some(first));
        assert!(shell.card_state(first, SANDBOX_REQUEST).unwrap().note_open);
        assert_eq!(
            acted.focus,
            Some(FocusTarget::CardNote {
                slot: first,
                request_id: SANDBOX_REQUEST.to_owned()
            })
        );
        assert!(acted.rows.is_none());
        // A request the row does not show opens nothing.
        let other = shell.act(ShellAction::DenyFromList {
            slot: first,
            request_id: "other".to_owned(),
        });
        assert!(other.focus.is_none());
    });
}

#[test]
fn open_from_the_list_selects_and_focuses_the_card_or_the_band() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (first, _, _) = waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        let (second, _, _) = waiting_slot(&mut shell, &harness, QUESTION, QUESTION_ASK, 0).await;
        let acted = shell.act(ShellAction::OpenFromList { slot: second });
        assert_eq!(shell.selected(), Some(second));
        assert_eq!(
            acted.focus,
            Some(FocusTarget::Card {
                slot: second,
                request_id: QUESTION_REQUEST.to_owned()
            })
        );
        let acted = shell.act(ShellAction::OpenFromList { slot: first });
        assert_eq!(shell.selected(), Some(first));
        assert!(matches!(acted.focus, Some(FocusTarget::Card { slot, .. }) if slot == first));

        let (launch, _) = harness.launch("none");
        let idle = shell.open(launch);
        let acted = shell.act(ShellAction::OpenFromList { slot: idle });
        assert!(acted.focus.is_none(), "a slot with no row opens nothing");
        assert_eq!(shell.selected(), Some(first));
    });
}

#[test]
fn open_from_the_list_goes_to_the_failure_band() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        harness.refuse(
            closta_providers::claude::launch::LaunchError::WslUnavailable {
                distro: "none".to_owned(),
            },
        );
        let (launch, _) = harness.launch("broken");
        let slot = shell.open(launch);
        let mut watch = shell.watch(slot).unwrap();
        while !matches!(shell.status(slot), Some(SessionStatus::Failed(_))) {
            assert!(watch.changed().await);
            shell.refresh(slot, watch.generation(), 0).unwrap();
        }
        assert!(matches!(
            shell.needs_you()[0].item,
            NeedsYouItem::Failed { .. }
        ));
        let acted = shell.act(ShellAction::OpenFromList { slot });
        assert_eq!(acted.focus, Some(FocusTarget::FailureBand(slot)));
    });
}

#[test]
fn jump_stays_on_the_selected_waiting_slot_then_goes_across() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (first, _, _) = waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        let (second, _, _) = waiting_slot(&mut shell, &harness, QUESTION, QUESTION_ASK, 10).await;
        let (launch, _) = harness.launch("quiet");
        let quiet_slot = shell.open(launch);

        shell.act(ShellAction::Select(second));
        let acted = shell.act(ShellAction::JumpToWaiting);
        assert_eq!(shell.selected(), Some(second));
        assert_eq!(
            acted.focus,
            Some(FocusTarget::Card {
                slot: second,
                request_id: QUESTION_REQUEST.to_owned()
            })
        );
        shell.act(ShellAction::Select(first));
        shell.act(ShellAction::JumpToWaiting);
        assert_eq!(shell.selected(), Some(first));

        shell.act(ShellAction::Select(quiet_slot));
        let acted = shell.act(ShellAction::JumpToWaiting);
        assert_eq!(shell.selected(), Some(first), "the head of the list");
        assert!(matches!(acted.focus, Some(FocusTarget::Card { slot, .. }) if slot == first));
    });
}

#[test]
fn jump_with_nothing_waiting_does_nothing() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, _) = harness.launch("quiet");
        let slot = shell.open(launch);
        let acted = shell.act(ShellAction::JumpToWaiting);
        assert!(acted.focus.is_none());
        assert_eq!(shell.selected(), Some(slot));
    });
}

#[test]
fn a_restart_drops_the_old_waits_and_their_answers() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (mut launch, runtime) = harness.launch("again");
        launch.relaunch = relaunchable(&harness, "again").relaunch;
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let old = harness.control(0).await;
        emit_capture(&old, SANDBOX, SANDBOX_ASK);
        waits_on(&runtime, 1).await;
        refresh(&mut shell, slot, 0);
        list_shown(&mut shell, slot, SANDBOX_REQUEST, 0);
        assert_eq!(shell.needs_you().len(), 1);
        let before = old.stdin_lines().len();

        old.exit(0);
        let mut watch = shell.watch(slot).unwrap();
        while watch.changed().await {}
        shell.refresh(slot, watch.generation(), 1000).unwrap();
        assert_eq!(shell.status(slot), Some(SessionStatus::Ended));
        assert!(shell.act(ShellAction::Restart { slot }).started.is_some());
        let fresh = harness.control(1).await;

        assert!(shell.needs_you().is_empty());
        assert!(shell.card_state(slot, SANDBOX_REQUEST).is_none());
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 5000);
        shell.act(ShellAction::ChooseCard {
            slot,
            request_id: SANDBOX_REQUEST.to_owned(),
            index: 0,
        });
        quiet().await;
        assert_eq!(old.stdin_lines().len(), before);
        assert!(answers_of(fresh.stdin_lines()).is_empty());
        assert_eq!(old.refused_writes(), 0);
        assert_eq!(fresh.refused_writes(), 0);
    });
}

#[test]
fn nothing_behind_an_overlay_acts() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) = waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        let (launch, _) = harness.launch("other");
        let other = shell.open(launch);
        list_shown(&mut shell, slot, SANDBOX_REQUEST, 0);
        shell.act(ShellAction::EditDraft {
            slot,
            text: "hello".to_owned(),
        });

        shell.act(ShellAction::OpenNewSession);
        assert_eq!(shell.overlay(), Some(Overlay::NewSession));
        behind(&mut shell, slot);
        assert_eq!(shell.selected(), Some(slot));
        quiet().await;
        assert!(control.stdin_lines().iter().all(|it| !it.contains("hello")));
        assert!(answers_of(control.stdin_lines()).is_empty());
        shell.act(ShellAction::Select(other));
        assert_eq!(shell.selected(), Some(other));
        shell.act(ShellAction::Select(slot));
        let toggled = shell.act(ShellAction::ToggleRow {
            slot,
            key: "x".to_owned(),
        });
        assert!(toggled.rows.is_some());

        shell.act(ShellAction::CancelNewSession);
        assert_eq!(shell.overlay(), None);
        shell.act(ShellAction::Select(other));
        let jumped = shell.act(ShellAction::JumpToWaiting);
        assert!(jumped.focus.is_some());
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 1000);
        until(|| answers_of(control.stdin_lines()).len() == 1).await;
    });
}

/// Every action the overlay holds back, for the one waiting slot.
fn behind(shell: &mut ShellState, slot: SlotId) {
    let id = SANDBOX_REQUEST.to_owned();
    let before_selected = shell.selected();
    let actions = [
        ShellAction::Send { slot },
        ShellAction::ChooseCard {
            slot,
            request_id: id.clone(),
            index: 0,
        },
        ShellAction::DenyCard {
            slot,
            request_id: id.clone(),
        },
        ShellAction::AllowFromList {
            slot,
            request_id: id.clone(),
            now_ms: 100_000,
        },
        ShellAction::DenyFromList {
            slot,
            request_id: id.clone(),
        },
        ShellAction::OpenFromList { slot },
        ShellAction::JumpToWaiting,
        ShellAction::OpenNote {
            slot,
            request_id: id.clone(),
        },
        ShellAction::EditNote {
            slot,
            request_id: id.clone(),
            text: "note".to_owned(),
        },
        ShellAction::PickDestination {
            slot,
            request_id: id,
            destination: "userSettings".to_owned(),
        },
        ShellAction::Interrupt { slot },
        ShellAction::HistoryPrev { slot },
    ];
    for action in actions {
        let acted = shell.act(action.clone());
        assert!(
            acted.focus.is_none() && acted.rows.is_none() && acted.draft.is_none(),
            "{action:?}"
        );
    }
    assert_eq!(shell.selected(), before_selected);
    assert!(
        shell
            .card_state(slot, SANDBOX_REQUEST)
            .is_none_or(|it| !it.note_open && it.note.is_empty())
    );
}

#[test]
fn nothing_acts_behind_a_slot_close_question_or_the_window_one() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) = waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        list_shown(&mut shell, slot, SANDBOX_REQUEST, 0);

        shell.act(ShellAction::CloseSlot { slot });
        assert_eq!(shell.overlay(), Some(Overlay::CloseSlot));
        behind(&mut shell, slot);
        shell.act(ShellAction::RequestClose);
        assert_eq!(shell.overlay(), Some(Overlay::CloseWindow));
        assert!(
            shell.slot_close().is_none(),
            "the window's question replaces it"
        );
        behind(&mut shell, slot);
        quiet().await;
        assert!(answers_of(control.stdin_lines()).is_empty());

        shell.act(ShellAction::CancelClose);
        assert_eq!(shell.overlay(), None);
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 1000);
        until(|| answers_of(control.stdin_lines()).len() == 1).await;
    });
}
