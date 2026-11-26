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

/// The list drew the slot's row where the shell puts it now (first when it has none).
fn list_shown(shell: &mut ShellState, slot: SlotId, id: &str, now_ms: i64) {
    let index = shell
        .needs_you()
        .iter()
        .position(|row| row.slot == slot)
        .unwrap_or(0);
    list_shown_at(shell, slot, id, index, now_ms);
}

fn list_shown_at(shell: &mut ShellState, slot: SlotId, id: &str, index: usize, now_ms: i64) {
    shell.act(ShellAction::ListShown {
        slot,
        request_id: id.to_owned(),
        index,
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

/// One slot whose process plays the first `ask` lines of `fixture` and waits on one request.
async fn live_waiting(
    shell: &mut ShellState,
    harness: &Harness,
    fixture: &str,
    ask: usize,
    n: usize,
) -> (SlotId, LiveControl) {
    let (launch, runtime) = harness.launch("slot");
    let slot = shell.open(launch);
    let runtime = runtime.recv().await.unwrap();
    running(&runtime).await;
    let control = harness.control(n).await;
    emit_capture(&control, fixture, ask);
    waits_on(&runtime, 1).await;
    refresh(shell, slot, 0);
    (slot, control)
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
        let (slot, control) = live_waiting(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 100_000);
        card_shown(&mut shell, slot, SANDBOX_REQUEST, 0);
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 100_000);
        allow_from_list(&mut shell, slot, "not-a-request", 100_000);
        quiet().await;
        assert!(answers_of(control.stdin_lines()).is_empty());
        assert_eq!(control.refused_writes(), 0);
    });
}

#[test]
fn what_cannot_be_allowed_from_the_list_is_refused() {
    drive(|harness| async move {
        for (n, (fixture, ask)) in [(EDIT, EDIT_ASK), (QUESTION, QUESTION_ASK), (PLAN, PLAN_ASK)]
            .into_iter()
            .enumerate()
        {
            let mut shell = harness.shell();
            let (slot, control) = live_waiting(&mut shell, &harness, fixture, ask, n).await;
            let row = shell.needs_you().remove(0);
            assert!(!row.may_allow(), "{fixture}");
            let id = row.request_id().unwrap().to_owned();
            list_shown(&mut shell, slot, &id, 1000);
            allow_from_list(&mut shell, slot, &id, 2000);
            quiet().await;
            assert!(answers_of(control.stdin_lines()).is_empty(), "{fixture}");
            assert_eq!(control.refused_writes(), 0, "{fixture}");
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
            now_ms: 100_000,
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
            now_ms: 100_000,
        },
        ShellAction::DenyCard {
            slot,
            request_id: id.clone(),
            now_ms: 100_000,
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
        ShellAction::HistoryNext { slot },
        ShellAction::CloseSlot { slot },
        ShellAction::Restart { slot },
        ShellAction::SendNote {
            slot,
            request_id: SANDBOX_REQUEST.to_owned(),
            now_ms: 100_000,
        },
        ShellAction::AnswerQuestion {
            slot,
            request_id: SANDBOX_REQUEST.to_owned(),
            now_ms: 100_000,
        },
        ShellAction::EditOther {
            slot,
            request_id: SANDBOX_REQUEST.to_owned(),
            question: 0,
            text: "other".to_owned(),
        },
        ShellAction::ToggleOption {
            slot,
            request_id: SANDBOX_REQUEST.to_owned(),
            question: 0,
            option: 0,
        },
        ShellAction::ToggleOther {
            slot,
            request_id: SANDBOX_REQUEST.to_owned(),
            question: 0,
        },
        ShellAction::CloseNote {
            slot,
            request_id: SANDBOX_REQUEST.to_owned(),
        },
    ];
    for action in actions {
        let acted = shell.act(action.clone());
        assert!(
            acted.focus.is_none() && acted.rows.is_none() && acted.draft.is_none(),
            "{action:?}"
        );
    }
    assert_eq!(shell.selected(), before_selected);
    assert!(shell.slot_close().is_none() || shell.overlay() != Some(Overlay::NewSession));
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

#[test]
fn a_slot_close_question_holds_back_a_new_session_and_a_start() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, _, _) = waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        shell.act(ShellAction::CloseSlot { slot });
        assert_eq!(shell.overlay(), Some(Overlay::CloseSlot));
        let opened = shell.act(ShellAction::OpenNewSession);
        assert!(!opened.folder);
        assert!(shell.new_session().is_none());
        let started = shell.act(ShellAction::StartSession {
            folder: "x".to_owned(),
        });
        assert!(started.check.is_none());
        assert_eq!(shell.overlay(), Some(Overlay::CloseSlot));
    });
}

