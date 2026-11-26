#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The project row's plus: the folder is looked for in the background, and a session starts in
//! it at once when it is found; every answer that comes too late starts nothing.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::sync::Arc;

use closta_shell::new_session::Problem;
use closta_shell::projects::{ProjectKey, project_key};
use closta_shell::settings::{SETTINGS_VERSION, SavedProject, Settings};
use closta_shell::state::{Overlay, ShellAction, ShellState};
use support::{Harness, Planners, drive, running};

const A: &str = r"C:\work\alpha";
const B: &str = r"C:\work\beta";

fn key(folder: &str) -> ProjectKey {
    project_key(folder).unwrap()
}

fn settings_of(folders: &[&str]) -> Settings {
    Settings {
        version: SETTINGS_VERSION,
        projects: folders
            .iter()
            .map(|folder| SavedProject {
                folder: (*folder).to_owned(),
                collapsed: false,
            })
            .collect(),
    }
}

/// A shell with the folders as projects and no slot, and the planners it asks.
fn shell_of(harness: &Harness, folders: &[&str]) -> (ShellState, Arc<Planners>) {
    let planners = Arc::new(Planners::new(Arc::clone(&harness.planner) as _));
    let mut ports = harness.ports();
    ports.planner_for = Arc::clone(&planners) as _;
    let mut shell = harness.shell_with(ports);
    shell.restore_projects(&settings_of(folders));
    (shell, planners)
}

fn plus(shell: &mut ShellState, folder: &str) -> closta_shell::state::Acted {
    shell.act(ShellAction::NewInProject {
        project: key(folder),
    })
}

fn answer(shell: &mut ShellState, folder: &str, exists: bool) -> closta_shell::state::Acted {
    shell.act(ShellAction::ProjectChecked {
        project: key(folder),
        exists,
    })
}

fn summary(shell: &ShellState, folder: &str) -> closta_shell::state::ProjectSummary {
    shell
        .projects()
        .into_iter()
        .find(|it| it.key == key(folder))
        .expect("the project")
}

/// Opens `n` live slots outside any project, one after the other.
async fn fill(shell: &mut ShellState, harness: &Harness, n: usize) {
    for _ in 0..n {
        let (launch, runtime) = harness.launch("slot");
        shell.open(launch);
        running(&runtime.recv().await.unwrap()).await;
    }
}

#[test]
fn plus_checks_the_folder_and_starts_at_once() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A]);
        let acted = plus(&mut shell, A);
        let check = acted.project_check.expect("a check");
        assert_eq!(check.project, key(A));
        assert!(check.exists.await);
        assert!(summary(&shell, A).checking);
        assert!(!summary(&shell, A).can_add);
        assert!(shell.slots().is_empty());

        let acted = answer(&mut shell, A, true);
        let slot = acted.started.expect("a slot");
        assert_eq!(shell.slots().len(), 1);
        assert_eq!(shell.selected(), Some(slot));
        assert_eq!(shell.project_of(slot), Some(&key(A)));
        assert!(shell.new_session().is_none());
        assert!(!summary(&shell, A).checking);
        assert!(summary(&shell, A).can_add);
    });
}

#[test]
fn plus_on_a_folder_with_a_quick_problem_opens_the_dialog_with_it() {
    drive(|harness| async move {
        let wsl = r"\\wsl.localhost\Debian\home\x";
        let (mut shell, _) = shell_of(&harness, &[wsl]);
        let acted = plus(&mut shell, wsl);
        assert!(acted.project_check.is_none());
        assert!(acted.folder);
        let dialog = shell.new_session().expect("the dialog");
        assert_eq!(dialog.folder, wsl);
        assert_eq!(
            dialog.problem,
            Some(Problem::DistroMissing("Debian".into()))
        );
        assert!(!summary(&shell, wsl).checking);
    });
}

#[test]
fn plus_on_a_missing_folder_opens_the_dialog_saying_so() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A]);
        plus(&mut shell, A);
        let acted = answer(&mut shell, A, false);
        assert!(acted.started.is_none());
        assert!(acted.folder);
        assert!(shell.slots().is_empty());
        let dialog = shell.new_session().expect("the dialog");
        assert_eq!(dialog.folder, A);
        assert_eq!(dialog.problem, Some(Problem::FolderMissing));
        assert!(!summary(&shell, A).checking);
    });
}

#[test]
fn a_second_plus_while_one_is_checked_does_nothing() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A, B]);
        assert!(plus(&mut shell, A).project_check.is_some());
        assert!(plus(&mut shell, B).project_check.is_none());
        assert!(plus(&mut shell, A).project_check.is_none());
        assert!(!summary(&shell, B).checking);
        assert!(!summary(&shell, B).can_add);
    });
}

