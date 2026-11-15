//! What the CLI sends goes into the tree only when the webview would accept it there
//! (SanitizeTest.kt).
//!
//! The lines that carry deep values are built without the codec, as Kotlin's `Lines` builds every
//! line: the codec takes 200 levels, and would make them a `BrokenLine`.

use std::sync::Arc;

use closta_goldens::lines;
use closta_goldens::session::Session;
use closta_goldens::tree_reading::{message, part, str, tool_calls};
use closta_model::AgentEvent;
use closta_presenter::json::{MAX_DEPTH, NESTING_LIMIT, TOO_DEEP, compact};
use serde_json::{Map, Value, json};

// A top-level part sits at level 10, so its args and result have 246 levels; a sub-agent's part at
// 16.
const TOP_ROOM: usize = MAX_DEPTH - 10;
const NESTED_ROOM: usize = MAX_DEPTH - 16;

/// An object `depth` levels deep: `{"a":{"a":…{}}}`.
fn nested(depth: usize) -> Value {
    let mut value = json!({});
    for _ in 1..depth {
        value = json!({ "a": value });
    }
    value
}

/// An array `depth` levels deep: `[[…[]]]`.
fn nested_array(depth: usize) -> Value {
    let mut value = json!([]);
    for _ in 1..depth {
        value = json!([value]);
    }
    value
}

fn call_with(input: &Value, result: Option<&Value>) -> Map<String, Value> {
    let mut session = Session::default();
    session.turn("c1");
    session.events([lines::assistant_built(
        "m1",
        &lines::tool_use("toolu_1", "Bash", &compact(input)),
        None,
    )]);
    if let Some(result) = result {
        session.events([lines::user_built(
            "u1",
            &lines::tool_result("toolu_1", &compact(result), None),
            None,
        )]);
    }
    part(message(session.thread(), "c1"), "toolu_1").clone()
}

#[test]
#[ignore = "needs task 5: foldLifecycle"]
fn args_that_reach_the_prototype_become_empty_and_args_text_keeps_what_the_cli_sent() {
    for input in [
        json!({ "a": { "__proto__": "x" } }),
        json!({ "constructor": { "prototype": {} } }),
        json!({ "list": [{ "__proto__": {} }] }),
    ] {
        let call = call_with(&input, None);
        assert_eq!(Some(&json!({})), call.get("args"), "{input}");
        assert_eq!(Some(compact(&input).as_str()), str(&call, "argsText"));
    }
    let harmless = json!({ "constructor": "ok" });
    assert_eq!(Some(&harmless), call_with(&harmless, None).get("args"));
}

#[test]
#[ignore = "needs task 5: foldLifecycle"]
fn args_as_deep_as_the_room_left_stay_one_level_deeper_become_empty() {
    assert_eq!(
        Some(&nested(TOP_ROOM)),
        call_with(&nested(TOP_ROOM), None).get("args")
    );
    let too_deep = call_with(&nested(TOP_ROOM + 1), None);
    assert_eq!(Some(&json!({})), too_deep.get("args"));
    assert_eq!(
        Some(compact(&nested(TOP_ROOM + 1)).as_str()),
        str(&too_deep, "argsText")
    );
}

#[test]
#[ignore = "needs task 5: foldLifecycle"]
fn a_result_too_deep_or_unsafe_for_the_tree_is_folded_into_its_json_text() {
    let empty = json!({});
    let fits = nested_array(TOP_ROOM);
    assert_eq!(Some(&fits), call_with(&empty, Some(&fits)).get("result"));
    let deep = nested_array(TOP_ROOM + 1);
    assert_eq!(
        Some(&Value::String(compact(&deep))),
        call_with(&empty, Some(&deep)).get("result")
    );
    let unsafe_result = json!([{ "type": "text", "__proto__": {} }]);
    assert_eq!(
        Some(&Value::String(compact(&unsafe_result))),
        call_with(&empty, Some(&unsafe_result)).get("result")
    );
    let text = json!([{ "type": "text", "text": "ok" }]);
    assert_eq!(
        Some(&text),
        call_with(&empty, Some(&text)).get("result"),
        "a block list that fits stays a list"
    );
}

#[test]
#[ignore = "needs task 5: foldLifecycle"]
fn a_sub_agents_call_has_less_room_by_the_levels_its_nesting_takes() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        lines::assistant("m1", &lines::tool_use("agent", "Agent", "{}"), None),
        lines::assistant_built(
            "m2",
            &lines::tool_use("fits", "Read", &compact(&nested(NESTED_ROOM))),
            Some("agent"),
        ),
        lines::assistant_built(
            "m2",
            &lines::tool_use("deep", "Read", &compact(&nested(NESTED_ROOM + 1))),
            Some("agent"),
        ),
        lines::user_built(
            "u1",
            &lines::tool_result("fits", &compact(&nested_array(NESTED_ROOM + 1)), None),
            Some("agent"),
        ),
    ]);
    let calls = tool_calls(session.tree());
    assert_eq!(Some(&nested(NESTED_ROOM)), calls["fits"].get("args"));
    assert_eq!(Some(&json!({})), calls["deep"].get("args"));
    assert!(calls["fits"].get("result").is_some_and(Value::is_string));
}

#[test]
#[ignore = "needs task 5: foldLifecycle"]
fn a_value_far_deeper_than_the_tree_allows_is_still_read_and_folded_rather_than_dropped() {
    let depth = MAX_DEPTH + 44;
    let call = call_with(&nested(depth), None);
    assert_eq!(Some(&json!({})), call.get("args"));
    assert_eq!(
        Some(compact(&nested(depth)).as_str()),
        str(&call, "argsText")
    );
}