#[test]
fn a_late_folder_check_starts_nothing_behind_the_windows_question() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, _) = harness.launch("one");
        shell.open(launch);
        shell.act(ShellAction::OpenNewSession);
        shell.act(ShellAction::EditFolder {
            text: r"C:\work\proj".to_owned(),
        });
        shell.act(ShellAction::StartSession {
            folder: r"C:\work\proj".to_owned(),
        });
        shell.act(ShellAction::EditDraft {
            slot: shell.selected().unwrap(),
            text: "draft".to_owned(),
        });
        shell.act(ShellAction::RequestClose);
        assert_eq!(shell.overlay(), Some(Overlay::CloseWindow));
        assert!(shell.new_session().is_none(), "one overlay at a time");
        let acted = shell.act(ShellAction::FolderChecked {
            folder: r"C:\work\proj".to_owned(),
            exists: true,
        });
        assert!(acted.started.is_none());
        assert_eq!(shell.slots().len(), 1);
        shell.act(ShellAction::CancelClose);
        assert_eq!(shell.overlay(), None);
    });
}

#[test]
fn a_row_that_shows_another_request_does_not_start_its_gate() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, runtime) = two_waits(&mut shell, &harness, 0).await;
        list_shown(&mut shell, slot, "R1", 0);
        list_shown(&mut shell, slot, "R2", 0);
        assert!(!shell.list_shown(slot, "R2"));
        allow_from_list(&mut shell, slot, "R1", 600);
        until(|| answers_of(control.stdin_lines()).len() == 1).await;
        until(|| runtime.view().conversation.pending_approvals.len() == 1).await;
        refresh(&mut shell, slot, 700);
        allow_from_list(&mut shell, slot, "R2", 5000);
        quiet().await;
        assert_eq!(answers_of(control.stdin_lines()).len(), 1);
        assert_eq!(control.refused_writes(), 0);
    });
}

#[test]
fn a_row_behind_an_overlay_does_not_start_its_gate() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) = waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        shell.act(ShellAction::OpenNewSession);
        list_shown(&mut shell, slot, SANDBOX_REQUEST, 0);
        assert!(!shell.list_shown(slot, SANDBOX_REQUEST));
        shell.act(ShellAction::CancelNewSession);
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 5000);
        quiet().await;
        assert!(answers_of(control.stdin_lines()).is_empty());
        list_shown(&mut shell, slot, SANDBOX_REQUEST, 6000);
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 6500);
        until(|| answers_of(control.stdin_lines()).len() == 1).await;
    });
}

#[test]
fn deny_from_the_list_needs_a_row_the_list_may_allow() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, _, _) = waiting_slot(&mut shell, &harness, QUESTION, QUESTION_ASK, 0).await;
        let acted = shell.act(ShellAction::DenyFromList {
            slot,
            request_id: QUESTION_REQUEST.to_owned(),
        });
        assert!(acted.focus.is_none());
        assert!(
            shell
                .card_state(slot, QUESTION_REQUEST)
                .is_none_or(|it| !it.note_open)
        );
    });
}

/// One slot whose process asks permission `request`, refreshed at `now_ms`; `n` is its process.
async fn one_wait(
    shell: &mut ShellState,
    harness: &Harness,
    request: &str,
    n: usize,
    now_ms: i64,
) -> (SlotId, LiveControl, SessionRuntime) {
    let (launch, runtime) = harness.launch("slot");
    let slot = shell.open(launch);
    let runtime = runtime.recv().await.unwrap();
    running(&runtime).await;
    let control = harness.control(n).await;
    control.emit(&can_use_tool(request, "ls"));
    waits_on(&runtime, 1).await;
    refresh(shell, slot, now_ms);
    (slot, control, runtime)
}

