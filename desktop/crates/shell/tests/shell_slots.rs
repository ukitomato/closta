#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The slots' marks, the cap of eight, closing one slot and what waits for the user, over
//! sessions made of replays and in-memory processes.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::io::ErrorKind;

use closta_providers::claude::launch::LaunchError;
use closta_session::runtime::SessionRuntime;
use closta_session::status::SessionStatus;
use closta_shell::closing::{CloseQuestion, CloseStage};
use closta_shell::needs_you::NeedsYouItem;
use closta_shell::slot::{SlotId, SlotMark};
use closta_shell::state::{Refresh, ShellAction, ShellState};
use support::{
    Harness, drive, emit_capture, relaunchable, replay_launch, running, until, waiting_slot,
    waits_on,
};

const SANDBOX: &str = "36-sandbox-unavailable.ndjson";
const SANDBOX_ASK: usize = 31;
const SANDBOX_REQUEST: &str = "b4635f8c-7b16-4eac-9934-9ca6b3b1373f";
const QUESTION: &str = "18-ask-multi-question.ndjson";
const QUESTION_ASK: usize = 46;

fn refresh_at(shell: &mut ShellState, slot: SlotId, now_ms: i64) -> Refresh {
    let generation = shell.watch(slot).unwrap().generation();
    shell.refresh(slot, generation, now_ms).unwrap()
}

/// Reads the slot once its run has returned and its watch has said so.
async fn settle(shell: &mut ShellState, slot: SlotId) -> Refresh {
    let mut watch = shell.watch(slot).unwrap();
    while watch.changed().await {}
    shell.refresh(slot, watch.generation(), 0).unwrap()
}

/// `n` slots whose sessions run and whose processes are there.
async fn running_slots(
    shell: &mut ShellState,
    harness: &Harness,
    n: usize,
) -> Vec<(SlotId, SessionRuntime)> {
    let mut slots = Vec::new();
    for _ in 0..n {
        let (launch, runtime) = harness.launch("slot");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        refresh_at(shell, slot, 0);
        slots.push((slot, runtime));
    }
    slots
}

fn type_in(shell: &mut ShellState, slot: SlotId, text: &str) {
    shell.act(ShellAction::EditDraft {
        slot,
        text: text.to_owned(),
    });
}

#[test]
fn a_waiting_slot_shows_waiting_and_is_listed() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, _control, _runtime) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        assert_eq!(shell.slots()[0].mark, SlotMark::Waiting);
        let rows = shell.needs_you();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].slot, slot);
        assert!(rows[0].may_allow());
        assert_eq!(rows[0].since_ms, 1000);
        assert_eq!(shell.waiting_count(), 1);
    });
}

#[test]
fn rows_follow_when_each_wait_was_first_seen() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (first, _c1, _r1) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 2000).await;
        let (second, _c2, _r2) =
            waiting_slot(&mut shell, &harness, QUESTION, QUESTION_ASK, 1000).await;
        let order: Vec<SlotId> = shell.needs_you().iter().map(|it| it.slot).collect();
        assert_eq!(order, [second, first]);

        refresh_at(&mut shell, first, 1000);
        refresh_at(&mut shell, first, 5000);
        let rows = shell.needs_you();
        let order: Vec<SlotId> = rows.iter().map(|it| it.slot).collect();
        assert_eq!(
            order,
            [second, first],
            "a later refresh keeps the first time"
        );
        assert_eq!(rows[1].since_ms, 2000);
    });
}

#[test]
fn rows_with_the_same_time_follow_the_slots() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (first, _c1, _r1) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        let (second, _c2, _r2) =
            waiting_slot(&mut shell, &harness, QUESTION, QUESTION_ASK, 1000).await;
        let order: Vec<SlotId> = shell.needs_you().iter().map(|it| it.slot).collect();
        assert_eq!(order, [first, second]);
    });
}

#[test]
fn a_failed_slot_is_listed_with_its_title() {
    drive(|harness| async move {
        harness.refuse(LaunchError::Spawn(ErrorKind::NotFound));
        let mut shell = harness.shell();
        let (launch, _runtime) = harness.launch("broken");
        let slot = shell.open(launch);
        let refresh = settle(&mut shell, slot).await;
        assert!(matches!(refresh.status, SessionStatus::Failed(_)));
        let rows = shell.needs_you();
        assert_eq!(rows.len(), 1);
        let (title, _) = shell.failure(slot).unwrap();
        assert_eq!(rows[0].item, NeedsYouItem::Failed { title });
        assert_eq!(shell.waiting_count(), 0, "a failure is not a request");
    });
}

