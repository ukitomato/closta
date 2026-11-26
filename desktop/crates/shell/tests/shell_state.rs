#![allow(clippy::expect_used, clippy::unwrap_used)]
//! The shell's slots over sessions made of in-memory processes: opening, refreshing, replacing,
//! the rows' open state, the watch, the companion, the panes and the marks.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::io::ErrorKind;
use std::sync::Arc;
use std::time::Duration;

use closta_model::{AppInfo, SavedSessionSummary};
use closta_presenter::input::PresenterInput;
use closta_presenter::rows::{ThreadRow, ThreadRows};
use closta_presenter::session::SessionView;
use closta_providers::claude::fake::live::LiveControl;
use closta_providers::claude::launch::LaunchError;
use closta_session::runtime::SessionRuntime;
use closta_session::status::{SessionFailure, SessionStatus};
use closta_shell::header::app_header;
use closta_shell::new_session::{launch_in, resume_in};
use closta_shell::panes::{LEFT_WIDTH, Pane, Panes, RIGHT_WIDTH};
use closta_shell::rows::RowChange;
use closta_shell::slot::{SlotId, SlotLaunch, SlotMark, Spawn, mark_of};
use closta_shell::state::{Refresh, ShellAction, ShellState};
use closta_shell::watch::SlotWatch;
use futures_lite::future;
use smol::{Executor, Timer};
use support::{GUARD, Harness, Quiet, drive, running, until};

/// Whether `watch` says a change within a short while.
async fn changes_soon(watch: &mut SlotWatch) -> Option<bool> {
    future::or(async { Some(watch.changed().await) }, async {
        Timer::after(Duration::from_millis(300)).await;
        None
    })
    .await
}

fn lines(scenario: &str) -> Vec<String> {
    common::non_blank_lines(&common::text_of(&format!("{scenario}.ndjson")))
}

