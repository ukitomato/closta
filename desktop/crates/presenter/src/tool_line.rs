//! A tool call as one line of the conversation, what the opened line shows, and a sub-agent's
//! one-line card, from ToolLine.kt.

use serde_json::{Map, Value};

use crate::json::{JsonFields, compact, pretty};
use crate::records::tasks::AGENT_TOOLS;
use crate::text::{kt_is_blank, kt_lines, take_last_utf16, take_utf16, utf16_len};
use crate::transcript::{PartRecord, ToolCallRecord};

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum ToolLineState {
    Running,
    Ok,
    Error,
}

/// One tool call as one line of the conversation (`● Edit(AuthService.kt) +12 −3`).
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ToolLine {
    pub state: ToolLineState,
    pub label: String,
    pub added: Option<i32>,
    pub removed: Option<i32>,
}

/// The most UTF-16 units of a summary a line shows before it is cut with `…`.
pub const SUMMARY_MAX: usize = 60;

const BY_FILE: [&str; 4] = ["Edit", "Write", "Read", "NotebookEdit"];

/// The line for `call`, read from its finished input; while the input is still streaming there
/// is only its name.
pub fn tool_line(call: &ToolCallRecord) -> ToolLine {
    let input = input_of(call);
    let label = match summary_of(&call.tool_name, input) {
        Some(summary) => format!("{}({summary})", call.tool_name),
        None => call.tool_name.clone(),
    };
    let state = state_of(call);
    let (added, removed) = match call.tool_name.as_str() {
        "Edit" => (
            line_count(input, "new_string"),
            line_count(input, "old_string"),
        ),
        "Write" => (line_count(input, "content"), None),
        _ => (None, None),
    };
    ToolLine {
        state,
        label,
        added,
        removed,
    }
}

fn input_of(call: &ToolCallRecord) -> Option<&Map<String, Value>> {
    call.input.as_deref()?.as_object()
}

fn text<'a>(input: Option<&'a Map<String, Value>>, key: &str) -> Option<&'a str> {
    input?.string(key)
}

fn state_of(call: &ToolCallRecord) -> ToolLineState {
    match &call.result {
        None => ToolLineState::Running,
        Some(result) if result.is_error == Some(true) => ToolLineState::Error,
        Some(_) => ToolLineState::Ok,
    }
}

fn line_count(input: Option<&Map<String, Value>>, key: &str) -> Option<i32> {
    text(input, key).map(|it| i32::try_from(kt_lines(it).count()).unwrap_or(i32::MAX))
}

fn file_name(path: &str) -> &str {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.rsplit('\\').next().unwrap_or(name)
}

fn summary_of(tool: &str, input: Option<&Map<String, Value>>) -> Option<String> {
    let summary = match tool {
        _ if BY_FILE.contains(&tool) => text(input, "file_path").map(file_name),
        "Bash" => text(input, "command").and_then(|it| kt_lines(it).next()),
        "Grep" | "Glob" => text(input, "pattern"),
        _ => None,
    }?;
    Some(if utf16_len(summary) > SUMMARY_MAX {
        format!("{}…", take_utf16(summary, SUMMARY_MAX))
    } else {
        summary.to_owned()
    })
}

/// What an opened tool line shows: its input (a command as it is, any other input as JSON), its
/// output (the result's text; why it failed, when it failed), and what it read (`target`), by
/// which "Explored" counts files.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ToolDetail {
    pub input: String,
    /// `None` until the result came. Only its last [`TOOL_OUTPUT_MAX`] UTF-16 units are kept.
    pub output: Option<String>,
    pub output_cut: bool,
    pub target: Option<String>,
}

/// How much of a tool's output a line keeps, from the end, in UTF-16 units: 8 KiB, as much as
/// the running list shows of a shell.
pub const TOOL_OUTPUT_MAX: usize = 8 * 1024;

