//! Turns one stream-json stdout line into an [`AgentEvent`]. Mirrors `StreamJsonCodec.decode` in
//! StreamJsonCodec.kt.

mod fields;
mod json;

use closta_model::{AgentEvent, AgentEventKind, RawJson};
use fields::{FieldError, Fields};
use json::{parse_line, raw_text};
use serde_json::{Map, Value};

const SYSTEM: &str = "system";
const CONTROL_REQUEST: &str = "control_request";
const CAN_USE_TOOL: &str = "can_use_tool";

/// Converts one line. Never panics: a line that is not a JSON object is a `BrokenLine`, and an
/// object that cannot be placed is an `UnknownKind` that keeps the whole line.
pub fn decode(line: &str) -> AgentEvent {
    match parse_line(line) {
        Ok(json) => place(&json),
        Err(e) => AgentEvent::BrokenLine {
            line: line.to_string(),
            reason: e.reason,
        },
    }
}

/// The wire type of a line: `type`, with `/<subtype>` appended for `system` lines that have one.
fn wire_type_of(fields: &Fields) -> String {
    let kind = fields.text_or_null("type").unwrap_or_default();
    match fields.text_or_null("subtype") {
        Some(subtype) if kind == SYSTEM => format!("{kind}/{subtype}"),
        _ => kind,
    }
}

fn unknown_kind(wire_type: String, json: &Map<String, Value>) -> AgentEvent {
    AgentEvent::UnknownKind {
        wire_type,
        raw: RawJson(raw_text(&Value::Object(json.clone()))),
    }
}

/// Places an already-parsed line, or counts it as unknown when nothing here matches its shape.
fn place(json: &Map<String, Value>) -> AgentEvent {
    let f = Fields::new(json);
    let wire_type = wire_type_of(&f);
    if wire_type == CONTROL_REQUEST {
        // Only can_use_tool is an approval; anything else would become a pending approval nobody
        // can answer, so it is counted as unknown under `control_request/<subtype>`.
        let subtype = f
            .nested("request")
            .and_then(|r| Fields::new(r).text_or_null("subtype"));
        if subtype.as_deref() != Some(CAN_USE_TOOL) {
            let unplaced = match subtype {
                None => CONTROL_REQUEST.to_string(),
                Some(s) => format!("{CONTROL_REQUEST}/{s}"),
            };
            return unknown_kind(unplaced, json);
        }
    }
    // The one place a missing or unreadable field turns into `UnknownKind`.
    let placed = AgentEventKind::of_wire_type(&wire_type).and_then(|kind| build(kind, &f).ok());
    placed.unwrap_or_else(|| unknown_kind(wire_type, json))
}

