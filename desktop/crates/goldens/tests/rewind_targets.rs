//! What an ask or a turn's end offers: rewinding and forking, and where each cuts the record
//! (RewindTargetsTest.kt).

use std::sync::Arc;

use closta_goldens::common::{manifest_transcript, non_blank_lines, text_of};
use closta_goldens::replay::{Step, inputs, replay, replay_with};
use closta_model::AgentEvent;
use closta_presenter::input::{PresenterInput, SendId, UserSent};
use closta_presenter::records::history::RestoredRecord;
use closta_presenter::rewind_targets::{
    AskActions, ForkFrom, RewindConversation, RewindFilesThenConversation, RewindRefusal,
    ask_actions, turn_end_actions,
};
use closta_presenter::session::SessionView;
use closta_presenter::thread_running::thread_is_running;
use closta_presenter::transcript::Transcript;
use serde_json::Value;

const CAPTURE: &str = "27-resume-session-at";

fn steps() -> Vec<Step> {
    replay_with(CAPTURE, true)
}

fn transcript() -> Arc<Transcript> {
    steps()
        .pop()
        .unwrap_or_else(|| panic!("no step"))
        .view
        .transcript
}

/// The uuids the three messages went to the CLI with, in order (the capture's `command_uuid`s).
fn sent_uuids() -> Vec<String> {
    let mut uuids: Vec<String> = Vec::new();
    for input in inputs(CAPTURE, false) {
        if let PresenterInput::Event(AgentEvent::CommandLifecycle {
            command_uuid,
            state,
            ..
        }) = input
            && state == "queued"
            && !uuids.contains(&command_uuid)
        {
            uuids.push(command_uuid);
        }
    }
    uuids
}

/// The uuids of the lines the user typed in the capture's saved record, in order: a user line
/// whose message content is a string (CutCapture.kt).
fn said_uuids() -> Vec<String> {
    let (name, _) = manifest_transcript(&format!("{CAPTURE}.ndjson"))
        .unwrap_or_else(|| panic!("capture 27 has a record"));
    non_blank_lines(&text_of(&name))
        .iter()
        .filter_map(|line| {
            let row: Value = serde_json::from_str(line).ok()?;
            let said = row.get("type").and_then(Value::as_str) == Some("user")
                && row
                    .get("message")
                    .and_then(|it| it.get("content"))
                    .is_some_and(Value::is_string);
            said.then(|| row.get("uuid").and_then(Value::as_str).map(str::to_owned))
                .flatten()
        })
        .collect()
}

fn none(actions: &AskActions, refusal: RewindRefusal) {
    assert_eq!(
        &AskActions {
            rewind: None,
            rewind_files: None,
            fork: None,
            refusal: Some(refusal),
        },
        actions
    );
}

#[test]
fn the_capture_sent_three_asks_under_the_records_uuids() {
    let sent = sent_uuids();
    let said = said_uuids();
    let transcript = transcript();
    assert_eq!(3, sent.len());
    // The record keeps the uuid a message was sent under as its user line's: what the cut point
    // is read by.
    assert_eq!(said[0], sent[0]);
    assert_eq!(said[1], sent[1]);
    let kept: Vec<Option<&String>> = ["send-1", "send-2", "send-3"]
        .iter()
        .map(|it| transcript.user_uuids.get(*it))
        .collect();
    assert_eq!(sent.iter().map(Some).collect::<Vec<_>>(), kept);
}

#[test]
fn rewind_targets_the_asks_own_uuid() {
    let actions = ask_actions(&transcript(), false, "send-2");
    assert_eq!(
        Some(RewindConversation {
            rewind_before: Some(said_uuids()[1].clone())
        }),
        actions.rewind
    );
    assert_eq!(None, actions.refusal);
}

#[test]
fn the_first_ask_rewinds_to_nothing_kept() {
    let actions = ask_actions(&transcript(), false, "send-1");
    assert_eq!(
        Some(RewindConversation {
            rewind_before: None
        }),
        actions.rewind
    );
    assert_eq!(
        Some(RewindFilesThenConversation {
            message_id: "send-1".into(),
            rewind_before: None
        }),
        actions.rewind_files
    );
}

