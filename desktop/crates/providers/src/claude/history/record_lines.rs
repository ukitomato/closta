//! One line of a saved record, read: which lines are the conversation, and the events the
//! conversation's own lines become. A line that is not a JSON object reads as none, and so does one
//! without the fields an event needs: nothing here fails for a damaged record.

use closta_model::{AgentEvent, RawJson};
use serde_json::{Map, Value};

use super::text::is_java_space;

/// The longest line (in bytes) that is read: a longer one is skipped without being parsed, and counted.
pub const MAX_LINE_BYTES: usize = 1024 * 1024;

/// Whether `name` is a session id as the CLI makes them (a UUID): what a record is named by.
pub fn is_session_id(name: &str) -> bool {
    let bytes = name.as_bytes();
    bytes.len() == 36
        && bytes.iter().enumerate().all(|(at, byte)| match at {
            8 | 13 | 18 | 23 => *byte == b'-',
            _ => byte.is_ascii_hexdigit(),
        })
}

/// Whether the line has `"type"`, a colon and one of `kinds` as a string, with only ASCII spaces
/// (Java's `\s`) around the colon, anywhere in it.
pub(crate) fn has_type(line: &str, kinds: &[&str]) -> bool {
    const KEY: &str = "\"type\"";
    line.match_indices(KEY).any(|(at, _)| {
        let rest = line[at + KEY.len()..].trim_start_matches(is_java_space);
        let Some(rest) = rest.strip_prefix(':') else {
            return false;
        };
        let rest = rest.trim_start_matches(is_java_space);
        kinds.iter().any(|kind| {
            rest.strip_prefix('"')
                .and_then(|it| it.strip_prefix(kind))
                .is_some_and(|it| it.starts_with('"'))
        })
    })
}

/// Whether a line says it is a user or an assistant line: the only ones worth parsing.
pub(crate) fn may_be_conversation(line: &str) -> bool {
    has_type(line, &["user", "assistant"])
}

/// `line` as a JSON object, or None when it is not one.
pub(crate) fn row(line: &str) -> Option<Map<String, Value>> {
    match serde_json::from_str::<Value>(line) {
        Ok(Value::Object(map)) => Some(map),
        _ => None,
    }
}

/// A conversation line made an event, and whether it only holds the results of tool calls.
pub(crate) struct Kept {
    pub event: AgentEvent,
    pub only_results: bool,
}

// The event holds what the user said, so `Debug` shows only which event it is.
impl std::fmt::Debug for Kept {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let kind = match self.event {
            AgentEvent::User { .. } => "User",
            AgentEvent::Assistant { .. } => "Assistant",
            _ => "Other",
        };
        write!(f, "Kept({kind}, only_results: {})", self.only_results)
    }
}

/// The conversation's own lines, as the events stdout gives; every other line is None.
pub(crate) fn event_of(line: &str) -> Option<Kept> {
    if !may_be_conversation(line) {
        return None;
    }
    let row = row(line)?;
    let uuid = string(&row, "uuid")?.to_owned();
    let session_id = string(&row, "sessionId")?.to_owned();
    let timestamp = string(&row, "timestamp")?.to_owned();
    let message = row.get("message").filter(|it| it.is_object())?;
    if flag(&row, "isSidechain") {
        return None;
    }
    let message_json = raw(message);
    match string(&row, "type")? {
        "user" if !is_note(&row) => Some(Kept {
            event: AgentEvent::User {
                uuid,
                session_id,
                timestamp,
                message: message_json,
                parent_tool_use_id: None,
                tool_use_result: raw_of(&row, "toolUseResult"),
                subagent_type: None,
                task_description: None,
            },
            only_results: only_tool_results(message),
        }),
        "assistant" => Some(Kept {
            event: AgentEvent::Assistant {
                uuid,
                session_id,
                timestamp,
                request_id: Some(string(&row, "requestId").unwrap_or_default().to_owned()),
                message: message_json,
                parent_tool_use_id: None,
                user_message_uuid: None,
                user_message_uuids: None,
                wire_tool_inputs: raw_of(&row, "wireToolInputs"),
                subagent_type: None,
                task_description: None,
                error: None,
            },
            only_results: false,
        }),
        _ => None,
    }
}

/// A user line of the main conversation: not a sub-agent's, not a note the CLI wrote for the model
/// and not the summary of a compaction.
pub(crate) fn is_main_user(row: &Map<String, Value>) -> bool {
    string(row, "type") == Some("user") && !flag(row, "isSidechain") && !is_note(row)
}

pub(crate) fn string<'a>(row: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    row.get(key).and_then(Value::as_str)
}

