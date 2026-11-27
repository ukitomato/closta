#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The resume popup: it reads a project's saved sessions in the background, drops the answer of
//! an earlier reading, filters and moves its pick, and never stands with another overlay.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::sync::Arc;

use closta_core::ports::SavedSessionsError;
use closta_model::SavedSessionSummary;
use closta_providers::claude::fake::saved::FakeSavedSessions;
use closta_session::history::SavedListing;
use closta_shell::new_session::resume_in;
use closta_shell::projects::{ProjectKey, project_key};
use closta_shell::resume::{ResumeRowState, ResumeStage};
use closta_shell::settings::{SETTINGS_VERSION, SavedProject, Settings};
use closta_shell::slot::SlotLaunch;
use closta_shell::state::{Acted, FocusTarget, Overlay, Ports, ShellAction, ShellState};
use support::{Harness, Machine, Planners, RecordingSettings, drive, running};

const A: &str = r"C:\work\alpha";
const B: &str = r"C:\work\beta";
const X: &str = "0b1f4c52-6a1e-4a43-9a53-7f0d2a4b8c11";
const Y: &str = "1c2a5d63-7b2f-4b54-8b64-8a1e3b5c9d22";
const Z: &str = "2d3b6e74-8c3a-4c65-9c75-9b2f4c6dae33";

fn key(folder: &str) -> ProjectKey {
    project_key(folder).unwrap()
}

fn summary(id: &str, title: &str) -> SavedSessionSummary {
    SavedSessionSummary {
        id: id.to_owned(),
        title: title.to_owned(),
        updated_at_ms: 1,
        bytes: 10,
    }
}

fn three() -> Vec<SavedSessionSummary> {
    vec![
        summary(X, "Retry up to 3 times when login fails"),
        summary(Y, "Split AuthService into TokenStore"),
        summary(Z, "Fix the CI cache key"),
    ]
}

fn listed(sessions: Vec<SavedSessionSummary>) -> Option<SavedListing> {
    Some(SavedListing {
        sessions,
        unreadable: false,
    })
}

/// A shell with the folders as projects and no slot; `A` holds the three saved sessions.
fn shell_of(harness: &Harness, folders: &[&str]) -> (ShellState, Arc<FakeSavedSessions>) {
    let fake = harness
        .saved_for
        .put(A, FakeSavedSessions::default().with_listed(three()));
    let mut shell = harness.shell();
    shell.restore_projects(&Settings {
        version: SETTINGS_VERSION,
        projects: folders
            .iter()
            .map(|folder| SavedProject {
                folder: (*folder).to_owned(),
                collapsed: false,
            })
            .collect(),
    });
    (shell, fake)
}

fn open(shell: &mut ShellState, folder: &str) -> Acted {
    shell.act(ShellAction::OpenResume {
        project: key(folder),
    })
}

fn generation(acted: &Acted) -> u64 {
    acted.listing.as_ref().expect("a reading").generation
}

/// Opens the popup on `A` and hands it the three saved sessions.
fn open_listed(shell: &mut ShellState) {
    let acted = open(shell, A);
    shell.act(ShellAction::SavedListed {
        generation: generation(&acted),
        listing: listed(three()),
    });
    assert_eq!(shell.resume_rows().len(), 3);
}

fn stage(shell: &ShellState) -> ResumeStage {
    shell.resume().expect("the popup").stage.clone()
}

fn selected(shell: &ShellState) -> usize {
    shell.resume().expect("the popup").selected
}

fn state_of(shell: &ShellState, id: &str) -> ResumeRowState {
    shell
        .resume_rows()
        .into_iter()
        .find(|it| it.id == id)
        .expect("the row")
        .state
}

fn launch_with_id(harness: &Harness, folder: &str, id: Option<&str>) -> SlotLaunch {
    SlotLaunch {
        session_id: id.map(str::to_owned),
        ..harness.folder_launch(folder)
    }
}

