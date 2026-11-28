#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The shell's composer, restart and New Session paths over sessions made of in-memory
//! processes: sending, stopping, the history, starting again and starting in a folder.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::sync::Arc;

use closta_presenter::rows::ThreadRow;
use closta_providers::claude::fake::live::LiveControl;
use closta_session::launch::SessionLaunchPlanner;
use closta_session::runtime::SessionRuntime;
use closta_session::status::{SessionFailure, SessionStatus};
use closta_shell::copy;
use closta_shell::new_session::{ClaudeOnPath, Problem};
use closta_shell::rows::RowChange;
use closta_shell::settings::MemorySettings;
use closta_shell::slot::{SlotId, SlotLaunch};
use closta_shell::state::{Acted, Ports, ShellAction, ShellState};
use futures_lite::future;
use support::{Harness, Machine, Planners, drive, relaunchable, until};

const FOLDER: &str = r"C:\work\proj";

/// A shell with one slot whose session runs: the shell, the slot, its runtime and its process.
async fn running_slot(harness: &Harness) -> (ShellState, SlotId, SessionRuntime, LiveControl) {
    let mut shell = harness.shell();
    let (launch, runtime) = harness.launch("slot");
    let slot = shell.open(launch);
    let runtime = runtime.recv().await.unwrap();
    until(|| runtime.commands().is_some()).await;
    let control = harness.control(0).await;
    control.skip_initialize().await;
    (shell, slot, runtime, control)
}

fn refresh(shell: &mut ShellState, slot: SlotId) {
    let generation = shell.watch(slot).unwrap().generation();
    shell.refresh(slot, generation, 0).unwrap();
}

fn type_in(shell: &mut ShellState, slot: SlotId, text: &str) {
    shell.act(ShellAction::EditDraft {
        slot,
        text: text.to_owned(),
    });
}

fn asks(shell: &ShellState, slot: SlotId) -> Vec<(String, String, bool)> {
    shell
        .rows(slot)
        .iter()
        .filter_map(|row| match row {
            ThreadRow::Ask(ask) => Some((ask.key.clone(), ask.text.clone(), ask.not_sent)),
            _ => None,
        })
        .collect()
}

#[test]
fn a_send_goes_to_the_session_as_s1_and_empties_the_draft() {
    drive(|harness| async move {
        let (mut shell, slot, _runtime, control) = running_slot(&harness).await;
        type_in(&mut shell, slot, "hello there");
        let acted = shell.act(ShellAction::Send { slot });
        assert_eq!(acted.draft, Some(slot));
        assert_eq!(shell.draft(slot), "");

        let line = control.next_stdin_line().await.expect("a line");
        let sent: serde_json::Value = serde_json::from_str(&line).unwrap();
        assert_eq!(sent["type"], "user");

        refresh(&mut shell, slot);
        assert_eq!(
            asks(&shell, slot),
            vec![("s1".to_owned(), "hello there".to_owned(), false)]
        );
        assert!(shell.composer_line(slot).is_some());
    });
}

#[test]
fn a_send_to_a_session_that_is_not_running_keeps_the_draft() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, _runtime) = harness.launch("slot");
        let slot = shell.open(launch);
        type_in(&mut shell, slot, "wait for me");
        let acted = shell.act(ShellAction::Send { slot });
        assert_eq!(acted.draft, None);
        assert_eq!(shell.draft(slot), "wait for me");
        assert_eq!(shell.composer_reason(slot), Some("Session is not running"));
        assert!(asks(&shell, slot).is_empty());
    });
}

#[test]
fn a_send_the_session_refuses_comes_back_with_not_sent() {
    drive(|harness| async move {
        let (mut shell, slot, _runtime, control) = running_slot(&harness).await;
        control.close_stdin();
        type_in(&mut shell, slot, "one");
        shell.act(ShellAction::Send { slot });
        until(|| control.refused_writes() == 1).await;

        type_in(&mut shell, slot, "two");
        let acted = shell.act(ShellAction::Send { slot });
        assert_eq!(
            acted.draft, None,
            "the input already reads what the draft is"
        );
        assert_eq!(shell.draft(slot), "two");
        assert_eq!(shell.composer_reason(slot), Some(copy::SEND_CLOSED));

        refresh(&mut shell, slot);
        assert_eq!(
            asks(&shell, slot),
            vec![
                ("s1".to_owned(), "one".to_owned(), false),
                ("s2".to_owned(), "two".to_owned(), true),
            ]
        );
    });
}

