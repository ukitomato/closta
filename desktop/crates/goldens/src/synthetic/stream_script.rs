//! Writes stream-json lines in the shapes the CLI prints (captures 01 and 17), for the synthetic
//! sessions and the replays (StreamScript.kt). Each call appends lines; [`StreamScript::lines`]
//! gives them all.

use closta_presenter::text::take_utf16;
use serde_json::{Map, Value, json};

const TIMESTAMP: &str = "2026-11-03T00:00:00.000Z";
const INPUT_CHUNK: usize = 12;

pub struct StreamScript {
    session_id: String,
    /// The model the init line and every assistant message name.
    model: String,
    out: Vec<Value>,
    uuid: usize,
}

impl StreamScript {
    pub fn new(session_id: &str) -> Self {
        Self::with_model(session_id, "claude-synthetic")
    }

    pub fn with_model(session_id: &str, model: &str) -> Self {
        Self {
            session_id: session_id.to_owned(),
            model: model.to_owned(),
            out: Vec::new(),
            uuid: 0,
        }
    }

    pub fn lines(&self) -> Vec<String> {
        self.out.iter().map(Value::to_string).collect()
    }

    /// One line: `type`, then `fields` in their order, then the session and a fresh uuid.
    fn line(&mut self, kind: &str, fields: Value) {
        let mut object = Map::new();
        object.insert("type".into(), kind.into());
        if let Value::Object(fields) = fields {
            object.extend(fields);
        }
        object.insert("session_id".into(), self.session_id.clone().into());
        object.insert("uuid".into(), format!("spike-{}", self.uuid).into());
        self.uuid += 1;
        self.out.push(Value::Object(object));
    }

    pub fn lifecycle(&mut self, command: &str, state: &str) {
        self.line(
            "command_lifecycle",
            json!({ "command_uuid": command, "state": state }),
        );
    }

    pub fn init(&mut self) {
        let model = self.model.clone();
        self.line(
            "system",
            json!({
                "subtype": "init",
                "cwd": "/spike",
                "tools": [],
                "mcp_servers": [],
                "model": model,
                "permissionMode": "default",
                "slash_commands": [],
                "apiKeySource": "none",
                "claude_code_version": "spike",
                "output_style": "default",
                "view_mode": "default",
                "messaging_socket_path": "",
                "fast_mode_state": "off",
                "terminal_slash_commands": [],
                "agents": [],
                "skills": [],
                "plugins": [],
                "capabilities": [],
                "memory_paths": {},
                "analytics_disabled": false,
                "product_feedback_disabled": false,
                "per_turn_effort_active": false,
            }),
        );
    }

    /// A finished `assistant` line holding `blocks`; `parent` puts it in that tool call's
    /// sub-agent.
    pub fn assistant(&mut self, message_id: &str, blocks: Vec<Value>, parent: Option<&str>) {
        let message = self.message(message_id, blocks);
        self.line(
            "assistant",
            json!({
                "timestamp": TIMESTAMP,
                "request_id": format!("req_{message_id}"),
                "message": message,
                "parent_tool_use_id": parent,
            }),
        );
    }

    /// A `user` line with the result of `tool_id`.
    pub fn tool_result(
        &mut self,
        tool_id: &str,
        content: &str,
        parent: Option<&str>,
        is_error: bool,
    ) {
        let mut result = json!({
            "tool_use_id": tool_id,
            "type": "tool_result",
            "content": content,
        });
        if is_error {
            result["is_error"] = true.into();
        }
        self.line(
            "user",
            json!({
                "timestamp": TIMESTAMP,
                "message": { "role": "user", "content": [result] },
                "parent_tool_use_id": parent,
            }),
        );
    }

    /// A tool call streamed in pieces of its input, then its finished snapshot.
    pub fn stream_tool(&mut self, message_id: &str, tool_id: &str, name: &str, input: &Value) {
        self.start(message_id);
        self.stream(json!({
            "type": "content_block_start",
            "index": 0,
            "content_block": tool_use(tool_id, name, json!({})),
        }));
        for piece in chunked(&input.to_string(), INPUT_CHUNK) {
            self.stream(delta("input_json_delta", "partial_json", piece));
        }
        self.assistant(
            message_id,
            vec![tool_use(tool_id, name, input.clone())],
            None,
        );
        self.stream(json!({ "type": "content_block_stop", "index": 0 }));
        self.end("tool_use");
    }