#[test]
fn opening_lists_in_the_background() {
    drive(|harness| async move {
        let (mut shell, fake) = shell_of(&harness, &[A]);
        let acted = open(&mut shell, A);
        assert_eq!(shell.overlay(), Some(Overlay::Resume));
        assert_eq!(stage(&shell), ResumeStage::Loading);
        assert_eq!(
            shell.resume_title().as_deref(),
            Some("Resume a session · alpha")
        );
        let reading = acted.listing.expect("a reading");
        assert_eq!(fake.lists(), 0, "nothing is read before the future runs");

        let answer = reading.listing.await;
        assert_eq!(fake.lists(), 1);
        shell.act(ShellAction::SavedListed {
            generation: reading.generation,
            listing: answer,
        });
        assert_eq!(stage(&shell), ResumeStage::Listed(three()));
        let rows = shell.resume_rows();
        let ids: Vec<&str> = rows.iter().map(|it| it.id.as_str()).collect();
        assert_eq!(ids, [X, Y, Z]);
        assert!(rows.iter().all(|it| it.state == ResumeRowState::Closed));
        assert_eq!(rows[2].title, "Fix the CI cache key");
    });
}

#[test]
fn no_saved_session_is_called_in_the_foreground() {
    drive(|harness| async move {
        let (mut shell, fake) = shell_of(&harness, &[A]);
        let untouched = |fake: &FakeSavedSessions| {
            assert_eq!(fake.lists(), 0);
            assert!(fake.reads().is_empty());
        };
        let acted = open(&mut shell, A);
        assert!(shell.resume().is_some());
        untouched(&fake);
        shell.act(ShellAction::SavedListed {
            generation: generation(&acted),
            listing: listed(three()),
        });
        assert!(shell.resume().is_some());
        untouched(&fake);
        shell.act(ShellAction::EditResumeQuery {
            text: "fix".to_owned(),
        });
        assert!(shell.resume().is_some());
        untouched(&fake);
        shell.act(ShellAction::MoveResume { delta: 1 });
        assert!(shell.resume().is_some());
        untouched(&fake);
        shell.act(ShellAction::CloseResume);
        untouched(&fake);
        assert_eq!(harness.saved_for.lists_started(), 0);
    });
}

#[test]
fn an_answer_of_an_earlier_reading_is_dropped() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A]);
        let first = open(&mut shell, A);
        shell.act(ShellAction::CloseResume);
        let second = open(&mut shell, A);
        assert!(generation(&second) > generation(&first));
        assert!(harness.saved_for.stopped(0), "the first reading gives up");
        assert!(!harness.saved_for.stopped(1));

        shell.act(ShellAction::SavedListed {
            generation: generation(&first),
            listing: listed(three()),
        });
        assert_eq!(stage(&shell), ResumeStage::Loading);
        assert!(shell.resume_rows().is_empty());

        shell.act(ShellAction::SavedListed {
            generation: generation(&second),
            listing: listed(three()),
        });
        assert_eq!(stage(&shell), ResumeStage::Listed(three()));
    });
}

#[test]
fn a_stopped_answer_is_dropped() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A]);
        let acted = open(&mut shell, A);
        assert_eq!(stage(&shell), ResumeStage::Loading);
        shell.act(ShellAction::SavedListed {
            generation: generation(&acted),
            listing: None,
        });
        assert_eq!(stage(&shell), ResumeStage::Loading);
        // The reading of the same number still lands.
        shell.act(ShellAction::SavedListed {
            generation: generation(&acted),
            listing: listed(three()),
        });
        assert_eq!(stage(&shell), ResumeStage::Listed(three()));
    });
}

#[test]
fn an_unreadable_listing_says_so() {
    drive(|harness| async move {
        let (mut shell, fake) = shell_of(&harness, &[A]);
        fake.fail_lists(SavedSessionsError::NoPlace);
        let reading = open(&mut shell, A).listing.unwrap();
        let answer = reading.listing.await;
        shell.act(ShellAction::SavedListed {
            generation: reading.generation,
            listing: answer,
        });
        assert_eq!(stage(&shell), ResumeStage::Unreadable);
        assert!(shell.resume_rows().is_empty());
    });
}