#[test]
fn a_partly_restored_first_ask_has_an_earlier_line() {
    let partly = Transcript {
        restored: Some(RestoredRecord {
            until: "x".into(),
            count: 3,
            partly: true,
        }),
        ..Transcript::clone(&transcript())
    };
    assert_eq!(
        Some(RewindConversation {
            rewind_before: Some(sent_uuids()[0].clone())
        }),
        ask_actions(&partly, false, "send-1").rewind
    );
    let whole = Transcript {
        restored: Some(RestoredRecord {
            until: "x".into(),
            count: 3,
            partly: false,
        }),
        ..Transcript::clone(&transcript())
    };
    assert_eq!(
        Some(RewindConversation {
            rewind_before: None
        }),
        ask_actions(&whole, false, "send-1").rewind
    );
}

#[test]
fn fork_from_the_last_ask() {
    assert_eq!(
        Some(ForkFrom {
            rewind_before: None
        }),
        ask_actions(&transcript(), false, "send-3").fork
    );
}

#[test]
fn fork_from_a_middle_ask() {
    let transcript = transcript();
    let sent = sent_uuids();
    assert_eq!(
        Some(ForkFrom {
            rewind_before: Some(sent[2].clone())
        }),
        ask_actions(&transcript, false, "send-2").fork
    );
    assert_eq!(
        Some(ForkFrom {
            rewind_before: Some(sent[1].clone())
        }),
        ask_actions(&transcript, false, "send-1").fork
    );
}

#[test]
fn rewind_refused_while_running() {
    let transcript = transcript();
    none(
        &ask_actions(&transcript, true, "send-2"),
        RewindRefusal::Running,
    );
    none(
        &turn_end_actions(&transcript, true, "send-1"),
        RewindRefusal::Running,
    );
}

#[test]
fn the_capture_is_running_until_its_turn_closes() {
    // Mid-way through the second turn the thread runs, so the host passes running = true.
    let steps = steps();
    let mid = steps
        .iter()
        .find(|it| it.view.transcript.user_uuids.len() == 2)
        .expect("a step with two sends");
    assert!(thread_is_running(
        &mid.view.conversation,
        &mid.view.transcript
    ));
    let last = &steps.last().expect("a step").view;
    assert!(!thread_is_running(&last.conversation, &last.transcript));
}

#[test]
fn an_unknown_ask_has_no_actions() {
    none(
        &ask_actions(&transcript(), false, "no-such-ask"),
        RewindRefusal::Unknown,
    );
    let unsent = replay(CAPTURE).pop().expect("a step").view.transcript;
    none(
        &ask_actions(&unsent, false, "send-2"),
        RewindRefusal::Unknown,
    );
}

#[test]
fn files_first_then_conversation() {
    assert_eq!(
        Some(RewindFilesThenConversation {
            message_id: "send-2".into(),
            rewind_before: Some(said_uuids()[1].clone()),
        }),
        ask_actions(&transcript(), false, "send-2").rewind_files
    );
}

#[test]
fn a_later_ask_without_a_uuid_is_skipped() {
    let lost = PresenterInput::UserSent(UserSent {
        message_id: SendId::new("lost").expect("a key"),
        text: "never reached the CLI".into(),
        attachments: Vec::new(),
        uuid: None,
    });
    let with_lost = inputs(CAPTURE, true)
        .iter()
        .fold(SessionView::default(), SessionView::fold)
        .fold(&lost);
    assert_eq!(
        Some(ForkFrom {
            rewind_before: None
        }),
        ask_actions(&with_lost.transcript, false, "send-3").fork
    );
}

#[test]
fn a_turn_end_rewinds_to_after_its_turn() {
    let sent = sent_uuids();
    let actions = turn_end_actions(&transcript(), false, "send-2");
    assert_eq!(
        AskActions {
            rewind: Some(RewindConversation {
                rewind_before: Some(sent[2].clone())
            }),
            rewind_files: Some(RewindFilesThenConversation {
                message_id: "send-3".into(),
                rewind_before: Some(sent[2].clone()),
            }),
            fork: None,
            refusal: None,
        },
        actions
    );
}

#[test]
fn the_last_turn_end_has_nothing_after_it() {
    let transcript = transcript();
    none(
        &turn_end_actions(&transcript, false, "send-3"),
        RewindRefusal::NothingAfter,
    );
    none(
        &turn_end_actions(&transcript, false, "no-such-ask"),
        RewindRefusal::Unknown,
    );
}