#[test]
fn a_send_mid_turn_is_taken() {
    drive(|harness| async move {
        let (mut shell, slot, _runtime, control) = running_slot(&harness).await;
        type_in(&mut shell, slot, "first");
        shell.act(ShellAction::Send { slot });
        refresh(&mut shell, slot);
        assert!(shell.running(slot), "the first turn is still running");

        type_in(&mut shell, slot, "second");
        let acted = shell.act(ShellAction::Send { slot });
        assert_eq!(acted.draft, Some(slot));
        control.next_stdin_line().await.expect("first");
        let second = control.next_stdin_line().await.expect("second");
        assert!(second.contains("second"));
    });
}

#[test]
fn interrupt_reaches_the_session() {
    drive(|harness| async move {
        let (mut shell, slot, _runtime, control) = running_slot(&harness).await;
        shell.act(ShellAction::Interrupt { slot });
        let line = control.next_stdin_line().await.expect("a line");
        let sent: serde_json::Value = serde_json::from_str(&line).unwrap();
        assert_eq!(sent["type"], "control_request");
        assert_eq!(sent["request"]["subtype"], "interrupt");
    });
}

#[test]
fn history_actions_set_the_draft() {
    drive(|harness| async move {
        let (mut shell, slot, _runtime, _control) = running_slot(&harness).await;
        for text in ["a", "b"] {
            type_in(&mut shell, slot, text);
            shell.act(ShellAction::Send { slot });
        }
        type_in(&mut shell, slot, "typed");

        let prev = |shell: &mut ShellState| shell.act(ShellAction::HistoryPrev { slot }).draft;
        let next = |shell: &mut ShellState| shell.act(ShellAction::HistoryNext { slot }).draft;
        assert_eq!(next(&mut shell), None, "not browsing yet");
        assert_eq!(prev(&mut shell), Some(slot));
        assert_eq!(shell.draft(slot), "b");
        assert_eq!(prev(&mut shell), Some(slot));
        assert_eq!(shell.draft(slot), "a");
        assert_eq!(prev(&mut shell), None, "no older message");
        assert_eq!(shell.draft(slot), "a");
        assert_eq!(next(&mut shell), Some(slot));
        assert_eq!(shell.draft(slot), "b");
        assert_eq!(next(&mut shell), Some(slot));
        assert_eq!(shell.draft(slot), "typed", "the stashed draft comes back");
    });
}

#[test]
fn a_refused_send_stays_in_the_history_and_a_browse_afterwards_loses_nothing() {
    drive(|harness| async move {
        let (mut shell, slot, _runtime, control) = running_slot(&harness).await;
        control.close_stdin();
        type_in(&mut shell, slot, "one");
        shell.act(ShellAction::Send { slot });
        until(|| control.refused_writes() == 1).await;
        type_in(&mut shell, slot, "refused");
        shell.act(ShellAction::Send { slot });
        assert_eq!(shell.draft(slot), "refused");

        assert_eq!(
            shell.act(ShellAction::HistoryPrev { slot }).draft,
            Some(slot)
        );
        assert_eq!(shell.draft(slot), "refused");
        shell.act(ShellAction::HistoryNext { slot });
        assert_eq!(
            shell.draft(slot),
            "refused",
            "the stash is the restored draft"
        );
    });
}

