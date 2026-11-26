#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The projects of the shell: made by the folders sessions open in, kept in order, opened and
//! closed by hand, saved to the settings and restored at startup.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::io::ErrorKind;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use closta_providers::claude::launch::LaunchError;
use closta_session::status::SessionStatus;
use closta_shell::projects::{Project, project_key};
use closta_shell::settings::{
    SETTINGS_VERSION, SavedProject, Settings, SettingsSink, sink_for_run,
};
use closta_shell::slot::{SlotId, SlotLaunch, SlotMark, slot_elapsed};
use closta_shell::state::{Overlay, Ports, ShellAction, ShellState};
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
        // Each process is awaited before the next slot opens: `control(i)` is slot `i`'s.
        let mut slots: Vec<SlotId> = Vec::new();
        for (n, folder) in folders.iter().enumerate() {
            slots.push(shell.open(harness.folder_launch(folder)));
            harness.control(n).await;
        }
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
            saved_for: Arc::new(closta_shell::new_session::NoSaved),
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
        assert!(
            summary.can_add && !summary.can_remove && !summary.checking,
            "its session is alive"
        );
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

const OTHER: &str = r"C:\work\other";

fn remove(shell: &mut ShellState, folder: &str) -> closta_shell::state::Acted {
    shell.act(ShellAction::RemoveProject {
        project: key(folder),
    })
}

fn can_remove(shell: &ShellState, folder: &str) -> bool {
    shell
        .projects()
        .into_iter()
        .find(|it| it.key == key(folder))
        .expect("the project")
        .can_remove
}

/// A launch in `folder` whose companion hands the test the runtime.
fn launch_in_project(
    harness: &Harness,
    folder: &str,
) -> (
    closta_shell::slot::SlotLaunch,
    async_channel::Receiver<closta_session::runtime::SessionRuntime>,
) {
    let (mut launch, runtime) = harness.launch("in project");
    launch.project = Some(folder.to_owned());
    (launch, runtime)
}

/// Lets the slot's session end by itself and reads that.
async fn end(shell: &mut ShellState, slot: SlotId) {
    let mut watch = shell.watch(slot).unwrap();
    while watch.changed().await {}
    shell.refresh(slot, watch.generation(), 0).unwrap();
}

/// A project of `folder` with one failed and one ended slot, both refreshed.
async fn ended_project(shell: &mut ShellState, harness: &Harness, folder: &str) -> [SlotId; 2] {
    harness.refuse(LaunchError::Spawn(ErrorKind::NotFound));
    let (launch, _runtime) = launch_in_project(harness, folder);
    let failed = shell.open(launch);
    end(shell, failed).await;
    assert!(matches!(
        shell.status(failed),
        Some(SessionStatus::Failed(_))
    ));
    let (launch, runtime) = launch_in_project(harness, folder);
    let ended = shell.open(launch);
    let runtime = runtime.recv().await.unwrap();
    running(&runtime).await;
    harness.control(0).await.exit(0);
    end(shell, ended).await;
    assert!(shell.ended(ended));
    [failed, ended]
}

#[test]
fn removing_a_project_takes_its_ended_slots_and_saves_the_rest() {
    drive(|harness| async move {
        let (mut shell, settings) = harness.shell_recording();
        let [failed, ended] = ended_project(&mut shell, &harness, CLOSTA).await;
        shell.open(harness.folder_launch(OTHER));
        assert_eq!(shell.projects().len(), 2);
        assert!(can_remove(&shell, CLOSTA));
        let acted = remove(&mut shell, CLOSTA);
        assert_eq!(acted.removed, vec![failed, ended]);
        assert_eq!(shell.projects().len(), 1);
        let left: Vec<SlotId> = shell.slots().iter().map(|it| it.id).collect();
        assert!(!left.contains(&failed) && !left.contains(&ended));
        assert_eq!(left.len(), 1);
        let last = settings.saves().pop().expect("a save");
        assert_eq!(last, settings_of(vec![saved(OTHER, false)]));
        assert!(last.projects.iter().all(|it| it.folder != CLOSTA));
        assert!(shell.selected().is_some_and(|it| left.contains(&it)));
    });
}

