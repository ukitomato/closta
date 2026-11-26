#![allow(clippy::expect_used, clippy::unwrap_used)]
//! A session that resumes a saved one: the arguments it starts the CLI with, and the earlier
//! conversation put back from the record, once, before anything the CLI says. The record is the
//! one capture 22 holds and the stdout is its second CLI's. SessionRuntimeResumeTest.kt.

#[path = "../../providers/tests/common/mod.rs"]
mod common;
mod support;

use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::Arc;

use closta_core::ports::{SavedSessions, SavedSessionsError};
use closta_model::{AgentEvent, RawJson, SavedTranscript};
use closta_presenter::input::SendId;
use closta_presenter::thread_running::thread_is_running;
use closta_presenter::transcript::Role;
use closta_providers::claude::fake::live::LiveOptions;
use closta_providers::claude::fake::record_fs::MemoryRecordFs;
use closta_providers::claude::fake::saved::FakeSavedSessions;
use closta_providers::claude::history::{ProjectTranscripts, RecordFs, name_of};
use closta_providers::claude::launch::LaunchError;
use closta_session::history::SessionOpening;
use closta_session::runtime::{SessionConfig, SessionRuntime};
use closta_session::status::SessionStatus;

use support::{ID, Processes, WORKING_DIR, drive, reach, runtime, until};

/// The id capture 22's record was saved under, and both of its CLIs say.
const RESUMED: &str = "336ed47b-2675-4317-b3f5-a3b48abb03a2";
const CAPTURE: &str = "22-resume.ndjson";
const TURN: &str = "01-baseline-text.ndjson";
const PROJECT: &str = "/work/the project";

fn running(status: &SessionStatus) -> bool {
    matches!(status, SessionStatus::Running { .. })
}

/// What the reader gives for the record of capture 22, read from a place in memory.
fn captured() -> SavedTranscript {
    let (name, _) = common::manifest_transcript(CAPTURE).expect("capture 22 has a transcript");
    let fs = Arc::new(MemoryRecordFs::default());
    fs.put(
        &format!("/config/projects/{}/{RESUMED}.jsonl", name_of(PROJECT)),
        common::bytes_of(&name),
        1_000,
    );
    let sessions = ProjectTranscripts::new(
        fs as Arc<dyn RecordFs>,
        Arc::new(|| Some(PathBuf::from("/config"))),
        Some(PROJECT.to_owned()),
        false,
        Arc::new(|_: &str| {}),
    );
    sessions
        .read(RESUMED, &|| false)
        .expect("the record of capture 22 is saved under the resumed id")
}

