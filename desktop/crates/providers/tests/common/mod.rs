#![allow(dead_code, clippy::expect_used, clippy::unwrap_used)]
//! Reads the recorded captures and `manifest.json` for tests. Mirrors CaptureFixtures.kt.
//!
//! This is the loader, not the decoder: every line goes through `closta_providers`'s `decode`.
//! The captures and the goldens are read in place from the Kotlin side of the repository, never
//! copied.

use closta_model::AgentEvent;
use closta_providers::claude::protocol::decode;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::path::PathBuf;

const MANIFEST: &str = "manifest.json";
const CAPTURE_SUFFIX: &str = ".ndjson";

/// The wire type of the recorder's mark that separates the two stdouts of a resume capture.
pub const RECORDER_BOUNDARY: &str = "recorder_boundary";

/// Lines of a capture that the codec cannot place, by capture and wire type. The three rows are the
/// recorder's own mark in the resume, fork and cut captures (`recorder/record.mjs`): it is not a
/// line the CLI wrote, so the codec rightly does not place it, and the manifest still counts it.
///
/// To add a row, say why the line is unplaceable and what will fix it; a row without both is a
/// silent hole in the captures.
pub const KNOWN_UNPLACED: &[(&str, &[(&str, usize)])] = &[
    ("22-resume", &[(RECORDER_BOUNDARY, 1)]),
    ("26-fork-session", &[(RECORDER_BOUNDARY, 1)]),
    ("27-resume-session-at", &[(RECORDER_BOUNDARY, 1)]),
];

/// The `KNOWN_UNPLACED` row of `scenario`, empty when it has none.
pub fn known_unplaced(scenario: &str) -> BTreeMap<String, usize> {
    KNOWN_UNPLACED
        .iter()
        .filter(|(name, _)| *name == scenario)
        .flat_map(|(_, rows)| rows.iter().map(|(t, n)| (t.to_string(), *n)))
        .collect()
}

/// One capture, as `manifest.json` describes it.
#[derive(Deserialize, Debug, Clone)]
pub struct ScenarioEntry {
    pub scenario: String,
    pub file: String,
    pub claude_version: String,
    pub sha256: String,
    pub lines: usize,
    pub flags: Vec<String>,
    pub resume_flags: Option<Vec<String>>,
    pub transcript_file: Option<String>,
    pub transcript_sha256: Option<String>,
    pub stdin_file: Option<String>,
    pub stdin_sha256: Option<String>,
    pub stdin_lines: Option<usize>,
}

/// `manifest.json` itself.
#[derive(Deserialize, Debug, Clone)]
pub struct Manifest {
    pub claude_version: String,
    pub scenario_count: usize,
    pub scenarios: Vec<ScenarioEntry>,
}

/// The stdin lines the recorder wrote next to an attachments capture.
#[derive(Debug, Clone)]
pub struct StdinLines {
    pub file: String,
    pub sha256: String,
    pub lines: usize,
}

fn repo_relative(path: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .join(path)
}

/// Where the captures and `manifest.json` sit.
pub fn fixtures_dir() -> PathBuf {
    let dir =
        repo_relative("jetbrains/src/main/kotlin/dev/ukitomato/closta/providers/claude/fixtures");
    assert!(
        dir.is_dir(),
        "the capture directory {} does not exist - run the tests from a checkout that has jetbrains/",
        dir.display()
    );
    dir
}

/// Where the Kotlin side keeps the golden conversation states.
pub fn golden_dir() -> PathBuf {
    let dir = repo_relative("jetbrains/src/test/resources/dev/ukitomato/closta/core/models/golden");
    assert!(
        dir.is_dir(),
        "the golden directory {} does not exist - run the tests from a checkout that has jetbrains/",
        dir.display()
    );
    dir
}

/// The raw bytes of a fixture; sha256 is taken over these, not over decoded text.
pub fn bytes_of(file_name: &str) -> Vec<u8> {
    let path = fixtures_dir().join(file_name);
    std::fs::read(&path).unwrap_or_else(|e| panic!("cannot read fixture {}: {e}", path.display()))
}

/// The text of a fixture. The recorder writes UTF-8; like Kotlin, bad bytes become U+FFFD.
pub fn text_of(file_name: &str) -> String {
    String::from_utf8_lossy(&bytes_of(file_name)).into_owned()
}