#[test]
fn a_restart_keeps_the_draft_and_history_and_starts_a_new_generation() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let slot = shell.open(relaunchable(&harness, "again"));
        until(|| harness.answers.lock().unwrap().controls.len() == 1).await;
        let control = harness.control(0).await;
        let mut watch = shell.watch(slot).unwrap();
        assert!(watch.changed().await);
        shell.refresh(slot, watch.generation(), 0).unwrap();
        until(|| matches!(shell.status(slot), Some(SessionStatus::Running { .. }))).await;

        type_in(&mut shell, slot, "hello");
        shell.act(ShellAction::Send { slot });
        control.skip_initialize().await;
        control.next_stdin_line().await.expect("sent");
        refresh(&mut shell, slot);
        type_in(&mut shell, slot, "keep me");
        assert!(
            !shell.can_restart(slot),
            "a running session is not restarted"
        );
        let refused = shell.act(ShellAction::Restart { slot });
        assert!(refused.started.is_none() && refused.rows.is_none());
        assert_eq!(shell.watch(slot).unwrap().generation(), 0);

        control.exit(0);
        while watch.changed().await {}
        shell.refresh(slot, watch.generation(), 0).unwrap();
        assert_eq!(shell.status(slot), Some(SessionStatus::Ended));
        assert!(shell.can_restart(slot));
        let emptied = shell.rows(slot).len();
        assert!(emptied > 0);

        let acted = shell.act(ShellAction::Restart { slot });
        assert_eq!(acted.started, Some(slot));
        assert_eq!(
            acted.rows,
            Some((
                slot,
                vec![RowChange::Splice {
                    range: 0..emptied,
                    count: 0
                }]
            ))
        );
        assert_eq!(shell.draft(slot), "keep me");
        assert_eq!(shell.watch(slot).unwrap().generation(), 1);

        assert!(!shell.browsing(slot));
        shell.act(ShellAction::HistoryPrev { slot });
        assert_eq!(shell.draft(slot), "hello", "the history stays");
        assert!(shell.browsing(slot));
        shell.act(ShellAction::HistoryNext { slot });
        assert!(!shell.browsing(slot));

        let second = harness.control(1).await;
        let generation = shell.watch(slot).unwrap().generation();
        let mut watch = shell.watch(slot).unwrap();
        while !matches!(shell.status(slot), Some(SessionStatus::Running { .. })) {
            assert!(watch.changed().await);
            shell.refresh(slot, generation, 0).unwrap();
        }
        shell.act(ShellAction::Send { slot });
        second.skip_initialize().await;
        second.next_stdin_line().await.expect("sent again");
        refresh(&mut shell, slot);
        assert_eq!(
            asks(&shell, slot),
            vec![("s2".to_owned(), "keep me".to_owned(), false)]
        );
    });
}

#[test]
fn a_slot_without_relaunch_does_not_restart() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, _runtime) = harness.launch("plain");
        let slot = shell.open(launch);
        assert!(!shell.can_restart(slot));
        let acted = shell.act(ShellAction::Restart { slot });
        assert!(acted.started.is_none() && acted.rows.is_none());
        assert_eq!(shell.watch(slot).unwrap().generation(), 0);
    });
}

fn start_in(shell: &mut ShellState, folder: &str) -> Acted {
    shell.act(ShellAction::OpenNewSession);
    shell.act(ShellAction::EditFolder {
        text: folder.to_owned(),
    });
    shell.act(ShellAction::StartSession {
        folder: folder.to_owned(),
    })
}

#[test]
fn start_opens_the_folder_once_it_is_seen_and_selects_it() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, _runtime) = harness.launch("first");
        let first = shell.open(launch);

        let opened = shell.act(ShellAction::OpenNewSession);
        assert!(opened.folder);
        assert_eq!(shell.new_session().unwrap().folder, "");
        assert!(
            !shell.act(ShellAction::OpenNewSession).folder,
            "open already"
        );
        let edited = shell.act(ShellAction::EditFolder {
            text: format!(" {FOLDER} "),
        });
        assert!(edited.folder);
        assert!(shell.new_session().unwrap().problem.is_none());

        let started = shell.act(ShellAction::StartSession {
            folder: format!(" {FOLDER} "),
        });
        assert!(shell.new_session().unwrap().checking);
        let check = started.check.expect("a check");
        assert!(check.exists.await);

        let acted = shell.act(ShellAction::FolderChecked {
            folder: check.folder,
            exists: true,
        });
        let slot = acted.started.expect("a slot");
        assert_ne!(slot, first);
        assert_eq!(shell.selected(), Some(slot));
        assert_eq!(shell.recent_folders(), [FOLDER.to_owned()]);
        assert!(shell.new_session().is_none());
        let titles: Vec<_> = shell.slots().into_iter().map(|it| it.title).collect();
        assert_eq!(titles, ["first", "New session"]);
        until(|| harness.answers.lock().unwrap().controls.len() == 2).await;
    });
}