/// A `TodoWrite` call and a `Bash` call, each answered: no capture of this CLI writes to-dos
/// with `TodoWrite`.
fn todo_lines() -> Vec<String> {
    let call = |n: usize, name: &str, input: &str| {
        format!(
            r#"{{"type":"assistant","uuid":"a{n}","session_id":"s","timestamp":"t","request_id":"req","message":{{"id":"m{n}","role":"assistant","content":[{{"type":"tool_use","id":"t{n}","name":"{name}","input":{input}}}]}}}}"#
        )
    };
    let answer = |n: usize| {
        format!(
            r#"{{"type":"user","uuid":"u{n}","session_id":"s","timestamp":"t","message":{{"role":"user","content":[{{"type":"tool_result","tool_use_id":"t{n}","content":"ok"}}]}}}}"#
        )
    };
    vec![
        call(
            0,
            "TodoWrite",
            r#"{"todos":[{"content":"Plan","status":"in_progress","activeForm":"Planning"}]}"#,
        ),
        answer(0),
        call(1, "Bash", r#"{"command":"ls"}"#),
        answer(1),
    ]
}

/// The rows the lines make when folded into a fresh view.
fn rows_of(lines: &[String]) -> Vec<ThreadRow> {
    let view = lines.iter().fold(SessionView::default(), |view, line| {
        view.fold(&PresenterInput::Event(common::parse(line)))
    });
    ThreadRows::default().of(&view.transcript)
}

fn rows_now(runtime: &SessionRuntime) -> Vec<ThreadRow> {
    ThreadRows::default().of(&runtime.view().transcript)
}

/// Emits `lines` and waits until the session has folded them into `expected`.
async fn play(
    control: &LiveControl,
    runtime: &SessionRuntime,
    lines: &[String],
    expected: &[ThreadRow],
) {
    for line in lines {
        control.emit(line);
    }
    until(|| rows_now(runtime) == expected).await;
}

/// `changes` applied to `rows` the way a surface applies them, by key.
fn apply(rows: &[String], changes: &[RowChange], after: &[ThreadRow]) -> Vec<String> {
    let mut rows = rows.to_vec();
    for change in changes {
        if let RowChange::Splice { range, count } = change {
            let new = after[range.start..range.start + count]
                .iter()
                .map(|row| row.key().to_owned());
            rows.splice(range.clone(), new);
        }
    }
    rows
}

/// The `n`th slot another shell opens: one this shell, with fewer slots, does not hold.
fn foreign(harness: &Harness, n: usize) -> SlotId {
    let mut other = harness.shell();
    let mut last = None;
    for _ in 0..n {
        let (launch, _) = harness.launch("elsewhere");
        last = Some(other.open(launch));
    }
    last.expect("at least one slot")
}

fn keys(rows: &[ThreadRow]) -> Vec<String> {
    rows.iter().map(|row| row.key().to_owned()).collect()
}

const RUNNING: SessionStatus = SessionStatus::Running {
    version: String::new(),
};

fn version(status: &SessionStatus) -> SessionStatus {
    match status {
        SessionStatus::Running { .. } => RUNNING,
        other => other.clone(),
    }
}

#[test]
fn opening_a_slot_starts_its_session_and_selects_the_first() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        assert_eq!(shell.header().headline, "Closta 0.1.0");
        assert_eq!(shell.selected(), None);
        assert!(shell.slots().is_empty());

        let (launch, first_runtime) = harness.launch("first");
        let first = shell.open(launch);
        let (launch, second_runtime) = harness.launch("second");
        let second = shell.open(launch);
        assert_ne!(first, second);
        assert!(first < second);
        assert_eq!(shell.selected(), Some(first));

        let first_runtime = first_runtime.recv().await.unwrap();
        let second_runtime = second_runtime.recv().await.unwrap();
        assert_ne!(first_runtime.id(), second_runtime.id());
        running(&first_runtime).await;
        running(&second_runtime).await;

        let slots = shell.slots();
        assert_eq!(slots.len(), 2);
        assert_eq!((slots[0].id, slots[0].title.as_str()), (first, "first"));
        assert_eq!((slots[1].id, slots[1].title.as_str()), (second, "second"));
        assert_eq!(
            slots[0].mark,
            SlotMark::Starting,
            "nothing is shown before a refresh"
        );

        let mut watch = shell.watch(first).unwrap();
        assert_eq!((watch.slot(), watch.generation()), (first, 0));
        assert!(watch.changed().await);
        let refresh = shell.refresh(first, watch.generation(), 0).unwrap();
        assert_eq!(version(&refresh.status), RUNNING);
        assert_eq!(shell.slots()[0].mark, SlotMark::Ready);
        assert_eq!(version(&shell.status(first).unwrap()), RUNNING);
        assert!(!shell.running(first) && !shell.waiting(first));

        let unknown = foreign(&harness, 3);
        assert!(shell.watch(unknown).is_none());
        assert!(shell.refresh(unknown, 0, 0).is_none());
        assert!(shell.status(unknown).is_none());
        assert!(shell.rows(unknown).is_empty());
    });
}

#[test]
fn refresh_reads_the_view_and_returns_the_changes() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("baseline");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let control = harness.control(0).await;
        let lines = lines("01-baseline-text");
        let expected = rows_of(&lines);
        assert!(!expected.is_empty());

        let mut watch = shell.watch(slot).unwrap();
        play(&control, &runtime, &lines, &expected).await;
        assert!(watch.changed().await);
        let Refresh {
            status,
            running,
            waiting,
            changes,
            ..
        } = shell.refresh(slot, watch.generation(), 0).unwrap();
        assert_eq!(version(&status), RUNNING);
        assert!(!running && !waiting, "the turn is over");
        assert_eq!(
            changes,
            [RowChange::Splice {
                range: 0..0,
                count: expected.len()
            }]
        );
        assert_eq!(shell.rows(slot), expected.as_slice());

        let again = shell.refresh(slot, watch.generation(), 0).unwrap();
        assert_eq!(again.changes, [], "nothing changed since");
        runtime.close();
    });
}

#[test]
fn a_refresh_of_an_old_generation_does_nothing() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("old");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let old = shell.watch(slot).unwrap();
        assert!(shell.refresh(slot, old.generation(), 0).is_some());

        let (launch, _) = harness.launch("new");
        shell.replace(slot, launch).unwrap();
        let new = shell.watch(slot).unwrap();
        assert_eq!(new.generation(), old.generation() + 1);
        assert!(shell.refresh(slot, old.generation(), 0).is_none());
        assert!(shell.refresh(slot, new.generation() + 1, 0).is_none());
        assert!(shell.refresh(slot, new.generation(), 0).is_some());
    });
}

