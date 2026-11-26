#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The projects of the shell: made by the folders sessions open in, kept in order, opened and
//! closed by hand, saved to the settings and restored at startup.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use closta_session::status::SessionStatus;
use closta_shell::projects::{Project, project_key};
use closta_shell::settings::{
    SETTINGS_VERSION, SavedProject, Settings, SettingsSink, sink_for_run,
};
use closta_shell::slot::SlotId;
use closta_shell::state::{Ports, ShellAction, ShellState};
use support::{
    Harness, Machine, Planners, RecordingSettings, drive, replay_launch, running, until, waits_on,
};

const CLOSTA: &str = r"C:\work\closta";
const SANDBOX: &str = "36-sandbox-unavailable.ndjson";
const SANDBOX_ASK: usize = 31;

fn saved(folder: &str, collapsed: bool) -> SavedProject {
    SavedProject {
        folder: folder.to_owned(),
        collapsed,
    }
}

fn settings_of(projects: Vec<SavedProject>) -> Settings {
    Settings {
        version: SETTINGS_VERSION,
        projects,
    }
}

fn key(folder: &str) -> closta_shell::projects::ProjectKey {
    project_key(folder).unwrap()
}

fn toggle(shell: &mut ShellState, folder: &str) {
    shell.act(ShellAction::ToggleProject {
        project: key(folder),
    });
}

fn names(shell: &ShellState) -> Vec<String> {
    shell.projects().into_iter().map(|it| it.name).collect()
}

/// Starts a session in `folder` through the New Session dialog.
fn start_from_dialog(shell: &mut ShellState, folder: &str) -> SlotId {
    shell.act(ShellAction::OpenNewSession);
    shell.act(ShellAction::EditFolder {
        text: folder.to_owned(),
    });
    let check = shell
        .act(ShellAction::StartSession {
            folder: folder.to_owned(),
        })
        .check
        .expect("a check");
    shell
        .act(ShellAction::FolderChecked {
            folder: check.folder,
            exists: true,
        })
        .started
        .expect("a slot")
}

/// A slot in `folder` that waits on one request, refreshed.
async fn waiting_in(shell: &mut ShellState, harness: &Harness, folder: &str) -> SlotId {
    let (mut launch, _control, runtime) = replay_launch(harness, SANDBOX, SANDBOX_ASK);
    launch.project = Some(folder.to_owned());
    let slot = shell.open(launch);
    let runtime = runtime.recv().await.unwrap();
    running(&runtime).await;
    waits_on(&runtime, 1).await;
    let generation = shell.watch(slot).unwrap().generation();
    shell.refresh(slot, generation, 0).unwrap();
    slot
}

#[test]
fn a_session_in_a_folder_makes_its_project_once() {
    drive(|harness| async move {
        let (mut shell, settings) = harness.shell_recording();
        let first = shell.open(harness.folder_launch(CLOSTA));
        let second = shell.open(harness.folder_launch(CLOSTA));
        assert_eq!(shell.projects().len(), 1);
        assert_eq!(shell.project_of(first), Some(&key(CLOSTA)));
        assert_eq!(shell.project_of(second), Some(&key(CLOSTA)));
        assert_eq!(settings.saves(), [settings_of(vec![saved(CLOSTA, false)])]);
    });
}

#[test]
fn a_folder_written_another_way_joins_its_project() {
    drive(|harness| async move {
        let (mut shell, settings) = harness.shell_recording();
        shell.open(harness.folder_launch(r"C:\Work"));
        let again = shell.open(harness.folder_launch("c:/work/"));
        assert_eq!(shell.projects().len(), 1);
        assert_eq!(shell.projects()[0].name, "Work");
        assert_eq!(shell.project_of(again), Some(&key(r"C:\Work")));
        assert_eq!(
            settings.saves(),
            [settings_of(vec![saved(r"C:\Work", false)])],
            "kept as it was first written"
        );
    });
}

#[test]
fn projects_keep_the_order_they_were_made_in() {
    drive(|harness| async move {
        let (mut shell, _settings) = harness.shell_recording();
        let folders = [r"C:\w\b", r"C:\w\a", r"C:\w\c"];
        let slots: Vec<SlotId> = folders
            .iter()
            .map(|folder| shell.open(harness.folder_launch(folder)))
            .collect();
        assert_eq!(names(&shell), ["b", "a", "c"]);
        toggle(&mut shell, folders[1]);
        shell.open(harness.folder_launch(folders[0]));
        harness.control(0).await.exit(0);
        let mut watch = shell.watch(slots[0]).unwrap();
        while watch.changed().await {}
        shell.refresh(slots[0], watch.generation(), 0).unwrap();
        assert_eq!(shell.status(slots[0]), Some(SessionStatus::Ended));
        assert_eq!(names(&shell), ["b", "a", "c"]);
    });
}

#[test]
fn a_slot_without_a_folder_belongs_to_no_project() {
    drive(|harness| async move {
        let (mut shell, settings) = harness.shell_recording();
        let (launch, _runtime) = harness.launch("x");
        let slot = shell.open(launch);
        assert_eq!(shell.project_of(slot), None);
        assert!(shell.projects().is_empty());
        assert!(settings.saves().is_empty());
    });
}