#[test]
fn the_folder_is_looked_for_without_the_spaces_around_it() {
    drive(|harness| async move {
        let ports = Ports {
            checks: Arc::new(Machine {
                folders: Some(vec![FOLDER.to_owned()]),
                ..Machine::default()
            }),
            planner_for: Arc::new(Planners::new(Arc::clone(&harness.planner) as _)),
            settings: Arc::new(MemorySettings),
            saved_for: Arc::new(closta_shell::new_session::NoSaved),
        };
        let mut shell = harness.shell_with(ports);
        let padded = format!(" {FOLDER} ");
        let check = start_in(&mut shell, &padded).check.expect("a check");
        assert_eq!(check.folder, FOLDER);
        assert!(check.exists.await, "the folder is looked for as trimmed");
    });
}

#[test]
fn a_missing_folder_keeps_the_dialog_and_says_so() {
    drive(|harness| async move {
        let ports = Ports {
            checks: Arc::new(Machine {
                folders: Some(Vec::new()),
                ..Machine::default()
            }),
            planner_for: Arc::new(Planners::new(Arc::clone(&harness.planner) as _)),
            settings: Arc::new(MemorySettings),
            saved_for: Arc::new(closta_shell::new_session::NoSaved),
        };
        let mut shell = harness.shell_with(ports);
        let check = start_in(&mut shell, FOLDER).check.expect("a check");
        assert!(!check.exists.await);
        let acted = shell.act(ShellAction::FolderChecked {
            folder: check.folder,
            exists: false,
        });
        assert!(acted.started.is_none());
        let dialog = shell.new_session().unwrap();
        assert_eq!(dialog.problem, Some(Problem::FolderMissing));
        assert!(!dialog.checking);
        assert_eq!(
            closta_shell::new_session::problem_text(dialog.problem.as_ref().unwrap()),
            "This folder does not exist."
        );
        assert!(shell.slots().is_empty());
        assert!(shell.recent_folders().is_empty());
    });
}

#[test]
fn a_second_start_while_checking_does_nothing() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        assert!(start_in(&mut shell, FOLDER).check.is_some());
        let again = shell.act(ShellAction::StartSession {
            folder: FOLDER.to_owned(),
        });
        assert!(again.check.is_none());
        let edit = shell.act(ShellAction::EditFolder {
            text: r"C:\other".to_owned(),
        });
        assert!(!edit.folder, "the field is not changed while it is checked");
        assert_eq!(shell.new_session().unwrap().folder, FOLDER);
    });
}

#[test]
fn a_check_for_a_folder_no_longer_in_the_dialog_is_ignored() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        assert!(start_in(&mut shell, FOLDER).check.is_some());
        shell.act(ShellAction::CancelNewSession);
        let acted = shell.act(ShellAction::FolderChecked {
            folder: FOLDER.to_owned(),
            exists: true,
        });
        assert!(acted.started.is_none());
        assert!(shell.slots().is_empty());

        shell.act(ShellAction::OpenNewSession);
        shell.act(ShellAction::EditFolder {
            text: r"C:\b".to_owned(),
        });
        let acted = shell.act(ShellAction::FolderChecked {
            folder: FOLDER.to_owned(),
            exists: true,
        });
        assert!(acted.started.is_none(), "the dialog is not checking");
        assert!(shell.slots().is_empty());
        assert_eq!(shell.new_session().unwrap().folder, r"C:\b");
    });
}