#[test]
fn a_project_with_a_draft_in_an_ended_slot_cannot_be_removed() {
    drive(|harness| async move {
        let (mut shell, settings) = harness.shell_recording();
        let [failed, _ended] = ended_project(&mut shell, &harness, CLOSTA).await;
        shell.act(ShellAction::EditDraft {
            slot: failed,
            text: "unsent".to_owned(),
        });
        let saves = settings.saves().len();
        assert!(!can_remove(&shell, CLOSTA));
        let acted = remove(&mut shell, CLOSTA);
        assert!(acted.removed.is_empty());
        assert_eq!(shell.projects().len(), 1);
        assert_eq!(shell.slots().len(), 2);
        assert_eq!(settings.saves().len(), saves);

        // Once the draft is emptied the project can go.
        shell.act(ShellAction::EditDraft {
            slot: failed,
            text: String::new(),
        });
        assert!(can_remove(&shell, CLOSTA));
    });
}

#[test]
fn removing_touches_nothing_but_the_settings() {
    drive(|harness| async move {
        let settings = Arc::new(RecordingSettings::default());
        let machine = Arc::new(Machine::default());
        let planners = Arc::new(Planners::new(Arc::clone(&harness.planner) as _));
        let mut shell = harness.shell_with(Ports {
            checks: Arc::clone(&machine) as _,
            planner_for: Arc::clone(&planners) as _,
            settings: Arc::clone(&settings) as _,
            saved_for: Arc::clone(&harness.saved_for) as _,
        });
        ended_project(&mut shell, &harness, CLOSTA).await;
        let ports = harness.ports();
        let record = closta_model::SavedSessionSummary {
            id: "0b1f4c52-6a1e-4a43-9a53-7f0d2a4b8c11".to_owned(),
            title: "t".to_owned(),
            updated_at_ms: 1,
            bytes: 1,
        };
        let resumed = shell.open(closta_shell::new_session::resume_in(
            CLOSTA, &record, &ports,
        ));
        harness.control(1).await.exit(0);
        let fakes = harness.saved_for.fakes();
        assert_eq!(fakes.len(), 1, "the precondition: a fake is there");
        until(|| fakes[0].reads().contains(&record.id)).await;
        end(&mut shell, resumed).await;
        let (asked, reads) = (harness.saved_for.saved_asked(), fakes[0].reads());
        let (looks, planned, runs) = (
            machine.folder_looks(),
            planners.planned(),
            shell.live_runs(),
        );
        let saves = settings.saves().len();
        let acted = remove(&mut shell, CLOSTA);
        assert!(acted.check.is_none() && acted.started.is_none() && !acted.close);
        assert!(acted.project_check.is_none());
        assert_eq!(machine.folder_looks(), looks);
        assert_eq!(planners.planned(), planned);
        assert_eq!(shell.live_runs(), runs);
        assert_eq!(harness.saved_for.lists_started(), 0);
        assert_eq!(harness.saved_for.saved_asked(), asked);
        assert_eq!(harness.saved_for.fakes().len(), 1);
        assert_eq!((fakes[0].lists(), fakes[0].reads()), (0, reads));
        assert_eq!(settings.saves().len(), saves + 1, "only the settings");
        let last = settings.saves().pop().expect("a save");
        assert!(last.projects.iter().all(|it| it.folder != CLOSTA));
    });
}

#[test]
fn copy_session_id_copies_the_slot_s_session_id() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let ports = harness.ports();
        let saved = closta_model::SavedSessionSummary {
            id: "0b1f4c52-6a1e-4a43-9a53-7f0d2a4b8c11".to_owned(),
            title: "Fix the parser".to_owned(),
            updated_at_ms: 1,
            bytes: 10,
        };
        let slot = shell.open(closta_shell::new_session::resume_in(CLOSTA, &saved, &ports));
        harness.control(0).await.exit(0);
        end(&mut shell, slot).await;
        assert!(shell.ended(slot));
        assert!(summary(&shell, slot).can_copy_id, "the precondition");
        assert_eq!(shell.session_id(slot), Some(saved.id.as_str()));
        assert_eq!(
            shell
                .act(ShellAction::CopySessionId { slot })
                .clipboard
                .as_deref(),
            Some(saved.id.as_str())
        );
    });
}