#[test]
fn replacing_a_slot_keeps_its_id_selection_and_open_rows_and_closes_the_old_session() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, old_runtime) = harness.launch("before");
        let slot = shell.open(launch);
        // The first process is awaited before the next slot opens: `control(0)` is its own.
        let old_runtime = old_runtime.recv().await.unwrap();
        running(&old_runtime).await;
        let control = harness.control(0).await;
        let (launch, _) = harness.launch("other");
        let other = shell.open(launch);
        shell.act(ShellAction::Select(other));
        shell.act(ShellAction::Select(slot));
        let lines = lines("01-baseline-text");
        let expected = rows_of(&lines);
        play(&control, &old_runtime, &lines, &expected).await;
        let mut old_watch = shell.watch(slot).unwrap();
        assert!(old_watch.changed().await);
        shell.refresh(slot, old_watch.generation(), 0).unwrap();
        let key = expected[0].key().to_owned();
        shell.act(ShellAction::ToggleRow {
            slot,
            key: key.clone(),
        });
        assert!(shell.is_open(slot, &expected[0]));

        let (launch, new_runtime) = harness.launch("after");
        let changes = shell.replace(slot, launch).unwrap();
        assert_eq!(
            changes,
            [RowChange::Splice {
                range: 0..expected.len(),
                count: 0
            }]
        );
        assert_eq!(old_runtime.status(), SessionStatus::Closed);
        let new_runtime = new_runtime.recv().await.unwrap();
        assert_ne!(new_runtime.id(), old_runtime.id());
        assert_eq!(shell.selected(), Some(slot));
        assert!(shell.rows(slot).is_empty());
        assert!(shell.is_open(slot, &expected[0]), "the open rows stay");
        let summary = &shell.slots()[0];
        assert_eq!((summary.id, summary.title.as_str()), (slot, "after"));
        assert_eq!(summary.mark, SlotMark::Starting);

        // The old watch ends once the old run has returned, and its last refresh does nothing.
        while old_watch.changed().await {}
        assert!(control.ended());
        assert!(shell.refresh(slot, old_watch.generation(), 0).is_none());

        // Nothing to clear is no change.
        let (launch, _) = harness.launch("again");
        assert_eq!(shell.replace(slot, launch).unwrap(), []);
        let (launch, _) = harness.launch("nowhere");
        assert!(shell.replace(foreign(&harness, 3), launch).is_none());
        new_runtime.close();
    });
}

#[test]
fn toggling_a_row_flips_it_and_remeasures_that_row() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("rows");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let control = harness.control(0).await;
        let lines = lines("01-baseline-text");
        let expected = rows_of(&lines);
        play(&control, &runtime, &lines, &expected).await;
        let mut watch = shell.watch(slot).unwrap();
        assert!(watch.changed().await);
        shell.refresh(slot, watch.generation(), 0).unwrap();

        let at = expected.len() - 1;
        let row = &expected[at];
        assert!(!shell.is_open(slot, row));
        let toggle = ShellAction::ToggleRow {
            slot,
            key: row.key().to_owned(),
        };
        assert_eq!(
            shell.act(toggle.clone()).rows,
            Some((slot, vec![RowChange::Remeasure(at..at + 1)]))
        );
        assert!(shell.is_open(slot, row));
        assert_eq!(
            shell.act(toggle).rows,
            Some((slot, vec![RowChange::Remeasure(at..at + 1)]))
        );
        assert!(!shell.is_open(slot, row));
        runtime.close();
    });
}