#[test]
fn a_quick_problem_blocks_start_without_a_check() {
    drive(|harness| async move {
        let ports = Ports {
            checks: Arc::new(Machine {
                claude: ClaudeOnPath::Missing,
                ..Machine::default()
            }),
            planner_for: Arc::new(Planners::new(Arc::clone(&harness.planner) as _)),
            settings: Arc::new(MemorySettings),
            saved_for: Arc::new(closta_shell::new_session::NoSaved),
        };
        let mut shell = harness.shell_with(ports);
        let acted = start_in(&mut shell, FOLDER);
        assert!(acted.check.is_none());
        let dialog = shell.new_session().unwrap();
        assert_eq!(dialog.problem, Some(Problem::ClaudeMissing));
        assert!(!dialog.checking);
    });
}

struct Failing(SessionFailure);

impl SessionLaunchPlanner for Failing {
    fn plan(
        &self,
        _session_id: &str,
        _working_directory: Option<&str>,
    ) -> future::Boxed<Result<closta_session::launch::SessionLaunch, SessionFailure>> {
        let failure = self.0.clone();
        Box::pin(async move { Err(failure) })
    }
}

#[test]
fn the_failure_band_reads_the_status() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let launch = SlotLaunch {
            title: "broken".into(),
            planner: Arc::new(Failing(SessionFailure::WslCommandNotFound {
                distro: "Ubuntu-26.04".into(),
            })),
            working_directory: Some(r"\\wsl.localhost\Ubuntu-26.04\home\x".into()),
            companion: None,
            relaunch: None,
            project: None,
            settles_on_failure: false,
            session_id: None,
            resume: None,
        };
        let slot = shell.open(launch);
        let mut watch = shell.watch(slot).unwrap();
        assert_eq!(shell.failure(slot), None);
        while !matches!(shell.status(slot), Some(SessionStatus::Failed(_))) {
            assert!(watch.changed().await);
            shell.refresh(slot, watch.generation(), 0).unwrap();
        }
        assert_eq!(
            shell.failure(slot),
            Some((
                "claude is not installed in Ubuntu-26.04, or not on the login shell's PATH."
                    .to_owned(),
                Some("Run `claude --version` in a WSL terminal.".to_owned())
            ))
        );
        assert!(!shell.ended(slot));

        let (launch, runtime) = harness.launch("fine");
        let fine = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        until(|| matches!(runtime.status(), SessionStatus::Running { .. })).await;
        refresh(&mut shell, fine);
        assert_eq!(shell.failure(fine), None);
    });
}

fn status_line(value: &str) -> String {
    format!(
        r#"{{"type":"system","subtype":"status","uuid":"st","session_id":"s","status":{value}}}"#
    )
}

