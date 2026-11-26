#![allow(clippy::expect_used, clippy::unwrap_used)]
//! Closing the window over sessions made of in-memory processes: when it asks, how it waits for
//! every run (a replaced one too), and the kill that ends a close that does not end.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::sync::Arc;
use std::time::{Duration, Instant};

use closta_session::launch::{SessionLaunch, SessionLaunchPlanner};
use closta_session::status::SessionFailure;
use closta_shell::closing::{
    CLOSE_LIMIT, CloseEnd, CloseQuestion, CloseStage, DESTROY_GRACE, finish_closing,
};
use closta_shell::slot::SlotLaunch;
use closta_shell::state::{ShellAction, ShellState};
use futures_lite::future;
use smol::Timer;
use support::{Harness, drive, running, until};

/// A planner whose plan never ends.
struct Planning;

impl SessionLaunchPlanner for Planning {
    fn plan(
        &self,
        _session_id: &str,
        _working_directory: Option<&str>,
    ) -> future::Boxed<Result<SessionLaunch, SessionFailure>> {
        Box::pin(future::pending())
    }
}

/// A shell with `n` slots whose sessions run, and the processes' controls.
async fn running_slots(harness: &Harness, n: usize) -> ShellState {
    let mut shell = harness.shell();
    for _ in 0..n {
        let (launch, runtime) = harness.launch("slot");
        shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
    }
    shell
}

#[test]
fn closing_asks_only_when_a_session_works_or_a_draft_waits() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        assert_eq!(shell.close_stage(), &CloseStage::Open);
        let acted = shell.act(ShellAction::RequestClose);
        assert!(acted.close);
        assert_eq!(shell.close_stage(), &CloseStage::Closing);

        let mut shell = harness.shell();
        let (launch, _) = harness.launch("slot");
        let slot = shell.open(launch);
        shell.act(ShellAction::EditDraft {
            slot,
            text: "unsent".to_owned(),
        });
        let acted = shell.act(ShellAction::RequestClose);
        assert!(!acted.close);
        assert_eq!(
            shell.close_stage(),
            &CloseStage::Asking(CloseQuestion {
                working: 0,
                drafts: 1
            })
        );
        shell.act(ShellAction::CancelClose);
        assert_eq!(shell.close_stage(), &CloseStage::Open);

        shell.act(ShellAction::RequestClose);
        let acted = shell.act(ShellAction::ConfirmClose);
        assert!(acted.close);
        assert_eq!(shell.close_stage(), &CloseStage::Closing);

        let mut shell = harness.shell();
        let (launch, _) = harness.launch("slot");
        shell.open(launch);
        let acted = shell.act(ShellAction::ConfirmClose);
        assert!(acted.close, "a confirmation from Open closes at once");
    });
}

#[test]
fn closing_with_no_slots_ends_at_once() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let end = future::or(
            finish_closing(shell.close_all(), CLOSE_LIMIT, DESTROY_GRACE),
            async {
                Timer::after(Duration::from_millis(100)).await;
                panic!("the close with no slots did not end at once")
            },
        )
        .await;
        assert_eq!(end, CloseEnd::Returned);
    });
}

#[test]
fn a_slot_closed_while_it_plans_returns_at_once() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        shell.open(SlotLaunch {
            title: "planning".to_owned(),
            planner: Arc::new(Planning),
            working_directory: None,
            companion: None,
            relaunch: None,
            project: None,
            settles_on_failure: false,
        });
        assert_eq!(shell.live_runs(), 1);
        let end = future::or(
            finish_closing(shell.close_all(), CLOSE_LIMIT, DESTROY_GRACE),
            async {
                Timer::after(Duration::from_secs(1)).await;
                panic!("a close while planning did not return within a second")
            },
        )
        .await;
        assert_eq!(end, CloseEnd::Returned);
        assert_eq!(shell.live_runs(), 0);
    });
}

#[test]
fn close_all_waits_for_every_run() {
    drive(|harness| async move {
        let mut shell = running_slots(&harness, 2).await;
        assert_eq!(shell.live_runs(), 2);
        let end = finish_closing(shell.close_all(), CLOSE_LIMIT, DESTROY_GRACE).await;
        assert_eq!(end, CloseEnd::Returned);
        assert_eq!(shell.live_runs(), 0);
    });
}