#[test]
fn a_todo_row_starts_open() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("todo");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let control = harness.control(0).await;
        let lines = todo_lines();
        let expected = rows_of(&lines);
        play(&control, &runtime, &lines, &expected).await;
        let mut watch = shell.watch(slot).unwrap();
        assert!(watch.changed().await);
        shell.refresh(slot, watch.generation(), 0).unwrap();

        let todo = expected
            .iter()
            .find(|row| matches!(row, ThreadRow::Todo(_)))
            .expect("the capture makes a todo row");
        assert!(shell.is_open(slot, todo));
        let tool = expected
            .iter()
            .find(|row| matches!(row, ThreadRow::Tool(_) | ThreadRow::Explored(_)))
            .expect("the capture makes a tool row");
        assert!(!shell.is_open(slot, tool));

        shell.act(ShellAction::ToggleRow {
            slot,
            key: todo.key().to_owned(),
        });
        assert!(!shell.is_open(slot, todo));
        runtime.close();
    });
}

#[test]
fn a_slot_that_is_not_selected_keeps_its_rows_current() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, shown) = harness.launch("shown");
        let selected = shell.open(launch);
        let shown = shown.recv().await.unwrap();
        running(&shown).await;
        let (launch, behind) = harness.launch("behind");
        let slot = shell.open(launch);
        let behind = behind.recv().await.unwrap();
        running(&behind).await;
        let control = harness.control(1).await;
        assert_eq!(shell.selected(), Some(selected));

        let lines = lines("01-baseline-text");
        let half = lines.len() / 2;
        let mut watch = shell.watch(slot).unwrap();
        let mut mirror: Vec<String> = Vec::new();
        let mut from = 0;
        for upto in [half, lines.len()] {
            let expected = rows_of(&lines[..upto]);
            play(&control, &behind, &lines[from..upto], &expected).await;
            from = upto;
            assert!(watch.changed().await);
            let refresh = shell.refresh(slot, watch.generation(), 0).unwrap();
            mirror = apply(&mirror, &refresh.changes, shell.rows(slot));
            assert_eq!(shell.rows(slot), expected.as_slice());
            assert_eq!(mirror, keys(&expected), "no change was missed");
        }
        assert_eq!(shell.selected(), Some(selected));
        assert!(shell.rows(selected).is_empty());

        shell.act(ShellAction::Select(slot));
        assert_eq!(shell.selected(), Some(slot));
        assert_eq!(shell.rows(slot), rows_of(&lines).as_slice());
        shown.close();
        behind.close();
    });
}

#[test]
fn a_slot_whose_launch_fails_ends_its_watch_with_the_failure() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        harness.refuse(LaunchError::Spawn(ErrorKind::NotFound));
        let (launch, _) = harness.launch("failing");
        let slot = shell.open(launch);
        let mut watch = shell.watch(slot).unwrap();
        let mut refreshes = 0;
        while watch.changed().await {
            shell.refresh(slot, watch.generation(), 0).unwrap();
            refreshes += 1;
        }
        let last = shell.refresh(slot, watch.generation(), 0).unwrap();
        assert!(refreshes >= 1);
        assert!(matches!(
            last.status,
            SessionStatus::Failed(SessionFailure::LaunchFailed {
                kind: ErrorKind::NotFound
            }) | SessionStatus::Failed(SessionFailure::CommandNotFound)
        ));
        assert_eq!(last.changes, []);
        assert!(shell.rows(slot).is_empty());
        assert_eq!(shell.slots()[0].mark, SlotMark::Failed);
        assert!(!watch.changed().await, "an ended watch stays ended");
    });
}

#[test]
fn a_watch_coalesces_pings_and_ends_once_the_session_ends() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("busy");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let control = harness.control(0).await;
        let mut watch = shell.watch(slot).unwrap();
        assert!(watch.changed().await);
        shell.refresh(slot, watch.generation(), 0).unwrap();

        let baseline = lines("01-baseline-text");
        let lines: Vec<String> = baseline.iter().cycle().take(100).cloned().collect();
        let before = control.stdout_lines_read();
        for line in &lines {
            control.emit(line);
        }
        until(|| control.stdout_lines_read() == before + 100).await;
        let folded = rows_of(&lines);
        until(|| rows_now(&runtime) == folded).await;
        assert_eq!(changes_soon(&mut watch).await, Some(true));
        assert_eq!(changes_soon(&mut watch).await, None, "the pings were one");

        control.exit(0);
        let mut after = 0;
        while watch.changed().await {
            after += 1;
        }
        assert!(after <= 2);
        let last = shell.refresh(slot, watch.generation(), 0).unwrap();
        assert_eq!(last.status, SessionStatus::Ended);
        assert_eq!(shell.slots()[0].mark, SlotMark::Ended);
    });
}