// The CLI's status is said only while a turn runs (e8e6cd2's ComposerState.kt), so a turn runs
// first.
#[test]
fn compacting_follows_the_clis_status() {
    drive(|harness| async move {
        let (mut shell, slot, runtime, control) = running_slot(&harness).await;
        type_in(&mut shell, slot, "/compact");
        shell.act(ShellAction::Send { slot });
        control.next_stdin_line().await.expect("the send");
        refresh(&mut shell, slot);
        assert!(shell.running(slot), "the turn runs");
        assert!(!shell.compacting(slot));

        control.emit(&status_line(r#""compacting""#));
        until(|| runtime.view().transcript.operations.compacting).await;
        refresh(&mut shell, slot);
        assert!(shell.compacting(slot));

        control.emit(&status_line("null"));
        until(|| !runtime.view().transcript.operations.compacting).await;
        refresh(&mut shell, slot);
        assert!(!shell.compacting(slot));
    });
}

// e8e6cd2: a compaction the CLI says outside a turn is not said.
#[test]
fn compacting_is_not_said_outside_a_turn() {
    drive(|harness| async move {
        let (mut shell, slot, runtime, control) = running_slot(&harness).await;
        control.emit(&status_line(r#""compacting""#));
        until(|| runtime.view().transcript.operations.compacting).await;
        refresh(&mut shell, slot);
        assert!(!shell.running(slot), "no turn runs");
        assert!(!shell.compacting(slot));
    });
}

#[test]
fn ready_lines_wait_for_every_slot_to_run_or_fail() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        assert_eq!(shell.ready_lines(), None);

        let (launch, runtime) = harness.launch("fine");
        let fine = shell.open(launch);
        let broken = shell.open(SlotLaunch {
            title: "broken".into(),
            planner: Arc::new(Failing(SessionFailure::WslCommandNotFound {
                distro: "Ubuntu-26.04".into(),
            })),
            working_directory: Some(r"\\wsl.localhost\Ubuntu-26.04\home\x".into()),
            companion: None,
            relaunch: None,
            project: None,
            settles_on_failure: false,
            session_id: None,
            resume: None,
        });
        assert_eq!(shell.ready_lines(), None);

        let runtime = runtime.recv().await.unwrap();
        until(|| matches!(runtime.status(), SessionStatus::Running { .. })).await;
        refresh(&mut shell, fine);
        // The failing slot has not been read since it started.
        assert_eq!(shell.ready_lines(), None);

        let mut watch = shell.watch(broken).unwrap();
        while !matches!(shell.status(broken), Some(SessionStatus::Failed(_))) {
            assert!(watch.changed().await);
            shell.refresh(broken, watch.generation(), 0).unwrap();
        }
        let lines = shell.ready_lines().unwrap();
        assert_eq!(lines, ["Running 2.1.325", "Failed WslCommandNotFound"]);
        assert!(
            lines
                .iter()
                .all(|line| !line.contains('\\') && !line.contains("home")),
            "{lines:?}"
        );

        // A slot that is to fail does not count as settled while it runs.
        let (mut launch, runtime) = harness.launch("to-fail");
        launch.settles_on_failure = true;
        let to_fail = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        until(|| matches!(runtime.status(), SessionStatus::Running { .. })).await;
        refresh(&mut shell, to_fail);
        assert_eq!(shell.status(to_fail).map(|it| it.is_end()), Some(false));
        assert_eq!(shell.ready_lines(), None);
    });
}

fn pick(shell: &mut ShellState, slot: SlotId, mode: &str) {
    shell.act(ShellAction::PickMode {
        slot,
        mode: mode.to_owned(),
    });
}

fn mode_lines(control: &LiveControl) -> Vec<String> {
    control
        .stdin_lines()
        .into_iter()
        .filter(|it| it.contains("set_permission_mode"))
        .collect()
}

async fn quiet() {
    smol::Timer::after(std::time::Duration::from_millis(150)).await;
}

#[test]
fn picking_a_mode_switches_it() {
    drive(|harness| async move {
        let (mut shell, slot, _runtime, control) = running_slot(&harness).await;
        pick(&mut shell, slot, "acceptEdits");
        until(|| mode_lines(&control).len() == 1).await;
        assert!(mode_lines(&control)[0].contains("acceptEdits"));
        assert!(!shell.bypass_asking(slot));
        refresh(&mut shell, slot);
        assert!(shell.composer_line(slot).unwrap().switching);
        let sent: serde_json::Value = serde_json::from_str(&mode_lines(&control)[0]).unwrap();
        control.emit(&format!(
            r#"{{"type":"control_response","response":{{"subtype":"success","request_id":"{}"}}}}"#,
            sent["request_id"].as_str().unwrap()
        ));
        for _ in 0..100 {
            refresh(&mut shell, slot);
            if shell.composer_line(slot).unwrap().mode.is_some() {
                break;
            }
            smol::Timer::after(std::time::Duration::from_millis(20)).await;
        }
        assert!(!shell.composer_line(slot).unwrap().switching);
        assert_eq!(
            shell.composer_line(slot).unwrap().mode.as_deref(),
            Some("acceptEdits")
        );
    });
}

#[test]
fn bypass_asks_first_and_cancel_keeps_the_mode() {
    drive(|harness| async move {
        let (mut shell, slot, _runtime, control) = running_slot(&harness).await;
        pick(&mut shell, slot, "bypassPermissions");
        assert!(shell.bypass_asking(slot));
        quiet().await;
        assert!(mode_lines(&control).is_empty());
        shell.act(ShellAction::CancelBypass { slot });
        assert!(!shell.bypass_asking(slot));
        quiet().await;
        assert!(mode_lines(&control).is_empty());
    });
}

#[test]
fn confirming_bypass_switches_to_it() {
    drive(|harness| async move {
        let (mut shell, slot, _runtime, control) = running_slot(&harness).await;
        shell.act(ShellAction::ConfirmBypass { slot });
        quiet().await;
        assert!(mode_lines(&control).is_empty(), "no question, no switch");

        pick(&mut shell, slot, "bypassPermissions");
        shell.act(ShellAction::ConfirmBypass { slot });
        until(|| mode_lines(&control).len() == 1).await;
        assert!(mode_lines(&control)[0].contains("bypassPermissions"));
        assert!(!shell.bypass_asking(slot));
    });
}

#[test]
fn the_bypass_question_belongs_to_its_slot() {
    drive(|harness| async move {
        let (mut shell, slot, _runtime, _control) = running_slot(&harness).await;
        let (launch, _) = harness.launch("other");
        let other = shell.open(launch);
        pick(&mut shell, slot, "bypassPermissions");
        assert!(shell.bypass_asking(slot));
        assert!(!shell.bypass_asking(other));
        shell.act(ShellAction::ConfirmBypass { slot: other });
        assert!(shell.bypass_asking(slot));
    });
}

#[test]
fn no_mode_is_picked_while_a_switch_waits() {
    drive(|harness| async move {
        let (mut shell, slot, _runtime, control) = running_slot(&harness).await;
        pick(&mut shell, slot, "acceptEdits");
        until(|| mode_lines(&control).len() == 1).await;
        refresh(&mut shell, slot);
        assert!(shell.composer_line(slot).unwrap().switching);
        pick(&mut shell, slot, "plan");
        pick(&mut shell, slot, "bypassPermissions");
        quiet().await;
        assert_eq!(mode_lines(&control).len(), 1);
        assert!(!shell.bypass_asking(slot));
    });
}

#[test]
fn an_unknown_mode_is_not_sent() {
    drive(|harness| async move {
        let (mut shell, slot, _runtime, control) = running_slot(&harness).await;
        pick(&mut shell, slot, "yolo");
        quiet().await;
        assert!(mode_lines(&control).is_empty());
        assert!(!shell.bypass_asking(slot));
    });
}

#[test]
fn a_mode_is_not_picked_behind_an_overlay() {
    drive(|harness| async move {
        let (mut shell, slot, _runtime, control) = running_slot(&harness).await;
        pick(&mut shell, slot, "bypassPermissions");
        shell.act(ShellAction::OpenNewSession);
        pick(&mut shell, slot, "acceptEdits");
        shell.act(ShellAction::ConfirmBypass { slot });
        quiet().await;
        assert!(mode_lines(&control).is_empty());
        assert!(shell.bypass_asking(slot));
    });
}

fn ack_mode(control: &LiveControl, n: usize) {
    let sent: serde_json::Value = serde_json::from_str(&mode_lines(control)[n]).unwrap();
    control.emit(&format!(
        r#"{{"type":"control_response","response":{{"subtype":"success","request_id":"{}"}}}}"#,
        sent["request_id"].as_str().unwrap()
    ));
}

#[test]
fn a_restart_takes_the_old_bypass_banner_down() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let slot = shell.open(relaunchable(&harness, "again"));
        until(|| harness.answers.lock().unwrap().controls.len() == 1).await;
        let control = harness.control(0).await;
        let mut watch = shell.watch(slot).unwrap();
        assert!(watch.changed().await);
        shell.refresh(slot, watch.generation(), 0).unwrap();
        until(|| matches!(shell.status(slot), Some(SessionStatus::Running { .. }))).await;

        pick(&mut shell, slot, "bypassPermissions");
        assert!(shell.bypass_asking(slot));
        control.exit(0);
        while watch.changed().await {}
        shell.refresh(slot, watch.generation(), 0).unwrap();
        shell.act(ShellAction::Restart { slot });
        assert!(!shell.bypass_asking(slot));

        let second = harness.control(1).await;
        shell.act(ShellAction::ConfirmBypass { slot });
        quiet().await;
        assert!(mode_lines(&control).is_empty() && mode_lines(&second).is_empty());
        assert_eq!(control.refused_writes() + second.refused_writes(), 0);
    });
}

