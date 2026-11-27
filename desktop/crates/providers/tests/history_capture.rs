//! The record the CLI saved when capture 22 was taken, read and listed by `ProjectTranscripts`.

#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;

use std::path::PathBuf;
use std::sync::Arc;

use closta_core::ports::SavedSessions;
use closta_model::AgentEvent;
use closta_providers::claude::fake::record_fs::MemoryRecordFs;
use closta_providers::claude::history::{ProjectTranscripts, RecordFs, name_of};
use sha2::{Digest, Sha256};

const CWD: &str = "/work/the project";
const CAPTURE: &str = "22-resume.ndjson";

fn never() -> bool {
    false
}

// The record put where the reader looks for it, under the id its lines say it was saved as.
fn captured_record() -> (ProjectTranscripts, String) {
    let (name, sha) = common::manifest_transcript(CAPTURE).expect("capture 22 has a transcript");
    let bytes = common::bytes_of(&name);
    let digest: String = Sha256::digest(&bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    assert_eq!(digest, sha);
    let first = common::text_of(&name)
        .lines()
        .find(|it| it.contains("\"sessionId\""))
        .expect("a line with the session id")
        .to_owned();
    let row: serde_json::Value = serde_json::from_str(&first).unwrap();
    let session_id = row["sessionId"].as_str().unwrap().to_owned();
    let fs = Arc::new(MemoryRecordFs::default());
    fs.put(
        &format!("/config/projects/{}/{session_id}.jsonl", name_of(CWD)),
        bytes,
        1_000,
    );
    let sessions = ProjectTranscripts::new(
        fs as Arc<dyn RecordFs>,
        Arc::new(|| Some(PathBuf::from("/config"))),
        Some(CWD.to_owned()),
        false,
        Arc::new(|_: &str| {}),
    );
    (sessions, session_id)
}

#[test]
fn the_record_of_capture_22_reads_as_the_lines_the_cli_saved() {
    let (sessions, sid) = captured_record();

    let read = sessions.read(&sid, &never).unwrap();

    let kinds: Vec<&str> = read
        .events
        .iter()
        .map(|event| match event {
            AgentEvent::User { .. } => "User",
            AgentEvent::Assistant { .. } => "Assistant",
            _ => "Other",
        })
        .collect();
    assert_eq!(
        kinds,
        vec!["User", "Assistant", "Assistant", "User", "Assistant"]
    );
    assert_eq!(
        read.skipped, 31,
        "36 lines of the record, 5 of them the conversation"
    );
    assert_eq!(read.dropped, 0);
    let AgentEvent::User {
        message,
        tool_use_result,
        ..
    } = &read.events[0]
    else {
        panic!("the prompt is a user event");
    };
    assert!(message.0.contains("echo hello-from-resume"));
    assert!(tool_use_result.is_none());
    let AgentEvent::User {
        tool_use_result, ..
    } = &read.events[3]
    else {
        panic!("the result is a user event");
    };
    assert!(
        tool_use_result.is_some(),
        "the tool's result is lifted as stdout's tool_use_result is"
    );
}

#[test]
fn capture_22_is_listed_by_its_title() {
    let (sessions, sid) = captured_record();

    let listed = sessions.list(&never).unwrap();

    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, sid);
    assert_eq!(
        listed[0].title,
        "Run this exact bash command and report its output: echo hello-from-resume"
    );
}