#[test]
fn moving_stops_at_both_ends() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A]);
        open_listed(&mut shell);
        assert_eq!(selected(&shell), 0);
        shell.act(ShellAction::MoveResume { delta: -1 });
        assert_eq!(selected(&shell), 0);
        shell.act(ShellAction::MoveResume { delta: 1 });
        assert_eq!(selected(&shell), 1);
        shell.act(ShellAction::MoveResume { delta: 1 });
        assert_eq!(selected(&shell), 2);
        shell.act(ShellAction::MoveResume { delta: 1 });
        assert_eq!(selected(&shell), 2);
        shell.act(ShellAction::MoveResume { delta: -10 });
        assert_eq!(selected(&shell), 0);
        shell.act(ShellAction::MoveResume { delta: 10 });
        assert_eq!(selected(&shell), 2);

        // With no row there is nowhere to go.
        shell.act(ShellAction::EditResumeQuery {
            text: "nothing like it".to_owned(),
        });
        shell.act(ShellAction::MoveResume { delta: 1 });
        assert_eq!(selected(&shell), 0);
    });
}

#[test]
fn editing_the_query_selects_the_first_row() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A]);
        open_listed(&mut shell);
        shell.act(ShellAction::MoveResume { delta: 2 });
        assert_eq!(selected(&shell), 2);
        shell.act(ShellAction::EditResumeQuery {
            text: "AUTH".to_owned(),
        });
        assert_eq!(selected(&shell), 0);
        let rows = shell.resume_rows();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, Y);
    });
}

#[test]
fn closing_stops_the_reading() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A]);
        let reading = open(&mut shell, A).listing.unwrap();
        assert!(!harness.saved_for.stopped(0));
        shell.act(ShellAction::CloseResume);
        assert!(shell.resume().is_none());
        assert_eq!(shell.overlay(), None);
        assert!(harness.saved_for.stopped(0));
        // Whatever the stopped reading still answers lands nowhere.
        shell.act(ShellAction::SavedListed {
            generation: reading.generation,
            listing: listed(three()),
        });
        assert!(shell.resume().is_none());
    });
}

#[test]
fn the_popup_and_the_dialog_never_open_together() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A]);
        open(&mut shell, A);
        assert!(shell.resume().is_some());
        let acted = shell.act(ShellAction::OpenNewSession);
        assert!(!acted.folder);
        assert!(shell.new_session().is_none());
        shell.act(ShellAction::OpenNewSessionHere);
        assert!(shell.new_session().is_none());
        assert_eq!(shell.overlay(), Some(Overlay::Resume));

        shell.act(ShellAction::CloseResume);
        shell.act(ShellAction::OpenNewSession);
        assert!(shell.new_session().is_some());
        let acted = open(&mut shell, A);
        assert!(acted.listing.is_none());
        assert!(shell.resume().is_none());
        shell.act(ShellAction::OpenResumeHere);
        assert!(shell.resume().is_none());
        assert_eq!(shell.overlay(), Some(Overlay::NewSession));
        assert_eq!(harness.saved_for.lists_asked(), 1);
    });
}

#[test]
fn resume_waits_while_a_plus_checks_its_folder() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A, B]);
        // A slot in B makes the key's way lead somewhere.
        let slot = shell.open(harness.folder_launch(B));
        harness.control(0).await;
        shell.act(ShellAction::Select(slot));

        let plus = shell.act(ShellAction::NewInProject { project: key(A) });
        assert!(plus.project_check.is_some());
        assert!(
            shell
                .projects()
                .iter()
                .any(|it| it.key == key(A) && it.checking)
        );
        let acted = open(&mut shell, A);
        assert!(acted.listing.is_none());
        assert!(shell.resume().is_none());
        let acted = shell.act(ShellAction::OpenResumeHere);
        assert!(acted.listing.is_none());
        assert!(shell.resume().is_none());

        shell.act(ShellAction::ProjectChecked {
            project: key(A),
            exists: false,
        });
        assert!(shell.new_session().is_some());
        assert!(shell.resume().is_none());
        assert_eq!(shell.overlay(), Some(Overlay::NewSession));

        shell.act(ShellAction::CancelNewSession);
        let acted = shell.act(ShellAction::OpenResumeHere);
        assert!(acted.listing.is_some());
        assert_eq!(shell.resume().unwrap().project, key(B));
        assert_eq!(harness.saved_for.lists_asked(), 1);
    });
}

