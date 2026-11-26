#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The left pane's cursor: where Alt+1 puts it, how the arrows and Enter move and open, and
//! how it holds when rows come and go, over in-memory processes and captures.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::io::ErrorKind;
use std::sync::Arc;

use closta_providers::claude::launch::LaunchError;
use closta_session::runtime::SessionRuntime;
use closta_session::status::SessionStatus;
use closta_shell::nav::NavItem;
use closta_shell::new_session::{ClaudeOnPath, Problem};
use closta_shell::projects::{ProjectKey, project_key};
use closta_shell::settings::{SETTINGS_VERSION, SavedProject, Settings};
use closta_shell::slot::{SlotId, SlotLaunch};
use closta_shell::state::{FocusTarget, Overlay, Ports, ShellAction, ShellState};
use support::{Harness, Machine, drive, running, until, waiting_slot};

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

const SIX: fn(SlotId) -> [ShellAction; 6] = |slot| {
    [
        ShellAction::NavFocus,
        ShellAction::NavMove { delta: 1 },
        ShellAction::NavTo(NavItem::Slot(slot)),
        ShellAction::NavEnter,
        ShellAction::NavLeft,
        ShellAction::NavRight,
    ]
};

#[test]
fn nav_actions_do_nothing_behind_an_overlay() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let slot = live_in(&mut shell, &harness, FOLDER, 0).await;
        let project = NavItem::Project(key(FOLDER));
        shell.act(ShellAction::NavTo(project.clone()));
        shell.act(ShellAction::ToggleProject {
            project: key(FOLDER),
        });
        assert!(collapsed(&shell));
        // Each overlay in turn: the new-session dialog, then the window's close question.
        shell.act(ShellAction::OpenNewSession);
        assert!(shell.overlay().is_some());
        for round in 0..2 {
            for action in SIX(slot) {
                let acted = shell.act(action.clone());
                assert!(acted.focus.is_none(), "{action:?}");
                assert_eq!(cursor(&shell), Some(project.clone()), "{action:?}");
                assert!(collapsed(&shell), "{action:?}");
            }
            if round == 0 {
                shell.act(ShellAction::CancelNewSession);
                shell.act(ShellAction::EditDraft {
                    slot,
                    text: "unsent".to_owned(),
                });
                shell.act(ShellAction::RequestClose);
                assert_eq!(shell.overlay(), Some(Overlay::CloseWindow));
            }
        }
    });
}

#[test]
fn nav_actions_do_nothing_once_the_window_is_closing() {
    drive(|harness| async move {
        let (mut shell, settings) = harness.shell_recording();
        let (quiet, _runtime) = harness.launch("quiet");
        let quiet = shell.open(quiet);
        let (waiting, _control, _runtime) =
            waiting_slot(&mut shell, &harness, SANDBOX, SANDBOX_ASK, 0).await;
        let saves = settings.saves().len();
        shell.act(ShellAction::NavTo(NavItem::NeedsYou(waiting)));
        shell.act(ShellAction::RequestClose);
        assert!(shell.act(ShellAction::ConfirmClose).close);
        assert_eq!(shell.overlay(), Some(Overlay::Closing));
        for action in SIX(quiet) {
            let acted = shell.act(action.clone());
            assert!(acted.focus.is_none(), "{action:?}");
            assert_eq!(
                cursor(&shell),
                Some(NavItem::NeedsYou(waiting)),
                "{action:?}"
            );
            assert_eq!(shell.selected(), Some(quiet), "{action:?}");
        }
        assert_eq!(settings.saves().len(), saves, "no settings write");
    });
}

#[test]
fn nav_keys_do_not_change_a_project_once_the_window_is_closing() {
    drive(|harness| async move {
        let (mut shell, settings) = harness.shell_recording();
        let slot = live_in(&mut shell, &harness, FOLDER, 0).await;
        shell.act(ShellAction::NavTo(NavItem::Project(key(FOLDER))));
        let saves = settings.saves().len();
        assert!(shell.act(ShellAction::RequestClose).close);
        // Enter and Left would fold the project; they come first, before anything moves the cursor.
        for action in [ShellAction::NavEnter, ShellAction::NavLeft] {
            shell.act(action.clone());
            assert!(!collapsed(&shell), "{action:?}");
        }
        for action in SIX(slot) {
            shell.act(action);
        }
        assert_eq!(settings.saves().len(), saves);
    });
}

#[test]
fn a_cursor_whose_slot_was_folded_away_by_an_action_takes_the_same_place() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let other = r"C:\work\other";
        let first = live_in(&mut shell, &harness, FOLDER, 0).await;
        live_in(&mut shell, &harness, other, 1).await;
        shell.act(ShellAction::NavTo(NavItem::Slot(first)));
        // [project A, its slot, project B, its slot]: the cursor is at 1.
        shell.act(ShellAction::ToggleProject {
            project: key(FOLDER),
        });
        assert_eq!(
            cursor(&shell),
            Some(NavItem::Project(key(other))),
            "number 1 of [A, B, B's slot]"
        );
    });
}