#[test]
fn a_replaced_run_is_counted_until_it_returns() {
    drive(|harness| async move {
        harness.stubborn();
        let mut shell = running_slots(&harness, 1).await;
        let first = harness.control(0).await;
        let slot = shell.slots()[0].id;
        let (launch, _) = harness.launch("next");
        shell.replace(slot, launch).unwrap();
        assert_eq!(shell.live_runs(), 2, "the replaced run has not returned");

        first.exit(0);
        until(|| shell.live_runs() == 1).await;
    });
}

#[test]
fn a_close_that_overruns_destroys_every_process_and_ends() {
    drive(|harness| async move {
        harness.stubborn();
        let mut shell = running_slots(&harness, 2).await;
        let slot = shell.slots()[0].id;
        let (launch, runtime) = harness.launch("next");
        shell.replace(slot, launch).unwrap();
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        assert_eq!(shell.live_runs(), 3);

        let started = Instant::now();
        let end = finish_closing(
            shell.close_all(),
            Duration::from_millis(200),
            Duration::from_secs(2),
        )
        .await;
        assert_eq!(end, CloseEnd::Destroyed);
        assert!(started.elapsed() < Duration::from_secs(2));
        for n in 0..3 {
            assert!(harness.control(n).await.force_kills() >= 1, "process {n}");
        }
        assert_eq!(shell.live_runs(), 0);
    });
}

#[test]
fn closing_twice_does_nothing_more() {
    drive(|harness| async move {
        let mut shell = running_slots(&harness, 1).await;
        let acted = shell.act(ShellAction::ConfirmClose);
        assert!(acted.close);
        for action in [
            ShellAction::RequestClose,
            ShellAction::ConfirmClose,
            ShellAction::CancelClose,
        ] {
            let acted = shell.act(action);
            assert!(!acted.close);
            assert_eq!(shell.close_stage(), &CloseStage::Closing);
        }
    });
}

#[test]
fn nothing_starts_or_sends_once_the_close_began() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (mut launch, runtime) = harness.launch("slot");
        launch.relaunch = Some(Arc::new({
            let planner = Arc::clone(&harness.planner);
            move || SlotLaunch {
                title: "again".to_owned(),
                planner: Arc::clone(&planner) as _,
                working_directory: None,
                companion: None,
                relaunch: None,
                project: None,
                settles_on_failure: false,
            }
        }));
        let slot = shell.open(launch);
        running(&runtime.recv().await.unwrap()).await;
        let control = harness.control(0).await;
        shell.act(ShellAction::OpenNewSession);
        shell.act(ShellAction::EditFolder {
            text: r"C:\work\proj".to_owned(),
        });
        shell.act(ShellAction::EditDraft {
            slot,
            text: "late".to_owned(),
        });
        let started = shell.act(ShellAction::StartSession {
            folder: r"C:\work\proj".to_owned(),
        });
        assert!(started.check.is_some(), "the dialog was ready to check");

        assert!(shell.act(ShellAction::ConfirmClose).close);
        let run = shell.close_all();
        let runs = shell.live_runs();
        for action in [
            ShellAction::Restart { slot },
            ShellAction::StartSession {
                folder: r"C:\work\proj".to_owned(),
            },
            ShellAction::OpenNewSession,
            ShellAction::FolderChecked {
                folder: r"C:\work\proj".to_owned(),
                exists: true,
            },
            ShellAction::Send { slot },
        ] {
            let acted = shell.act(action);
            assert!(acted.started.is_none() && acted.check.is_none() && acted.draft.is_none());
        }
        assert_eq!(shell.slots().len(), 1);
        assert_eq!(shell.live_runs(), runs);
        assert!(control.stdin_lines().is_empty());
        let end = finish_closing(run, CLOSE_LIMIT, DESTROY_GRACE).await;
        assert_eq!(end, CloseEnd::Returned);
        assert_eq!(shell.live_runs(), 0);
    });
}
