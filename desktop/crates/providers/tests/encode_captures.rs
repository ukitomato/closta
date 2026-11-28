#![allow(clippy::unwrap_used, clippy::expect_used)]
//! The write direction against the lines the recorder wrote to the CLI's stdin (captures 23, 24 and
//! 25) and against what the CLI made of a request it kept no stdin for (capture 33). Mirrors
//! StdinAttachmentsTest.kt, StdinMcpTest.kt, StdinSandboxTest.kt and the capture-reading test of
//! CodecEncodeTest.kt.

mod common;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use closta_core::ports::EncodeError;
use closta_model::{Attachment, AttachmentKind};
use closta_providers::claude::protocol::encode;
use common::*;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

fn json(text: &str) -> Value {
    serde_json::from_str(text).unwrap()
}

fn object(text: &str) -> Map<String, Value> {
    match json(text) {
        Value::Object(map) => map,
        other => panic!("not an object: {other}"),
    }
}

/// The stdin lines kept next to `capture`, checked against the sha256 and the count the manifest
/// recorded for them.
fn stdin_lines(capture: &str) -> Vec<String> {
    let kept = manifest_stdin(&format!("{capture}.ndjson"))
        .unwrap_or_else(|| panic!("{capture}: the manifest keeps no stdin lines"));
    let bytes = bytes_of(&kept.file);
    let digest: String = Sha256::digest(&bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect();
    assert_eq!(digest, kept.sha256, "{}: sha256", kept.file);
    let lines = non_blank_lines(&text_of(&kept.file));
    assert_eq!(lines.len(), kept.lines, "{}: line count", kept.file);
    lines
}

/// `line` without its `origin` mark, which the captures predate.
fn without_origin(line: &str) -> String {
    let mut map = object(line);
    map.shift_remove("origin");
    Value::Object(map).to_string()
}

/// Keys in order, down the whole tree, with a string value kept only as its type.
fn shape(value: &Value) -> Value {
    match value {
        Value::Object(map) => Value::Array(
            map.iter()
                .map(|(k, v)| Value::Array(vec![Value::from(k.as_str()), shape(v)]))
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(shape).collect()),
        Value::String(_) => Value::from("string"),
        other => Value::from(other.to_string()),
    }
}

fn attachment(kind: AttachmentKind, media_type: &str, name: &str, bytes: Vec<u8>) -> Attachment {
    Attachment {
        kind,
        media_type: media_type.into(),
        name: name.into(),
        bytes,
        path: None,
    }
}

// --- capture 23: attachments -------------------------------------------------------------------

const ATTACHMENTS: &str = "23-attachments";

fn captured_turns() -> Vec<Map<String, Value>> {
    stdin_lines(ATTACHMENTS)
        .iter()
        .map(|l| object(l))
        .filter(|o| o["type"] == "user")
        .collect()
}

fn blocks(line: &Map<String, Value>) -> &Vec<Value> {
    line["message"]["content"].as_array().unwrap()
}

fn block<'a>(line: &'a Map<String, Value>, kind: &str) -> &'a Value {
    let found: Vec<&Value> = blocks(line).iter().filter(|b| b["type"] == kind).collect();
    assert_eq!(found.len(), 1, "one {kind} block");
    found[0]
}

fn bytes_in(block: &Value) -> Vec<u8> {
    STANDARD
        .decode(block["source"]["data"].as_str().unwrap())
        .unwrap()
}

fn types(line: &Map<String, Value>) -> Vec<&str> {
    blocks(line)
        .iter()
        .map(|b| b["type"].as_str().unwrap())
        .collect()
}

/// Writes the captured turn again from its parts, without the `origin` the capture predates.
fn rewrite(line: &Map<String, Value>, attachments: &[Attachment]) -> String {
    let text = block(line, "text")["text"].as_str().unwrap();
    let written = encode::user_message(
        line["session_id"].as_str().unwrap(),
        line["uuid"].as_str().unwrap(),
        text,
        attachments,
    )
    .unwrap();
    without_origin(&written)
}

