//! The synthetic session written as the CLI's saved record of it: each user and assistant line of
//! its stdout as one line of `<config>/projects/<name>/<id>.jsonl`, for the budget of reading and
//! putting back the largest session.

use std::path::PathBuf;
use std::sync::Arc;

use closta_providers::claude::fake::record_fs::MemoryRecordFs;
use closta_providers::claude::history::{ProjectTranscripts, RecordFs, name_of};
use serde_json::{Map, Value};

use super::{Shape, session};

/// The session every record written here belongs to.
pub const SESSION_ID: &str = "5e55a0e0-0000-4000-8000-000000000001";

const WORKING_DIRECTORY: &str = "/work/the project";
const CONFIG_DIR: &str = "/config";

/// The session of `shape` drawn from `seed` as its saved record, and how many lines it holds: each
/// user and assistant line of its stdout, in order, with the fields a record line has (`type`,
/// `uuid`, `sessionId`, `timestamp`, `message`; an assistant's `requestId`, a user's
/// `toolUseResult` when stdout has one). Every line has a uuid of its own: stdout's start again
/// each turn.
///
/// It mixes its lines unlike a real record: the user's prompts (not on stdout) and sidechain lines
/// are not in it, and a sub-agent's lines are written as the main conversation's.
pub fn record_text(shape: &Shape, seed: u64) -> (String, usize) {
    let mut text = String::new();
    let mut written = 0;
    for turn in session(shape, seed) {
        for line in turn.lines {
            let Ok(Value::Object(out)) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            let Some(kind @ ("user" | "assistant")) = out.get("type").and_then(Value::as_str)
            else {
                continue;
            };
            let mut record = Map::new();
            record.insert("type".into(), kind.into());
            record.insert("uuid".into(), format!("record-{written}").into());
            record.insert("sessionId".into(), SESSION_ID.into());
            for (from, to) in [("timestamp", "timestamp"), ("message", "message")]
                .into_iter()
                .chain(if kind == "assistant" {
                    Some(("request_id", "requestId"))
                } else {
                    Some(("tool_use_result", "toolUseResult"))
                })
            {
                if let Some(value) = out.get(from).filter(|it| !it.is_null()) {
                    record.insert(to.into(), value.clone());
                }
            }
            text.push_str(&Value::Object(record).to_string());
            text.push('\n');
            written += 1;
        }
    }
    (text, written)
}

/// A reader of one project's records, each `(id, bytes)` put where the CLI keeps them, links not
/// resolved. The records are listed newest first in their order here.
pub fn transcripts(records: &[(String, Arc<[u8]>)]) -> ProjectTranscripts {
    let fs = Arc::new(MemoryRecordFs::default());
    let place = format!("{CONFIG_DIR}/projects/{}", name_of(WORKING_DIRECTORY));
    let newest = i64::try_from(records.len()).unwrap_or(i64::MAX);
    for ((id, bytes), age) in records.iter().zip(0..) {
        fs.put(
            &format!("{place}/{id}.jsonl"),
            Arc::clone(bytes),
            1_000_000 + newest - age,
        );
    }
    ProjectTranscripts::new(
        fs as Arc<dyn RecordFs>,
        Arc::new(|| Some(PathBuf::from(CONFIG_DIR))),
        Some(WORKING_DIRECTORY.to_owned()),
        false,
        Arc::new(|_: &str| {}),
    )
}

#[cfg(test)]
mod tests {
    use closta_core::ports::SavedSessions;

    use super::super::LARGEST;
    use super::*;

    #[test]
    fn the_record_reads_back_as_every_line_written() {
        let (text, written) = record_text(&LARGEST, 1);
        let bytes: Arc<[u8]> = text.into_bytes().into();
        let read = transcripts(&[(SESSION_ID.to_owned(), bytes)])
            .read(SESSION_ID, &|| false)
            .unwrap_or_else(|e| panic!("the record could not be read: {e:?}"));
        assert!(written > 0, "no line was written");
        assert_eq!(read.events.len(), written);
        assert_eq!((read.skipped, read.dropped), (0, 0));
    }
}