#[test]
fn a_banner_over_an_ended_or_closed_slot_writes_nothing() {
    drive(|harness| async move {
        let (mut shell, slot, _runtime, control) = running_slot(&harness).await;
        pick(&mut shell, slot, "bypassPermissions");
        control.exit(0);
        let mut watch = shell.watch(slot).unwrap();
        while watch.changed().await {}
        shell.refresh(slot, watch.generation(), 0).unwrap();
        shell.act(ShellAction::ConfirmBypass { slot });
        quiet().await;
        assert!(mode_lines(&control).is_empty());
        assert_eq!(control.refused_writes(), 0);
    });
    drive(|harness| async move {
        let (mut shell, slot, _runtime, control) = running_slot(&harness).await;
        pick(&mut shell, slot, "bypassPermissions");
        shell.act(ShellAction::CloseSlot { slot });
        shell.act(ShellAction::ConfirmCloseSlot);
        shell.act(ShellAction::ConfirmBypass { slot });
        quiet().await;
        assert!(mode_lines(&control).is_empty());
        assert_eq!(control.refused_writes(), 0);
    });
}

#[test]
fn two_picks_before_a_refresh_send_one_switch() {
    drive(|harness| async move {
        let (mut shell, slot, _runtime, control) = running_slot(&harness).await;
        pick(&mut shell, slot, "acceptEdits");
        pick(&mut shell, slot, "plan");
        pick(&mut shell, slot, "bypassPermissions");
        shell.act(ShellAction::ConfirmBypass { slot });
        quiet().await;
        assert_eq!(mode_lines(&control).len(), 1);
        assert!(!shell.bypass_asking(slot));
    });
}