#[test]
fn the_capture_holds_two_turns_the_first_with_an_image_and_the_second_with_a_pdf_and_a_text_each() {
    let captured = captured_turns();
    assert_eq!(captured.len(), 2);
    assert_eq!(types(&captured[0]), ["image", "text"]);
    assert_eq!(types(&captured[1]), ["document", "text"]);
    assert_eq!(
        block(&captured[0], "image")["source"]["media_type"],
        "image/png"
    );
    assert_eq!(
        block(&captured[1], "document")["source"]["media_type"],
        "application/pdf"
    );
}

#[test]
fn an_image_with_a_sentence_is_written_as_the_recorder_wrote_it_to_the_cli() {
    let line = &captured_turns()[0];
    let image = attachment(
        AttachmentKind::Image,
        "image/png",
        "red.png",
        bytes_in(block(line, "image")),
    );
    let written = rewrite(line, &[image]);
    let recorded = Value::Object(line.clone());
    assert_eq!(
        written,
        recorded.to_string(),
        "byte for byte: keys, types and order"
    );
    assert_eq!(
        shape(&json(&written)),
        shape(&recorded),
        "the shape, down every level"
    );
}

#[test]
fn a_pdf_with_a_sentence_is_written_as_the_recorder_wrote_it_to_the_cli() {
    let line = &captured_turns()[1];
    let pdf = attachment(
        AttachmentKind::Document,
        "application/pdf",
        "kiwi.pdf",
        bytes_in(block(line, "document")),
    );
    let written = rewrite(line, &[pdf]);
    let recorded = Value::Object(line.clone());
    assert_eq!(
        written,
        recorded.to_string(),
        "byte for byte: keys, types and order"
    );
    assert_eq!(
        shape(&json(&written)),
        shape(&recorded),
        "the shape, down every level"
    );
}

#[test]
fn the_recorded_attachment_lines_are_rewritten_byte_for_byte_from_the_file() {
    // The two comparisons above go through a parsed copy; this one holds the file's own bytes.
    let lines = stdin_lines(ATTACHMENTS);
    let turns = captured_turns();
    let image = attachment(
        AttachmentKind::Image,
        "image/png",
        "red.png",
        bytes_in(block(&turns[0], "image")),
    );
    let pdf = attachment(
        AttachmentKind::Document,
        "application/pdf",
        "kiwi.pdf",
        bytes_in(block(&turns[1], "document")),
    );
    assert_eq!(rewrite(&turns[0], &[image]), lines[1]);
    assert_eq!(rewrite(&turns[1], &[pdf]), lines[2]);
}

#[test]
fn without_attachments_the_content_is_the_text_itself_as_before() {
    let plain = encode::user_message("S", "U", "hello", &[]).unwrap();
    assert!(
        json(&plain)["message"]["content"].is_string(),
        "a string, not an array"
    );
    assert_eq!(json(&plain)["message"]["content"], "hello");
}

#[test]
fn attachments_come_first_in_the_order_given_and_the_text_is_last_a_text_file_as_a_named_sentence()
{
    let image = attachment(AttachmentKind::Image, "image/jpeg", "a.jpg", vec![1, 2, 3]);
    let notes = attachment(
        AttachmentKind::Text,
        "text/plain",
        "notes.txt",
        "line one\nこんにちは".as_bytes().to_vec(),
    );
    let pdf = attachment(
        AttachmentKind::Document,
        "application/pdf",
        "b.pdf",
        vec![4, 5],
    );

    let line = json(&encode::user_message("S", "U", "the question", &[image, notes, pdf]).unwrap());
    let content = line["message"]["content"].as_array().unwrap();

    let kinds: Vec<&str> = content
        .iter()
        .map(|b| b["type"].as_str().unwrap())
        .collect();
    assert_eq!(kinds, ["image", "text", "document", "text"]);
    assert_eq!(content[0]["source"]["media_type"], "image/jpeg");
    assert_eq!(content[0]["source"]["data"], "AQID");
    assert_eq!(content[1]["text"], "notes.txt\n\nline one\nこんにちは");
    assert_eq!(content[2]["source"]["media_type"], "application/pdf");
    assert_eq!(content[3]["text"], "the question");
}