/// Kotlin's `Char.isWhitespace`: Java whitespace or a space separator. That is Rust's whitespace
/// plus U+001C..U+001F, minus U+0085.
fn is_kotlin_whitespace(c: char) -> bool {
    matches!(c, '\u{1c}'..='\u{1f}') || (c.is_whitespace() && c != '\u{85}')
}

/// Kotlin's `lineSequence`: lines end at `\n`, `\r\n` or a lone `\r`; a trailing terminator adds a
/// last empty line.
fn line_sequence(text: &str) -> Vec<&str> {
    let bytes = text.as_bytes();
    let mut lines = Vec::new();
    let mut start = 0;
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\n' => {
                lines.push(&text[start..i]);
                i += 1;
                start = i;
            }
            b'\r' => {
                lines.push(&text[start..i]);
                i += if bytes.get(i + 1) == Some(&b'\n') {
                    2
                } else {
                    1
                };
                start = i;
            }
            _ => i += 1,
        }
    }
    lines.push(&text[start..]);
    lines
}

/// The lines a capture actually contains, which is what `manifest.json` counts.
pub fn non_blank_lines(text: &str) -> Vec<String> {
    line_sequence(text)
        .into_iter()
        .filter(|l| !l.chars().all(is_kotlin_whitespace))
        .map(str::to_string)
        .collect()
}

/// Converts one line, through the production decoder.
pub fn parse(line: &str) -> AgentEvent {
    decode(line)
}

/// Converts a whole capture. Blank lines are not lines: a trailing newline is not an event.
pub fn parse_all(text: &str) -> Vec<AgentEvent> {
    non_blank_lines(text).iter().map(|l| parse(l)).collect()
}

/// Reads a capture and converts it.
pub fn read_capture(file: &str) -> Vec<AgentEvent> {
    parse_all(&text_of(file))
}

/// Line `line_number` (1-based, counting non-blank lines) of capture `<scenario>.ndjson`, decoded.
pub fn capture_line(scenario: &str, line_number: usize) -> AgentEvent {
    let lines = non_blank_lines(&text_of(&format!("{scenario}.ndjson")));
    parse(&lines[line_number - 1])
}

/// `manifest.json`, parsed.
pub fn manifest() -> Manifest {
    let text = text_of(MANIFEST);
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{MANIFEST} does not parse: {e}"))
}

/// The capture files present on disk, regardless of what the manifest claims, sorted.
pub fn capture_file_names() -> Vec<String> {
    let dir = fixtures_dir();
    let mut names: Vec<String> = std::fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("cannot list {}: {e}", dir.display()))
        .filter_map(Result::ok)
        .filter(|e| e.path().is_file())
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| n.ends_with(CAPTURE_SUFFIX))
        .collect();
    names.sort();
    names
}

fn entry(file: &str) -> ScenarioEntry {
    let mut matching: Vec<ScenarioEntry> = manifest()
        .scenarios
        .into_iter()
        .filter(|s| s.file == file)
        .collect();
    assert_eq!(
        1,
        matching.len(),
        "{file}: expected exactly one manifest entry"
    );
    matching.remove(0)
}

/// The CLI flags `manifest.json` records for the capture `file`.
pub fn manifest_flags(file: &str) -> Vec<String> {
    entry(file).flags
}

/// The flags of the second CLI of a resume capture, or `None` for a capture with one CLI.
pub fn manifest_resume_flags(file: &str) -> Option<Vec<String>> {
    entry(file).resume_flags
}

/// What `manifest.json` records of the stdin lines kept for `file`, or `None` for any other capture.
pub fn manifest_stdin(file: &str) -> Option<StdinLines> {
    let e = entry(file);
    let name = e.stdin_file?;
    Some(StdinLines {
        file: name,
        sha256: e
            .stdin_sha256
            .expect("stdin_sha256 missing next to stdin_file"),
        lines: e
            .stdin_lines
            .expect("stdin_lines missing next to stdin_file"),
    })
}

/// The transcript saved next to a resume capture: its file name and the sha256 the manifest recorded.
pub fn manifest_transcript(file: &str) -> Option<(String, String)> {
    let e = entry(file);
    let name = e.transcript_file?;
    Some((
        name,
        e.transcript_sha256
            .expect("transcript_sha256 missing next to transcript_file"),
    ))
}