    /// A text block streamed in pieces of `chunk` UTF-16 units, then its finished snapshot.
    pub fn stream_text(&mut self, message_id: &str, text: &str, chunk: usize) {
        self.start(message_id);
        self.stream(json!({
            "type": "content_block_start",
            "index": 0,
            "content_block": self::text(""),
        }));
        for piece in chunked(text, chunk) {
            self.stream(delta("text_delta", "text", piece));
        }
        self.assistant(message_id, vec![self::text(text)], None);
        self.stream(json!({ "type": "content_block_stop", "index": 0 }));
        self.end("end_turn");
    }

    pub fn result(&mut self, text: &str) {
        self.line(
            "result",
            json!({
                "subtype": "success",
                "is_error": false,
                "duration_ms": 0,
                "duration_api_ms": 0,
                "num_turns": 1,
                "result": text,
                "stop_reason": "end_turn",
                "total_cost_usd": 0,
                "result_index": 0,
                "queued_turn_count": 0,
                "fast_mode_state": "off",
                "usage": {},
                "modelUsage": {},
                "permission_denials": [],
                "subagent_stats": {},
            }),
        );
    }

    fn start(&mut self, message_id: &str) {
        let message = self.message(message_id, Vec::new());
        self.stream(json!({ "type": "message_start", "message": message }));
    }

    fn end(&mut self, reason: &str) {
        self.stream(json!({ "type": "message_delta", "delta": { "stop_reason": reason } }));
        self.stream(json!({ "type": "message_stop" }));
    }

    fn stream(&mut self, event: Value) {
        self.line(
            "stream_event",
            json!({ "event": event, "parent_tool_use_id": null }),
        );
    }

    fn message(&self, id: &str, content: Vec<Value>) -> Value {
        json!({
            "model": self.model,
            "id": id,
            "type": "message",
            "role": "assistant",
            "content": content,
            "stop_reason": null,
        })
    }
}

pub fn text(text: &str) -> Value {
    json!({ "type": "text", "text": text })
}

pub fn tool_use(id: &str, name: &str, input: Value) -> Value {
    json!({ "type": "tool_use", "id": id, "name": name, "input": input })
}

fn delta(kind: &str, key: &str, value: &str) -> Value {
    let mut delta = Map::new();
    delta.insert("type".into(), kind.into());
    delta.insert(key.into(), value.into());
    json!({ "type": "content_block_delta", "index": 0, "delta": delta })
}

/// Kotlin's `chunked` over UTF-16 units, except that a piece never ends inside a surrogate pair:
/// the pair goes to the next piece whole (a `str` cannot hold half of one).
fn chunked(text: &str, size: usize) -> Vec<&str> {
    let mut pieces = Vec::new();
    let mut rest = text;
    while !rest.is_empty() {
        let mut piece = take_utf16(rest, size);
        if piece.is_empty() {
            let first = rest.chars().next().map_or(0, char::len_utf8);
            piece = &rest[..first];
        }
        pieces.push(piece);
        rest = &rest[piece.len()..];
    }
    pieces
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunks_count_utf16_units_and_keep_a_pair_whole() {
        assert_eq!(vec!["abc", "de"], chunked("abcde", 3));
        assert_eq!(vec!["a", "\u{1F600}", "b"], chunked("a\u{1F600}b", 2));
        assert_eq!(vec!["\u{1F600}"], chunked("\u{1F600}", 1));
        assert!(chunked("", 8).is_empty());
    }

    #[test]
    fn a_line_has_its_type_first_and_the_session_and_uuid_last() {
        let mut script = StreamScript::new("s");
        script.lifecycle("c", "queued");
        script.lifecycle("c", "started");

        assert_eq!(
            vec![
                r#"{"type":"command_lifecycle","command_uuid":"c","state":"queued","session_id":"s","uuid":"spike-0"}"#,
                r#"{"type":"command_lifecycle","command_uuid":"c","state":"started","session_id":"s","uuid":"spike-1"}"#,
            ],
            script.lines()
        );
    }
}