#[test]
#[ignore = "needs task 5: foldLifecycle"]
fn a_value_deeper_than_the_reader_takes_is_marked_and_the_rest_of_its_line_is_shown() {
    let mut session = Session::default();
    session.turn("c1");
    let pad = format!("{}{}", "[".repeat(NESTING_LIMIT), "]".repeat(NESTING_LIMIT));
    session.events([lines::assistant_built(
        "m1",
        &lines::tool_use(
            "toolu_1",
            "Bash",
            &format!(r#"{{"command":"ls","pad":{pad}}}"#),
        ),
        None,
    )]);
    let call = part(message(session.thread(), "c1"), "toolu_1");
    let args_text = str(call, "argsText").expect("argsText");
    assert!(args_text.contains("\"command\":\"ls\""));
    assert!(args_text.contains(TOO_DEEP));
    assert_eq!(
        Some(&json!({})),
        call.get("args"),
        "still too deep for the tree"
    );
}

#[test]
#[ignore = "needs task 5: foldLifecycle"]
fn a_streaming_calls_args_stay_empty_until_its_stream_stops_then_are_what_args_text_parses_to() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        lines::message_start("m1"),
        lines::block_start(0, &lines::tool_use("toolu_1", "Bash", "{}")),
        lines::json_delta(0, "{\"command\": \"l"),
        lines::json_delta(0, "s\"}"),
    ]);
    let call = |session: &Session| part(message(session.thread(), "c1"), "toolu_1").clone();
    let streaming = call(&session);
    assert_eq!(Some("{\"command\": \"ls\"}"), str(&streaming, "argsText"));
    assert_eq!(
        Some(&json!({})),
        streaming.get("args"),
        "whole, but still streaming: not parsed yet"
    );
    session.events([lines::block_stop(0)]);
    assert_eq!(
        Some(&json!({ "command": "ls" })),
        call(&session).get("args")
    );
    assert_eq!(None, call(&session).get("result"));
}

#[test]
#[ignore = "needs task 5: foldLifecycle"]
fn the_snapshots_input_is_the_args_even_while_streaming_and_args_text_that_is_not_one_object_gives_none()
 {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        lines::message_start("m1"),
        lines::block_start(0, &lines::tool_use("toolu_1", "Bash", "{}")),
        lines::json_delta(0, "{\"command\": \"ls\"}"),
        lines::assistant(
            "m1",
            &lines::tool_use("toolu_1", "Bash", r#"{"command":"ls -la"}"#),
            None,
        ),
    ]);
    let call = |session: &Session, key: &str| part(message(session.thread(), "c1"), key).clone();
    let ls_la = json!({ "command": "ls -la" });
    assert_eq!(Some(&ls_la), call(&session, "toolu_1").get("args"));
    session.events([lines::block_stop(0)]);
    assert_eq!(Some(&ls_la), call(&session, "toolu_1").get("args"));
    session.events([
        lines::block_start(1, &lines::tool_use("toolu_2", "Bash", "{}")),
        lines::json_delta(1, "[1]"),
        lines::block_stop(1),
    ]);
    assert_eq!(
        Some(&json!({})),
        call(&session, "toolu_2").get("args"),
        "not one object"
    );
    assert_eq!(Some("[1]"), str(&call(&session, "toolu_2"), "argsText"));
}

/// Kotlin folds a number that is not finite as a double (`1e999`) into the result's text. In Rust
/// such a number cannot be held in a `serde_json::Value`, so stage 4a's codec already decodes a line
/// that carries one as a `BrokenLine`: the line adds nothing to the transcript, and the call shows
/// no result. Inside a string (a streamed `partial_json`) the number is only text: `argsText` keeps
/// it and `args`, which cannot be read from it, stays empty — as in Kotlin.
#[test]
fn a_number_that_is_not_finite_as_a_double_makes_its_line_add_nothing() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        lines::message_start("m1"),
        lines::block_start(0, &lines::tool_use("toolu_1", "Bash", "{}")),
        lines::json_delta(0, "{\"n\": 1e999}"),
        lines::block_stop(0),
    ]);
    for content in ["1e999", "[1,-1E400]"] {
        let line = lines::user("u1", &lines::tool_result("toolu_1", content, None), None);
        assert!(
            matches!(line, AgentEvent::BrokenLine { .. }),
            "{content}: {line:?}"
        );
        let before = Arc::clone(session.transcript());
        session.events([line]);
        assert!(
            Arc::ptr_eq(&before, session.transcript()),
            "{content}: the line adds nothing"
        );
    }
    let calls = tool_calls(session.tree());
    let call = calls["toolu_1"].as_object().expect("the call");
    assert_eq!(Some(&json!({})), call.get("args"));
    assert_eq!(Some("{\"n\": 1e999}"), str(call, "argsText"));
    assert_eq!(None, call.get("result"));

    // Tiny is finite: the line is read and the result is a list holding one number.
    session.events([lines::user(
        "u2",
        &lines::tool_result("toolu_1", "[1e-400]", None),
        None,
    )]);
    let calls = tool_calls(session.tree());
    let result = calls["toolu_1"].get("result").and_then(Value::as_array);
    assert!(
        result.is_some_and(|items| items.len() == 1 && items[0].is_number()),
        "{result:?}"
    );
}
