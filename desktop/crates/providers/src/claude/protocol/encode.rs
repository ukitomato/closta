//! The write direction: a host intent becomes one stream-json line for the CLI's stdin. Mirrors
//! `StdinEncoder` in StdinEncoder.kt, function for function.
//!
//! Every function is pure: ids and opaque payloads are arguments, and there is no clock, no
//! random and no IO. Each line is a `serde_json::Map` built in Kotlin's key order (the workspace
//! keeps insertion order) and written compactly.
//!
//! Deliberately unlike Kotlin: U+2028 and U+2029 are written raw where Gson escapes them (the same
//! JSON string either way), and the opaque JSON payloads are read strictly, a failure being an
//! [`EncodeError::BadPayload`] rather than an exception.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use closta_core::ports::EncodeError;
use closta_model::{Attachment, AttachmentKind};
use serde_json::{Map, Value};

const PDF: &str = "application/pdf";

/// What the CLI tells the model when the user rejects a tool in its terminal; a deny without a
/// reason carries it.
pub const REJECTED: &str = concat!(
    "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file ",
    "edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to ",
    "tell you how to proceed."
);

fn object<const N: usize>(entries: [(&str, Value); N]) -> Map<String, Value> {
    entries
        .into_iter()
        .map(|(key, value)| (key.to_string(), value))
        .collect()
}

fn line(map: Map<String, Value>) -> String {
    Value::Object(map).to_string()
}

/// The caller's opaque JSON, read strictly.
fn opaque(text: &str) -> Result<Value, EncodeError> {
    serde_json::from_str(text).map_err(|_| EncodeError::BadPayload)
}

/// A user turn. Without `attachments` the content is the text itself. With them it is an array of
/// blocks: the attachments first, in order, then the text (none when the text is empty). An
/// image is a base64 `image` block, a PDF a base64 `document` block, and a text file a text block
/// of its name, a blank line and its body. A failure names neither the bytes nor the name.
pub fn user_message(
    session_id: &str,
    uuid: &str,
    content: &str,
    attachments: &[Attachment],
) -> Result<String, EncodeError> {
    let content = if attachments.is_empty() {
        Value::from(content)
    } else {
        let mut blocks = attachments
            .iter()
            .map(attachment_block)
            .collect::<Result<Vec<_>, _>>()?;
        // A message of files only has no sentence to send: a block of no text is left out.
        if !content.is_empty() {
            blocks.push(text_block(content.to_string()));
        }
        Value::Array(blocks)
    };
    let message = object([("role", "user".into()), ("content", content)]);
    Ok(line(object([
        ("type", "user".into()),
        ("message", message.into()),
        ("session_id", session_id.into()),
        ("parent_tool_use_id", Value::Null),
        ("uuid", uuid.into()),
        // Everything the host sends as a user message was typed by the user (sdk.d.ts
        // `SDKMessageOrigin`).
        ("origin", object([("kind", "human".into())]).into()),
    ])))
}

fn text_block(text: String) -> Value {
    object([("type", "text".into()), ("text", text.into())]).into()
}

fn attachment_block(attachment: &Attachment) -> Result<Value, EncodeError> {
    Ok(match attachment.kind {
        AttachmentKind::Image => base64_block("image", &attachment.media_type, &attachment.bytes),
        AttachmentKind::Document => base64_block("document", PDF, &attachment.bytes),
        AttachmentKind::Text => {
            let body =
                std::str::from_utf8(&attachment.bytes).map_err(|_| EncodeError::TextNotUtf8)?;
            text_block(format!("{}\n\n{body}", attachment.name))
        }
    })
}

fn base64_block(kind: &str, media_type: &str, bytes: &[u8]) -> Value {
    let source = object([
        ("type", "base64".into()),
        ("media_type", media_type.into()),
        ("data", STANDARD.encode(bytes).into()),
    ]);
    object([("type", kind.into()), ("source", source.into())]).into()
}