#[test]
fn a_watch_ends_only_once_the_closed_session_has_stopped_writing() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        harness.stubborn();
        let (launch, runtime) = harness.launch("stubborn");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let control = harness.control(0).await;
        let mut watch = shell.watch(slot).unwrap();
        assert!(watch.changed().await);

        let (launch, _) = harness.launch("next");
        shell.replace(slot, launch).unwrap();
        assert_eq!(runtime.status(), SessionStatus::Closed);
        assert!(watch.changed().await, "the close is a change");
        // The run still winds the old process down and may write the view: the watch waits.
        assert_eq!(changes_soon(&mut watch).await, None);
        control.exit(0);
        assert!(!watch.changed().await);
        assert!(control.ended());
    });
}

#[test]
fn a_session_that_ends_mid_turn_is_not_running() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let baseline = lines("01-baseline-text");
        // Up to the first text delta: the turn is open.
        let open = &baseline[..8];
        for (n, code, end) in [(0, 0, SlotMark::Ended), (1, 3, SlotMark::Failed)] {
            let (launch, runtime) = harness.launch("mid-turn");
            let slot = shell.open(launch);
            let runtime = runtime.recv().await.unwrap();
            running(&runtime).await;
            let control = harness.control(n).await;
            play(&control, &runtime, open, &rows_of(open)).await;
            let mut watch = shell.watch(slot).unwrap();
            assert!(watch.changed().await);
            assert!(shell.refresh(slot, watch.generation(), 0).unwrap().running);
            assert!(shell.running(slot));
            let at = shell.slots().iter().position(|it| it.id == slot).unwrap();
            assert_eq!(shell.slots()[at].mark, SlotMark::Working);

            control.exit(code);
            while watch.changed().await {
                shell.refresh(slot, watch.generation(), 0).unwrap();
            }
            let last = shell.refresh(slot, watch.generation(), 0).unwrap();
            assert!(last.status.is_end());
            assert!(!last.running, "the spinner stops with the session");
            assert!(!shell.running(slot));
            assert_eq!(shell.slots()[at].mark, end);
        }
    });
}

#[test]
fn a_watch_ends_when_its_run_is_dropped_unfinished() {
    let executor = Arc::new(Executor::new());
    let harness = Harness::new(executor);
    let spawn: Spawn = Arc::new(drop);
    let header = app_header(&AppInfo {
        name: "Closta".into(),
        version: "0.1.0".into(),
    });
    let mut shell = ShellState::new(header, spawn, Arc::new(Quiet), harness.ports());
    let (launch, _) = harness.launch("dropped");
    let slot = shell.open(launch);
    let mut watch = shell.watch(slot).unwrap();
    smol::block_on(future::race(
        async {
            assert!(watch.changed().await, "the first status");
            assert!(!watch.changed().await);
        },
        async {
            Timer::after(GUARD).await;
            panic!("the watch did not end")
        },
    ));
    assert_eq!(shell.status(slot), Some(SessionStatus::Starting));
}

#[test]
fn a_companion_runs_beside_the_session_with_its_runtime() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let (launch, runtime) = harness.launch("companion");
        let slot = shell.open(launch);
        let runtime = runtime.recv().await.unwrap();
        running(&runtime).await;
        let control = harness.control(0).await;
        let lines = lines("01-baseline-text");
        let expected = rows_of(&lines);
        play(&control, &runtime, &lines, &expected).await;
        let mut watch = shell.watch(slot).unwrap();
        assert!(watch.changed().await);
        shell.refresh(slot, watch.generation(), 0).unwrap();
        assert_eq!(
            shell.rows(slot),
            expected.as_slice(),
            "it is this slot's session"
        );

        let (launch, replaced) = harness.launch("replaced");
        shell.replace(slot, launch).unwrap();
        let replaced = replaced.recv().await.unwrap();
        assert_ne!(replaced.id(), runtime.id());
        assert_eq!(runtime.status(), SessionStatus::Closed);
        assert_ne!(replaced.status(), SessionStatus::Closed);
        replaced.close();

        let without = SlotLaunch {
            title: "alone".into(),
            planner: Arc::clone(&harness.planner) as _,
            working_directory: None,
            companion: None,
            relaunch: None,
            project: None,
            settles_on_failure: false,
            session_id: None,
            resume: None,
        };
        let alone = shell.open(without);
        assert!(shell.watch(alone).is_some());
    });
}