#[test]
fn files_with_no_words_are_sent_with_no_block_of_text_and_no_files_and_no_words_is_still_the_string()
 {
    let image = attachment(AttachmentKind::Image, "image/png", "a.png", vec![1]);

    let line = json(&encode::user_message("S", "U", "", &[image]).unwrap());
    let kinds: Vec<&str> = line["message"]["content"]
        .as_array()
        .unwrap()
        .iter()
        .map(|b| b["type"].as_str().unwrap())
        .collect();
    assert_eq!(kinds, ["image"]);

    let plain = json(&encode::user_message("S", "U", "", &[]).unwrap());
    assert_eq!(
        plain["message"]["content"], "",
        "a message with no files and no words is the empty string it was"
    );
}

#[test]
fn a_text_file_that_is_not_utf8_is_refused_and_the_failure_says_nothing_of_its_name_or_its_bytes() {
    let bad = attachment(
        AttachmentKind::Text,
        "text/plain",
        "secret-name.txt",
        vec![0x68, 0xc3],
    );
    let failure = encode::user_message("S", "U", "q", &[bad]).unwrap_err();
    assert_eq!(failure, EncodeError::TextNotUtf8);
    assert!(
        !failure.to_string().contains("secret-name"),
        "no name in the message"
    );
    assert_eq!(failure.to_string(), "a text attachment is not UTF-8");
}

// --- capture 24: MCP management ----------------------------------------------------------------

const MCP: &str = "24-mcp-management";

fn mcp_line(number: usize) -> String {
    let id = format!("{MCP}-req-{number}");
    stdin_lines(MCP)
        .into_iter()
        .find(|l| json(l)["request_id"] == id.as_str())
        .unwrap_or_else(|| panic!("no line {id}"))
}

fn mcp_id(number: usize) -> String {
    format!("{MCP}-req-{number}")
}

#[test]
fn the_capture_holds_the_status_the_toggles_and_the_reconnect_the_recorder_sent() {
    let subtypes: Vec<String> = (1..=9)
        .map(|n| {
            json(&mcp_line(n))["request"]["subtype"]
                .as_str()
                .unwrap()
                .to_string()
        })
        .collect();
    assert_eq!(
        subtypes,
        [
            "initialize",
            "mcp_status",
            "mcp_toggle",
            "mcp_status",
            "mcp_toggle",
            "mcp_status",
            "mcp_reconnect",
            "mcp_status",
            "mcp_toggle",
        ]
    );
}

#[test]
fn initialize_is_the_recorded_line_apart_from_the_per_task_stop_affordance_added_since() {
    let mut written = object(&encode::initialize(&mcp_id(1), &[], true));
    let request = written["request"].as_object_mut().unwrap();
    assert_eq!(
        request.shift_remove("perTaskStopAffordance"),
        Some(true.into())
    );
    assert_eq!(Value::Object(written), json(&mcp_line(1)));
}

#[test]
fn mcp_status_is_written_as_the_recorder_wrote_it() {
    assert_eq!(encode::mcp_status(&mcp_id(2)), mcp_line(2));
    assert_eq!(encode::mcp_status(&mcp_id(4)), mcp_line(4));
    assert_eq!(encode::mcp_status(&mcp_id(6)), mcp_line(6));
    assert_eq!(encode::mcp_status(&mcp_id(8)), mcp_line(8));
}

#[test]
fn mcp_toggle_is_written_as_the_recorder_wrote_it_off_and_on_and_for_a_name_the_cli_does_not_know()
{
    assert_eq!(
        encode::mcp_toggle(&mcp_id(3), "fake-echo", false),
        mcp_line(3)
    );
    assert_eq!(
        encode::mcp_toggle(&mcp_id(5), "fake-echo", true),
        mcp_line(5)
    );
    assert_eq!(
        encode::mcp_toggle(&mcp_id(9), "no-such-server", false),
        mcp_line(9)
    );
}

#[test]
fn mcp_reconnect_is_written_as_the_recorder_wrote_it() {
    assert_eq!(encode::mcp_reconnect(&mcp_id(7), "fake-echo"), mcp_line(7));
}