#[test]
fn toggling_a_project_collapses_it_and_saves() {
    drive(|harness| async move {
        let (mut shell, settings) = harness.shell_recording();
        shell.open(harness.folder_launch(CLOSTA));
        assert!(!shell.projects()[0].collapsed);
        toggle(&mut shell, CLOSTA);
        assert!(shell.projects()[0].collapsed);
        assert_eq!(
            settings.saves().last(),
            Some(&settings_of(vec![saved(CLOSTA, true)]))
        );
        toggle(&mut shell, CLOSTA);
        assert!(!shell.projects()[0].collapsed);
        assert_eq!(
            settings.saves().last(),
            Some(&settings_of(vec![saved(CLOSTA, false)]))
        );
        assert_eq!(settings.saves().len(), 3, "the project, then two toggles");
    });
}

#[test]
fn toggling_a_project_that_is_not_there_does_nothing() {
    drive(|harness| async move {
        let (mut shell, settings) = harness.shell_recording();
        toggle(&mut shell, CLOSTA);
        assert!(shell.projects().is_empty());
        assert!(settings.saves().is_empty());
    });
}

#[test]
fn restoring_projects_writes_nothing() {
    drive(|harness| async move {
        let settings = Arc::new(RecordingSettings::default());
        let machine = Arc::new(Machine::default());
        let planners = Arc::new(Planners::new(Arc::clone(&harness.planner) as _));
        let mut shell = harness.shell_with(Ports {
            checks: Arc::clone(&machine) as _,
            planner_for: Arc::clone(&planners) as _,
            settings: Arc::clone(&settings) as _,
        });
        let restored = Settings {
            version: SETTINGS_VERSION,
            projects: vec![saved(r"C:\work\b", true), saved(CLOSTA, false)],
        };
        shell.restore_projects(&restored);
        assert!(settings.saves().is_empty());
        let shown: Vec<_> = shell
            .projects()
            .into_iter()
            .map(|it| (it.name, it.collapsed))
            .collect();
        assert_eq!(
            shown,
            [("b".to_owned(), true), ("closta".to_owned(), false)]
        );
        shell.restore_projects(&restored);
        assert_eq!(
            shell.projects().len(),
            2,
            "the same projects are not added twice"
        );
        assert!(settings.saves().is_empty());
        assert!(shell.slots().is_empty());
        assert_eq!(shell.live_runs(), 0);
        assert_eq!(machine.folder_looks(), 0);
        assert_eq!(planners.planned(), 0);
    });
}

#[test]
fn restoring_drops_what_has_no_key_or_repeats_and_keeps_the_rest() {
    drive(|harness| async move {
        let (mut shell, settings) = harness.shell_recording();
        shell.restore_projects(&Settings {
            version: SETTINGS_VERSION,
            projects: vec![
                saved("   ", false),
                saved(r"C:\Work", true),
                saved("c:/work/", false),
                saved(CLOSTA, false),
            ],
        });
        let shown: Vec<_> = shell
            .projects()
            .into_iter()
            .map(|it| (it.name, it.collapsed))
            .collect();
        assert_eq!(
            shown,
            [("Work".to_owned(), true), ("closta".to_owned(), false)]
        );
        assert!(settings.saves().is_empty());
        // What is saved next is what is kept now, so a session in a restored project writes
        // nothing and a new project writes the list as it stands.
        shell.open(harness.folder_launch(r"C:\WORK"));
        assert!(settings.saves().is_empty());
        shell.open(harness.folder_launch(r"C:\other"));
        assert_eq!(
            settings.saves(),
            [settings_of(vec![
                saved(r"C:\Work", true),
                saved(CLOSTA, false),
                saved(r"C:\other", false),
            ])]
        );
    });
}

#[test]
fn a_run_that_keeps_nothing_hands_nothing_to_the_file() {
    drive(|harness| async move {
        let restored = settings_of(vec![saved(r"C:\work\b", false)]);
        let calls = AtomicUsize::new(0);
        let recording = Arc::new(RecordingSettings::default());
        let sink = sink_for_run(false, || {
            calls.fetch_add(1, Ordering::SeqCst);
            Arc::clone(&recording) as Arc<dyn SettingsSink>
        });
        let mut ports = harness.ports();
        ports.settings = sink;
        let mut shell = harness.shell_with(ports);
        shell.restore_projects(&restored);
        shell.open(harness.folder_launch(CLOSTA));
        toggle(&mut shell, CLOSTA);
        assert_eq!(shell.projects().len(), 2);
        assert!(shell.projects()[1].collapsed);
        assert_eq!(
            calls.load(Ordering::SeqCst),
            0,
            "the file's writer is not made"
        );
        assert!(recording.saves().is_empty());

        let kept = Arc::new(RecordingSettings::default());
        let sink = sink_for_run(true, || Arc::clone(&kept) as Arc<dyn SettingsSink>);
        let mut ports = harness.ports();
        ports.settings = sink;
        let mut shell = harness.shell_with(ports);
        shell.restore_projects(&restored);
        shell.open(harness.folder_launch(CLOSTA));
        toggle(&mut shell, CLOSTA);
        assert_eq!(
            kept.saves().last(),
            Some(&settings_of(vec![
                saved(r"C:\work\b", false),
                saved(CLOSTA, true)
            ]))
        );
    });
}