#[test]
fn a_project_with_a_live_or_closing_slot_cannot_be_removed() {
    drive(|harness| async move {
        let (mut shell, settings) = harness.shell_recording();
        let (launch, runtime) = launch_in_project(&harness, CLOSTA);
        let live = shell.open(launch);
        running(&runtime.recv().await.unwrap()).await;
        let saves = settings.saves().len();
        assert!(!can_remove(&shell, CLOSTA));
        let acted = remove(&mut shell, CLOSTA);
        assert!(acted.removed.is_empty());
        assert_eq!(shell.projects().len(), 1);
        assert_eq!(shell.slots().len(), 1);
        assert_eq!(settings.saves().len(), saves);

        // A slot still closing holds its project as well.
        harness.stubborn();
        let (launch, runtime) = launch_in_project(&harness, OTHER);
        let closing = shell.open(launch);
        running(&runtime.recv().await.unwrap()).await;
        shell.act(ShellAction::CloseSlot { slot: closing });
        assert!(
            shell
                .slots()
                .iter()
                .any(|it| it.id == closing && it.closing)
        );
        assert!(!can_remove(&shell, OTHER));
        let saves = settings.saves().len();
        assert!(remove(&mut shell, OTHER).removed.is_empty());
        assert_eq!(shell.projects().len(), 2);
        assert_eq!(shell.slots().len(), 2);
        assert_eq!(settings.saves().len(), saves);
        assert!(shell.project_of(live).is_some());
    });
}

#[test]
fn a_removed_folder_comes_back_at_the_end_open() {
    drive(|harness| async move {
        let (mut shell, settings) = harness.shell_recording();
        let restored = settings_of(vec![saved(CLOSTA, true), saved(OTHER, false)]);
        shell.restore_projects(&restored);
        ended_project(&mut shell, &harness, CLOSTA).await;
        remove(&mut shell, CLOSTA);
        assert_eq!(names(&shell), ["other"]);
        shell.open(harness.folder_launch(CLOSTA));
        assert_eq!(names(&shell), ["other", "closta"]);
        assert!(!shell.projects()[1].collapsed);
        let last = settings.saves().pop().expect("a save");
        assert_eq!(
            last,
            settings_of(vec![saved(OTHER, false), saved(CLOSTA, false)])
        );
    });
}

#[test]
fn removing_is_refused_behind_an_overlay_and_while_closing() {
    drive(|harness| async move {
        let (mut shell, settings) = harness.shell_recording();
        let [slot, _] = ended_project(&mut shell, &harness, CLOSTA).await;
        let saves = settings.saves().len();
        // A draft makes closing the slot ask first: the question is an overlay.
        shell.act(ShellAction::EditDraft {
            slot,
            text: "draft".to_owned(),
        });
        shell.act(ShellAction::CloseSlot { slot });
        assert_eq!(shell.overlay(), Some(Overlay::CloseSlot));
        assert!(remove(&mut shell, CLOSTA).removed.is_empty());
        assert_eq!(shell.projects().len(), 1);
        assert_eq!(settings.saves().len(), saves);
        shell.act(ShellAction::CancelCloseSlot);
        assert_eq!(shell.overlay(), None);

        shell.act(ShellAction::OpenNewSession);
        assert!(remove(&mut shell, CLOSTA).removed.is_empty());
        assert_eq!(shell.projects().len(), 1);
        assert_eq!(settings.saves().len(), saves);
        toggle(&mut shell, CLOSTA);
        assert!(shell.projects()[0].collapsed, "a toggle goes through");
        shell.act(ShellAction::CancelNewSession);

        let saves = settings.saves().len();
        shell.act(ShellAction::RequestClose);
        assert!(remove(&mut shell, CLOSTA).removed.is_empty());
        assert_eq!(shell.projects().len(), 1);
        assert_eq!(shell.slots().len(), 2);
        assert_eq!(settings.saves().len(), saves);
    });
}

/// A slot started from the dialog in `folder` whose session runs.
async fn running_from_dialog(shell: &mut ShellState, harness: &Harness, folder: &str) -> SlotId {
    let slot = start_from_dialog(shell, folder);
    let n = shell.slots().len() - 1;
    let _control = harness.control(n).await;
    let mut watch = shell.watch(slot).unwrap();
    assert!(watch.changed().await);
    shell.refresh(slot, watch.generation(), 0).unwrap();
    until(|| matches!(shell.status(slot), Some(SessionStatus::Running { .. }))).await;
    slot
}

fn ask(shell: &mut ShellState, slot: SlotId, text: &str) {
    shell.act(ShellAction::EditDraft {
        slot,
        text: text.to_owned(),
    });
    shell.act(ShellAction::Send { slot });
    let generation = shell.watch(slot).unwrap().generation();
    shell.refresh(slot, generation, 0).unwrap();
}