fn build(kind: AgentEventKind, f: &Fields) -> Result<AgentEvent, FieldError> {
    Ok(match kind {
        AgentEventKind::StreamEvent => AgentEvent::StreamEvent {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            event: f.raw("event")?,
            parent_tool_use_id: f.text_or_null("parent_tool_use_id"),
            ttft_ms: f.whole_or_null("ttft_ms")?,
            user_message_uuid: f.text_or_null("user_message_uuid"),
            user_message_uuids: f.raw_or_null("user_message_uuids"),
        },
        AgentEventKind::Assistant => AgentEvent::Assistant {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            timestamp: f.text("timestamp")?,
            request_id: f.text_or_null("request_id"),
            message: f.raw("message")?,
            parent_tool_use_id: f.text_or_null("parent_tool_use_id"),
            user_message_uuid: f.text_or_null("user_message_uuid"),
            user_message_uuids: f.raw_or_null("user_message_uuids"),
            wire_tool_inputs: f.raw_or_null("wire_tool_inputs"),
            subagent_type: f.text_or_null("subagent_type"),
            task_description: f.text_or_null("task_description"),
            error: f.text_or_null("error"),
        },
        AgentEventKind::CommandLifecycle => AgentEvent::CommandLifecycle {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            command_uuid: f.text("command_uuid")?,
            state: f.text("state")?,
        },
        AgentEventKind::SystemStatus => AgentEvent::SystemStatus {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            status: f.text_or_null("status"),
            permission_mode: f.text_or_null("permissionMode"),
        },
        AgentEventKind::User => AgentEvent::User {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            timestamp: f.text("timestamp")?,
            message: f.raw("message")?,
            parent_tool_use_id: f.text_or_null("parent_tool_use_id"),
            tool_use_result: f.raw_or_null("tool_use_result"),
            subagent_type: f.text_or_null("subagent_type"),
            task_description: f.text_or_null("task_description"),
        },
        AgentEventKind::ControlResponse => {
            // request_id / subtype / error live inside `response`; `response` itself stays raw.
            let response = f.nested("response").map(Fields::new);
            let inner = |name: &str| response.as_ref().and_then(|r| r.text_or_null(name));
            AgentEvent::ControlResponse {
                response: f.raw("response")?,
                request_id: inner("request_id"),
                subtype: inner("subtype"),
                error: inner("error"),
            }
        }
        AgentEventKind::SystemInit => AgentEvent::SystemInit {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            cwd: f.text("cwd")?,
            model: f.text("model")?,
            permission_mode: f.text("permissionMode")?,
            api_key_source: f.text("apiKeySource")?,
            claude_code_version: f.text("claude_code_version")?,
            output_style: f.text("output_style")?,
            view_mode: f.text("view_mode")?,
            scratchpad_path: f.text_or_null("scratchpad_path"),
            messaging_socket_path: f.text("messaging_socket_path")?,
            fast_mode_state: f.text("fast_mode_state")?,
            tools: f.raw("tools")?,
            mcp_servers: f.raw("mcp_servers")?,
            slash_commands: f.raw("slash_commands")?,
            terminal_slash_commands: f.raw("terminal_slash_commands")?,
            agents: f.raw("agents")?,
            skills: f.raw("skills")?,
            plugins: f.raw("plugins")?,
            capabilities: f.raw("capabilities")?,
            memory_paths: f.raw("memory_paths")?,
            analytics_disabled: f.flag("analytics_disabled")?,
            product_feedback_disabled: f.flag("product_feedback_disabled")?,
            per_turn_effort_active: f.flag("per_turn_effort_active")?,
            fast_mode_disabled_reason: f.text_or_null("fast_mode_disabled_reason"),
        },
        AgentEventKind::Result => AgentEvent::Result {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            subtype: f.text("subtype")?,
            // An error result (sdk.d.ts SDKResultError) has no result text; its errors say what
            // went wrong.
            result: match f.text_or_null("result") {
                Some(text) => text,
                None => f.lines("errors")?,
            },
            is_error: f.flag("is_error")?,
            stop_reason: f.text_or_null("stop_reason"),
            terminal_reason: f.text_or_null("terminal_reason"),
            num_turns: f.count("num_turns")?,
            result_index: f.count("result_index")?,
            queued_turn_count: f.count("queued_turn_count")?,
            total_cost_usd: f.money("total_cost_usd")?,
            duration_ms: f.whole("duration_ms")?,
            duration_api_ms: f.whole("duration_api_ms")?,
            ttft_ms: f.whole_or_null("ttft_ms")?,
            ttft_stream_ms: f.whole_or_null("ttft_stream_ms")?,
            time_to_request_ms: f.whole_or_null("time_to_request_ms")?,
            first_content_frame_ms: f.whole_or_null("first_content_frame_ms")?,
            fast_mode_state: f.text("fast_mode_state")?,
            usage: f.raw("usage")?,
            model_usage: f.raw("modelUsage")?,
            permission_denials: f.raw("permission_denials")?,
            subagent_stats: f.raw("subagent_stats")?,
            api_error_status: f.text_or_null("api_error_status"),
            fast_mode_disabled_reason: f.text_or_null("fast_mode_disabled_reason"),
            request_sent_wall_ms: f.whole_or_null("request_sent_wall_ms")?,
            user_message_uuid: f.text_or_null("user_message_uuid"),
            user_message_uuids: f.texts_or_null("user_message_uuids"),
            origin: f.raw_or_null("origin"),
            local_command: f.text_or_null("local_command"),
        },
        AgentEventKind::RateLimitEvent => AgentEvent::RateLimitEvent {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            rate_limit_info: f.raw("rate_limit_info")?,
        },
        AgentEventKind::SystemBackgroundTasksChanged => AgentEvent::SystemBackgroundTasksChanged {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            tasks: f.raw("tasks")?,
        },
        AgentEventKind::SystemThinkingTokens => AgentEvent::SystemThinkingTokens {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            estimated_tokens: f.whole("estimated_tokens")?,
            estimated_tokens_delta: f.whole("estimated_tokens_delta")?,
            user_message_uuid: f.text_or_null("user_message_uuid"),
        },
        AgentEventKind::SystemTaskStarted => AgentEvent::SystemTaskStarted {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            task_id: f.text("task_id")?,
            tool_use_id: f.text("tool_use_id")?,
            description: f.text("description")?,
            task_type: f.text("task_type")?,
            is_backgrounded: f.flag("is_backgrounded")?,
            subagent_type: f.text_or_null("subagent_type"),
            spawn_depth: f.count_or_null("spawn_depth")?,
            prompt: f.text_or_null("prompt"),
            owned_by_subagent: f.flag_or_null("owned_by_subagent")?,
        },
        AgentEventKind::SystemTaskProgress => AgentEvent::SystemTaskProgress {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            task_id: f.text("task_id")?,
            description: f.text("description")?,
            subagent_type: f.text("subagent_type")?,
            last_tool_name: f.text("last_tool_name")?,
            usage: f.raw("usage")?,
            tool_use_id: f.text_or_null("tool_use_id"),
        },
        AgentEventKind::SystemTaskUpdated => AgentEvent::SystemTaskUpdated {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            task_id: f.text("task_id")?,
            patch: f.raw("patch")?,
        },
        AgentEventKind::SystemTaskNotification => AgentEvent::SystemTaskNotification {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            task_id: f.text("task_id")?,
            tool_use_id: f.text("tool_use_id")?,
            status: f.text("status")?,
            output_file: f.text("output_file")?,
            summary: f.text("summary")?,
            usage: f.raw_or_null("usage"),
        },
        AgentEventKind::ControlRequest => {
            // The attribution/kind scalars live inside `request`; `request` itself stays raw.
            let request = f.nested("request").map(Fields::new);
            let inner = |name: &str| request.as_ref().and_then(|r| r.text_or_null(name));
            AgentEvent::ControlRequest {
                request_id: f.text("request_id")?,
                request: f.raw("request")?,
                agent_id: inner("agent_id"),
                tool_name: inner("tool_name"),
                tool_use_id: inner("tool_use_id"),
            }
        }
        AgentEventKind::SystemCommandsChanged => AgentEvent::SystemCommandsChanged {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            commands: f.raw("commands")?,
        },
        AgentEventKind::SystemCompactBoundary => AgentEvent::SystemCompactBoundary {
            uuid: f.text("uuid")?,
            session_id: f.text("session_id")?,
            compact_metadata: f.raw("compact_metadata")?,
            logical_parent_uuid: f.text_or_null("logical_parent_uuid"),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::json::MAX_DEPTH;
    use super::*;

    fn unknown(line: &str) -> (String, String) {
        match decode(line) {
            AgentEvent::UnknownKind { wire_type, raw } => (wire_type, raw.0),
            other => panic!("expected UnknownKind for {line:?}, got {other:?}"),
        }
    }

    fn is_broken(line: &str) -> bool {
        matches!(decode(line), AgentEvent::BrokenLine { .. })
    }

    fn is_unknown(line: &str) -> bool {
        matches!(decode(line), AgentEvent::UnknownKind { .. })
    }

    fn parsed(raw: &RawJson) -> Value {
        serde_json::from_str(&raw.0).unwrap()
    }

    fn nested_to(depth: usize) -> String {
        let inner = format!(
            "{}{{}}{}",
            "{\"a\":".repeat(depth - 2),
            "}".repeat(depth - 2)
        );
        format!(r#"{{"type":"holographic_telemetry","n":{inner}}}"#)
    }

    #[test]
    fn a_line_that_is_not_json_becomes_a_broken_line() {
        let AgentEvent::BrokenLine { line, reason } = decode("not json at all") else {
            panic!("expected BrokenLine");
        };
        assert_eq!(line, "not json at all");
        assert!(!reason.trim().is_empty());
    }

    #[test]
    fn a_strict_reader_rejects_an_unquoted_literal_rather_than_guessing_a_value() {
        assert!(is_broken(r#"{"type":"assistant", this is not JSON"#));
    }

    #[test]
    fn a_top_level_value_that_is_not_an_object_is_a_broken_line() {
        assert!(is_broken("42"));
        assert!(is_broken("[1,2,3]"));
        assert!(is_broken(""));
    }

    #[test]
    fn an_unknown_wire_type_is_counted_as_unknown_and_kept_whole() {
        let line = r#"{"type":"holographic_telemetry","uuid":"u","session_id":"s"}"#;
        let (wire_type, raw) = unknown(line);
        assert_eq!(wire_type, "holographic_telemetry");
        assert_eq!(raw, line);
    }

    #[test]
    fn an_unknown_system_subtype_keeps_its_subtype_rather_than_collapsing_into_system() {
        let line = r#"{"type":"system","subtype":"quantum_entangled","uuid":"u","session_id":"s"}"#;
        assert_eq!(unknown(line).0, "system/quantum_entangled");
    }

    #[test]
    fn a_known_kind_missing_a_required_field_is_counted_as_unknown() {
        let line = r#"{"type":"command_lifecycle","command_uuid":"c","uuid":"u","session_id":"s"}"#;
        assert_eq!(unknown(line).0, "command_lifecycle");
    }

    #[test]
    fn an_assistant_message_the_cli_made_itself_has_no_request_id_and_says_its_error() {
        let line = concat!(
            r#"{"type":"assistant","message":{"id":"m1","model":"<synthetic>","role":"assistant","#,
            r#""type":"message","content":[{"type":"text","text":"Not logged in · Please run /login"}]},"#,
            r#""parent_tool_use_id":null,"session_id":"s","uuid":"u","timestamp":"t","#,
            r#""user_message_uuid":"c1","error":"authentication_failed","is_api_error_message":true}"#
        );
        let AgentEvent::Assistant {
            request_id,
            error,
            user_message_uuid,
            ..
        } = decode(line)
        else {
            panic!("expected Assistant");
        };
        assert_eq!(request_id, None);
        assert_eq!(error.as_deref(), Some("authentication_failed"));
        assert_eq!(user_message_uuid.as_deref(), Some("c1"));
    }

    #[test]
    fn decode_never_panics_whatever_the_input() {
        for line in [
            "",
            "   ",
            "null",
            "\"a string\"",
            "{not even close",
            r#"{"type":"system"}"#,
            r#"{"type":"result"}"#,
        ] {
            let _ = decode(line);
        }
    }

    #[test]
    fn a_line_nested_10000_deep_is_a_broken_line_and_decode_does_not_panic() {
        let AgentEvent::BrokenLine { reason, .. } = decode(&nested_to(10_000)) else {
            panic!("expected BrokenLine");
        };
        assert!(reason.contains("nesting"), "{reason}");
    }

    #[test]
    fn the_limit_is_exact_201_levels_is_broken_and_200_levels_is_placed() {
        assert!(is_broken(&nested_to(201)));
        assert!(is_unknown(&nested_to(200)));
        assert_eq!(MAX_DEPTH, 200);
    }

    #[test]
    fn brackets_inside_a_string_are_not_counted_as_nesting() {
        let brackets = format!("{}{}", "[".repeat(500), "{".repeat(500));
        let escaped = format!(r#"a\"[{}"#, "[".repeat(500));
        assert!(is_unknown(&format!(
            r#"{{"type":"holographic_telemetry","s":"{brackets}"}}"#
        )));
        assert!(is_unknown(&format!(
            r#"{{"type":"holographic_telemetry","s":"{escaped}"}}"#
        )));
    }

    #[test]
    fn only_can_use_tool_becomes_a_control_request() {
        let approval = r#"{"type":"control_request","request_id":"r1","request":{"subtype":"can_use_tool","tool_name":"Write"}}"#;
        let mcp = concat!(
            r#"{"type":"control_request","request_id":"r2","#,
            r#""request":{"subtype":"mcp_message","server_name":"s","message":{}}}"#
        );
        let no_subtype =
            r#"{"type":"control_request","request_id":"r3","request":{"tool_name":"Write"}}"#;
        let no_request = r#"{"type":"control_request","request_id":"r4"}"#;

        assert!(matches!(
            decode(approval),
            AgentEvent::ControlRequest { .. }
        ));
        let (wire_type, raw) = unknown(mcp);
        assert_eq!(wire_type, "control_request/mcp_message");
        assert_eq!(raw, mcp, "kept whole");
        assert_eq!(unknown(no_subtype).0, "control_request");
        assert_eq!(unknown(no_request).0, "control_request");
    }

    #[test]
    fn an_assistant_message_is_carried_through_as_text_rather_than_modelled() {
        let message =
            r#"{"role":"assistant","content":[{"type":"text","text":"hi"}],"model":"claude"}"#;
        let line = format!(
            r#"{{"type":"assistant","uuid":"u","session_id":"s","timestamp":"t","request_id":"r","message":{message}}}"#
        );
        let AgentEvent::Assistant { message: raw, .. } = decode(&line) else {
            panic!("expected Assistant");
        };
        assert_eq!(
            parsed(&raw),
            serde_json::from_str::<Value>(message).unwrap()
        );
    }

    #[test]
    fn a_stream_event_frame_is_carried_through_and_an_explicit_null_is_an_absent_value() {
        let frame =
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"x"}}"#;
        let line = format!(
            r#"{{"type":"stream_event","event":{frame},"session_id":"s","parent_tool_use_id":null,"uuid":"u","ttft_ms":812}}"#
        );
        let AgentEvent::StreamEvent {
            event,
            parent_tool_use_id,
            ttft_ms,
            ..
        } = decode(&line)
        else {
            panic!("expected StreamEvent");
        };
        assert_eq!(
            parsed(&event),
            serde_json::from_str::<Value>(frame).unwrap()
        );
        assert_eq!(parent_tool_use_id, None);
        assert_eq!(ttft_ms, Some(812));
    }

    #[test]
    fn a_control_request_keeps_its_payload_raw_while_lifting_the_typed_scalars_out_of_it() {
        let request = concat!(
            r#"{"subtype":"can_use_tool","tool_name":"Write","tool_use_id":"toolu_1","agent_id":"a1","#,
            r#""input":{"file_path":"note.txt","content":"hi"}}"#
        );
        let line =
            format!(r#"{{"type":"control_request","request_id":"req_1","request":{request}}}"#);
        let AgentEvent::ControlRequest {
            request_id,
            request: raw,
            agent_id,
            tool_name,
            tool_use_id,
        } = decode(&line)
        else {
            panic!("expected ControlRequest");
        };
        assert_eq!(request_id, "req_1");
        assert_eq!(
            parsed(&raw),
            serde_json::from_str::<Value>(request).unwrap()
        );
        assert_eq!(agent_id.as_deref(), Some("a1"));
        assert_eq!(tool_name.as_deref(), Some("Write"));
        assert_eq!(tool_use_id.as_deref(), Some("toolu_1"));
    }

    #[test]
    fn attribution_scalars_are_null_when_the_request_omits_them() {
        let line = r#"{"type":"control_request","request_id":"req_2","request":{"subtype":"can_use_tool"}}"#;
        let AgentEvent::ControlRequest {
            agent_id,
            tool_name,
            tool_use_id,
            ..
        } = decode(line)
        else {
            panic!("expected ControlRequest");
        };
        assert_eq!((agent_id, tool_name, tool_use_id), (None, None, None));
    }

    #[test]
    fn non_object_and_typeless_lines_match_kotlin() {
        // Kotlin: blank and non-object JSON are BrokenLine; an object without a usable `type` is
        // UnknownKind with the type read as text ("" when absent, "5" for the number 5).
        for line in ["", "   ", "[]", "\"x\"", "1"] {
            assert!(is_broken(line), "{line:?}");
        }
        assert_eq!(unknown("{}"), (String::new(), "{}".to_string()));
        assert_eq!(unknown(r#"{"type":5}"#).0, "5");
    }

    fn result_line(extra: &str) -> String {
        format!(
            concat!(
                r#"{{"type":"result","uuid":"u","session_id":"s","subtype":"success","is_error":false,"#,
                r#""num_turns":1,"result_index":0,"queued_turn_count":0,"total_cost_usd":0.5,"#,
                r#""duration_ms":10,"duration_api_ms":5,"fast_mode_state":"off","usage":{{}},"#,
                r#""modelUsage":{{}},"permission_denials":[],"subagent_stats":{{}}{}}}"#
            ),
            extra
        )
    }

    fn result_text(extra: &str) -> Option<String> {
        match decode(&result_line(extra)) {
            AgentEvent::Result { result, .. } => Some(result),
            AgentEvent::UnknownKind { .. } => None,
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn errors_that_are_not_strings_are_unknown_kind() {
        // Kotlin differs here on purpose: Gson's `asString` on `{}` or null throws
        // UnsupportedOperationException, which `place` does not catch, so Kotlin decode throws.
        // Here both become UnknownKind so decode stays total.
        assert_eq!(result_text(r#","errors":[{}]"#), None);
        assert_eq!(result_text(r#","errors":[null]"#), None);
        assert_eq!(result_text(r#","errors":[["a"]]"#).as_deref(), Some("a"));
        assert_eq!(result_text(r#","errors":[1]"#).as_deref(), Some("1"));
        assert_eq!(
            result_text(r#","errors":["a","b"]"#).as_deref(),
            Some("a\nb")
        );
        assert_eq!(result_text(r#","result":"ok""#).as_deref(), Some("ok"));
        assert_eq!(result_text(""), None);
    }

    #[test]
    fn errors_with_non_single_arrays_are_unknown_kind() {
        // Kotlin differs here on purpose: Gson's `JsonArray.asString` throws IllegalStateException
        // unless the array has exactly one element, and `place` does not catch it.
        assert_eq!(result_text(r#","errors":[[]]"#), None);
        assert_eq!(result_text(r#","errors":[["a","b"]]"#), None);
    }

    #[test]
    fn bad_number_field_is_unknown_kind() {
        let line = result_line(r#","ttft_ms":"abc""#);
        assert_eq!(unknown(&line).0, "result");
        let bad_duration = result_line("").replace(r#""duration_ms":10"#, r#""duration_ms":"abc""#);
        assert_eq!(unknown(&bad_duration).0, "result");
        let bad_cost =
            result_line("").replace(r#""total_cost_usd":0.5"#, r#""total_cost_usd":"abc""#);
        assert_eq!(unknown(&bad_cost).0, "result");
        let bad_count = result_line("").replace(r#""num_turns":1"#, r#""num_turns":"abc""#);
        assert_eq!(unknown(&bad_count).0, "result");
    }
}