#[test]
fn panes_clamp_their_widths_and_the_right_one_starts_closed() {
    assert_eq!(LEFT_WIDTH, 200.0..=420.0);
    assert_eq!(RIGHT_WIDTH, 240.0..=480.0);
    let mut panes = Panes::default();
    assert_eq!(
        panes,
        Panes {
            left_open: true,
            right_open: false,
            left_width: 260.0,
            right_width: 300.0
        }
    );
    panes.toggle(Pane::Right);
    panes.toggle(Pane::Left);
    assert!(panes.right_open && !panes.left_open);
    assert_eq!(panes.resize(Pane::Left, 100.0), 200.0);
    assert_eq!(panes.resize(Pane::Left, 999.0), 420.0);
    assert_eq!(panes.resize(Pane::Left, 333.0), 333.0);
    assert_eq!(panes.resize(Pane::Right, 0.0), 240.0);
    assert_eq!(panes.resize(Pane::Right, 500.0), 480.0);
    assert_eq!(panes.resize(Pane::Right, f32::NAN), 480.0);
    assert_eq!((panes.left_width, panes.right_width), (333.0, 480.0));

    smol::block_on(async {
        let executor = Arc::new(Executor::new());
        let harness = Harness::new(executor);
        let mut shell = harness.shell();
        assert_eq!(shell.panes(), &Panes::default());
        assert!(
            shell
                .act(ShellAction::TogglePane(Pane::Right))
                .rows
                .is_none()
        );
        assert!(
            shell
                .act(ShellAction::ResizePane {
                    pane: Pane::Left,
                    width: 1000.0
                })
                .rows
                .is_none()
        );
        assert!(shell.panes().right_open);
        assert_eq!(shell.panes().left_width, 420.0);
    });
}

#[test]
fn the_marks_follow_the_status_and_the_turn() {
    let running = SessionStatus::Running {
        version: "2.1.282".into(),
    };
    assert_eq!(
        mark_of(&SessionStatus::Starting, false, false, false),
        SlotMark::Starting
    );
    assert_eq!(mark_of(&running, true, false, false), SlotMark::Working);
    assert_eq!(mark_of(&running, false, false, false), SlotMark::Ready);
    assert_eq!(mark_of(&running, true, true, false), SlotMark::Waiting);
    assert_eq!(mark_of(&running, false, true, false), SlotMark::Waiting);
    assert_eq!(
        mark_of(&SessionStatus::Ended, true, false, false),
        SlotMark::Ended
    );
    assert_eq!(
        mark_of(
            &SessionStatus::Failed(SessionFailure::CommandNotFound),
            false,
            false,
            false
        ),
        SlotMark::Failed
    );
    assert_eq!(
        mark_of(&SessionStatus::Closed, false, false, false),
        SlotMark::Closed
    );
}

fn summary_of(id: &str, title: &str) -> SavedSessionSummary {
    SavedSessionSummary {
        id: id.to_owned(),
        title: title.to_owned(),
        updated_at_ms: 1,
        bytes: 10,
    }
}

const FOLDER: &str = r"C:\work\closta";

#[test]
fn a_resumed_launch_starts_its_id_with_its_record() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let ports = harness.ports();
        let saved = summary_of("0b1f4c52-6a1e-4a43-9a53-7f0d2a4b8c11", "Fix the parser");
        let slot = shell.open(resume_in(FOLDER, &saved, &ports));
        harness.control(0).await;
        let args = harness.launch_args(0).await;
        assert!(args.contains(&format!("--resume={}", saved.id)), "{args:?}");
        assert!(
            !args.iter().any(|it| it.starts_with("--session-id")),
            "{args:?}"
        );
        assert_eq!(shell.session_id(slot), Some(saved.id.as_str()));
        assert_eq!(shell.slot_title(slot).as_deref(), Some("Fix the parser"));
        assert_eq!(shell.slots()[0].title, "Fix the parser");

        // The record was handed to the session: its background restore reads that id.
        let fakes = harness.saved_for.fakes();
        assert_eq!(fakes.len(), 1);
        until(|| fakes[0].reads().contains(&saved.id)).await;
    });
}