fn rows_of(shell: &ShellState) -> Vec<(SlotId, Option<String>)> {
    shell
        .needs_you()
        .iter()
        .map(|row| (row.slot, row.request_id().map(str::to_owned)))
        .collect()
}

#[test]
fn a_row_that_moves_up_into_an_answered_rows_place_waits_again() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (upper, one, one_runtime) = one_wait(&mut shell, &harness, "A1", 0, 0).await;
        let (lower, two, _) = one_wait(&mut shell, &harness, "B1", 1, 10).await;
        assert_eq!(
            rows_of(&shell),
            [
                (upper, Some("A1".to_owned())),
                (lower, Some("B1".to_owned()))
            ]
        );
        list_shown_at(&mut shell, upper, "A1", 0, 0);
        list_shown_at(&mut shell, lower, "B1", 1, 0);
        allow_from_list(&mut shell, upper, "A1", 600);
        until(|| answers_of(one.stdin_lines()).len() == 1).await;
        until(|| one_runtime.view().conversation.pending_approvals.is_empty()).await;
        refresh(&mut shell, upper, 700);
        assert_eq!(rows_of(&shell), [(lower, Some("B1".to_owned()))]);

        // The second press of a double click lands where the answered row was: on B1 now.
        allow_from_list(&mut shell, lower, "B1", 750);
        quiet().await;
        assert!(answers_of(two.stdin_lines()).is_empty());
        // Once drawn in its new place, it waits its own half second there.
        list_shown_at(&mut shell, lower, "B1", 0, 800);
        allow_from_list(&mut shell, lower, "B1", 1299);
        quiet().await;
        assert!(answers_of(two.stdin_lines()).is_empty());
        allow_from_list(&mut shell, lower, "B1", 1300);
        until(|| answers_of(two.stdin_lines()).len() == 1).await;
        assert_eq!(two.refused_writes(), 0);
    });
}

#[test]
fn a_row_moved_by_its_neighbours_next_wait_waits_again() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (upper, one, one_runtime) = one_wait(&mut shell, &harness, "A1", 0, 0).await;
        let (lower, two, _) = one_wait(&mut shell, &harness, "B1", 1, 10).await;
        one.emit(&can_use_tool("A2", "pwd"));
        waits_on(&one_runtime, 2).await;
        refresh(&mut shell, upper, 20);
        list_shown_at(&mut shell, upper, "A1", 0, 0);
        list_shown_at(&mut shell, lower, "B1", 1, 0);
        allow_from_list(&mut shell, upper, "A1", 600);
        until(|| answers_of(one.stdin_lines()).len() == 1).await;
        until(|| one_runtime.view().conversation.pending_approvals.len() == 1).await;
        refresh(&mut shell, upper, 700);
        // The upper slot now shows its next wait, seen later: it goes below.
        assert_eq!(
            rows_of(&shell),
            [
                (lower, Some("B1".to_owned())),
                (upper, Some("A2".to_owned()))
            ]
        );
        allow_from_list(&mut shell, lower, "B1", 750);
        allow_from_list(&mut shell, upper, "A2", 750);
        quiet().await;
        assert!(answers_of(two.stdin_lines()).is_empty());
        assert_eq!(answers_of(one.stdin_lines()).len(), 1);
        list_shown_at(&mut shell, lower, "B1", 0, 800);
        allow_from_list(&mut shell, lower, "B1", 1300);
        until(|| answers_of(two.stdin_lines()).len() == 1).await;
    });
}

