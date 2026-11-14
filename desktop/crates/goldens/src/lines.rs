//! Stdout lines built by hand, for the paths the captures do not take (Lines.kt). Each is written
//! as the CLI writes it and read through `closta_providers`' `decode`, so a test feeds the
//! presenter what the codec would. Field values that do not matter are fixed.

use closta_model::AgentEvent;
use closta_presenter::json::compact;
use closta_providers::claude::protocol::decode;
use serde_json::{Number, Value};

const SESSION: &str = "s-1";

/// `text` as a JSON string literal.
pub fn quote(text: &str) -> String {
    compact(&Value::String(text.to_owned()))
}

fn optional(name: &str, value: Option<&str>) -> String {
    value.map_or_else(String::new, |it| format!(r#","{name}":{}"#, quote(it)))
}

pub fn queued(command: &str) -> AgentEvent {
    lifecycle(command, "queued")
}

pub fn started(command: &str) -> AgentEvent {
    lifecycle(command, "started")
}

fn lifecycle(command: &str, state: &str) -> AgentEvent {
    decode(&format!(
        r#"{{"type":"command_lifecycle","uuid":"lc","session_id":"{SESSION}","command_uuid":{},"state":"{state}"}}"#,
        quote(command)
    ))
}

fn frame(json: &str) -> AgentEvent {
    decode(&format!(
        r#"{{"type":"stream_event","uuid":"se","session_id":"{SESSION}","event":{json}}}"#
    ))
}

pub fn message_start(id: &str) -> AgentEvent {
    frame(&format!(
        r#"{{"type":"message_start","message":{{"id":{}}}}}"#,
        quote(id)
    ))
}

pub fn block_start(index: i32, block: &str) -> AgentEvent {
    frame(&format!(
        r#"{{"type":"content_block_start","index":{index},"content_block":{block}}}"#
    ))
}

fn delta(index: i32, delta: &str) -> AgentEvent {
    frame(&format!(
        r#"{{"type":"content_block_delta","index":{index},"delta":{delta}}}"#
    ))
}

pub fn text_delta(index: i32, text: &str) -> AgentEvent {
    delta(
        index,
        &format!(r#"{{"type":"text_delta","text":{}}}"#, quote(text)),
    )
}

pub fn thinking_delta(index: i32, text: &str) -> AgentEvent {
    delta(
        index,
        &format!(r#"{{"type":"thinking_delta","thinking":{}}}"#, quote(text)),
    )
}

pub fn json_delta(index: i32, partial: &str) -> AgentEvent {
    delta(
        index,
        &format!(
            r#"{{"type":"input_json_delta","partial_json":{}}}"#,
            quote(partial)
        ),
    )
}

pub fn block_stop(index: i32) -> AgentEvent {
    frame(&format!(
        r#"{{"type":"content_block_stop","index":{index}}}"#
    ))
}

pub fn message_stop() -> AgentEvent {
    frame(r#"{"type":"message_stop"}"#)
}

/// A text block.
pub fn text(text: &str) -> String {
    format!(r#"{{"type":"text","text":{}}}"#, quote(text))
}

/// A thinking block.
pub fn thinking(text: &str) -> String {
    format!(
        r#"{{"type":"thinking","thinking":{},"signature":"sig"}}"#,
        quote(text)
    )
}

/// A `tool_use` block; `input` is JSON text (Kotlin's default is `{}`).
pub fn tool_use(id: &str, name: &str, input: &str) -> String {
    format!(
        r#"{{"type":"tool_use","id":{},"name":{},"input":{input}}}"#,
        quote(id),
        quote(name)
    )
}

/// An assistant message `id` holding `block`, under the tool call `parent` when there is one.
pub fn assistant(id: &str, block: &str, parent: Option<&str>) -> AgentEvent {
    decode(&format!(
        r#"{{"type":"assistant","uuid":"a","session_id":"{SESSION}","timestamp":"t","request_id":"req","message":{{"id":{},"role":"assistant","content":[{block}]}}{}}}"#,
        quote(id),
        optional("parent_tool_use_id", parent)
    ))
}

/// A user line `uuid` whose `content` is JSON text.
pub fn user(uuid: &str, content: &str, parent: Option<&str>) -> AgentEvent {
    decode(&format!(
        r#"{{"type":"user","uuid":{},"session_id":"{SESSION}","timestamp":"t","message":{{"role":"user","content":{content}}}{}}}"#,
        quote(uuid),
        optional("parent_tool_use_id", parent)
    ))
}

/// The content of a user line carrying one tool result; `content` is JSON text.
pub fn tool_result(tool_use_id: &str, content: &str, is_error: Option<bool>) -> String {
    let error = is_error.map_or_else(String::new, |it| format!(r#","is_error":{it}"#));
    format!(
        r#"[{{"type":"tool_result","tool_use_id":{},"content":{content}{error}}}]"#,
        quote(tool_use_id)
    )
}

/// A `result` line (Lines.kt's `result` with its defaults: `ResultLine::default()`).
#[derive(Clone, Debug)]
pub struct ResultLine<'a> {
    pub command: Option<&'a str>,
    pub is_error: bool,
    pub text: &'a str,
    pub cost: f64,
    pub model_usage: &'a str,
}

impl Default for ResultLine<'_> {
    fn default() -> Self {
        Self {
            command: None,
            is_error: false,
            text: "done",
            cost: 0.0,
            model_usage: "{}",
        }
    }
}

impl ResultLine<'_> {
    pub fn event(&self) -> AgentEvent {
        decode(&format!(
            concat!(
                r#"{{"type":"result","uuid":"r","session_id":"{session}","subtype":"success","result":{text},"#,
                r#""is_error":{is_error},"stop_reason":"end_turn","terminal_reason":"completed","num_turns":1,"#,
                r#""result_index":0,"queued_turn_count":0,"total_cost_usd":{cost},"duration_ms":0,"#,
                r#""duration_api_ms":0,"ttft_ms":0,"ttft_stream_ms":0,"time_to_request_ms":0,"#,
                r#""first_content_frame_ms":0,"fast_mode_state":"off","usage":{{}},"modelUsage":{model_usage},"#,
                r#""permission_denials":[],"subagent_stats":{{}}{command}}}"#
            ),
            session = SESSION,
            text = quote(self.text),
            is_error = self.is_error,
            cost = money(self.cost),
            model_usage = self.model_usage,
            command = optional("user_message_uuid", self.command),
        ))
    }
}

/// A cost as the line carries it: a number, or the string Java prints for one that is not finite
/// (the codec reads both, as Kotlin's does).
fn money(cost: f64) -> String {
    match Number::from_f64(cost) {
        Some(number) => number.to_string(),
        None if cost.is_nan() => quote("NaN"),
        None if cost > 0.0 => quote("Infinity"),
        None => quote("-Infinity"),
    }
}

/// A successful `result` naming `command`, with Lines.kt's defaults.
pub fn result(command: Option<&str>) -> AgentEvent {
    ResultLine {
        command,
        ..ResultLine::default()
    }
    .event()
}

/// A `can_use_tool` request (Lines.kt's `request`; `RequestLine::new` has its defaults).
#[derive(Clone, Debug)]
pub struct RequestLine<'a> {
    pub request_id: &'a str,
    pub tool: &'a str,
    pub tool_use_id: Option<&'a str>,
    pub input: &'a str,
    pub agent_id: Option<&'a str>,
    pub suggestions: Option<&'a str>,
}

impl<'a> RequestLine<'a> {
    pub fn new(request_id: &'a str, tool: &'a str, tool_use_id: Option<&'a str>) -> Self {
        Self {
            request_id,
            tool,
            tool_use_id,
            input: "{}",
            agent_id: None,
            suggestions: None,
        }
    }

    /// The line. Kotlin sets the event's `agentId` beside the request; the codec reads it from the
    /// request's `agent_id`, so it is written there, last.
    pub fn event(&self) -> AgentEvent {
        let offered = self.suggestions.map_or_else(String::new, |it| {
            format!(r#","permission_suggestions":{it}"#)
        });
        decode(&format!(
            r#"{{"type":"control_request","request_id":{},"request":{{"subtype":"can_use_tool","tool_name":{},"input":{}{offered}{}{}}}}}"#,
            quote(self.request_id),
            quote(self.tool),
            self.input,
            optional("tool_use_id", self.tool_use_id),
            optional("agent_id", self.agent_id),
        ))
    }
}

/// A `can_use_tool` request with `input` (JSON text) and no agent or suggestions.
pub fn request(request_id: &str, tool: &str, tool_use_id: Option<&str>, input: &str) -> AgentEvent {
    RequestLine {
        input,
        ..RequestLine::new(request_id, tool, tool_use_id)
    }
    .event()
}

pub fn task_started(task_id: &str, tool_use_id: &str, background: bool) -> AgentEvent {
    decode(&format!(
        r#"{{"type":"system","subtype":"task_started","uuid":"ts","session_id":"{SESSION}","task_id":{},"tool_use_id":{},"description":"d","task_type":"local_agent","is_backgrounded":{background}}}"#,
        quote(task_id),
        quote(tool_use_id)
    ))
}

/// `system/init` of a session (Lines.kt's `init`; `InitLine::default()` has its defaults).
#[derive(Clone, Debug)]
pub struct InitLine<'a> {
    pub model: &'a str,
    pub mode: &'a str,
    pub cwd: &'a str,
    pub slash_commands: &'a str,
}

impl Default for InitLine<'_> {
    fn default() -> Self {
        Self {
            model: "claude-sonnet-5-5",
            mode: "default",
            cwd: "/work",
            slash_commands: "[]",
        }
    }
}

impl InitLine<'_> {
    pub fn event(&self) -> AgentEvent {
        decode(&format!(
            concat!(
                r#"{{"type":"system","subtype":"init","uuid":"i","session_id":"{session}","cwd":{cwd},"#,
                r#""model":{model},"permissionMode":{mode},"apiKeySource":"none","claude_code_version":"2.1.282","#,
                r#""output_style":"text","view_mode":"normal","scratchpad_path":"/tmp","#,
                r#""messaging_socket_path":"/tmp/sock","fast_mode_state":"off","tools":[],"mcp_servers":[],"#,
                r#""slash_commands":{slash},"terminal_slash_commands":[],"agents":[],"skills":[],"plugins":[],"#,
                r#""capabilities":{{}},"memory_paths":[],"analytics_disabled":false,"#,
                r#""product_feedback_disabled":false,"per_turn_effort_active":false}}"#
            ),
            session = SESSION,
            cwd = quote(self.cwd),
            model = quote(self.model),
            mode = quote(self.mode),
            slash = self.slash_commands,
        ))
    }
}

/// `system/init` with Lines.kt's defaults.
pub fn init() -> AgentEvent {
    InitLine::default().event()
}

/// The success of the host's `initialize` (`init-1` in Lines.kt), whose `response` is `body`.
pub fn initialized(body: &str, request_id: &str) -> AgentEvent {
    decode(&format!(
        r#"{{"type":"control_response","response":{{"subtype":"success","request_id":{},"response":{body}}}}}"#,
        quote(request_id)
    ))
}

/// `system/status`, which carries the permission mode the CLI is now in.
pub fn status(mode: &str) -> AgentEvent {
    decode(&format!(
        r#"{{"type":"system","subtype":"status","uuid":"st","session_id":"{SESSION}","status":null,"permissionMode":{}}}"#,
        quote(mode)
    ))
}

/// The answer to a control request the host sent, saying it went through; `body` is its body.
pub fn control_ok(request_id: &str, body: Option<&str>) -> AgentEvent {
    let response = body.map_or_else(String::new, |it| format!(r#","response":{it}"#));
    decode(&format!(
        r#"{{"type":"control_response","response":{{"subtype":"success","request_id":{}{response}}}}}"#,
        quote(request_id)
    ))
}

/// `system/status` with a status and no mode: `compacting`, or `None` when it is over.
pub fn status_only(status: Option<&str>) -> AgentEvent {
    let status = status.map_or_else(|| "null".to_owned(), quote);
    decode(&format!(
        r#"{{"type":"system","subtype":"status","uuid":"st","session_id":"{SESSION}","status":{status}}}"#
    ))
}

/// `system/compact_boundary`; `metadata` is JSON text.
pub fn compact_boundary(metadata: &str) -> AgentEvent {
    decode(&format!(
        r#"{{"type":"system","subtype":"compact_boundary","uuid":"cb","session_id":"{SESSION}","compact_metadata":{metadata}}}"#
    ))
}

/// The answer to a control request the host sent, saying it was refused.
pub fn control_error(request_id: &str, error: &str) -> AgentEvent {
    decode(&format!(
        r#"{{"type":"control_response","response":{{"subtype":"error","request_id":{},"error":{}}}}}"#,
        quote(request_id),
        quote(error)
    ))
}

pub fn task_notification(task_id: &str, tool_use_id: &str, status: &str) -> AgentEvent {
    decode(&format!(
        r#"{{"type":"system","subtype":"task_notification","uuid":"tn","session_id":"{SESSION}","task_id":{},"tool_use_id":{},"status":{},"output_file":"out","summary":"summary"}}"#,
        quote(task_id),
        quote(tool_use_id),
        quote(status)
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use closta_model::RawJson;

    fn placed(event: &AgentEvent) {
        assert!(
            event.kind().is_some(),
            "the codec did not place the line: {event:?}"
        );
    }

    #[test]
    fn every_line_is_placed_by_the_codec() {
        let events = [
            queued("c"),
            started("c"),
            message_start("m"),
            block_start(0, &text("")),
            text_delta(0, "a\"b"),
            thinking_delta(0, "t"),
            json_delta(1, "{\"a\":"),
            block_stop(0),
            message_stop(),
            assistant("m", &tool_use("t1", "Bash", "{}"), Some("p")),
            user("u", &tool_result("t1", "\"ok\"", Some(true)), None),
            result(Some("c")),
            ResultLine {
                cost: f64::NAN,
                ..ResultLine::default()
            }
            .event(),
            RequestLine {
                agent_id: Some("ag"),
                suggestions: Some("[]"),
                ..RequestLine::new("r1", "Write", Some("t1"))
            }
            .event(),
            task_started("k", "t1", true),
            init(),
            initialized("{}", "init-1"),
            status("plan"),
            control_ok("r", None),
            control_ok("r", Some("{}")),
            status_only(Some("compacting")),
            status_only(None),
            compact_boundary("{}"),
            control_error("r", "no"),
            task_notification("k", "t1", "completed"),
        ];
        events.iter().for_each(placed);
    }

    #[test]
    fn lines_carry_what_kotlin_sets() {
        assert_eq!(
            AgentEvent::CommandLifecycle {
                uuid: "lc".into(),
                session_id: SESSION.into(),
                command_uuid: "c1".into(),
                state: "queued".into(),
            },
            queued("c1")
        );
        let AgentEvent::ControlRequest {
            request_id,
            agent_id,
            tool_name,
            tool_use_id,
            ..
        } = RequestLine {
            agent_id: Some("ag"),
            ..RequestLine::new("r1", "Write", None)
        }
        .event()
        else {
            panic!("a control request");
        };
        assert_eq!(
            ("r1", Some("ag"), Some("Write"), None),
            (
                request_id.as_str(),
                agent_id.as_deref(),
                tool_name.as_deref(),
                tool_use_id.as_deref()
            )
        );
        let AgentEvent::Result {
            user_message_uuid,
            total_cost_usd,
            ..
        } = result(Some("c1"))
        else {
            panic!("a result");
        };
        assert_eq!(
            (Some("c1"), 0.0),
            (user_message_uuid.as_deref(), total_cost_usd)
        );
        let AgentEvent::ControlResponse {
            request_id,
            subtype,
            error,
            response,
        } = control_error("r", "no")
        else {
            panic!("a control response");
        };
        assert_eq!(
            (Some("r"), Some("error"), Some("no")),
            (request_id.as_deref(), subtype.as_deref(), error.as_deref())
        );
        assert_eq!(
            RawJson(r#"{"subtype":"error","request_id":"r","error":"no"}"#.into()),
            response
        );
    }
}
