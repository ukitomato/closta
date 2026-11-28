#![allow(dead_code, clippy::expect_used, clippy::unwrap_used)]
//! Reads the recorded captures and `manifest.json` for tests. Mirrors CaptureFixtures.kt.
//!
//! This is the loader, not the decoder: every line goes through `closta_providers`'s `decode`.
//! The captures and the goldens are read in place from the Kotlin side of the repository, never
//! copied.

use closta_core::fold;
use closta_model::{AgentEvent, ConversationState};
use closta_providers::claude::launch::spawn::{NativeProgram, NativeSpawner};
use closta_providers::claude::launch::{Launch, LaunchError};
use closta_providers::claude::process::{AgentProcess, ProcessSpawner};
use closta_providers::claude::protocol::decode;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

const MANIFEST: &str = "manifest.json";
const CAPTURE_SUFFIX: &str = ".ndjson";

/// The wire type of the recorder's mark that separates the two stdouts of a resume capture.
pub const RECORDER_BOUNDARY: &str = "recorder_boundary";

/// Lines of a capture that the codec cannot place, by capture and wire type. The six rows are the
/// recorder's own mark in the resume, fork, cut and sandbox captures (`recorder/record.mjs`): it is not a
/// line the CLI wrote, so the codec rightly does not place it, and the manifest still counts it.
///
/// To add a row, say why the line is unplaceable and what will fix it; a row without both is a
/// silent hole in the captures.
pub const KNOWN_UNPLACED: &[(&str, &[(&str, usize)])] = &[
    ("22-resume", &[(RECORDER_BOUNDARY, 1)]),
    ("26-fork-session", &[(RECORDER_BOUNDARY, 1)]),
    ("27-resume-session-at", &[(RECORDER_BOUNDARY, 1)]),
    // The same mark between the two CLIs of the sandbox-unavailable scene: the first refuses to start, the
    // second is a fresh launch with a new session id (`then`, not a resume).
    ("36-sandbox-unavailable", &[(RECORDER_BOUNDARY, 1)]),
    // Between the two stdouts of the scene that resumes into the sandbox (`--resume --settings`).
    ("39-sandbox-resume", &[(RECORDER_BOUNDARY, 1)]),
    // Between the two CLIs launched under the same `--session-id`, the second with the sandbox on.
    ("40-sandbox-same-id", &[(RECORDER_BOUNDARY, 1)]),
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

/// Where the older CLI's (2.1.282) excerpts sit (CaptureFixtures.kt `legacyExcerpt`).
fn legacy_dir() -> PathBuf {
    let dir = repo_relative(
        "jetbrains/src/test/resources/dev/ukitomato/closta/providers/claude/fixtures-2.1.282",
    );
    assert!(
        dir.is_dir(),
        "the excerpt directory {} does not exist - run the tests from a checkout that has jetbrains/",
        dir.display()
    );
    dir
}

/// The excerpt of the lines an older CLI sent in `scenario`: that version's committed, scrubbed
/// capture with its stream_event and rate_limit_event lines left out.
pub fn legacy_excerpt(scenario: &str) -> PathBuf {
    legacy_dir().join(format!("{scenario}-excerpt.ndjson"))
}

/// Reads and converts the capture at `path`.
pub fn read_capture_at(path: &Path) -> Vec<AgentEvent> {
    let bytes = std::fs::read(path)
        .unwrap_or_else(|e| panic!("cannot read fixture {}: {e}", path.display()));
    parse_all(&String::from_utf8_lossy(&bytes))
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

/// A place where two JSON values differ.
#[derive(Debug, Clone, PartialEq)]
pub struct Difference {
    /// RFC 6901 pointer to the place.
    pub pointer: String,
    pub expected: serde_json::Value,
    pub actual: serde_json::Value,
}

fn escape_pointer(key: &str) -> String {
    key.replace('~', "~0").replace('/', "~1")
}

/// The first of `json_differences`.
pub fn json_first_difference(
    expected: &serde_json::Value,
    actual: &serde_json::Value,
) -> Option<Difference> {
    json_differences(expected, actual).into_iter().next()
}

/// Every place two values differ, in the order the expected value is walked. Compares the way
/// the goldens need: numbers by value, objects by key set and values, arrays by length and
/// elements. A missing side is reported as `null`, and nothing under a differing place is walked.
pub fn json_differences(
    expected: &serde_json::Value,
    actual: &serde_json::Value,
) -> Vec<Difference> {
    use serde_json::Value;
    fn differ(out: &mut Vec<Difference>, pointer: String, e: &Value, a: &Value) {
        out.push(Difference {
            pointer,
            expected: e.clone(),
            actual: a.clone(),
        });
    }
    fn walk(out: &mut Vec<Difference>, pointer: &str, e: &Value, a: &Value) {
        match (e, a) {
            (Value::Number(x), Value::Number(y)) => {
                if x.as_f64() != y.as_f64() {
                    differ(out, pointer.to_string(), e, a);
                }
            }
            (Value::Object(x), Value::Object(y)) => {
                for (key, ev) in x {
                    let child = format!("{pointer}/{}", escape_pointer(key));
                    match y.get(key) {
                        Some(av) => walk(out, &child, ev, av),
                        None => differ(out, child, ev, &Value::Null),
                    }
                }
                for (key, av) in y {
                    if !x.contains_key(key) {
                        let child = format!("{pointer}/{}", escape_pointer(key));
                        differ(out, child, &Value::Null, av);
                    }
                }
            }
            (Value::Array(x), Value::Array(y)) => {
                for i in 0..x.len().max(y.len()) {
                    let child = format!("{pointer}/{i}");
                    match (x.get(i), y.get(i)) {
                        (Some(ev), Some(av)) => walk(out, &child, ev, av),
                        (ev, av) => differ(
                            out,
                            child,
                            ev.unwrap_or(&Value::Null),
                            av.unwrap_or(&Value::Null),
                        ),
                    }
                }
            }
            _ => {
                if e != a {
                    differ(out, pointer.to_string(), e, a);
                }
            }
        }
    }
    let mut out = Vec::new();
    walk(&mut out, "", expected, actual);
    out
}

/// Folds capture `<scenario>.ndjson` decoded directly.
pub fn fold_capture(scenario: &str) -> ConversationState {
    read_capture(&format!("{scenario}.ndjson"))
        .iter()
        .fold(ConversationState::default(), fold)
}

/// The core golden of `scenario`, or why it cannot be read.
pub fn read_golden(scenario: &str) -> Result<Value, String> {
    let path = golden_dir().join(format!("{scenario}.json"));
    let text = std::fs::read_to_string(&path)
        .map_err(|e| format!("{scenario}: golden {} cannot be read: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{scenario}: golden does not parse: {e}"))
}

/// Folds `scenario` twice with `fold_fn` and compares the state with the golden; `None` when
/// it matches, else the first difference named by the scenario.
pub fn check_scenario(
    scenario: &str,
    fold_fn: &dyn Fn(&str) -> ConversationState,
) -> Option<String> {
    let once = fold_fn(scenario);
    let twice = fold_fn(scenario);
    if once != twice {
        return Some(format!(
            "{scenario}: folding twice must give the same state"
        ));
    }
    let golden = match read_golden(scenario) {
        Ok(g) => g,
        Err(e) => return Some(e),
    };
    let actual = serde_json::to_value(&once).expect("the state serializes");
    json_first_difference(&golden, &actual).map(|d| {
        format!(
            "{scenario}: {}: expected {}, got {}",
            d.pointer, d.expected, d.actual
        )
    })
}

/// The scenarios `manifest.json` lists, sorted.
pub fn scenario_names() -> Vec<String> {
    let mut names: Vec<String> = manifest()
        .scenarios
        .into_iter()
        .map(|s| s.scenario)
        .collect();
    names.sort();
    names
}

// `option_env!` because `closta-goldens` compiles this file as a library, where cargo sets neither
// variable; only the providers' own tests can call these two.

/// The fake CLI that cargo built next to these tests.
pub fn fake_cli() -> PathBuf {
    match option_env!("CARGO_BIN_EXE_closta-fake-claude") {
        Some(path) => PathBuf::from(path),
        None => panic!("only the providers' integration tests have the fake CLI"),
    }
}

/// An empty folder of its own for one test, made again on every run.
pub fn scratch_dir(name: &str) -> PathBuf {
    let Some(tmp) = option_env!("CARGO_TARGET_TMPDIR") else {
        panic!("only the providers' integration tests have a scratch folder")
    };
    let dir = PathBuf::from(tmp).join(name);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).expect("the old scratch folder is removed");
    }
    std::fs::create_dir_all(&dir).expect("the scratch folder is made");
    dir
}

/// Whether `pid` is a running process: it is in `/proc` and not a zombie.
pub fn alive(pid: u32) -> bool {
    let Ok(stat) = std::fs::read_to_string(format!("/proc/{pid}/stat")) else {
        return false;
    };
    // The state follows the command name, which is in parentheses and may hold anything.
    let state = stat
        .rfind(')')
        .and_then(|end| stat[end + 1..].trim_start().chars().next());
    state.is_some_and(|state| state != 'Z')
}

/// A native spawner of the fake CLI that inherits this process's environment.
pub fn fake_spawner() -> NativeSpawner {
    NativeSpawner::new(NativeProgram::Path(fake_cli()), BTreeSet::new())
}

/// Starts `launch` with `spawner` on a thread of the blocking pool, as production does: a spawn
/// is synchronous and slow on Windows. The box kills the child when dropped, also when a test
/// fails.
pub async fn spawn_in_background(
    spawner: Arc<dyn ProcessSpawner>,
    launch: Launch,
) -> Result<Box<dyn AgentProcess>, LaunchError> {
    blocking::unblock(move || spawner.spawn(&launch)).await
}