#[test]
fn a_row_drawn_in_another_place_than_the_lists_is_not_noted() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (upper, _, _) = one_wait(&mut shell, &harness, "A1", 0, 0).await;
        let (lower, two, _) = one_wait(&mut shell, &harness, "B1", 1, 10).await;
        list_shown_at(&mut shell, lower, "B1", 0, 0);
        assert!(!shell.list_shown(lower, "B1"));
        list_shown_at(&mut shell, upper, "A1", 1, 0);
        assert!(!shell.list_shown(upper, "A1"));
        allow_from_list(&mut shell, lower, "B1", 5000);
        quiet().await;
        assert!(answers_of(two.stdin_lines()).is_empty());
        list_shown_at(&mut shell, lower, "B1", 1, 6000);
        assert_eq!(shell.list_shown_at(lower, "B1"), Some(1));
        // The same place again keeps the first time.
        list_shown_at(&mut shell, lower, "B1", 1, 9000);
        allow_from_list(&mut shell, lower, "B1", 6500);
        until(|| answers_of(two.stdin_lines()).len() == 1).await;
    });
}

fn project_launch(
    harness: &Harness,
) -> (
    closta_shell::slot::SlotLaunch,
    closta_providers::claude::fake::replay::ReplayControl,
    async_channel::Receiver<SessionRuntime>,
) {
    support::replay_launch(harness, SANDBOX, SANDBOX_ASK)
}

/// Opens a slot in `folder` (none for no project) that waits on a request, refreshed at `at`.
async fn waiting_in(
    shell: &mut ShellState,
    harness: &Harness,
    folder: Option<&str>,
    at: i64,
) -> SlotId {
    let (mut launch, _control, runtime) = project_launch(harness);
    launch.project = folder.map(str::to_owned);
    let slot = shell.open(launch);
    let runtime = runtime.recv().await.unwrap();
    running(&runtime).await;
    waits_on(&runtime, 1).await;
    let generation = shell.watch(slot).unwrap().generation();
    shell.refresh(slot, generation, at).unwrap();
    slot
}

fn projects_of(shell: &ShellState) -> Vec<(SlotId, Option<String>)> {
    shell
        .needs_you()
        .into_iter()
        .map(|row| (row.slot, row.project))
        .collect()
}

#[test]
fn waits_of_three_projects_are_one_list_oldest_first() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let a = waiting_in(&mut shell, &harness, Some(r"C:\work\alpha"), 300).await;
        let b = waiting_in(&mut shell, &harness, Some(r"C:\work\beta"), 100).await;
        let c = waiting_in(&mut shell, &harness, Some(r"C:\work\gamma"), 200).await;
        let d = waiting_in(&mut shell, &harness, Some(r"C:\work\alpha"), 400).await;
        assert_eq!(
            projects_of(&shell),
            vec![
                (b, Some("beta".to_owned())),
                (c, Some("gamma".to_owned())),
                (a, Some("alpha".to_owned())),
                (d, Some("alpha".to_owned())),
            ]
        );
    });
}

#[test]
fn a_collapsed_project_s_wait_is_listed() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let slot = waiting_in(&mut shell, &harness, Some(r"C:\work\alpha"), 1).await;
        let key = closta_shell::projects::project_key(r"C:\work\alpha").unwrap();
        shell.act(ShellAction::ToggleProject { project: key });
        assert!(shell.projects()[0].collapsed);
        assert_eq!(projects_of(&shell), vec![(slot, Some("alpha".to_owned()))]);
    });
}

#[test]
fn two_projects_of_the_same_name_are_told_apart_in_the_rows() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let win = waiting_in(&mut shell, &harness, Some(r"C:\work\closta"), 1).await;
        let wsl = waiting_in(
            &mut shell,
            &harness,
            Some(r"\\wsl$\Ubuntu\home\x\closta"),
            2,
        )
        .await;
        assert_eq!(
            projects_of(&shell),
            vec![
                (win, Some("closta (Windows)".to_owned())),
                (wsl, Some("closta (WSL)".to_owned())),
            ]
        );
    });
}

#[test]
fn a_row_of_a_slot_without_a_project_has_no_project() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let slot = waiting_in(&mut shell, &harness, None, 1).await;
        assert_eq!(projects_of(&shell), vec![(slot, None)]);
    });
}

#[test]
fn a_row_carries_the_slot_s_title_as_the_list_shows_it() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (mut launch, _control, runtime) = project_launch(&harness);
        launch.title = "t".repeat(70);
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        waits_on(&runtime, 1).await;
        let generation = shell.watch(slot).unwrap().generation();
        shell.refresh(slot, generation, 1).unwrap();
        let title = shell.slot_title(slot).unwrap();
        assert_eq!(title.len(), 60);
        assert_eq!(shell.needs_you()[0].title, title);
    });
}

