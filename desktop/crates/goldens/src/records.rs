//! The saved record of a capture, put where the CLI keeps a project's records and read and listed
//! by the providers' reader, as RecordGoldenTest.kt does it on the Kotlin side: the working
//! directory `/work/the project`, the config directory `/config`, links not resolved, the record
//! named by the first `sessionId` its lines carry.

use std::path::PathBuf;
use std::sync::Arc;

use closta_core::ports::SavedSessions;
use closta_model::{AgentEvent, RawJson, SavedSessionSummary, SavedTranscript};
use closta_providers::claude::fake::record_fs::MemoryRecordFs;
use closta_providers::claude::history::{ProjectTranscripts, RecordFs, name_of};
use serde_json::{Value, json};

use crate::common::{bytes_of, manifest_transcript, text_of};

const WORKING_DIRECTORY: &str = "/work/the project";
const CONFIG_DIR: &str = "/config";

/// What the reader gave for one capture's saved record.
pub struct CaptureRecord {
    pub session_id: String,
    pub read: SavedTranscript,
    pub list: Vec<SavedSessionSummary>,
}

fn never() -> bool {
    false
}

/// Reads and lists the saved record of `capture` (a capture file name such as
/// `"22-resume.ndjson"`). Panics when the capture has no record or the reader fails.
pub fn read_capture_record(capture: &str) -> CaptureRecord {
    let (name, _) = manifest_transcript(capture)
        .unwrap_or_else(|| panic!("{capture} has no saved record in the manifest"));
    let session_id = session_id_of(&text_of(&name))
        .unwrap_or_else(|| panic!("no line of the record of {capture} names its session"));
    let fs = Arc::new(MemoryRecordFs::default());
    fs.put(
        &format!(
            "{CONFIG_DIR}/projects/{}/{session_id}.jsonl",
            name_of(WORKING_DIRECTORY)
        ),
        bytes_of(&name),
        1_000,
    );
    let sessions = ProjectTranscripts::new(
        fs as Arc<dyn RecordFs>,
        Arc::new(|| Some(PathBuf::from(CONFIG_DIR))),
        Some(WORKING_DIRECTORY.to_owned()),
        false,
        Arc::new(|_: &str| {}),
    );
    let read = sessions
        .read(&session_id, &never)
        .unwrap_or_else(|e| panic!("the record of {capture} could not be read: {e:?}"));
    let list = sessions
        .list(&never)
        .unwrap_or_else(|e| panic!("the record of {capture} could not be listed: {e:?}"));
    CaptureRecord {
        session_id,
        read,
        list,
    }
}

// The first line that has a "sessionId", as CapturedTranscript takes it.
fn session_id_of(text: &str) -> Option<String> {
    let line = text.lines().find(|it| it.contains("\"sessionId\""))?;
    let row: Value = serde_json::from_str(line).ok()?;
    row.get("sessionId")?.as_str().map(str::to_owned)
}

fn raw(value: Option<&RawJson>) -> Value {
    value.map_or(Value::Null, |it| {
        serde_json::from_str(&it.0)
            .unwrap_or_else(|e| panic!("a raw field is not JSON at column {}", e.column()))
    })
}

/// One event as a golden line holds it: every field of the user or assistant line, absent ones as
/// `null`, raw JSON as its parsed value. Panics on any other kind: the reader gives only these.
pub fn event_json(event: &AgentEvent) -> Value {
    match event {
        AgentEvent::User {
            uuid,
            session_id,
            timestamp,
            message,
            parent_tool_use_id,
            tool_use_result,
            subagent_type,
            task_description,
        } => json!({
            "kind": "User",
            "uuid": uuid,
            "sessionId": session_id,
            "timestamp": timestamp,
            "message": raw(Some(message)),
            "parentToolUseId": parent_tool_use_id,
            "toolUseResult": raw(tool_use_result.as_ref()),
            "subagentType": subagent_type,
            "taskDescription": task_description,
        }),
        AgentEvent::Assistant {
            uuid,
            session_id,
            timestamp,
            request_id,
            message,
            parent_tool_use_id,
            user_message_uuid,
            user_message_uuids,
            wire_tool_inputs,
            subagent_type,
            task_description,
            error,
        } => json!({
            "kind": "Assistant",
            "uuid": uuid,
            "sessionId": session_id,
            "timestamp": timestamp,
            "requestId": request_id,
            "message": raw(Some(message)),
            "parentToolUseId": parent_tool_use_id,
            "userMessageUuid": user_message_uuid,
            "userMessageUuids": raw(user_message_uuids.as_ref()),
            "wireToolInputs": raw(wire_tool_inputs.as_ref()),
            "subagentType": subagent_type,
            "taskDescription": task_description,
            "error": error,
        }),
        _ => panic!("the reader gave an event that is neither a user nor an assistant line"),
    }
}