#[test]
fn resume_is_refused_while_closing_and_the_close_shuts_it() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A]);
        let first = open(&mut shell, A);
        assert!(shell.resume().is_some());
        shell.act(ShellAction::RequestClose);
        shell.act(ShellAction::ConfirmClose);
        assert_eq!(shell.overlay(), Some(Overlay::Closing));
        assert!(shell.resume().is_none());
        assert!(harness.saved_for.stopped(0));

        let acted = open(&mut shell, A);
        assert!(acted.listing.is_none());
        assert!(shell.resume().is_none());
        shell.act(ShellAction::OpenResumeHere);
        shell.act(ShellAction::SavedListed {
            generation: generation(&first),
            listing: listed(three()),
        });
        assert!(shell.resume().is_none());
        assert_eq!(harness.saved_for.lists_asked(), 1);
    });
}

#[test]
fn removing_the_project_waits_behind_the_popup() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A]);
        assert!(shell.projects()[0].can_remove);
        open(&mut shell, A);
        shell.act(ShellAction::RemoveProject { project: key(A) });
        assert_eq!(shell.projects().len(), 1);
        assert!(shell.resume().is_some());
        assert!(shell.resume_title().is_some());
    });
}

#[test]
fn a_row_of_an_open_or_closing_slot_says_so() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A]);
        let ports = harness.ports();
        let open_slot = shell.open(resume_in(A, &three()[0], &ports));
        harness.control(0).await;

        harness.stubborn();
        let (launch, runtime) = harness.launch("closing");
        let closing = shell.open(SlotLaunch {
            session_id: Some(Y.to_owned()),
            ..launch
        });
        running(&runtime.recv().await.unwrap()).await;
        harness.control(1).await;
        shell.act(ShellAction::CloseSlot { slot: closing });
        assert!(
            shell
                .slots()
                .iter()
                .any(|it| it.id == closing && it.closing)
        );

        open_listed(&mut shell);
        assert_eq!(state_of(&shell, X), ResumeRowState::OpenHere(open_slot));
        assert_eq!(state_of(&shell, Y), ResumeRowState::Closing);
        assert_eq!(state_of(&shell, Z), ResumeRowState::Closed);
    });
}

#[test]
fn a_row_whose_old_run_has_not_returned_is_closing() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A]);
        harness.stubborn();
        let slot = shell.open(launch_with_id(&harness, A, Some(X)));
        harness.control(0).await;
        shell
            .replace(slot, launch_with_id(&harness, A, None))
            .unwrap();
        harness.control(1).await;
        assert_ne!(shell.session_id(slot), Some(X));
        assert!(shell.run_alive(X), "the old run has not returned");

        open_listed(&mut shell);
        assert_eq!(state_of(&shell, X), ResumeRowState::Closing);
        assert_eq!(state_of(&shell, Y), ResumeRowState::Closed);
    });
}

#[test]
fn other_has_no_resume() {
    drive(|harness| async move {
        let (mut shell, _) = shell_of(&harness, &[A]);
        let (launch, _) = harness.launch("other");
        let slot = shell.open(launch);
        harness.control(0).await;
        shell.act(ShellAction::Select(slot));
        assert_eq!(shell.selected(), Some(slot));
        assert!(shell.project_of(slot).is_none());
        // The project exists: only the way to it is missing.
        assert_eq!(shell.projects().len(), 1);

        let acted = shell.act(ShellAction::OpenResumeHere);
        assert!(acted.listing.is_none());
        assert!(shell.resume().is_none());
        assert_eq!(harness.saved_for.lists_asked(), 0);
    });
}

/// `shell_of`, with a count of the planners asked for.
fn counted(harness: &Harness, folders: &[&str]) -> (ShellState, Arc<Planners>) {
    harness
        .saved_for
        .put(A, FakeSavedSessions::default().with_listed(three()));
    let planners = Arc::new(Planners::new(Arc::clone(&harness.planner) as _));
    let mut shell = harness.shell_with(Ports {
        checks: Arc::new(Machine::default()),
        planner_for: Arc::clone(&planners) as _,
        settings: Arc::new(RecordingSettings::default()),
        saved_for: Arc::clone(&harness.saved_for) as _,
    });
    shell.restore_projects(&Settings {
        version: SETTINGS_VERSION,
        projects: folders
            .iter()
            .map(|folder| SavedProject {
                folder: (*folder).to_owned(),
                collapsed: false,
            })
            .collect(),
    });
    (shell, planners)
}