#[test]
fn waits_left_by_an_ended_session_are_not_listed() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, _control, runtime) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        runtime.close();
        settle(&mut shell, slot).await;
        assert!(shell.needs_you().is_empty());
        assert_eq!(shell.waiting_count(), 0);
    });
}

#[test]
fn waits_left_by_a_process_that_exited_are_not_listed() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("slot");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let control = harness.control(0).await;
        emit_capture(&control, SANDBOX, SANDBOX_ASK);
        waits_on(&runtime, 1).await;
        refresh_at(&mut shell, slot, 1000);
        assert_eq!(shell.needs_you().len(), 1);

        control.exit(0);
        settle(&mut shell, slot).await;
        assert_eq!(shell.status(slot), Some(SessionStatus::Ended));
        assert!(shell.needs_you().is_empty());
        assert_eq!(shell.waiting_count(), 0);
    });
}

#[test]
fn the_title_counts_waiting_requests_and_changes_once() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        waiting_slot(&mut shell, &harness, QUESTION, QUESTION_ASK, 1000).await;
        assert_eq!(shell.title_change(), Some("(2) Closta".to_owned()));
        assert_eq!(shell.title_change(), None);
    });
}

#[test]
fn a_slot_with_two_waits_counts_both_in_the_title_and_the_row() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("slot");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let control = harness.control(0).await;
        emit_capture(&control, SANDBOX, SANDBOX_ASK);
        control.emit(&support::can_use_tool("second-request", "echo second"));
        waits_on(&runtime, 2).await;
        refresh_at(&mut shell, slot, 1000);
        let rows = shell.needs_you();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].waiting, 2);
        assert_eq!(shell.waiting_count(), 2);
        assert_eq!(rows[0].request_id(), Some(SANDBOX_REQUEST));
    });
}

#[test]
fn a_new_wait_asks_for_attention_once() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, control, runtime) = replay_launch(&harness, SANDBOX, SANDBOX_ASK);
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        waits_on(&runtime, 1).await;
        let _keep = control;
        let first = refresh_at(&mut shell, slot, 1000);
        assert!(first.attention);
        assert_eq!(first.raised, [SANDBOX_REQUEST]);
        let again = refresh_at(&mut shell, slot, 1100);
        assert!(!again.attention);
        assert!(again.raised.is_empty());
    });
}

#[test]
fn a_failure_asks_for_attention() {
    drive(|harness| async move {
        harness.refuse(LaunchError::Spawn(ErrorKind::NotFound));
        let mut shell = harness.shell();
        let (launch, _runtime) = harness.launch("broken");
        let slot = shell.open(launch);
        let refresh = settle(&mut shell, slot).await;
        assert!(refresh.attention);
        assert!(refresh.raised.is_empty());
        let again = refresh_at(&mut shell, slot, 10);
        assert!(!again.attention, "the same failure asks once");
    });
}

#[test]
fn eight_live_slots_refuse_a_ninth_start_and_a_restart() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let live = running_slots(&mut shell, &harness, 8).await;
        assert!(shell.slots_full());

        shell.act(ShellAction::OpenNewSession);
        shell.act(ShellAction::EditFolder {
            text: r"C:\work\proj".to_owned(),
        });
        shell.act(ShellAction::StartSession {
            folder: r"C:\work\proj".to_owned(),
        });
        let acted = shell.act(ShellAction::FolderChecked {
            folder: r"C:\work\proj".to_owned(),
            exists: true,
        });
        assert!(acted.started.is_none());
        assert_eq!(shell.slots().len(), 8);
        assert!(shell.new_session().is_some(), "the dialog stays open");
        // The open dialog holds back a Restart and a close; the rest of the test needs both.
        shell.act(ShellAction::CancelNewSession);

        harness.control(7).await;
        harness.refuse(LaunchError::Spawn(ErrorKind::NotFound));
        let ninth = shell.open(relaunchable(&harness, "ninth"));
        settle(&mut shell, ninth).await;
        assert!(matches!(
            shell.status(ninth),
            Some(SessionStatus::Failed(_))
        ));
        assert!(shell.restart_blocked(ninth));
        assert!(!shell.can_restart(ninth));
        let refused = shell.act(ShellAction::Restart { slot: ninth });
        assert!(refused.started.is_none());

        let (first, _) = &live[0];
        shell.act(ShellAction::CloseSlot { slot: *first });
        settle(&mut shell, *first).await;
        assert!(!shell.slots_full());
        assert!(!shell.restart_blocked(ninth));
        assert!(shell.can_restart(ninth));
    });
}

