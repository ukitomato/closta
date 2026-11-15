//! A turn to replay, as the stream-json lines the CLI would print (ReplayScript.kt): the turn
//! starts, the session says init, an Edit is streamed and answered, then the reply is streamed in
//! pieces of eight UTF-16 units, and the turn ends. The user's words are not here: the CLI does not
//! echo them.

use serde_json::{Value, json};

use super::stream_script::StreamScript;

const EDIT_ID: &str = "toolu_spike_edit";
const COMMAND: &str = "spike-command";
const CHUNK: usize = 8;

/// The lines of one turn whose reply is `markdown`, in the session `session_id`.
pub fn lines(markdown: &str, session_id: &str) -> Vec<String> {
    let mut script = StreamScript::new(session_id);
    script.lifecycle(COMMAND, "queued");
    script.lifecycle(COMMAND, "started");
    script.init();
    script.stream_tool("msg_spike_1", EDIT_ID, "Edit", &edit_input());
    script.tool_result(
        EDIT_ID,
        "The file has been updated successfully.",
        None,
        false,
    );
    script.stream_text("msg_spike_2", markdown, CHUNK);
    script.result(markdown);
    script.lifecycle(COMMAND, "completed");
    script.lines()
}

fn edit_input() -> Value {
    json!({
        "file_path": "/spike/src/main/kotlin/AuthService.kt",
        "old_string": "fun login(c: Credentials) =\n    api.login(c)",
        "new_string": "suspend fun login(c: Credentials) =\n    retry(times = 3, backoff = 200.milliseconds) {\n        api.login(c)\n    }",
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_reply_streams_in_pieces_and_ends_the_turn() {
        let lines = lines("Hello, world!", "s-9");
        let values: Vec<Value> = lines
            .iter()
            .map(|line| serde_json::from_str(line).expect("json"))
            .collect();
        let deltas: Vec<&str> = values
            .iter()
            .filter_map(|it| it["event"]["delta"]["text"].as_str())
            .collect();

        assert_eq!(vec!["Hello, w", "orld!"], deltas);
        assert!(values.iter().all(|it| it["session_id"] == "s-9"));
        assert_eq!("completed", values[values.len() - 1]["state"]);
        assert_eq!("Hello, world!", values[values.len() - 2]["result"]);
    }
}