#[test]
fn plus_is_refused_at_the_limit() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A]);
        fill(&mut shell, &harness, 8).await;
        assert!(!summary(&shell, A).can_add);
        let acted = plus(&mut shell, A);
        assert!(acted.project_check.is_none());
        assert!(!summary(&shell, A).checking);
        assert_eq!(shell.slots().len(), 8);
    });
}

#[test]
fn an_answer_for_another_project_is_dropped() {
    drive(|harness| async move {
        let (mut shell, planners) = shell_of(&harness, &[A, B]);
        plus(&mut shell, A);
        let acted = answer(&mut shell, B, true);
        assert!(acted.started.is_none());
        assert!(shell.slots().is_empty());
        assert!(summary(&shell, A).checking);
        let acted = answer(&mut shell, A, true);
        assert!(acted.started.is_some());
        assert_eq!(planners.planned(), 1);
        let stray = answer(&mut shell, A, true);
        assert!(stray.started.is_none());
        assert_eq!(shell.slots().len(), 1);
    });
}

#[test]
fn an_answer_after_the_close_began_starts_nothing() {
    drive(|harness| async move {
        let (mut shell, planners) = shell_of(&harness, &[A]);
        plus(&mut shell, A);
        let acted = shell.act(ShellAction::RequestClose);
        assert!(acted.close);
        let acted = answer(&mut shell, A, true);
        assert!(acted.started.is_none());
        assert!(shell.slots().is_empty());
        assert_eq!(shell.live_runs(), 0);
        assert_eq!(planners.planned(), 0);
        assert!(!summary(&shell, A).checking);
        assert!(plus(&mut shell, A).project_check.is_none());
        assert_eq!(planners.planned(), 0);
    });
}

#[test]
fn an_answer_while_the_close_is_asked_starts_nothing() {
    drive(|harness| async move {
        let (mut shell, planners) = shell_of(&harness, &[A]);
        let (launch, runtime) = harness.launch("slot");
        let slot = shell.open(launch);
        running(&runtime.recv().await.unwrap()).await;
        plus(&mut shell, A);
        shell.act(ShellAction::EditDraft {
            slot,
            text: "unsent".to_owned(),
        });
        let acted = shell.act(ShellAction::RequestClose);
        assert!(!acted.close);
        assert_eq!(shell.overlay(), Some(Overlay::CloseWindow));
        let acted = answer(&mut shell, A, true);
        assert!(acted.started.is_none());
        assert_eq!(shell.slots().len(), 1);
        assert_eq!(planners.planned(), 0);
        assert!(!summary(&shell, A).checking);
    });
}

#[test]
fn removing_a_project_being_checked_drops_its_answer() {
    drive(|harness| async move {
        let (mut shell, planners) = shell_of(&harness, &[A]);
        plus(&mut shell, A);
        shell.act(ShellAction::RemoveProject { project: key(A) });
        assert!(shell.projects().is_empty());
        let acted = answer(&mut shell, A, true);
        assert!(acted.started.is_none());
        assert!(shell.slots().is_empty());
        assert!(shell.projects().is_empty());
        assert_eq!(planners.planned(), 0);
        let acted = answer(&mut shell, A, false);
        assert!(!acted.folder);
        assert!(shell.new_session().is_none());
    });
}

#[test]
fn an_answer_when_the_slots_filled_meanwhile_starts_nothing() {
    drive(|harness| async move {
        let (mut shell, planners) = shell_of(&harness, &[A]);
        plus(&mut shell, A);
        fill(&mut shell, &harness, 8).await;
        let acted = answer(&mut shell, A, true);
        assert!(acted.started.is_none());
        assert_eq!(shell.slots().len(), 8);
        assert_eq!(planners.planned(), 0);
        assert!(!summary(&shell, A).checking);
    });
}

#[test]
fn a_missing_folder_behind_another_overlay_only_ends_the_check() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A, B]);
        plus(&mut shell, A);
        shell.act(ShellAction::OpenNewSession);
        shell.act(ShellAction::EditFolder { text: B.to_owned() });
        let acted = answer(&mut shell, A, false);
        assert!(!acted.folder);
        let dialog = shell.new_session().expect("the dialog");
        assert_eq!(dialog.folder, B);
        assert_eq!(dialog.problem, None);
        assert!(!summary(&shell, A).checking);
    });
}

#[test]
fn plus_is_refused_behind_an_overlay() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A]);
        shell.act(ShellAction::OpenNewSession);
        let acted = plus(&mut shell, A);
        assert!(acted.project_check.is_none());
        assert!(!summary(&shell, A).checking);
        assert_eq!(shell.overlay(), Some(Overlay::NewSession));
    });
}