#[test]
fn a_name_with_a_quote_or_a_newline_stays_one_line_of_one_json_text() {
    let written = encode::mcp_toggle("id", "a\"b\nc", true);
    assert_eq!(written.lines().count(), 1);
    assert_eq!(json(&written)["request"]["serverName"], "a\"b\nc");
}

// --- capture 25: rewind the files --------------------------------------------------------------

const REWIND: &str = "25-rewind-files";
const REWOUND_UUID: &str = "f6236b45-b026-49b7-ba9a-8d41b1ff77b4";

#[test]
fn rewind_files_is_the_line_the_recorder_sent_in_capture_25_apart_from_its_request_id() {
    let rewinds: Vec<String> = stdin_lines(REWIND)
        .into_iter()
        .filter(|l| json(l)["request"]["subtype"] == "rewind_files")
        .collect();
    assert_eq!(
        rewinds.len(),
        2,
        "the capture holds a dry run and the real one"
    );
    for (captured, dry_run) in rewinds.iter().zip([true, false]) {
        let id = json(captured)["request_id"].as_str().unwrap().to_string();
        assert_eq!(
            &encode::rewind_files(&id, REWOUND_UUID, dry_run),
            captured,
            "byte for byte, in the recorded order"
        );
    }
}

#[test]
fn the_user_lines_of_capture_25_are_written_as_the_recorder_wrote_them_apart_from_origin() {
    let lines = stdin_lines(REWIND);
    for number in [2, 4, 8] {
        let recorded = &lines[number - 1];
        let line = json(recorded);
        assert_eq!(line["type"], "user", "line {number}");
        let written = encode::user_message(
            line["session_id"].as_str().unwrap(),
            line["uuid"].as_str().unwrap(),
            line["message"]["content"].as_str().unwrap(),
            &[],
        )
        .unwrap();
        assert_eq!(&without_origin(&written), recorded, "line {number}");
    }
}

#[test]
fn the_allows_of_capture_25_are_written_as_the_recorder_wrote_them() {
    let lines = stdin_lines(REWIND);
    for number in [3, 5] {
        let recorded = &lines[number - 1];
        let response = &json(recorded)["response"];
        let written = encode::allow(
            response["request_id"].as_str().unwrap(),
            &response["response"]["updatedInput"].to_string(),
            None,
        )
        .unwrap();
        assert_eq!(&written, recorded, "line {number}");
    }
}

// --- capture 33: the sandbox turned off mid-session --------------------------------------------

const SANDBOX: &str = "33-sandbox-live";

fn sandbox_line(number: usize) -> Value {
    json(&non_blank_lines(&text_of(&format!("{SANDBOX}.ndjson")))[number - 1])
}

#[test]
fn sandbox_off_sends_only_enabled_false() {
    let line = json(&encode::sandbox_off("r1"));
    assert_eq!(line["request"]["subtype"], "apply_flag_settings");
    assert_eq!(
        line["request"]["settings"].to_string(),
        r#"{"sandbox":{"enabled":false}}"#
    );
}

#[test]
fn sandbox_off_answer_matches_capture_33() {
    // Capture 33 kept no stdin lines, so the request is held to what the CLI made of it: line 68
    // answers the request that turned the sandbox off (req-5); line 69 is the get_settings after it.
    let id = format!("{SANDBOX}-req-5");
    let written = json(&encode::sandbox_off(&id));
    let answer = &sandbox_line(68)["response"];
    let settings = sandbox_line(69)["response"]["response"].clone();
    let flag_layers: Vec<&Value> = settings["sources"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|s| s["source"] == "flagSettings")
        .collect();
    assert_eq!(flag_layers.len(), 1);

    assert_eq!(written["type"], "control_request");
    assert_eq!(written["request_id"], id.as_str());
    assert_eq!(answer["request_id"], id.as_str());
    assert_eq!(answer["subtype"], "success");
    assert!(answer.get("response").is_none(), "a success without a body");
    // The flag layer is replaced by what was sent, so it holds exactly the request's settings.
    assert_eq!(written["request"]["settings"], flag_layers[0]["settings"]);
    assert_eq!(
        settings["effective"]["sandbox"].to_string(),
        r#"{"enabled":false}"#
    );
}