#[test]
fn the_cursor_follows_its_row_when_a_slot_opens() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, _runtime) = harness.launch("loose");
        let loose = shell.open(launch);
        shell.act(ShellAction::NavTo(NavItem::Slot(loose)));
        // Rows: [loose]. A slot in a new project pushes the row down by two.
        let made = live_in(&mut shell, &harness, FOLDER, 0).await;
        assert_eq!(
            shell.nav_rows(),
            [
                NavItem::Project(key(FOLDER)),
                NavItem::Slot(made),
                NavItem::Slot(loose)
            ]
        );
        shell.act(ShellAction::NavMove { delta: -1 });
        assert_eq!(cursor(&shell), Some(NavItem::Slot(made)));
    });
}

#[test]
fn ctrl_n_fills_the_folder_of_the_selected_slot_s_project() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let other = r"C:\work\other";
        let first = live_in(&mut shell, &harness, FOLDER, 0).await;
        live_in(&mut shell, &harness, other, 1).await;
        shell.act(ShellAction::Select(first));
        let acted = shell.act(ShellAction::OpenNewSessionHere);
        assert!(acted.folder);
        assert_eq!(shell.overlay(), Some(Overlay::NewSession));
        assert_eq!(shell.new_session().unwrap().folder, FOLDER);
        assert!(
            !shell.act(ShellAction::OpenNewSessionHere).folder,
            "open already"
        );
        shell.act(ShellAction::CancelNewSession);

        // The selection wins over the cursor.
        shell.act(ShellAction::NavTo(NavItem::Project(key(other))));
        shell.act(ShellAction::OpenNewSessionHere);
        assert_eq!(shell.new_session().unwrap().folder, FOLDER);
        shell.act(ShellAction::CancelNewSession);

        // No selection: the project under the cursor, or the parent of the slot under it.
        let mut shell = harness.shell();
        shell.restore_projects(&Settings {
            version: SETTINGS_VERSION,
            projects: vec![
                SavedProject {
                    folder: FOLDER.to_owned(),
                    collapsed: false,
                },
                SavedProject {
                    folder: other.to_owned(),
                    collapsed: false,
                },
            ],
        });
        assert_eq!(shell.selected(), None);
        shell.act(ShellAction::NavTo(NavItem::Project(key(other))));
        shell.act(ShellAction::OpenNewSessionHere);
        assert_eq!(shell.new_session().unwrap().folder, other);
        shell.act(ShellAction::CancelNewSession);

        // A cursor on a slot stands for the slot's project.
        let mut shell = harness.shell();
        let under = live_in(&mut shell, &harness, other, 2).await;
        shell.act(ShellAction::NavTo(NavItem::Slot(under)));
        shell.act(ShellAction::OpenNewSessionHere);
        assert_eq!(shell.new_session().unwrap().folder, other);

        // Neither a selection nor a cursor: an empty field.
        let mut bare = harness.shell();
        bare.act(ShellAction::OpenNewSessionHere);
        assert_eq!(bare.new_session().unwrap().folder, "");
    });
}

#[test]
fn ctrl_n_is_refused_behind_an_overlay_and_while_closing() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        live_in(&mut shell, &harness, FOLDER, 0).await;
        shell.act(ShellAction::EditDraft {
            slot: shell.selected().unwrap(),
            text: "unsent".to_owned(),
        });
        shell.act(ShellAction::RequestClose);
        assert_eq!(shell.overlay(), Some(Overlay::CloseWindow));
        assert!(!shell.act(ShellAction::OpenNewSessionHere).folder);
        assert!(shell.new_session().is_none());
        assert!(shell.act(ShellAction::ConfirmClose).close);
        assert_eq!(shell.overlay(), Some(Overlay::Closing));
        assert!(!shell.act(ShellAction::OpenNewSessionHere).folder);
        assert!(shell.new_session().is_none());
    });
}

#[test]
fn ctrl_n_shows_a_quick_problem_of_the_folder_it_fills() {
    drive(|harness| async move {
        let ports = Ports {
            checks: Arc::new(Machine {
                claude: ClaudeOnPath::Missing,
                ..Machine::default()
            }),
            ..harness.ports()
        };
        let mut shell = harness.shell_with(ports);
        live_in(&mut shell, &harness, FOLDER, 0).await;
        shell.act(ShellAction::OpenNewSessionHere);
        let dialog = shell.new_session().unwrap();
        assert_eq!(dialog.folder, FOLDER);
        assert_eq!(dialog.problem, Some(Problem::ClaudeMissing));
        assert!(!dialog.checking);
    });
}