/// `initialize`. The two mcp-server fields must be arrays of strings: the CLI rejects `{}`.
/// `sdk_mcp_servers` names the in-process MCP servers the host answers for.
pub fn initialize(request_id: &str, sdk_mcp_servers: &[String]) -> String {
    control_request(
        request_id,
        object([
            ("subtype", "initialize".into()),
            ("hooks", Map::new().into()),
            ("sdkMcpServers", sdk_mcp_servers.into()),
            (
                "webSearchIsolationExemptMcpServers",
                Value::Array(Vec::new()),
            ),
            // The host shows a stop control per task, so an interrupt leaves background tasks
            // running.
            ("perTaskStopAffordance", true.into()),
        ]),
    )
}

/// `interrupt` as a control_request. See also [`cancel_request`] for the top-level form.
pub fn interrupt(request_id: &str) -> String {
    control_request(request_id, object([("subtype", "interrupt".into())]))
}

/// `stop_task`: stops the one task whose CLI id is `task_id` (the SDK's
/// `SDKControlStopTaskRequest`).
pub fn stop_task(request_id: &str, task_id: &str) -> String {
    control_request(
        request_id,
        object([("subtype", "stop_task".into()), ("task_id", task_id.into())]),
    )
}

/// The other interrupt form the CLI accepts: a top-level `control_cancel_request`.
pub fn cancel_request(request_id: &str) -> String {
    line(object([
        ("type", "control_cancel_request".into()),
        ("request_id", request_id.into()),
    ]))
}

/// `set_model`: a live model change without a restart.
pub fn set_model(request_id: &str, model: &str) -> String {
    control_request(
        request_id,
        object([("subtype", "set_model".into()), ("model", model.into())]),
    )
}

/// `set_permission_mode`: a live permission-mode change.
pub fn set_permission_mode(request_id: &str, mode: &str) -> String {
    control_request(
        request_id,
        object([
            ("subtype", "set_permission_mode".into()),
            ("mode", mode.into()),
        ]),
    )
}

/// `get_context_usage`: how much of the context window is used. `detail` is `summary` (Kotlin's
/// default) or `full`.
pub fn get_context_usage(request_id: &str, detail: &str) -> String {
    control_request(
        request_id,
        object([
            ("subtype", "get_context_usage".into()),
            ("detail", detail.into()),
        ]),
    )
}

/// `get_settings`: the settings in effect, among them the model and the effort of the next
/// request.
pub fn get_settings(request_id: &str) -> String {
    control_request(request_id, object([("subtype", "get_settings".into())]))
}

/// `apply_flag_settings` with only `effortLevel`: the effort changes from the next request on.
/// `None` is written as JSON null, which puts the model's own default back.
pub fn apply_effort(request_id: &str, effort_level: Option<&str>) -> String {
    let settings = object([("effortLevel", effort_level.into())]);
    control_request(
        request_id,
        object([
            ("subtype", "apply_flag_settings".into()),
            ("settings", settings.into()),
        ]),
    )
}

/// `apply_flag_settings` with only `{"sandbox":{"enabled":false}}`: the sandbox is off from the
/// next command on. The flag layer is replaced, not merged. There is no counterpart that turns it
/// on: that is a new launch.
pub fn sandbox_off(request_id: &str) -> String {
    let sandbox = object([("enabled", false.into())]);
    control_request(
        request_id,
        object([
            ("subtype", "apply_flag_settings".into()),
            ("settings", object([("sandbox", sandbox.into())]).into()),
        ]),
    )
}

/// `mcp_status`: which MCP servers the session has.
pub fn mcp_status(request_id: &str) -> String {
    control_request(request_id, object([("subtype", "mcp_status".into())]))
}

/// `mcp_toggle`: turns the server `server_name` on or off.
pub fn mcp_toggle(request_id: &str, server_name: &str, enabled: bool) -> String {
    control_request(
        request_id,
        object([
            ("subtype", "mcp_toggle".into()),
            ("serverName", server_name.into()),
            ("enabled", enabled.into()),
        ]),
    )
}