fn flag(row: &Map<String, Value>, key: &str) -> bool {
    row.get(key).and_then(Value::as_bool) == Some(true)
}

// What the CLI wrote itself in a user line: a note for the model, or the summary of a compaction.
fn is_note(row: &Map<String, Value>) -> bool {
    flag(row, "isMeta") || flag(row, "isCompactSummary")
}

fn raw(value: &Value) -> RawJson {
    RawJson(serde_json::to_string(value).unwrap_or_default())
}

fn raw_of(row: &Map<String, Value>, key: &str) -> Option<RawJson> {
    row.get(key).filter(|it| !it.is_null()).map(raw)
}

// A message that holds nothing but the results of tool calls.
fn only_tool_results(message: &Value) -> bool {
    let Some(blocks) = message.get("content").and_then(Value::as_array) else {
        return false;
    };
    !blocks.is_empty()
        && blocks.iter().all(|block| {
            block
                .as_object()
                .and_then(|it| string(it, "type"))
                .is_some_and(|it| it == "tool_result")
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const SESSION: &str = "11111111-2222-3333-4444-555555555555";

    fn user(message: Value, extra: Value) -> String {
        let mut line = json!({"type": "user", "uuid": "u1", "sessionId": SESSION,
            "timestamp": "2026-01-01T00:00:00Z", "message": message});
        merge(&mut line, extra);
        line.to_string()
    }

    fn assistant(extra: Value) -> String {
        let mut line = json!({"type": "assistant", "uuid": "a1", "sessionId": SESSION,
            "timestamp": "2026-01-01T00:00:01Z",
            "message": {"role": "assistant", "content": [{"type": "text", "text": "hi"}]}});
        merge(&mut line, extra);
        line.to_string()
    }

    fn merge(line: &mut Value, extra: Value) {
        if let (Some(into), Value::Object(from)) = (line.as_object_mut(), extra) {
            into.extend(from);
        }
    }

    fn hello() -> Value {
        json!({"role": "user", "content": "hello"})
    }

    #[test]
    fn session_ids_are_uuids_as_the_cli_makes_them() {
        assert!(is_session_id(SESSION));
        assert!(is_session_id("ABCDEF01-2345-6789-ABCD-EF0123456789"));
        assert!(!is_session_id("../escape"));
        assert!(!is_session_id("11111111-2222-3333-4444-55555555555"));
        assert!(!is_session_id("11111111-2222-3333-4444-5555555555555"));
        assert!(!is_session_id("g1111111-2222-3333-4444-555555555555"));
        assert!(!is_session_id("111111112222-3333-4444-5555-55555555555"));
    }

    #[test]
    fn a_line_is_conversation_by_its_type_with_ascii_spaces_only() {
        assert!(may_be_conversation(r#"{"type":"user"}"#));
        assert!(may_be_conversation(r#"{"type":"assistant"}"#));
        assert!(may_be_conversation(r#"{ "type" : "user" }"#));
        assert!(may_be_conversation("{\"type\"\t\n:\r\"assistant\"}"));
        assert!(!may_be_conversation("{\"type\"\u{3000}:\"user\"}"));
        assert!(!may_be_conversation(r#"{"type":"system"}"#));
        assert!(!may_be_conversation(r#"{"type":"users"}"#));
        assert!(!may_be_conversation("{not json"));
        // A later `"type"` still counts when an earlier one is another kind.
        assert!(may_be_conversation(r#"{"type":"x","m":{"type":"user"}}"#));
    }

    #[test]
    fn user_and_assistant_lines_become_the_events_stdout_gives() {
        let tool = user(
            json!({"role": "user", "content": [{"type": "tool_result", "tool_use_id": "t1"}]}),
            json!({"toolUseResult": {"stdout": "ok"}}),
        );
        let kept = event_of(&tool).unwrap();
        assert!(kept.only_results);
        let AgentEvent::User {
            uuid,
            session_id,
            timestamp,
            tool_use_result,
            parent_tool_use_id,
            ..
        } = kept.event
        else {
            panic!("a user line is a User");
        };
        assert_eq!(
            (uuid.as_str(), session_id.as_str(), timestamp.as_str()),
            ("u1", SESSION, "2026-01-01T00:00:00Z")
        );
        assert_eq!(
            tool_use_result,
            Some(RawJson(r#"{"stdout":"ok"}"#.to_owned()))
        );
        assert_eq!(parent_tool_use_id, None);

        let line = assistant(json!({"requestId": "req_1", "wireToolInputs": {"a": 1}}));
        let kept = event_of(&line).unwrap();
        assert!(!kept.only_results);
        let AgentEvent::Assistant {
            request_id,
            message,
            parent_tool_use_id,
            wire_tool_inputs,
            error,
            subagent_type,
            ..
        } = kept.event
        else {
            panic!("an assistant line is an Assistant");
        };
        assert_eq!(request_id.as_deref(), Some("req_1"));
        assert!(message.0.contains(r#""text":"hi""#));
        assert_eq!(wire_tool_inputs, Some(RawJson(r#"{"a":1}"#.to_owned())));
        assert_eq!(
            (parent_tool_use_id, error, subagent_type),
            (None, None, None)
        );
    }

    #[test]
    fn an_assistant_line_without_request_id_says_the_empty_one() {
        let Some(Kept {
            event: AgentEvent::Assistant { request_id, .. },
            ..
        }) = event_of(&assistant(json!({})))
        else {
            panic!("an assistant line is an Assistant");
        };
        assert_eq!(request_id, Some(String::new()));
    }

    #[test]
    fn a_line_without_ids_or_a_message_is_none() {
        let no_uuid = json!({"type": "user", "message": {"role": "user", "content": "no uuid"}});
        let no_message =
            json!({"type": "assistant", "uuid": "a1", "sessionId": SESSION, "timestamp": "t"});
        assert!(event_of(&no_uuid.to_string()).is_none());
        assert!(event_of(&no_message.to_string()).is_none());
        let message_not_object = user(json!("text"), json!({}));
        assert!(event_of(&message_not_object).is_none());
    }

    #[test]
    fn a_sub_agent_a_note_and_a_compaction_summary_are_none() {
        assert!(event_of(&user(hello(), json!({}))).is_some());
        assert!(event_of(&user(hello(), json!({"isSidechain": true}))).is_none());
        assert!(event_of(&assistant(json!({"isSidechain": true}))).is_none());
        assert!(event_of(&user(hello(), json!({"isMeta": true}))).is_none());
        assert!(event_of(&user(hello(), json!({"isCompactSummary": true}))).is_none());
        // Only a real `true` counts.
        assert!(event_of(&user(hello(), json!({"isMeta": "true"}))).is_some());
    }

    #[test]
    fn only_tool_results_is_a_message_of_results_alone() {
        let only = |content: Value| {
            event_of(&user(
                json!({"role": "user", "content": content}),
                json!({}),
            ))
            .unwrap()
            .only_results
        };
        assert!(only(
            json!([{"type": "tool_result"}, {"type": "tool_result"}])
        ));
        assert!(!only(
            json!([{"type": "tool_result"}, {"type": "text", "text": "x"}])
        ));
        assert!(!only(json!([])));
        assert!(!only(json!("text")));
    }

    #[test]
    fn a_lone_surrogate_and_a_line_deeper_than_128_are_none() {
        let lone = format!(
            r#"{{"type":"user","uuid":"u1","sessionId":"{SESSION}","timestamp":"t","message":{{"content":"\ud800"}}}}"#
        );
        assert!(may_be_conversation(&lone));
        assert!(event_of(&lone).is_none());

        let deep = format!(
            r#"{{"type":"user","uuid":"u1","sessionId":"{SESSION}","timestamp":"t","message":{{"content":{}{}}}}}"#,
            "[".repeat(129),
            "]".repeat(129)
        );
        assert!(event_of(&deep).is_none());
    }

    #[test]
    fn a_line_of_another_type_is_not_parsed() {
        let summary = format!(
            r#"{{"type":"summary","uuid":"u1","sessionId":"{SESSION}","timestamp":"t","message":{{"content":"user"}}}}"#
        );
        assert!(event_of(&summary).is_none());
    }

    #[test]
    fn is_main_user_reads_the_rule_a_title_is_made_by() {
        let main = |extra: Value| {
            let mut line = json!({"type": "user"});
            merge(&mut line, extra);
            is_main_user(line.as_object().unwrap())
        };
        assert!(main(json!({})));
        assert!(!main(json!({"isSidechain": true})));
        assert!(!main(json!({"isMeta": true})));
        assert!(!main(json!({"isCompactSummary": true})));
        assert!(!is_main_user(
            json!({"type": "assistant"}).as_object().unwrap()
        ));
    }

    #[test]
    fn the_debug_of_a_kept_event_says_nothing_of_the_line() {
        let kept = event_of(&user(json!({"content": "secret words"}), json!({}))).unwrap();
        assert_eq!(format!("{kept:?}"), "Kept(User, only_results: false)");
    }
}