#[test]
fn the_slot_title_is_the_first_request_once_there_is_one() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let slot = running_from_dialog(&mut shell, &harness, CLOSTA).await;
        assert_eq!(shell.slots()[0].title, "New session");
        assert_eq!(shell.slot_title(slot).as_deref(), Some("New session"));
        ask(&mut shell, slot, "Retry login when it fails\nmore");
        assert_eq!(
            shell.slot_title(slot).as_deref(),
            Some("Retry login when it fails")
        );
        assert_eq!(shell.slots()[0].title, "Retry login when it fails");
        assert_eq!(shell.slot_title(SlotId::numbered(99)), None);
    });
}

#[test]
fn a_long_first_request_is_cut_at_sixty() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let slot = running_from_dialog(&mut shell, &harness, CLOSTA).await;
        let long = "x".repeat(70);
        ask(&mut shell, slot, &long);
        assert_eq!(shell.slot_title(slot), Some("x".repeat(60)));
    });
}

const BASELINE: &str = "01-baseline-text.ndjson";
/// The baseline's lines up to the first text delta: its turn is open.
const BASELINE_OPEN: usize = 8;
const BASELINE_ALL: usize = 15;

/// Waits until the slot's session runs a turn (or has none), then refreshes the slot at `now_ms`.
async fn refreshed(
    shell: &mut ShellState,
    slot: SlotId,
    runtime: &closta_session::runtime::SessionRuntime,
    turn_runs: bool,
    now_ms: i64,
) {
    until(|| {
        let view = runtime.view();
        closta_presenter::thread_running::thread_is_running(&view.conversation, &view.transcript)
            == turn_runs
    })
    .await;
    let generation = shell.watch(slot).unwrap().generation();
    shell.refresh(slot, generation, now_ms).unwrap();
}

fn summary(shell: &ShellState, slot: SlotId) -> closta_shell::slot::SlotSummary {
    shell.slots().into_iter().find(|it| it.id == slot).unwrap()
}

#[test]
fn a_turn_that_ends_in_a_slot_not_shown_is_unread_until_selected() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let mut slots = Vec::new();
        let mut runtimes = Vec::new();
        // Each process is awaited before the next slot opens.
        for n in 0..2 {
            let (launch, runtime) = harness.launch("turn");
            slots.push(shell.open(launch));
            let runtime = runtime.recv().await.unwrap();
            running(&runtime).await;
            harness.control(n).await;
            runtimes.push(runtime);
        }
        assert_eq!(shell.selected(), Some(slots[0]));
        for n in 0..2 {
            let control = harness.control(n).await;
            support::emit_capture(&control, BASELINE, BASELINE_OPEN);
            refreshed(&mut shell, slots[n], &runtimes[n], true, 1000).await;
            support::emit_capture(&control, BASELINE, BASELINE_ALL);
            refreshed(&mut shell, slots[n], &runtimes[n], false, 2000).await;
        }
        assert_eq!(
            summary(&shell, slots[0]).mark,
            SlotMark::Ready,
            "the one shown"
        );
        assert_eq!(summary(&shell, slots[1]).mark, SlotMark::Unread);
        assert_eq!(
            slot_elapsed(&summary(&shell, slots[1]), 9000).as_deref(),
            Some("new")
        );
        shell.act(ShellAction::Select(slots[1]));
        assert_eq!(summary(&shell, slots[1]).mark, SlotMark::Ready);
    });
}

#[test]
fn the_time_moves_only_when_the_heading_changes() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("turn");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let control = harness.control(0).await;
        refreshed(&mut shell, slot, &runtime, false, 500).await;
        assert_eq!(summary(&shell, slot).since_ms, None, "first seen");
        support::emit_capture(&control, BASELINE, BASELINE_OPEN);
        refreshed(&mut shell, slot, &runtime, true, 1000).await;
        assert_eq!(summary(&shell, slot).since_ms, Some(1000));
        refreshed(&mut shell, slot, &runtime, true, 5000).await;
        assert_eq!(
            summary(&shell, slot).since_ms,
            Some(1000),
            "the same heading"
        );
        support::emit_capture(&control, BASELINE, BASELINE_ALL);
        refreshed(&mut shell, slot, &runtime, false, 9000).await;
        assert_eq!(summary(&shell, slot).since_ms, Some(9000));
        assert_eq!(
            slot_elapsed(&summary(&shell, slot), 9000 + 120_000).as_deref(),
            Some("2 min")
        );
    });
}