/// `mcp_reconnect`: reconnects the server `server_name`.
pub fn mcp_reconnect(request_id: &str, server_name: &str) -> String {
    control_request(
        request_id,
        object([
            ("subtype", "mcp_reconnect".into()),
            ("serverName", server_name.into()),
        ]),
    )
}

/// `rewind_files`: puts the files back as they were before the user line whose uuid is
/// `user_message_id`, or with `dry_run` says what would change.
pub fn rewind_files(request_id: &str, user_message_id: &str, dry_run: bool) -> String {
    control_request(
        request_id,
        object([
            ("subtype", "rewind_files".into()),
            ("user_message_id", user_message_id.into()),
            ("dry_run", dry_run.into()),
        ]),
    )
}

/// Answers `can_use_tool` with allow. `updated_input` is the caller's JSON (the possibly rewritten
/// tool input), embedded whole. `updated_permissions` is the caller's JSON array, typically the
/// request's `permission_suggestions` passed back to accept them; `None` leaves the key out.
pub fn allow(
    request_id: &str,
    updated_input: &str,
    updated_permissions: Option<&str>,
) -> Result<String, EncodeError> {
    let mut payload = object([
        ("behavior", "allow".into()),
        ("updatedInput", opaque(updated_input)?),
    ]);
    if let Some(permissions) = updated_permissions {
        payload.insert("updatedPermissions".into(), opaque(permissions)?);
    }
    Ok(control_response(request_id, payload))
}

/// Answers an `mcp_message` request: the JSON-RPC answer, the caller's JSON embedded whole, goes
/// in `response.mcp_response`.
pub fn mcp_response(request_id: &str, json_rpc: &str) -> Result<String, EncodeError> {
    Ok(control_response(
        request_id,
        object([("mcp_response", opaque(json_rpc)?)]),
    ))
}

/// Answers `can_use_tool` with deny and a message shown to the model. A blank `message` is
/// replaced by [`REJECTED`]: the API refuses an empty error tool_result with a 400 for the rest
/// of the conversation.
pub fn deny(request_id: &str, message: &str) -> String {
    let message = if message.chars().all(is_kt_whitespace) {
        REJECTED
    } else {
        message
    };
    control_response(
        request_id,
        object([("behavior", "deny".into()), ("message", message.into())]),
    )
}

/// Answers `can_use_tool` with cancelled (the request was withdrawn before an answer).
pub fn cancelled(request_id: &str) -> String {
    control_response(request_id, object([("behavior", "cancelled".into())]))
}

/// Kotlin's `Char.isWhitespace`, for `isBlank`: U+0009..U+000D, U+001C..U+001F and the
/// categories Zs, Zl and Zp.
fn is_kt_whitespace(c: char) -> bool {
    matches!(
        c,
        '\u{9}'..='\u{d}'
            | '\u{1c}'..='\u{20}'
            | '\u{a0}'
            | '\u{1680}'
            | '\u{2000}'..='\u{200a}'
            | '\u{2028}'
            | '\u{2029}'
            | '\u{202f}'
            | '\u{205f}'
            | '\u{3000}'
    )
}

/// `{"type":"control_request","request_id":<id>,"request":{...}}`.
fn control_request(request_id: &str, request: Map<String, Value>) -> String {
    line(object([
        ("type", "control_request".into()),
        ("request_id", request_id.into()),
        ("request", request.into()),
    ]))
}