fn pick(shell: &mut ShellState, id: &str) -> Acted {
    shell.act(ShellAction::PickResume {
        session_id: id.to_owned(),
    })
}

async fn end(shell: &mut ShellState, slot: closta_shell::slot::SlotId) {
    let mut watch = shell.watch(slot).unwrap();
    while watch.changed().await {}
    shell.refresh(slot, watch.generation(), 0).unwrap();
}

#[test]
fn picking_a_saved_session_resumes_it_in_its_project() {
    drive(|harness| async move {
        let (mut shell, planners) = counted(&harness, &[A, B]);
        open_listed(&mut shell);
        assert_eq!(planners.planned(), 0);

        let acted = pick(&mut shell, Y);
        let slot = acted.started.expect("a started slot");
        assert_eq!(acted.focus, Some(FocusTarget::Composer(slot)));
        assert_eq!(shell.selected(), Some(slot));
        assert!(shell.resume().is_none(), "the popup closes");
        assert_eq!(shell.session_id(slot), Some(Y));
        assert_eq!(shell.project_of(slot), Some(key(A)).as_ref());
        harness.control(0).await;
        let args = harness.launch_args(0).await;
        assert!(args.contains(&format!("--resume={Y}")), "{args:?}");
        assert_eq!(shell.live_runs(), 1);
    });
}

#[test]
fn picking_an_open_conversation_goes_to_its_slot() {
    drive(|harness| async move {
        let (mut shell, planners) = counted(&harness, &[A]);
        open_listed(&mut shell);
        let slot = pick(&mut shell, X).started.expect("the first pick starts");
        harness.control(0).await;
        assert_eq!(shell.live_runs(), 1);
        let planned = planners.planned();
        assert_eq!(planned, 1);

        // A live slot.
        let other = shell.open(harness.folder_launch(A));
        harness.control(1).await;
        shell.act(ShellAction::Select(other));
        open_listed(&mut shell);
        let acted = pick(&mut shell, X);
        assert!(acted.started.is_none());
        assert_eq!(acted.focus, Some(FocusTarget::Composer(slot)));
        assert_eq!(shell.selected(), Some(slot));
        assert!(shell.resume().is_none());

        // The same slot once it ended.
        harness.control(0).await.exit(0);
        end(&mut shell, slot).await;
        assert!(shell.ended(slot));
        shell.act(ShellAction::Select(other));
        open_listed(&mut shell);
        let acted = pick(&mut shell, X);
        assert_eq!(acted.focus, Some(FocusTarget::EndedBand(slot)));
        assert_eq!(shell.selected(), Some(slot));
        assert_eq!(shell.live_runs(), 1, "the other slot only");
        assert_eq!(planners.planned(), planned);
    });
}

#[test]
fn picking_a_failed_conversation_goes_to_its_band() {
    drive(|harness| async move {
        let (mut shell, planners) = counted(&harness, &[A]);
        harness.refuse(closta_providers::claude::launch::LaunchError::Spawn(
            std::io::ErrorKind::NotFound,
        ));
        open_listed(&mut shell);
        let slot = pick(&mut shell, X).started.expect("the first pick starts");
        end(&mut shell, slot).await;
        assert!(matches!(
            shell.status(slot),
            Some(closta_session::status::SessionStatus::Failed(_))
        ));
        let planned = planners.planned();
        assert_eq!(planned, 1);

        open_listed(&mut shell);
        let acted = pick(&mut shell, X);
        assert_eq!(acted.focus, Some(FocusTarget::FailureBand(slot)));
        assert_eq!(shell.selected(), Some(slot));
        assert_eq!(planners.planned(), planned);
    });
}