#[test]
fn settings_of_the_projects_keep_their_order_state_and_version() {
    let mut closta = Project::new(CLOSTA).unwrap();
    closta.collapsed = true;
    let other = Project::new(r"  C:\Other ").unwrap();
    let settings = Settings::of(&[closta, other]);
    assert_eq!(settings.version, SETTINGS_VERSION);
    assert_eq!(
        settings.projects,
        [saved(CLOSTA, true), saved(r"C:\Other", false)]
    );
    assert_eq!(Settings::of(&[]).version, SETTINGS_VERSION);
}

#[test]
fn a_summary_does_not_show_the_name_when_debugged() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        shell.open(harness.folder_launch(r"C:\work\secretname"));
        let summary = shell.projects().remove(0);
        assert_eq!(summary.runtime, "Windows");
        assert!(summary.can_add && summary.can_remove && !summary.checking);
        let text = format!("{summary:?}");
        assert!(
            !text.contains("secretname") && !text.contains(r"C:\"),
            "{text}"
        );
    });
}

#[test]
fn a_restored_project_takes_its_sessions() {
    drive(|harness| async move {
        let (mut shell, settings) = harness.shell_recording();
        shell.restore_projects(&settings_of(vec![saved(CLOSTA, true)]));
        let slot = shell.open(harness.folder_launch(CLOSTA));
        assert_eq!(shell.projects().len(), 1);
        assert!(
            shell.projects()[0].collapsed,
            "opening a session keeps it closed"
        );
        assert_eq!(shell.project_of(slot), Some(&key(CLOSTA)));
        assert!(settings.saves().is_empty());
    });
}

#[test]
fn selecting_a_slot_of_a_collapsed_project_opens_it() {
    drive(|harness| async move {
        let (mut shell, settings) = harness.shell_recording();
        shell.restore_projects(&settings_of(vec![saved(CLOSTA, true)]));
        let slot = waiting_in(&mut shell, &harness, CLOSTA).await;
        assert!(shell.projects()[0].collapsed);
        assert!(settings.saves().is_empty());

        shell.act(ShellAction::OpenFromList { slot });
        assert!(!shell.projects()[0].collapsed);
        assert_eq!(settings.saves(), [settings_of(vec![saved(CLOSTA, false)])]);

        toggle(&mut shell, CLOSTA);
        assert_eq!(settings.saves().len(), 2);
        shell.act(ShellAction::JumpToWaiting);
        assert!(!shell.projects()[0].collapsed);
        assert_eq!(settings.saves().len(), 3);

        shell.act(ShellAction::JumpToWaiting);
        assert_eq!(
            settings.saves().len(),
            3,
            "an open project is not saved again"
        );
    });
}

#[test]
fn the_new_session_dialog_offers_project_folders_after_the_recent_ones() {
    drive(|harness| async move {
        let (mut shell, _settings) = harness.shell_recording();
        shell.restore_projects(&settings_of(vec![
            saved(r"C:\work\one", false),
            saved(r"C:\work\two", true),
        ]));
        start_from_dialog(&mut shell, r"C:\work\fresh");
        assert_eq!(
            shell.folder_choices(),
            [r"C:\work\fresh", r"C:\work\one", r"C:\work\two"]
        );
        // A project the dialog started in, written another way, is offered once, as recent.
        start_from_dialog(&mut shell, "c:/work/one/");
        assert_eq!(
            shell.folder_choices(),
            ["c:/work/one/", r"C:\work\fresh", r"C:\work\two"]
        );
    });
}

#[test]
fn a_new_session_is_titled_new_session_and_restarts_in_its_project() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let slot = start_from_dialog(&mut shell, CLOSTA);
        assert_eq!(shell.slots()[0].title, "New session");
        assert_eq!(shell.project_of(slot), Some(&key(CLOSTA)));
        let control = harness.control(0).await;
        let mut watch = shell.watch(slot).unwrap();
        assert!(watch.changed().await);
        shell.refresh(slot, watch.generation(), 0).unwrap();
        until(|| matches!(shell.status(slot), Some(SessionStatus::Running { .. }))).await;
        control.exit(0);
        while watch.changed().await {}
        shell.refresh(slot, watch.generation(), 0).unwrap();
        assert!(shell.can_restart(slot));
        let restarted = shell.act(ShellAction::Restart { slot });
        assert_eq!(restarted.started, Some(slot));
        assert_eq!(shell.project_of(slot), Some(&key(CLOSTA)));
        assert_eq!(shell.slots()[0].title, "New session");
        assert_eq!(shell.projects().len(), 1);
    });
}
