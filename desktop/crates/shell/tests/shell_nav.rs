#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The left pane's cursor: where Alt+1 puts it, how the arrows and Enter move and open, and
//! how it holds when rows come and go, over in-memory processes and captures.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::io::ErrorKind;

use closta_providers::claude::launch::LaunchError;
use closta_session::runtime::SessionRuntime;
use closta_session::status::SessionStatus;
use closta_shell::nav::NavItem;
use closta_shell::projects::{ProjectKey, project_key};
use closta_shell::settings::{SETTINGS_VERSION, SavedProject, Settings};
use closta_shell::slot::{SlotId, SlotLaunch};
use closta_shell::state::{FocusTarget, ShellAction, ShellState};
use support::{Harness, drive, running, until, waiting_slot};

const FOLDER: &str = r"C:\work\closta";
const SANDBOX: &str = "36-sandbox-unavailable.ndjson";
const SANDBOX_ASK: usize = 31;
const SANDBOX_REQUEST: &str = "b4635f8c-7b16-4eac-9934-9ca6b3b1373f";

fn key(folder: &str) -> ProjectKey {
    project_key(folder).unwrap()
}

fn refresh(shell: &mut ShellState, slot: SlotId, now_ms: i64) {
    let generation = shell.watch(slot).unwrap().generation();
    shell.refresh(slot, generation, now_ms).unwrap();
}

/// A live slot in `folder`; its process is awaited, so the next slot may open.
async fn live_in(shell: &mut ShellState, harness: &Harness, folder: &str, n: usize) -> SlotId {
    let slot = shell.open(harness.folder_launch(folder));
    harness.control(n).await;
    slot
}

fn cursor(shell: &ShellState) -> Option<NavItem> {
    shell.nav_cursor().cloned()
}

fn collapsed(shell: &ShellState) -> bool {
    shell.projects()[0].collapsed
}

#[test]
fn alt_one_puts_the_cursor_on_the_selected_slot() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let first = live_in(&mut shell, &harness, FOLDER, 0).await;
        let second = live_in(&mut shell, &harness, FOLDER, 1).await;
        shell.act(ShellAction::Select(second));
        let acted = shell.act(ShellAction::NavFocus);
        assert_eq!(acted.focus, Some(FocusTarget::Nav));
        assert_eq!(cursor(&shell), Some(NavItem::Slot(second)));
        shell.act(ShellAction::Select(first));
        shell.act(ShellAction::NavFocus);
        assert_eq!(cursor(&shell), Some(NavItem::Slot(first)));

        // A collapsed project hides the slot: the cursor goes to the project's row.
        shell.act(ShellAction::ToggleProject {
            project: key(FOLDER),
        });
        shell.act(ShellAction::NavFocus);
        assert_eq!(cursor(&shell), Some(NavItem::Project(key(FOLDER))));
    });
}

#[test]
fn alt_one_without_a_slot_goes_to_the_first_row() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        shell.restore_projects(&Settings {
            version: SETTINGS_VERSION,
            projects: vec![
                SavedProject {
                    folder: FOLDER.to_owned(),
                    collapsed: false,
                },
                SavedProject {
                    folder: r"C:\work\other".to_owned(),
                    collapsed: false,
                },
            ],
        });
        let acted = shell.act(ShellAction::NavFocus);
        assert_eq!(acted.focus, Some(FocusTarget::Nav));
        assert_eq!(cursor(&shell), Some(NavItem::Project(key(FOLDER))));

        let empty = harness.shell();
        let mut empty = empty;
        let acted = empty.act(ShellAction::NavFocus);
        assert_eq!(acted.focus, Some(FocusTarget::Nav));
        assert_eq!(cursor(&empty), None);
    });
}

#[test]
fn enter_on_a_needs_you_row_opens_it_and_answers_nothing() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, _quiet) = harness.launch("quiet");
        let quiet = shell.open(launch);
        let (waiting, control, _runtime) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        assert_eq!(shell.selected(), Some(quiet));
        shell.act(ShellAction::NavTo(NavItem::NeedsYou(waiting)));
        let acted = shell.act(ShellAction::NavEnter);
        assert_eq!(
            acted.focus,
            Some(FocusTarget::Card {
                slot: waiting,
                request_id: SANDBOX_REQUEST.to_owned()
            })
        );
        assert_eq!(shell.selected(), Some(waiting));
        assert_eq!(shell.needs_you().len(), 1, "the wait is still there");
        assert!(
            !control
                .stdin_lines()
                .iter()
                .any(|line| line.contains("control_response")),
            "nothing was answered"
        );
    });
}

#[test]
fn enter_on_a_project_toggles_it_and_the_arrows_open_and_close_it() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let slot = live_in(&mut shell, &harness, FOLDER, 0).await;
        let project = NavItem::Project(key(FOLDER));
        shell.act(ShellAction::NavTo(project.clone()));
        assert!(!collapsed(&shell));
        shell.act(ShellAction::NavEnter);
        assert!(collapsed(&shell));
        assert_eq!(shell.nav_rows(), std::slice::from_ref(&project));
        shell.act(ShellAction::NavEnter);
        assert!(!collapsed(&shell));
        assert_eq!(shell.nav_rows(), [project.clone(), NavItem::Slot(slot)]);

        shell.act(ShellAction::NavLeft);
        assert!(collapsed(&shell));
        shell.act(ShellAction::NavLeft);
        assert!(collapsed(&shell), "closing a closed project does nothing");
        shell.act(ShellAction::NavRight);
        assert!(!collapsed(&shell));
        shell.act(ShellAction::NavRight);
        assert!(!collapsed(&shell));
        assert_eq!(cursor(&shell), Some(project));
    });
}