/// The second CLI's stdout (`--resume`): the lines after the recorder's mark.
fn second_stdout() -> Vec<String> {
    let lines = common::non_blank_lines(&common::text_of(CAPTURE));
    let boundary = format!(r#""type":"{}""#, common::RECORDER_BOUNDARY);
    let mark = lines
        .iter()
        .position(|line| line.contains(&boundary))
        .expect("capture 22 has a mark");
    lines[mark + 1..].to_vec()
}

fn with_record() -> Arc<FakeSavedSessions> {
    Arc::new(FakeSavedSessions::default().with_transcript(RESUMED, captured()))
}

/// The session resumed from `saved`, with effort high.
fn resuming(saved: Option<Arc<FakeSavedSessions>>) -> impl FnOnce(&mut SessionConfig) {
    move |config| {
        config.id = RESUMED.to_owned();
        config.effort = Some("high".to_owned());
        config.opening = SessionOpening::Resume;
        config.saved = saved.map(|saved| saved as Arc<dyn SavedSessions>);
    }
}

fn session_args(processes: &Processes) -> Vec<String> {
    processes
        .session_args()
        .last()
        .cloned()
        .expect("a session process was started")
}

async fn running_now(runtime: &SessionRuntime) {
    reach(runtime, running).await;
}

#[test]
fn a_resumed_session_starts_the_cli_with_resume_of_its_id_and_no_session_id() {
    drive(|executor| async move {
        let processes = Processes::new();
        let (runtime, run, _log) = runtime(&processes, resuming(Some(with_record())));
        let run = executor.spawn(run);
        running_now(&runtime).await;

        let argv = session_args(&processes);
        assert!(argv.contains(&format!("--resume={RESUMED}")), "{argv:?}");
        assert!(
            !argv.iter().any(|it| it.starts_with("--session-id")),
            "{argv:?}"
        );
        let effort = argv
            .iter()
            .position(|it| it == "--effort")
            .expect("--effort");
        assert_eq!(argv[effort + 1], "high");
        assert_eq!(runtime.id(), RESUMED);
        runtime.close();
        run.await;
    });
}

#[test]
fn a_new_session_starts_with_its_own_id_and_reads_no_record() {
    drive(|executor| async move {
        let processes = Processes::new();
        let saved = Arc::new(FakeSavedSessions::default());
        let held = Arc::clone(&saved);
        let (runtime, run, _log) = runtime(&processes, move |config| {
            config.effort = Some("high".to_owned());
            config.saved = Some(held as Arc<dyn SavedSessions>);
        });
        let run = executor.spawn(run);
        running_now(&runtime).await;

        let argv = session_args(&processes);
        assert!(argv.contains(&format!("--session-id={ID}")), "{argv:?}");
        assert!(
            !argv.iter().any(|it| it.starts_with("--resume")),
            "{argv:?}"
        );
        assert!(
            saved.reads().is_empty(),
            "a new session has no record to read"
        );
        let transcript = runtime.view().transcript;
        assert_eq!(transcript.restored, None);
        assert!(!transcript.history_unavailable);
        runtime.close();
        run.await;
    });
}

#[test]
fn the_earlier_conversation_is_in_the_view_before_what_the_cli_says() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        // The CLI has said its turn before the host reads the first line of it: the record is
        // still folded first.
        for line in second_stdout() {
            control.emit(&line);
        }
        let saved = with_record();
        let (runtime, run, _log) = runtime(&processes, resuming(Some(Arc::clone(&saved))));
        let run = executor.spawn(run);
        running_now(&runtime).await;
        until(|| runtime.view().transcript.messages.len() == 3).await;

        let transcript = runtime.view().transcript;
        let restored = transcript
            .restored
            .clone()
            .expect("the record was put back");
        assert_eq!(
            saved.reads(),
            [RESUMED],
            "read once, for the session resumed"
        );
        assert_eq!(
            restored.count, 2,
            "the user's words and what the assistant answered"
        );
        assert!(!restored.partly);
        let keys: Vec<&str> = transcript.messages.order().collect();
        assert_eq!(
            restored.until, keys[1],
            "the mark is the last message put back"
        );
        let roles: Vec<Role> = keys
            .iter()
            .map(|key| transcript.messages.get(key).expect("a message").role)
            .collect();
        assert_eq!(
            roles,
            [Role::User, Role::Assistant, Role::Assistant],
            "the new turn is after what was put back"
        );
        runtime.close();
        run.await;
    });
}

#[test]
fn a_start_that_fails_puts_nothing_back() {
    drive(|executor| async move {
        let processes = Processes::new();
        processes.refuse(LaunchError::CommandNotFound);
        let saved = with_record();
        let (runtime, run, _log) = runtime(&processes, resuming(Some(Arc::clone(&saved))));
        executor.spawn(run).await;

        assert!(
            matches!(runtime.status(), SessionStatus::Failed(_)),
            "{:?}",
            runtime.status()
        );
        assert!(
            saved.reads().is_empty(),
            "no record is read for a process that did not start"
        );
        assert_eq!(runtime.view().transcript.restored, None);
    });
}

#[test]
fn a_record_that_cannot_be_read_is_said_and_the_session_goes_on() {
    drive(|executor| async move {
        let processes = Processes::new();
        let saved = with_record();
        saved.fail_reads(SavedSessionsError::Unreadable(ErrorKind::NotFound));
        let (runtime, run, log) = runtime(&processes, resuming(Some(saved)));
        let run = executor.spawn(run);
        running_now(&runtime).await;

        let transcript = runtime.view().transcript;
        assert!(transcript.history_unavailable);
        assert_eq!(transcript.restored, None);
        let lines = log.lines();
        assert!(
            lines
                .iter()
                .any(|line| line.starts_with("WARN") && line.contains("NotFound")),
            "{lines:?}"
        );
        runtime.close();
        run.await;
        assert!(
            log.lines().iter().all(|line| !line.contains(WORKING_DIR)),
            "no line shows the working folder"
        );
    });
}