/// `{"type":"control_response","response":{"subtype":"success","request_id":<id>,"response":<payload>}}`.
/// The reply is keyed to the top-level `request_id`, not to any `tool_use_id` inside the request.
fn control_response(request_id: &str, payload: Map<String, Value>) -> String {
    let response = object([
        ("subtype", "success".into()),
        ("request_id", request_id.into()),
        ("response", payload.into()),
    ]);
    line(object([
        ("type", "control_response".into()),
        ("response", response.into()),
    ]))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use closta_core::ports::EncodeError;
    use closta_model::{Attachment, AttachmentKind};
    use serde_json::Value;

    fn json(text: &str) -> Value {
        serde_json::from_str(text).unwrap()
    }

    const INITIALIZE_R: &str = concat!(
        r#"{"type":"control_request","request_id":"R","request":{"subtype":"initialize","#,
        r#""hooks":{},"sdkMcpServers":[],"webSearchIsolationExemptMcpServers":[],"#,
        r#""perTaskStopAffordance":true}}"#
    );

    const ALLOW_NOTE: &str = concat!(
        r#"{"type":"control_response","response":{"subtype":"success","request_id":"req_1","#,
        r#""response":{"behavior":"allow","updatedInput":{"file_path":"note.txt"}}}}"#
    );

    #[test]
    fn a_user_message_is_marked_as_typed_by_a_person() {
        let line = json(&user_message("S", "U", "hello", &[]).unwrap());
        assert_eq!(line["origin"]["kind"], "human");
    }

    #[test]
    fn initialize_declares_that_each_task_can_be_stopped_on_its_own() {
        let line = json(&initialize("R", &[]));
        assert_eq!(line["request"]["perTaskStopAffordance"], true);
    }

    #[test]
    fn a_user_message_matches_the_recorded_shape() {
        let expected = concat!(
            r#"{"type":"user","message":{"role":"user","content":"hello"},"#,
            r#""session_id":"S","parent_tool_use_id":null,"uuid":"U","origin":{"kind":"human"}}"#
        );
        assert_eq!(user_message("S", "U", "hello", &[]).unwrap(), expected);
    }

    #[test]
    fn initialize_sends_arrays_not_objects_for_the_mcp_server_fields() {
        let line = initialize("R", &[]);
        assert_eq!(json(&line), json(INITIALIZE_R));
        let request = &json(&line)["request"];
        // The CLI rejects `{}` here: "sdkMcpServers ... must be arrays of strings".
        assert!(
            request["sdkMcpServers"].is_array(),
            "sdkMcpServers must be an array"
        );
        assert!(
            request["webSearchIsolationExemptMcpServers"].is_array(),
            "webSearchIsolationExemptMcpServers must be an array"
        );
        assert!(request["hooks"].is_object(), "hooks is an object");
    }

    #[test]
    fn initialize_without_server_names_is_byte_identical_to_the_line_written_before_they_existed() {
        assert_eq!(initialize("R", &[]), INITIALIZE_R);
    }

    #[test]
    fn initialize_with_server_names_lists_them_in_sdk_mcp_servers() {
        let expected = concat!(
            r#"{"type":"control_request","request_id":"R","request":{"subtype":"initialize","#,
            r#""hooks":{},"sdkMcpServers":["ide-context","other"],"webSearchIsolationExemptMcpServers":[],"#,
            r#""perTaskStopAffordance":true}}"#
        );
        let names = ["ide-context".to_string(), "other".to_string()];
        assert_eq!(initialize("R", &names), expected);
    }

    #[test]
    fn an_mcp_answer_is_a_success_control_response_carrying_the_json_rpc_answer_as_mcp_response() {
        let line = mcp_response("Q", r#"{"jsonrpc":"2.0","id":3,"result":{"tools":[]}}"#).unwrap();
        let expected = concat!(
            r#"{"type":"control_response","response":{"subtype":"success","request_id":"Q","#,
            r#""response":{"mcp_response":{"jsonrpc":"2.0","id":3,"result":{"tools":[]}}}}}"#
        );
        assert_eq!(line, expected);
    }

    #[test]
    fn interrupt_has_both_a_control_request_form_and_a_top_level_cancel_form() {
        assert_eq!(
            interrupt("R"),
            r#"{"type":"control_request","request_id":"R","request":{"subtype":"interrupt"}}"#
        );
        assert_eq!(
            cancel_request("R"),
            r#"{"type":"control_cancel_request","request_id":"R"}"#
        );
    }

    #[test]
    fn stop_task_is_a_control_request_with_the_task_id_in_the_shape_of_the_sdk() {
        assert_eq!(
            stop_task("R", "bc4b0ae63"),
            concat!(
                r#"{"type":"control_request","request_id":"R","#,
                r#""request":{"subtype":"stop_task","task_id":"bc4b0ae63"}}"#
            )
        );
    }

    #[test]
    fn set_model_and_set_permission_mode_carry_their_value() {
        assert_eq!(
            set_model("R", "opus"),
            r#"{"type":"control_request","request_id":"R","request":{"subtype":"set_model","model":"opus"}}"#
        );
        assert_eq!(
            set_permission_mode("R", "acceptEdits"),
            concat!(
                r#"{"type":"control_request","request_id":"R","#,
                r#""request":{"subtype":"set_permission_mode","mode":"acceptEdits"}}"#
            )
        );
    }

    #[test]
    fn get_context_usage_carries_the_detail_asked_for() {
        // Kotlin's default is "summary"; Rust has no default arguments, so callers pass it.
        assert_eq!(
            get_context_usage("R", "summary"),
            concat!(
                r#"{"type":"control_request","request_id":"R","#,
                r#""request":{"subtype":"get_context_usage","detail":"summary"}}"#
            )
        );
        assert_eq!(
            get_context_usage("R", "full"),
            concat!(
                r#"{"type":"control_request","request_id":"R","#,
                r#""request":{"subtype":"get_context_usage","detail":"full"}}"#
            )
        );
    }

    #[test]
    fn get_settings_is_a_bare_control_request() {
        assert_eq!(
            get_settings("R"),
            r#"{"type":"control_request","request_id":"R","request":{"subtype":"get_settings"}}"#
        );
    }

    #[test]
    fn a_control_response_is_keyed_to_the_top_level_request_id_and_carries_the_payload_verbatim() {
        assert_eq!(
            allow("req_1", r#"{"file_path":"note.txt"}"#, None).unwrap(),
            ALLOW_NOTE
        );
        assert_eq!(
            deny("req_1", "not allowed"),
            concat!(
                r#"{"type":"control_response","response":{"subtype":"success","request_id":"req_1","#,
                r#""response":{"behavior":"deny","message":"not allowed"}}}"#
            )
        );
        assert_eq!(
            cancelled("req_1"),
            concat!(
                r#"{"type":"control_response","response":{"subtype":"success","request_id":"req_1","#,
                r#""response":{"behavior":"cancelled"}}}"#
            )
        );
    }

    #[test]
    fn a_deny_without_a_reason_carries_the_clis_own_rejection_never_an_empty_message() {
        // An empty message becomes an empty error tool_result, which the API refuses with a 400 for
        // the rest of the conversation (seen on Windows when a question was skipped).
        let rejection = concat!(
            "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file ",
            "edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to ",
            "tell you how to proceed."
        );
        assert_eq!(REJECTED, rejection);
        for blank in ["", "  ", "\n", "\u{a0}\u{1c}"] {
            let expected = format!(
                r#"{{"type":"control_response","response":{{"subtype":"success","request_id":"req_1","response":{{"behavior":"deny","message":{}}}}}}}"#,
                Value::from(rejection)
            );
            assert_eq!(deny("req_1", blank), expected, "{blank:?}");
        }
    }

    #[test]
    fn an_opaque_updated_input_payload_is_embedded_whole_not_flattened() {
        let payload = r#"{"file_path":"a.txt","content":"multi\nline","nested":{"k":[1,2,3]}}"#;
        let line = json(&allow("R", payload, None).unwrap());
        assert_eq!(line["response"]["response"]["updatedInput"], json(payload));
    }

    #[test]
    fn an_allow_with_updated_permissions_has_the_shape_recorder_answered_capture_16_with() {
        let suggestions = r#"[{"type":"setMode","mode":"acceptEdits","destination":"session"}]"#;
        let input = r#"{"file_path":"/tmp/x/note.txt","content":"hello-rewritten-by-host"}"#;
        let expected = format!(
            r#"{{"type":"control_response","response":{{"subtype":"success","request_id":"req_16","response":{{"behavior":"allow","updatedInput":{input},"updatedPermissions":{suggestions}}}}}}}"#
        );
        assert_eq!(allow("req_16", input, Some(suggestions)).unwrap(), expected);
    }

    #[test]
    fn an_allow_without_updated_permissions_leaves_the_key_out() {
        let line = allow("req_1", r#"{"file_path":"note.txt"}"#, None).unwrap();
        assert_eq!(line, ALLOW_NOTE);
        assert!(!line.contains("updatedPermissions"));
    }

    #[test]
    fn the_same_arguments_produce_the_same_line_byte_for_byte() {
        // Purity: no clock, no random, no IO - repeated calls are identical.
        assert_eq!(
            user_message("S", "U", "hi", &[]),
            user_message("S", "U", "hi", &[])
        );
        assert_eq!(initialize("R", &[]), initialize("R", &[]));
        assert_eq!(
            allow("R", r#"{"a":1}"#, None),
            allow("R", r#"{"a":1}"#, None)
        );
    }

    #[test]
    fn apply_effort_and_sandbox_off_write_apply_flag_settings() {
        assert_eq!(
            apply_effort("r", Some("high")),
            concat!(
                r#"{"type":"control_request","request_id":"r","#,
                r#""request":{"subtype":"apply_flag_settings","settings":{"effortLevel":"high"}}}"#
            )
        );
        assert_eq!(
            apply_effort("r", None),
            concat!(
                r#"{"type":"control_request","request_id":"r","#,
                r#""request":{"subtype":"apply_flag_settings","settings":{"effortLevel":null}}}"#
            )
        );
        let off = json(&sandbox_off("r"));
        assert_eq!(off["request"]["subtype"], "apply_flag_settings");
        assert_eq!(
            off["request"]["settings"].to_string(),
            r#"{"sandbox":{"enabled":false}}"#
        );
    }

    #[test]
    fn a_text_with_line_breaks_and_separators_is_one_line() {
        let text = "a\nb\rc\u{2028}d";
        let line = user_message("S", "U", text, &[]).unwrap();
        assert!(!line.as_bytes().contains(&b'\n'), "{line}");
        assert!(!line.as_bytes().contains(&b'\r'), "{line}");
        assert_eq!(json(&line)["message"]["content"], text);
        // Deliberately unlike Kotlin: Gson escapes U+2028 and U+2029, serde_json writes them raw.
        // Both are the same JSON string, and neither is a line break to the CLI's line reader.
        assert!(line.contains('\u{2028}'), "U+2028 stays raw");
    }

    #[test]
    fn a_bad_payload_is_an_encode_error() {
        // Deliberately unlike Kotlin: Gson reads opaque JSON leniently and throws on what it cannot
        // read; here it is read strictly and refused with an error, never a panic.
        assert_eq!(allow("r", "{nope", None), Err(EncodeError::BadPayload));
        assert_eq!(
            allow("r", "{}", Some("[oops")),
            Err(EncodeError::BadPayload)
        );
        assert_eq!(mcp_response("r", ""), Err(EncodeError::BadPayload));
    }

    #[test]
    fn a_text_attachment_that_is_not_utf8_names_nothing() {
        let bad = Attachment {
            kind: AttachmentKind::Text,
            media_type: "text/plain".into(),
            name: "secret.txt".into(),
            bytes: vec![0xff],
            path: None,
        };
        let failure = user_message("S", "U", "q", &[bad]).unwrap_err();
        assert_eq!(failure, EncodeError::TextNotUtf8);
        assert_eq!(failure.to_string(), "a text attachment is not UTF-8");
    }
}