#[test]
fn left_on_a_slot_goes_to_its_project() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let slot = live_in(&mut shell, &harness, FOLDER, 0).await;
        shell.act(ShellAction::NavTo(NavItem::Slot(slot)));
        shell.act(ShellAction::NavLeft);
        assert_eq!(cursor(&shell), Some(NavItem::Project(key(FOLDER))));
        assert!(!collapsed(&shell), "going to the project does not close it");

        let (launch, _runtime) = harness.launch("loose");
        let loose = shell.open(launch);
        shell.act(ShellAction::NavTo(NavItem::Slot(loose)));
        shell.act(ShellAction::NavLeft);
        assert_eq!(
            cursor(&shell),
            Some(NavItem::Slot(loose)),
            "no project to go to"
        );
    });
}

async fn end(shell: &mut ShellState, slot: SlotId) {
    let mut watch = shell.watch(slot).unwrap();
    while watch.changed().await {}
    shell.refresh(slot, watch.generation(), 0).unwrap();
}

fn in_project(
    launch: (SlotLaunch, async_channel::Receiver<SessionRuntime>),
) -> (SlotLaunch, async_channel::Receiver<SessionRuntime>) {
    let (mut launch, runtime) = launch;
    launch.project = Some(FOLDER.to_owned());
    (launch, runtime)
}

#[test]
fn enter_on_a_slot_goes_where_the_slot_can_be_used() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        harness.refuse(LaunchError::Spawn(ErrorKind::NotFound));
        let (launch, _runtime) = in_project(harness.launch("failed"));
        let failed = shell.open(launch);
        end(&mut shell, failed).await;
        assert!(matches!(
            shell.status(failed),
            Some(SessionStatus::Failed(_))
        ));

        let (launch, runtime) = in_project(harness.launch("ended"));
        let ended = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        harness.control(0).await.exit(0);
        end(&mut shell, ended).await;
        assert!(shell.ended(ended));

        let live = live_in(&mut shell, &harness, FOLDER, 1).await;
        shell.act(ShellAction::Select(live));

        let go = |shell: &mut ShellState, slot: SlotId| {
            shell.act(ShellAction::NavTo(NavItem::Slot(slot)));
            shell.act(ShellAction::NavEnter)
        };
        let acted = go(&mut shell, failed);
        assert_eq!(acted.focus, Some(FocusTarget::FailureBand(failed)));
        assert_eq!(shell.selected(), Some(failed));
        let acted = go(&mut shell, ended);
        assert_eq!(acted.focus, Some(FocusTarget::EndedBand(ended)));
        assert_eq!(shell.selected(), Some(ended));
        let acted = go(&mut shell, live);
        assert_eq!(acted.focus, Some(FocusTarget::Composer(live)));
        assert_eq!(shell.selected(), Some(live));
    });
}

#[test]
fn the_cursor_survives_an_answered_wait() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (first, _control, _runtime) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        let (second, _control, runtime) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        assert_eq!(
            shell.nav_rows(),
            [
                NavItem::NeedsYou(first),
                NavItem::NeedsYou(second),
                NavItem::Slot(first),
                NavItem::Slot(second)
            ]
        );
        shell.act(ShellAction::NavTo(NavItem::NeedsYou(second)));
        assert_eq!(cursor(&shell), Some(NavItem::NeedsYou(second)));

        shell.act(ShellAction::ListShown {
            slot: second,
            request_id: SANDBOX_REQUEST.to_owned(),
            index: 1,
            now_ms: 1000,
        });
        shell.act(ShellAction::AllowFromList {
            slot: second,
            request_id: SANDBOX_REQUEST.to_owned(),
            now_ms: 1500,
        });
        until(|| runtime.view().conversation.pending_approvals.is_empty()).await;
        refresh(&mut shell, second, 2000);
        assert_eq!(shell.needs_you().len(), 1, "the answered row went");
        assert_eq!(
            cursor(&shell),
            Some(NavItem::Slot(first)),
            "the same place, number 1, now holds the next item"
        );
    });
}

#[test]
fn nav_actions_do_nothing_behind_an_overlay() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let slot = live_in(&mut shell, &harness, FOLDER, 0).await;
        let project = NavItem::Project(key(FOLDER));
        shell.act(ShellAction::NavTo(project.clone()));
        shell.act(ShellAction::OpenNewSession);
        let actions = [
            ShellAction::NavFocus,
            ShellAction::NavMove { delta: 1 },
            ShellAction::NavTo(NavItem::Slot(slot)),
            ShellAction::NavEnter,
            ShellAction::NavLeft,
            ShellAction::NavRight,
        ];
        for action in actions {
            let acted = shell.act(action.clone());
            assert!(acted.focus.is_none(), "{action:?}");
            assert_eq!(cursor(&shell), Some(project.clone()), "{action:?}");
            assert!(!collapsed(&shell), "{action:?}");
        }
    });
}