#[test]
fn a_resume_with_nowhere_to_read_is_a_record_that_cannot_be_read() {
    drive(|executor| async move {
        let processes = Processes::new();
        let (runtime, run, log) = runtime(&processes, resuming(None));
        let run = executor.spawn(run);
        running_now(&runtime).await;

        assert!(runtime.view().transcript.history_unavailable);
        assert!(
            log.lines().iter().any(|line| line
                == &format!(
                    "WARN claude session {RESUMED}: the saved record could not be read (no saved \
                     sessions)"
                )),
            "{:?}",
            log.lines()
        );
        runtime.close();
        run.await;
    });
}

#[test]
fn a_new_session_never_says_the_history_is_unavailable() {
    drive(|executor| async move {
        let processes = Processes::new();
        let (runtime, run, _log) = runtime(&processes, |_| {});
        let run = executor.spawn(run);
        running_now(&runtime).await;

        let transcript = runtime.view().transcript;
        assert!(!transcript.history_unavailable);
        assert_eq!(transcript.restored, None);
        runtime.close();
        run.await;
    });
}

#[test]
fn the_id_of_a_resumed_session_is_the_one_its_user_lines_carry() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let (runtime, run, _log) = runtime(&processes, resuming(Some(with_record())));
        let run = executor.spawn(run);
        running_now(&runtime).await;

        runtime
            .commands()
            .expect("a running session has commands")
            .send_message(SendId::new("send-1").expect("a key"), "go on", &[])
            .expect("sent");

        let user_line = || {
            control
                .stdin_lines()
                .into_iter()
                .find(|line| line.contains(r#""type":"user""#))
        };
        until(|| user_line().is_some()).await;
        let line = user_line().expect("a user line");
        assert!(
            line.contains(&format!(r#""session_id":"{RESUMED}""#)),
            "the CLI's session id is the id of the session"
        );
        runtime.close();
        run.await;
    });
}

#[test]
fn a_record_cut_by_its_size_says_so() {
    drive(|executor| async move {
        let processes = Processes::new();
        let whole = captured();
        let saved = Arc::new(FakeSavedSessions::default().with_transcript(
            RESUMED,
            SavedTranscript {
                dropped: 7,
                ..whole
            },
        ));
        let (runtime, run, log) = runtime(&processes, resuming(Some(saved)));
        let run = executor.spawn(run);
        running_now(&runtime).await;

        let restored = runtime
            .view()
            .transcript
            .restored
            .clone()
            .expect("put back");
        assert!(restored.partly);
        assert!(
            log.lines().iter().any(|line| line
                == &format!(
                    "INFO claude session {RESUMED}: put back 5 lines of the saved record \
                     (SavedTranscript(5 events, 22 skipped, 7 dropped))"
                )),
            "{:?}",
            log.lines()
        );
        runtime.close();
        run.await;
    });
}

/// The `n`th of a long record's lines: the user's words on even lines, an answer on odd ones, so
/// that each line is a message of its own.
fn line(n: usize) -> AgentEvent {
    if n.is_multiple_of(2) {
        return AgentEvent::User {
            uuid: format!("u{n}"),
            session_id: RESUMED.to_owned(),
            timestamp: "t".to_owned(),
            message: RawJson(format!(r#"{{"role":"user","content":"line {n}"}}"#)),
            parent_tool_use_id: None,
            tool_use_result: None,
            subagent_type: None,
            task_description: None,
        };
    }
    AgentEvent::Assistant {
        uuid: format!("a{n}"),
        session_id: RESUMED.to_owned(),
        timestamp: "t".to_owned(),
        request_id: Some(format!("r{n}")),
        message: RawJson(format!(
            r#"{{"id":"msg_{n}","type":"message","role":"assistant","content":[{{"type":"text","text":"line {n}"}}]}}"#
        )),
        parent_tool_use_id: None,
        user_message_uuid: None,
        user_message_uuids: None,
        wire_tool_inputs: None,
        subagent_type: None,
        task_description: None,
        error: None,
    }
}

#[test]
fn a_record_longer_than_the_first_step_is_put_back_once() {
    drive(|executor| async move {
        let processes = Processes::new();
        let lines = 1_000;
        let saved = Arc::new(FakeSavedSessions::default().with_transcript(
            RESUMED,
            SavedTranscript {
                events: (0..lines).map(line).collect(),
                skipped: 0,
                dropped: 0,
            },
        ));
        let (runtime, run, _log) = runtime(&processes, resuming(Some(saved)));
        let run = executor.spawn(run);
        running_now(&runtime).await;

        let transcript = runtime.view().transcript;
        let restored = transcript.restored.clone().expect("put back");
        assert_eq!(
            transcript.messages.order().count(),
            lines,
            "each line once: the whole record replaces its newest part"
        );
        assert_eq!(usize::try_from(restored.count), Ok(lines));
        assert!(!restored.partly);
        runtime.close();
        run.await;
    });
}

#[test]
fn a_resume_whose_init_says_another_id_stays_running() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let other = "9c4f7a1e-2b3d-4e5f-8a6b-7c8d9e0f1a2b";
        for line in second_stdout() {
            if line.contains(r#""subtype":"init""#) {
                control.emit(&line.replace(RESUMED, other));
            } else {
                control.emit(&line);
            }
        }
        let (runtime, run, _log) = runtime(&processes, resuming(Some(with_record())));
        let run = executor.spawn(run);
        running_now(&runtime).await;
        until(|| runtime.view().transcript.messages.len() == 3).await;

        assert!(running(&runtime.status()), "{:?}", runtime.status());
        runtime.close();
        run.await;
    });
}