#[test]
fn confirming_bypass_waits_while_a_switch_is_pending() {
    drive(|harness| async move {
        let (mut shell, slot, runtime, control) = running_slot(&harness).await;
        pick(&mut shell, slot, "bypassPermissions");
        runtime.commands().unwrap().switch_mode("plan").unwrap();
        until(|| mode_lines(&control).len() == 1).await;
        refresh(&mut shell, slot);
        assert!(shell.composer_line(slot).unwrap().switching);
        shell.act(ShellAction::ConfirmBypass { slot });
        quiet().await;
        assert_eq!(mode_lines(&control).len(), 1);
        assert!(shell.bypass_asking(slot), "the banner stays");
    });
}

#[test]
fn confirming_bypass_in_bypass_only_takes_the_banner_down() {
    drive(|harness| async move {
        let (mut shell, slot, runtime, control) = running_slot(&harness).await;
        pick(&mut shell, slot, "bypassPermissions");
        runtime
            .commands()
            .unwrap()
            .switch_mode("bypassPermissions")
            .unwrap();
        until(|| mode_lines(&control).len() == 1).await;
        ack_mode(&control, 0);
        for _ in 0..100 {
            refresh(&mut shell, slot);
            if shell.composer_line(slot).unwrap().mode.as_deref() == Some("bypassPermissions") {
                break;
            }
            smol::Timer::after(std::time::Duration::from_millis(20)).await;
        }
        shell.act(ShellAction::ConfirmBypass { slot });
        quiet().await;
        assert_eq!(mode_lines(&control).len(), 1, "nothing new is written");
        assert!(!shell.bypass_asking(slot));
    });
}