#[test]
fn a_new_launch_starts_a_new_id() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let ports = harness.ports();
        let first = shell.open(launch_in(FOLDER, &ports));
        harness.control(0).await;
        let second = shell.open(launch_in(FOLDER, &ports));
        harness.control(1).await;
        let (one, two) = (
            shell.session_id(first).unwrap().to_owned(),
            shell.session_id(second).unwrap().to_owned(),
        );
        assert_ne!(one, two);
        for (n, id) in [(0, &one), (1, &two)] {
            let args = harness.launch_args(n).await;
            assert!(args.contains(&format!("--session-id={id}")), "{args:?}");
            assert!(
                !args.iter().any(|it| it.starts_with("--resume")),
                "{args:?}"
            );
        }
    });
}

#[test]
fn the_title_of_a_resumed_slot_stays_after_its_first_request() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let ports = harness.ports();
        let saved = summary_of("0b1f4c52-6a1e-4a43-9a53-7f0d2a4b8c11", "Fix the parser");
        let (sender, receiver) = async_channel::bounded(1);
        let slot = shell.open(SlotLaunch {
            companion: Some(Box::new(move |runtime| {
                Box::pin(async move {
                    _ = sender.send(runtime).await;
                })
            })),
            ..resume_in(FOLDER, &saved, &ports)
        });
        let runtime = receiver.recv().await.unwrap();
        until(|| runtime.commands().is_some()).await;
        let control = harness.control(0).await;
        control.skip_initialize().await;
        shell.act(ShellAction::EditDraft {
            slot,
            text: "something else entirely".to_owned(),
        });
        shell.act(ShellAction::Send { slot });
        control.next_stdin_line().await.expect("the request");
        let generation = shell.watch(slot).unwrap().generation();
        shell.refresh(slot, generation, 0).unwrap();
        assert!(
            shell
                .rows(slot)
                .iter()
                .any(|it| matches!(it, ThreadRow::Ask(_))),
            "the request is in the conversation"
        );
        assert_eq!(shell.slot_title(slot).as_deref(), Some("Fix the parser"));
    });
}

#[test]
fn replacing_a_slot_rewrites_its_session_id() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let ports = harness.ports();
        let saved = summary_of("0b1f4c52-6a1e-4a43-9a53-7f0d2a4b8c11", "Fix the parser");
        let slot = shell.open(resume_in(FOLDER, &saved, &ports));
        harness.control(0).await;
        assert_eq!(shell.session_id(slot), Some(saved.id.as_str()));
        shell.replace(slot, launch_in(FOLDER, &ports)).unwrap();
        harness.control(1).await;
        let id = shell.session_id(slot).unwrap().to_owned();
        assert_ne!(id, saved.id);
        let args = harness.launch_args(1).await;
        assert!(args.contains(&format!("--session-id={id}")), "{args:?}");
        assert_eq!(shell.slot_title(slot).as_deref(), Some("New session"));
    });
}

#[test]
fn a_resume_without_a_title_is_still_a_resume() {
    drive(|harness| async move {
        let mut shell = harness.shell();
        let ports = harness.ports();
        let mut launch = resume_in(
            FOLDER,
            &summary_of("0b1f4c52-6a1e-4a43-9a53-7f0d2a4b8c11", "x"),
            &ports,
        );
        launch.resume.as_mut().unwrap().saved_title = None;
        let slot = shell.open(launch);
        harness.control(0).await;
        let args = harness.launch_args(0).await;
        assert!(
            args.iter().any(|it| it.starts_with("--resume=")),
            "{args:?}"
        );
        assert!(shell.resumed(slot), "the slot records the opening");
    });
}