fn no_answer(lines: Vec<String>, refused: usize) {
    assert!(answers_of(lines).is_empty());
    assert_eq!(refused, 0);
}

#[test]
fn allow_from_the_list_needs_the_request_the_row_shows() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) = two_waits(&mut shell, &harness, 0).await;
        assert_eq!(shell.needs_you()[0].request_id(), Some("R1"));
        list_shown(&mut shell, slot, "R1", 1000);
        allow_from_list(&mut shell, slot, "R2", 2000);
        quiet().await;
        no_answer(control.stdin_lines(), control.refused_writes());
        allow_from_list(&mut shell, slot, "R1", 2000);
        until(|| answers_of(control.stdin_lines()).len() == 1).await;
    });
}

#[test]
fn allow_from_the_list_needs_a_request_it_may_allow() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) = waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        assert!(shell.needs_you()[0].may_allow());
        let (other, other_control) =
            live_waiting(&mut shell, &harness, QUESTION, QUESTION_ASK, 0).await;
        let unanswerable = shell
            .needs_you()
            .into_iter()
            .find(|row| row.slot == other)
            .unwrap();
        assert!(!unanswerable.may_allow());
        list_shown(&mut shell, other, QUESTION_REQUEST, 1000);
        allow_from_list(&mut shell, other, QUESTION_REQUEST, 2000);
        quiet().await;
        no_answer(other_control.stdin_lines(), other_control.refused_writes());
        list_shown(&mut shell, slot, SANDBOX_REQUEST, 1000);
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 2000);
        until(|| answers_of(control.stdin_lines()).len() == 1).await;
    });
}

#[test]
fn allow_from_the_list_needs_the_row_drawn_half_a_second_ago_in_its_place() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 100).await;
        assert_eq!(shell.needs_you()[0].slot, slot);
        list_shown_at(&mut shell, slot, SANDBOX_REQUEST, 0, 1000);
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 1499);
        quiet().await;
        no_answer(control.stdin_lines(), 0);

        // An older wait comes in ahead of the row: it was drawn in another place than it has now.
        let (older, _, _) = waiting_slot(&mut shell, &harness, QUESTION, QUESTION_ASK, 50).await;
        assert_eq!(shell.needs_you()[0].slot, older);
        assert_eq!(shell.needs_you()[1].slot, slot);
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 5000);
        quiet().await;
        no_answer(control.stdin_lines(), 0);

        list_shown_at(&mut shell, slot, SANDBOX_REQUEST, 1, 6000);
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 6499);
        quiet().await;
        no_answer(control.stdin_lines(), 0);
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 6500);
        until(|| answers_of(control.stdin_lines()).len() == 1).await;
    });
}

#[test]
fn allow_from_the_list_needs_the_request_still_waiting() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control, _) = two_waits(&mut shell, &harness, 0).await;
        list_shown(&mut shell, slot, "R1", 1000);
        allow_from_list(&mut shell, slot, "R1", 2000);
        until(|| answers_of(control.stdin_lines()).len() == 1).await;
        // The same request again, before the list moved on, answers nothing more.
        allow_from_list(&mut shell, slot, "R1", 3000);
        quiet().await;
        assert_eq!(answers_of(control.stdin_lines()).len(), 1);
        assert_eq!(control.refused_writes(), 0);
    });
}

#[test]
fn allow_from_the_list_needs_a_live_session() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, control) = live_waiting(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        list_shown(&mut shell, slot, SANDBOX_REQUEST, 1000);
        control.exit(0);
        let mut watch = shell.watch(slot).unwrap();
        while watch.changed().await {}
        shell.refresh(slot, watch.generation(), 1100).unwrap();
        assert_eq!(shell.status(slot), Some(SessionStatus::Ended));
        let before = control.stdin_lines().len();
        allow_from_list(&mut shell, slot, SANDBOX_REQUEST, 5000);
        quiet().await;
        assert_eq!(control.stdin_lines().len(), before);
        assert_eq!(control.refused_writes(), 0);
    });
}