#[test]
fn closing_a_waiting_slot_asks_first() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, _control, _runtime) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        shell.act(ShellAction::CloseSlot { slot });
        assert_eq!(
            shell.slot_close(),
            Some((
                slot,
                CloseQuestion {
                    working: 1,
                    drafts: 0
                }
            ))
        );
        assert!(!shell.slots()[0].closing);
    });
}

#[test]
fn closing_the_window_counts_a_waiting_slot_as_working() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        shell.act(ShellAction::RequestClose);
        assert_eq!(
            shell.close_stage(),
            &CloseStage::Asking(CloseQuestion {
                working: 1,
                drafts: 0
            })
        );
    });
}

#[test]
fn closing_the_window_does_not_count_a_slot_already_closing() {
    drive(|harness| async move {
        harness.stubborn();
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("slot");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let control = harness.control(0).await;
        control.emit(&support::can_use_tool("R1", "ls"));
        waits_on(&runtime, 1).await;
        refresh_at(&mut shell, slot, 0);
        shell.act(ShellAction::CloseSlot { slot });
        shell.act(ShellAction::ConfirmCloseSlot);
        assert!(shell.slots()[0].closing, "its run has not returned");
        let acted = shell.act(ShellAction::RequestClose);
        assert_eq!(shell.close_stage(), &CloseStage::Closing);
        assert!(acted.close);
    });
}

#[test]
fn a_window_close_replaces_the_slot_close_question() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (slot, _control, _runtime) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 1000).await;
        shell.act(ShellAction::CloseSlot { slot });
        assert!(shell.slot_close().is_some());
        shell.act(ShellAction::RequestClose);
        assert_eq!(shell.slot_close(), None);
        assert!(matches!(shell.close_stage(), CloseStage::Asking(_)));
    });
}

#[test]
fn closing_a_working_slot_asks_first() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let live = running_slots(&mut shell, &harness, 8).await;
        let (first, second) = (live[0].0, live[1].0);
        assert_eq!(shell.selected(), Some(first));
        type_in(&mut shell, first, "unsent");

        shell.act(ShellAction::CloseSlot { slot: first });
        let question = CloseQuestion {
            working: 0,
            drafts: 1,
        };
        assert_eq!(shell.slot_close(), Some((first, question)));
        shell.act(ShellAction::CancelCloseSlot);
        assert_eq!(shell.slot_close(), None);
        assert_eq!(shell.slots().len(), 8);

        shell.act(ShellAction::CloseSlot { slot: first });
        shell.act(ShellAction::ConfirmCloseSlot);
        assert_eq!(shell.slot_close(), None);
        assert!(shell.slots()[0].closing);
        assert!(shell.slots_full(), "a slot that is closing still counts");

        let last = settle(&mut shell, first).await;
        assert!(last.removed);
        assert!(shell.slots().iter().all(|it| it.id != first));
        assert_eq!(shell.selected(), Some(second));
        assert!(!shell.slots_full());
    });
}

#[test]
fn closing_an_idle_slot_closes_at_once() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let live = running_slots(&mut shell, &harness, 1).await;
        let slot = live[0].0;
        shell.act(ShellAction::CloseSlot { slot });
        assert_eq!(shell.slot_close(), None, "nothing to ask");
        assert!(shell.slots()[0].closing);
        let last = settle(&mut shell, slot).await;
        assert!(last.removed);
        assert!(shell.slots().is_empty());
        assert_eq!(shell.selected(), None);
    });
}

#[test]
fn closing_an_ended_slot_removes_it_at_once() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("slot");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let control = harness.control(0).await;
        control.exit(0);
        settle(&mut shell, slot).await;
        assert!(shell.ended(slot));
        let acted = shell.act(ShellAction::CloseSlot { slot });
        assert_eq!(acted.removed, vec![slot]);
        assert!(shell.slots().is_empty());
        until(|| shell.live_runs() == 0).await;
    });
}