/// The detail of `call` from its finished input and its result.
pub fn tool_detail(call: &ToolCallRecord) -> ToolDetail {
    let input = input_of(call);
    let shown_input = match call.input.as_deref() {
        _ if call.tool_name == "Bash" => text(input, "command").unwrap_or_default().to_owned(),
        Some(value @ Value::Object(members)) if !members.is_empty() => pretty(value),
        _ => String::new(),
    };
    let output = call.result.as_ref().map(|result| {
        result
            .content
            .as_deref()
            .map(result_text)
            .unwrap_or_default()
    });
    let output_cut = output
        .as_deref()
        .is_some_and(|it| utf16_len(it) > TOOL_OUTPUT_MAX);
    let output = match output {
        Some(all) if output_cut => Some(take_last_utf16(&all, TOOL_OUTPUT_MAX).to_owned()),
        other => other,
    };
    ToolDetail {
        input: shown_input,
        output,
        output_cut,
        target: target_of(call, input).map(str::to_owned),
    }
}

fn result_text(content: &Value) -> String {
    match content {
        Value::String(text) => text.clone(),
        Value::Array(items) => items
            .iter()
            .map(|item| match item.get("text") {
                Some(Value::String(text)) => text.clone(),
                _ => compact(item),
            })
            .collect::<Vec<_>>()
            .join("\n"),
        other => compact(other),
    }
}

fn target_of<'a>(call: &ToolCallRecord, input: Option<&'a Map<String, Value>>) -> Option<&'a str> {
    match call.tool_name.as_str() {
        tool if BY_FILE.contains(&tool) => text(input, "file_path"),
        "LS" => text(input, "path"),
        "Grep" | "Glob" => text(input, "pattern"),
        _ => None,
    }
}

/// A sub-agent's call as its one-line card shows it: what it was asked to do, how many tools it
/// has called, and how long it ran once it is done (`duration_ms`).
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct AgentSummary {
    pub description: Option<String>,
    pub tools: i32,
    pub duration_ms: Option<i64>,
}