#[test]
fn a_closing_conversation_cannot_be_picked() {
    drive(|harness| async move {
        let (mut shell, planners) = counted(&harness, &[A]);
        harness.stubborn();
        let slot = shell.open(launch_with_id(&harness, A, Some(X)));
        harness.control(0).await;
        shell.act(ShellAction::CloseSlot { slot });
        assert!(shell.slots().iter().any(|it| it.id == slot && it.closing));
        open_listed(&mut shell);
        assert_eq!(state_of(&shell, X), ResumeRowState::Closing);
        let slots = shell.slots().len();
        let runs = shell.live_runs();
        let planned = planners.planned();

        let acted = pick(&mut shell, X);
        assert!(acted.started.is_none() && acted.focus.is_none());
        assert_eq!(shell.slots().len(), slots);
        assert_eq!(shell.live_runs(), runs);
        assert_eq!(planners.planned(), planned);
        assert!(shell.resume().is_some(), "the popup stays open");
    });
}

#[test]
fn picking_at_the_limit_does_nothing() {
    drive(|harness| async move {
        let (mut shell, planners) = counted(&harness, &[A]);
        for n in 0..8 {
            shell.open(launch_with_id(&harness, A, None));
            harness.control(n).await;
        }
        assert!(shell.slots_full());
        open_listed(&mut shell);
        let planned = planners.planned();
        let runs = shell.live_runs();

        let acted = pick(&mut shell, X);
        assert!(acted.started.is_none());
        assert_eq!(shell.slots().len(), 8);
        assert_eq!(shell.live_runs(), runs);
        assert_eq!(planners.planned(), planned);
        assert!(shell.resume().is_some());
    });
}

#[test]
fn an_id_not_listed_is_not_picked() {
    drive(|harness| async move {
        let (mut shell, planners) = counted(&harness, &[A]);
        open_listed(&mut shell);
        shell.act(ShellAction::EditResumeQuery {
            text: "Fix the CI".to_owned(),
        });
        assert_eq!(shell.resume_rows().len(), 1, "X is filtered out of view");
        let unknown = "3e4c7f85-9d4b-4d76-8d86-ac3a5d7ebf44";
        let acted = pick(&mut shell, unknown);
        assert!(acted.started.is_none());
        assert!(shell.slots().is_empty());
        assert!(shell.resume().is_some());
        assert_eq!(planners.planned(), 0);

        let acted = pick(&mut shell, X);
        assert!(acted.started.is_some(), "a hidden row of the list opens");
        assert_eq!(shell.session_id(acted.started.unwrap()), Some(X));
    });
}

#[test]
fn an_id_whose_old_run_has_not_returned_cannot_be_picked() {
    drive(|harness| async move {
        let (mut shell, planners) = counted(&harness, &[A]);
        harness.stubborn();
        let slot = shell.open(launch_with_id(&harness, A, Some(X)));
        harness.control(0).await;
        shell
            .replace(slot, launch_with_id(&harness, A, None))
            .unwrap();
        harness.control(1).await;
        assert!(shell.run_alive(X), "the old run has not returned");
        open_listed(&mut shell);
        let runs = shell.live_runs();
        let planned = planners.planned();

        let acted = pick(&mut shell, X);
        assert!(acted.started.is_none());
        assert_eq!(shell.live_runs(), runs);
        assert_eq!(planners.planned(), planned);
        assert_eq!(shell.slots().len(), 1);
    });
}

#[test]
fn picking_is_refused_while_closing() {
    drive(|harness| async move {
        let (mut shell, planners) = counted(&harness, &[A]);
        open_listed(&mut shell);
        shell.act(ShellAction::RequestClose);
        shell.act(ShellAction::ConfirmClose);
        assert_eq!(shell.overlay(), Some(Overlay::Closing));

        let acted = pick(&mut shell, X);
        assert!(acted.started.is_none());
        assert!(shell.slots().is_empty());
        assert_eq!(shell.live_runs(), 0);
        assert_eq!(planners.planned(), 0);
    });
}

#[test]
fn picking_a_slot_of_a_collapsed_project_opens_it() {
    drive(|harness| async move {
        let (mut shell, _) = counted(&harness, &[A]);
        open_listed(&mut shell);
        let slot = pick(&mut shell, X).started.unwrap();
        harness.control(0).await;
        shell.act(ShellAction::ToggleProject { project: key(A) });
        assert!(shell.projects()[0].collapsed);

        open_listed(&mut shell);
        let acted = pick(&mut shell, X);
        assert_eq!(acted.focus, Some(FocusTarget::Composer(slot)));
        assert!(!shell.projects()[0].collapsed);
    });
}