#[test]
fn a_restart_counts_the_new_run_afresh() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("kept");
        shell.open(launch);
        harness.control(0).await;
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let (mut other, other_runtime) = harness.launch("other");
        other.relaunch = Some(Arc::new({
            let planner = Arc::clone(&harness.planner);
            move || SlotLaunch {
                title: "other".to_owned(),
                planner: Arc::clone(&planner) as _,
                working_directory: None,
                companion: None,
                relaunch: None,
                project: None,
                settles_on_failure: false,
                session_id: None,
                resume: None,
            }
        }));
        let second = shell.open(other);
        let other_runtime = other_runtime.recv().await.unwrap();
        running(&other_runtime).await;
        let control = harness.control(1).await;
        support::emit_capture(&control, BASELINE, BASELINE_OPEN);
        refreshed(&mut shell, second, &other_runtime, true, 1000).await;
        support::emit_capture(&control, BASELINE, BASELINE_ALL);
        refreshed(&mut shell, second, &other_runtime, false, 2000).await;
        assert_eq!(summary(&shell, second).mark, SlotMark::Unread);
        assert_eq!(summary(&shell, second).since_ms, Some(2000));
        control.exit(0);
        let mut watch = shell.watch(second).unwrap();
        while watch.changed().await {}
        shell.refresh(second, watch.generation(), 3000).unwrap();
        assert_eq!(shell.status(second), Some(SessionStatus::Ended));
        assert!(shell.can_restart(second));
        shell.act(ShellAction::Restart { slot: second });
        let now = summary(&shell, second);
        assert_eq!(now.mark, SlotMark::Starting);
        assert_eq!(now.since_ms, None);
        harness.control(2).await;
        // `mark_of` hides `unread` while Starting: look once the new run is up.
        let mut again = shell.watch(second).unwrap();
        while !matches!(shell.status(second), Some(SessionStatus::Running { .. })) {
            assert!(again.changed().await);
            shell.refresh(second, again.generation(), 4000).unwrap();
        }
        // At least one refresh after the run is up, whatever the loop saw.
        shell.refresh(second, again.generation(), 4000).unwrap();
        assert_eq!(summary(&shell, second).mark, SlotMark::Ready);
    });
}

#[test]
fn copy_session_id_is_offered_only_for_an_ended_or_failed_slot() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("ids");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let control = harness.control(0).await;
        refreshed(&mut shell, slot, &runtime, false, 0).await;
        assert!(!summary(&shell, slot).can_copy_id);
        assert_eq!(
            shell.act(ShellAction::CopySessionId { slot }).clipboard,
            None
        );
        control.exit(3);
        let mut watch = shell.watch(slot).unwrap();
        while watch.changed().await {}
        shell.refresh(slot, watch.generation(), 1).unwrap();
        assert_eq!(summary(&shell, slot).mark, SlotMark::Failed);
        assert!(summary(&shell, slot).can_copy_id);
        assert_eq!(
            shell
                .act(ShellAction::CopySessionId { slot })
                .clipboard
                .as_deref(),
            Some(runtime.id())
        );
    });
}

#[test]
fn copy_session_id_is_offered_for_an_ended_slot() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("ids");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        harness.control(0).await.exit(0);
        let mut watch = shell.watch(slot).unwrap();
        while watch.changed().await {}
        shell.refresh(slot, watch.generation(), 1).unwrap();
        assert_eq!(shell.status(slot), Some(SessionStatus::Ended));
        assert!(summary(&shell, slot).can_copy_id);
        assert_eq!(
            shell
                .act(ShellAction::CopySessionId { slot })
                .clipboard
                .as_deref(),
            Some(runtime.id())
        );
    });
}

/// A slot whose session already ended or failed has no window in which it is closing but still
/// offers its id: the status is written just before the run returns, in the same poll on the
/// single-threaded test executor, so once it reads Ended or Failed closing the slot removes it at once and there is nothing to copy from.
#[test]
fn closing_an_ended_or_failed_slot_leaves_nothing_to_copy() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        for (n, code) in [(0, 0), (1, 3)] {
            let (launch, runtime) = harness.launch("closing");
            let slot = shell.open(launch);
            let runtime = runtime.recv().await.unwrap();
            running(&runtime).await;
            harness.control(n).await.exit(code);
            // Refreshed as soon as the session has ended, with no wait for its run.
            until(|| runtime.status().is_end()).await;
            let generation = shell.watch(slot).unwrap().generation();
            shell.refresh(slot, generation, 1).unwrap();
            assert!(summary(&shell, slot).can_copy_id);
            let acted = shell.act(ShellAction::CloseSlot { slot });
            assert_eq!(
                acted.removed,
                [slot],
                "the run had not returned when the status ended"
            );
            assert_eq!(
                shell.act(ShellAction::CopySessionId { slot }).clipboard,
                None
            );
        }
    });
}