/// The summary of `call` when it started a sub-agent; `None` for any other tool.
pub fn agent_summary(call: &ToolCallRecord) -> Option<AgentSummary> {
    if !AGENT_TOOLS.contains(&call.tool_name.as_str()) {
        return None;
    }
    let tools = call
        .messages
        .values()
        .flat_map(|message| message.parts.values())
        .filter(|part| matches!(part.as_ref(), PartRecord::ToolCall(_)))
        .count();
    let description = text(input_of(call), "description")
        .filter(|it| !kt_is_blank(it))
        .map(str::to_owned);
    Some(AgentSummary {
        description,
        tools: i32::try_from(tools).unwrap_or(i32::MAX),
        duration_ms: call.result.as_ref().and_then(|it| it.duration_ms),
    })
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use serde_json::{Map, Value, json};

    use super::*;
    use crate::transcript::{ToolCallRecord, ToolResult};

    fn ok(content: Value) -> Option<ToolResult> {
        Some(ToolResult {
            content: Some(Arc::new(content)),
            is_error: Some(false),
            duration_ms: None,
        })
    }

    fn call(name: &str, input: &[(&str, &str)], result: Option<ToolResult>) -> ToolCallRecord {
        let members: Map<String, Value> = input
            .iter()
            .map(|(k, v)| ((*k).to_owned(), Value::String((*v).to_owned())))
            .collect();
        ToolCallRecord {
            tool_use_id: "t1".into(),
            tool_name: name.into(),
            input: Some(Arc::new(Value::Object(members))),
            result,
            ..ToolCallRecord::default()
        }
    }

    fn done(name: &str, input: &[(&str, &str)]) -> ToolCallRecord {
        call(name, input, ok(json!("done")))
    }

    // ToolLineTest.kt

    #[test]
    fn edit_shows_the_file_name_and_line_counts() {
        let twelve = (1..=12)
            .map(|n| n.to_string())
            .collect::<Vec<_>>()
            .join("\n");
        let line = tool_line(&done(
            "Edit",
            &[
                ("file_path", "/a/b/AuthService.kt"),
                ("old_string", "1\n2\n3"),
                ("new_string", &twelve),
            ],
        ));
        assert_eq!(
            ToolLine {
                state: ToolLineState::Ok,
                label: "Edit(AuthService.kt)".into(),
                added: Some(12),
                removed: Some(3),
            },
            line
        );
    }

    #[test]
    fn write_counts_its_content_as_added() {
        let line = tool_line(&done(
            "Write",
            &[("file_path", "/x/New.kt"), ("content", "a\nb\nc\nd\ne")],
        ));
        assert_eq!(
            ToolLine {
                state: ToolLineState::Ok,
                label: "Write(New.kt)".into(),
                added: Some(5),
                removed: None,
            },
            line
        );
    }

    #[test]
    fn a_file_name_is_cut_at_either_slash_and_lines_end_as_kotlin_reads_them() {
        let line = tool_line(&done(
            "Edit",
            &[
                ("file_path", "C:\\w\\src/Main.kt"),
                ("old_string", "a\r\nb\rc"),
                ("new_string", "x\n"),
            ],
        ));
        assert_eq!("Edit(Main.kt)", line.label);
        assert_eq!((Some(2), Some(3)), (line.added, line.removed));
    }

    #[test]
    fn bash_shows_the_first_line_of_the_command() {
        assert_eq!(
            "Bash(git status)",
            tool_line(&done("Bash", &[("command", "git status\necho x")])).label
        );
    }

    #[test]
    fn a_long_summary_is_cut_at_60_chars() {
        let label = tool_line(&done("Bash", &[("command", &"x".repeat(80))])).label;
        assert_eq!(format!("Bash({}…)", "x".repeat(60)), label);
        assert_eq!(60, SUMMARY_MAX);
        let exact = tool_line(&done("Grep", &[("pattern", &"x".repeat(60))])).label;
        assert_eq!(format!("Grep({})", "x".repeat(60)), exact);
    }

    #[test]
    fn a_summary_cut_inside_an_emoji_keeps_whole_characters() {
        let command = format!("{}😀b", "a".repeat(59));
        let label = tool_line(&done("Bash", &[("command", &command)])).label;
        assert_eq!(format!("Bash({}…)", "a".repeat(59)), label);
    }

    #[test]
    fn no_result_is_running_and_an_error_result_is_error() {
        assert_eq!(
            ToolLineState::Running,
            tool_line(&call("Read", &[("file_path", "/a")], None)).state
        );
        let failed = Some(ToolResult {
            content: None,
            is_error: Some(true),
            duration_ms: None,
        });
        assert_eq!(
            ToolLineState::Error,
            tool_line(&call("Read", &[("file_path", "/a")], failed)).state
        );
    }

    #[test]
    fn an_unknown_tool_is_its_name_only() {
        assert_eq!(
            "mcp__x__y",
            tool_line(&done("mcp__x__y", &[("q", "v")])).label
        );
    }

    #[test]
    fn a_call_still_streaming_its_input_is_its_name_only() {
        let streaming = ToolCallRecord {
            tool_name: "Bash".into(),
            args_text: "{\"command\":\"l".into(),
            ..ToolCallRecord::default()
        };
        let line = tool_line(&streaming);
        assert_eq!(
            ("Bash", ToolLineState::Running),
            (line.label.as_str(), line.state)
        );
    }

    // ToolDetailTest.kt

    #[test]
    fn bash_shows_its_command_and_its_output() {
        let detail = tool_detail(&call("Bash", &[("command", "ls\npwd")], ok(json!("a\nb"))));
        assert_eq!("ls\npwd", detail.input);
        assert_eq!(Some("a\nb"), detail.output.as_deref());
        assert!(!detail.output_cut);
    }

    #[test]
    fn a_failed_call_shows_why_as_its_output() {
        let failed = Some(ToolResult {
            content: Some(Arc::new(json!("not found"))),
            is_error: Some(true),
            duration_ms: None,
        });
        let detail = tool_detail(&call("Bash", &[("command", "x")], failed));
        assert_eq!(Some("not found"), detail.output.as_deref());
    }

    #[test]
    fn text_blocks_are_joined() {
        let blocks = json!([
            {"type": "text", "text": "one"},
            {"type": "text", "text": "two"},
        ]);
        assert_eq!(
            Some("one\ntwo"),
            tool_detail(&call("Agent", &[], ok(blocks)))
                .output
                .as_deref()
        );
    }

    #[test]
    fn a_block_without_text_and_any_other_content_show_as_compact_json() {
        let blocks = json!([{"type": "image", "n": 1}, "s"]);
        assert_eq!(
            Some("{\"type\":\"image\",\"n\":1}\n\"s\""),
            tool_detail(&call("Agent", &[], ok(blocks)))
                .output
                .as_deref()
        );
        assert_eq!(
            Some("{\"a\":1}"),
            tool_detail(&call("Agent", &[], ok(json!({"a": 1}))))
                .output
                .as_deref()
        );
        let empty = Some(ToolResult::default());
        assert_eq!(
            Some(""),
            tool_detail(&call("Agent", &[], empty)).output.as_deref()
        );
    }

    #[test]
    fn no_result_is_no_output() {
        assert_eq!(
            None,
            tool_detail(&call("Bash", &[("command", "x")], None)).output
        );
    }

    #[test]
    fn another_tool_shows_its_input_as_json() {
        let input = tool_detail(&done("WebFetch", &[("url", "https://x")])).input;
        assert!(
            input.contains("\"url\"") && input.contains("https://x"),
            "{input}"
        );
        assert_eq!("", tool_detail(&done("WebFetch", &[])).input);
    }

    #[test]
    fn the_output_keeps_its_last_8_kib() {
        let long = format!("{}{}", "a".repeat(100), "b".repeat(TOOL_OUTPUT_MAX));
        let detail = tool_detail(&call("Bash", &[("command", "x")], ok(Value::String(long))));
        assert_eq!(Some("b".repeat(TOOL_OUTPUT_MAX)), detail.output);
        assert!(detail.output_cut);
        assert_eq!(8 * 1024, TOOL_OUTPUT_MAX);
    }

    #[test]
    fn the_target_is_the_file_or_the_pattern() {
        assert_eq!(
            Some("/a/A.kt"),
            tool_detail(&done("Read", &[("file_path", "/a/A.kt")]))
                .target
                .as_deref()
        );
        assert_eq!(
            Some("login"),
            tool_detail(&done("Grep", &[("pattern", "login")]))
                .target
                .as_deref()
        );
        assert_eq!(
            Some("/a"),
            tool_detail(&done("LS", &[("path", "/a")]))
                .target
                .as_deref()
        );
    }

    #[test]
    fn explored_counts_files_not_calls() {
        use crate::rows::{ExploredRow, ToolRow};

        fn row(key: &str, name: &str, input: &[(&str, &str)]) -> Arc<ToolRow> {
            let made = call(name, input, None);
            Arc::new(ToolRow {
                key: key.into(),
                line: tool_line(&made),
                tool_use_id: format!("t-{key}"),
                tool_name: name.into(),
                depth: 0,
                opens: false,
                detail: Some(tool_detail(&made)),
                agent: None,
            })
        }
        let explored = ExploredRow {
            key: "k1".into(),
            members: vec![
                row("k1", "Read", &[("file_path", "/a/A.kt")]),
                row("k2", "Read", &[("file_path", "/a/A.kt")]),
                row("k3", "Grep", &[("pattern", "login")]),
            ],
            depth: 0,
            opens: false,
        };
        assert_eq!(2, explored.files());
        assert_eq!(3, explored.lines().len());
    }
}
