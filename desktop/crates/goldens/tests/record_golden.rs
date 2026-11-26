//! What the saved-record reader gives for the records of captures 22, 27 and 39, held by value to
//! the goldens the Kotlin reader wrote (RecordGoldenTest.kt): every field of every event, the
//! counts, and the listing. `updatedAtMs` is not in the goldens: it is when the file was put down.
//!
//! A difference is told by its pointer only: the values are the record's own words.

use closta_goldens::common::json_first_difference;
use closta_goldens::records::{CaptureRecord, event_json, read_capture_record};
use serde_json::{Value, json};
use std::path::PathBuf;

const CAPTURES: [&str; 3] = ["22-resume", "27-resume-session-at", "39-sandbox-resume"];

fn golden_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(
        "../../../jetbrains/src/test/resources/dev/ukitomato/closta/providers/claude/history/golden",
    )
}

fn read_golden(capture: &str) -> Value {
    let path = golden_dir().join(format!("{capture}.json"));
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read the golden of {capture}: {}", e.kind()));
    serde_json::from_str(&text)
        .unwrap_or_else(|e| panic!("the golden of {capture} is not JSON at line {}", e.line()))
}

fn record_json(capture: &str, record: &CaptureRecord) -> Value {
    json!({
        "capture": capture,
        "sessionId": record.session_id,
        "read": {
            "events": record.read.events.iter().map(event_json).collect::<Vec<_>>(),
            "skipped": record.read.skipped,
            "dropped": record.read.dropped,
        },
        "list": record.list.iter().map(|it| json!({
            "id": it.id,
            "title": it.title,
            "bytes": it.bytes,
        })).collect::<Vec<_>>(),
    })
}

#[test]
fn each_saved_record_reads_to_its_jetbrains_golden() {
    let differing: Vec<String> = CAPTURES
        .iter()
        .filter_map(|capture| {
            let record = read_capture_record(&format!("{capture}.ndjson"));
            let actual = record_json(capture, &record);
            json_first_difference(&read_golden(capture), &actual)
                .map(|it| format!("{capture}: first difference at {}", it.pointer))
        })
        .collect();

    assert!(differing.is_empty(), "{}", differing.join("\n"));
}

#[test]
fn the_three_records_are_read_with_nothing_dropped() {
    for capture in CAPTURES {
        let record = read_capture_record(&format!("{capture}.ndjson"));

        assert_eq!(0, record.read.dropped, "{capture}");
        assert!(!record.read.events.is_empty(), "{capture}: a conversation");
        assert_eq!(1, record.list.len(), "{capture}: one record is listed");
    }
}