#[test]
fn closing_during_the_read_stops_it() {
    drive(|executor| async move {
        let processes = Processes::new();
        let control = processes.prepare(LiveOptions::default());
        let saved = with_record();
        saved.hold_reads();
        let (runtime, run, _log) = runtime(&processes, resuming(Some(Arc::clone(&saved))));
        let run = executor.spawn(run);
        until(|| saved.reads().len() == 1).await;
        assert_eq!(
            runtime.status(),
            SessionStatus::Starting,
            "not running while reading"
        );

        runtime.close();
        run.await;
        // The read runs on the blocking pool, which the run does not wait for.
        until(|| saved.stopped_reads() == 1).await;

        assert_eq!(runtime.status(), SessionStatus::Closed);
        assert_eq!(runtime.view().transcript.restored, None);
        assert!(control.destroyed());
        assert_eq!(control.next_stdin_line().await, None, "stdin is closed");
    });
}

#[test]
fn a_sandbox_restart_does_not_put_the_record_back_again() {
    drive(|executor| async move {
        let processes = Processes::new();
        let saved = with_record();
        let (runtime, run, _log) = runtime(&processes, resuming(Some(Arc::clone(&saved))));
        let run = executor.spawn(run);
        until(|| running(&runtime.status()) && processes.controls().len() == 1).await;
        let commands = runtime.commands().expect("commands");
        commands
            .send_message(SendId::new("m1").expect("a key"), "hello", &[])
            .expect("sent");
        for line in common::non_blank_lines(&common::text_of(TURN)) {
            processes.controls()[0].emit(&line);
        }
        until(|| {
            let view = runtime.view();
            view.transcript.routing.sends == 1
                && !thread_is_running(&view.conversation, &view.transcript)
        })
        .await;
        let before = runtime.view().transcript.restored.clone();
        assert!(before.is_some());

        assert!(runtime.turn_sandbox_on());
        until(|| running(&runtime.status()) && processes.controls().len() == 2).await;

        let argv = session_args(&processes);
        assert!(argv.contains(&format!("--resume={RESUMED}")), "{argv:?}");
        assert_eq!(saved.reads(), [RESUMED], "read once, for the first process");
        assert_eq!(runtime.view().transcript.restored, before);
        runtime.close();
        run.await;
    });
}

#[test]
fn a_resume_with_no_effort_or_mode_still_resumes() {
    drive(|executor| async move {
        let processes = Processes::new();
        let configure = resuming(Some(with_record()));
        let (runtime, run, _log) = runtime(&processes, move |config| {
            configure(config);
            config.effort = None;
        });
        let run = executor.spawn(run);
        running_now(&runtime).await;

        let argv = session_args(&processes);
        assert!(argv.contains(&format!("--resume={RESUMED}")), "{argv:?}");
        assert!(
            !argv.iter().any(|it| it.starts_with("--session-id")),
            "{argv:?}"
        );
        runtime.close();
        run.await;
    });
}
