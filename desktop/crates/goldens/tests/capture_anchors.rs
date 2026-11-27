//! What the projected captures must show, asserted value by value from what the captures and the
//! recorder's scenarios say happened — independently of the goldens, which only pin what the
//! projection made (CaptureAnchorsTest.kt). Ids and texts are read off the `.ndjson` files and
//! `recorder/scenarios.mjs`.

use closta_goldens::common::known_unplaced;
use closta_goldens::projector::project_tree;
use closta_goldens::replay::{Step, THREAD, final_tree, inputs, replay, scenarios};
use closta_goldens::tree_reading::{
    at, entries, keys_of, message, messages, part, parts, status, str, tool_calls,
};
use closta_model::AgentEvent;
use closta_presenter::input::{Decided, PassedOn, PresenterInput};
use closta_presenter::session::SessionView;
use serde_json::{Map, Value, json};

type Object = Map<String, Value>;

fn thread_of(tree: &Value) -> &Object {
    at(tree, &["threads", "byId", THREAD])
}

fn keys(thread: &Object) -> Vec<String> {
    keys_of(thread, "messages")
}

fn calls(node: &Object) -> Object {
    tool_calls(&Value::Object(node.clone()))
}

fn call<'a>(calls: &'a Object, id: &str) -> &'a Object {
    calls
        .get(id)
        .and_then(Value::as_object)
        .unwrap_or_else(|| panic!("no tool call {id}"))
}

fn objects<'a>(node: &'a Object, key: &str) -> Vec<&'a Object> {
    node.get(key)
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("no array '{key}'"))
        .iter()
        .map(|it| {
            it.as_object()
                .unwrap_or_else(|| panic!("an item of '{key}' is not an object"))
        })
        .collect()
}

fn texts(parts: &[&Object]) -> Vec<Option<String>> {
    parts
        .iter()
        .map(|p| str(p, "text").map(str::to_owned))
        .collect()
}

fn is_event(step: &Step, kind: fn(&AgentEvent) -> bool) -> bool {
    matches!(&step.input, PresenterInput::Event(event) if kind(event))
}

fn tree_after_request(scenario: &str) -> Value {
    replay(scenario)
        .into_iter()
        .find(|step| is_event(step, |e| matches!(e, AgentEvent::ControlRequest { .. })))
        .unwrap_or_else(|| panic!("{scenario}: no control_request"))
        .tree
}

/// The captures where the fold leaves the thread running at the end: those whose `result` line
/// the codec does not place (`KNOWN_UNPLACED`), so the turn it closes stays open. Empty now.
fn still_running(scenario: &str) -> bool {
    known_unplaced(scenario).contains_key("result")
}

/// A sub-agent's call that shows cut off from the capture's line `from_line` on.
struct Cut {
    call_id: &'static str,
    from_line: usize,
}

/// The captures where a sub-agent's call shows cut off: the interrupt killed the background agent
/// and its Bash (task_updated killed at line 71, task_notification stopped), so the call shows
/// incomplete with no result until the rejection arrives at line 79 as its result (an error) — it
/// stays incomplete. How the tree should tell an interrupt from a rejection is still open.
fn cut_off(scenario: &str) -> Option<Cut> {
    (scenario == "19-interrupt-background").then_some(Cut {
        call_id: "toolu_01JQzJgds9jxAZS6KpB3yPYh",
        from_line: 71,
    })
}

/// The tool calls nested under the tool calls of `tree` (a sub-agent's calls under its Agent call).
fn nested_calls(tree: &Value) -> Vec<Object> {
    tool_calls(tree)
        .values()
        .filter_map(|call| call.get("messages"))
        .flat_map(|inner| {
            tool_calls(inner)
                .into_iter()
                .filter_map(|(_, v)| v.as_object().cloned())
                .collect::<Vec<_>>()
        })
        .collect()
}

#[test]
fn no_capture_leaves_the_thread_running_but_for_the_known_gaps() {
    let all = scenarios();
    assert_eq!(44, all.len());
    for scenario in &all {
        // A known gap still shows; anywhere else the thread ends at rest.
        let expected = Value::Bool(still_running(scenario));
        assert_eq!(
            Some(&expected),
            thread_of(&final_tree(scenario)).get("isRunning"),
            "{scenario}"
        );
    }
}

#[test]
fn capture_01_one_user_message_and_one_assistant_message_holding_the_answer() {
    let tree = final_tree("01-baseline-text");
    let thread = thread_of(&tree);
    assert_eq!(
        vec!["send-1", "2db4d1c4-2832-4e82-b206-29fb6231413f"],
        keys(thread)
    );
    let user = message(thread, "send-1");
    assert_eq!(Some("user"), str(user, "role"));
    assert_eq!(None, user.get("status"));
    assert_eq!(
        vec![Some("Respond with exactly one word: pong".to_owned())],
        texts(&parts(user))
    );
    let answer = message(thread, "2db4d1c4-2832-4e82-b206-29fb6231413f");
    assert_eq!(Some("assistant"), str(answer, "role"));
    assert_eq!(Some("complete/stop".to_owned()), status(answer));
    let answer_parts = parts(answer);
    assert_eq!(
        vec![(Some("text"), Some("pong"))],
        answer_parts
            .iter()
            .map(|p| (str(p, "type"), str(p, "text")))
            .collect::<Vec<_>>()
    );
    assert_eq!(1, answer_parts.len());
    assert_eq!(Some("complete".to_owned()), status(answer_parts[0]));
}

#[test]
fn capture_01_while_the_answer_streams_its_part_and_message_run_and_so_does_the_thread() {
    let answer_id = "2db4d1c4-2832-4e82-b206-29fb6231413f";
    let steps = replay("01-baseline-text");
    let streaming = steps
        .iter()
        .find(|step| {
            let thread = thread_of(&step.tree);
            keys(thread).len() == 2
                && parts(message(thread, answer_id))
                    .iter()
                    .any(|p| str(p, "text") == Some("p"))
        })
        .expect("a step where the answer reads \"p\"");
    let thread = thread_of(&streaming.tree);
    let answer = message(thread, answer_id);
    assert_eq!(Some("running".to_owned()), status(answer));
    let answer_parts = parts(answer);
    assert_eq!(1, answer_parts.len());
    assert_eq!(Some("running".to_owned()), status(answer_parts[0]));
    assert_eq!(Some(&Value::Bool(true)), thread.get("isRunning"));
}

#[test]
fn capture_02_the_bash_call_carries_its_input_its_result_and_is_complete() {
    let tree = final_tree("02-tool-bash-autorun");
    let turn = message(thread_of(&tree), "40cc3c71-e383-4bc1-9bef-0c9c972479fb");
    assert_eq!(
        vec![
            Some("reasoning"),
            Some("text"),
            Some("tool-call"),
            Some("text")
        ],
        parts(turn)
            .iter()
            .map(|p| str(p, "type"))
            .collect::<Vec<_>>()
    );
    let bash = part(turn, "toolu_01M1wzh6sucheWf2EB5A36Mq");
    assert_eq!(Some("Bash"), str(bash, "toolName"));
    assert_eq!(
        Some("echo hello-from-capture"),
        str(at(&Value::Object(bash.clone()), &["args"]), "command")
    );
    assert_eq!(Some(&json!("hello-from-capture")), bash.get("result"));
    assert_eq!(Some(&Value::Bool(false)), bash.get("isError"));
    assert_eq!(Some("complete".to_owned()), status(bash));
    assert_eq!(Some("complete/stop".to_owned()), status(turn));
}

#[test]
fn capture_23_each_user_message_holds_its_file_ahead_of_its_words_by_name_kind_type_and_size_and_by_no_byte()
 {
    let tree = final_tree("23-attachments");
    let thread = thread_of(&tree);
    let users: Vec<String> = keys(thread)
        .into_iter()
        .filter(|k| str(message(thread, k), "role") == Some("user"))
        .collect();
    assert_eq!(vec!["send-1", "send-2"], users);
    let picture = parts(message(thread, "send-1"));
    assert_eq!(
        vec![Some("attachment"), Some("text")],
        picture.iter().map(|p| str(p, "type")).collect::<Vec<_>>()
    );
    assert_eq!(
        vec![
            Some(&json!("attachment-1")),
            Some(&json!("image")),
            Some(&json!("image/png")),
            Some(&json!(73)),
        ],
        ["name", "kind", "mediaType", "size"]
            .iter()
            .map(|k| picture[0].get(*k))
            .collect::<Vec<_>>()
    );
    let pdf = parts(message(thread, "send-2"));
    assert_eq!(
        vec![Some("attachment"), Some("text")],
        pdf.iter().map(|p| str(p, "type")).collect::<Vec<_>>()
    );
    assert_eq!(
        vec![Some("document"), Some("application/pdf")],
        ["kind", "mediaType"]
            .iter()
            .map(|k| str(pdf[0], k))
            .collect::<Vec<_>>()
    );
    // The size is the file's, as the recorder's stdin line carried it; nothing else of the file is
    // in the tree.
    let mut fields: Vec<&str> = pdf[0].keys().map(String::as_str).collect();
    fields.sort_unstable();
    assert_eq!(vec!["kind", "mediaType", "name", "size", "type"], fields);
    let printed = serde_json::to_string(thread).expect("the thread prints");
    assert!(
        !printed.contains("iVBORw0KGgo") && !printed.contains("JVBERi0"),
        "no byte of a file, in base64, is in the tree"
    );
    let answers: Vec<Option<String>> = keys(thread)
        .iter()
        .filter(|k| !users.contains(k))
        .map(|k| {
            let text_parts: Vec<&Object> = parts(message(thread, k))
                .into_iter()
                .filter(|p| str(p, "type") == Some("text"))
                .collect();
            assert_eq!(1, text_parts.len(), "{k}: one text part");
            str(text_parts[0], "text").map(str::to_owned)
        })
        .collect();
    assert_eq!(
        vec![Some("Red".to_owned()), Some("KIWI".to_owned())],
        answers
    );
}

#[test]
fn capture_04_the_bash_call_allowed_in_advance_ran_without_an_approval() {
    let tree = final_tree("04-tool-autorun-with-ppt-stdio");
    let found = calls(thread_of(&tree));
    let bash = call(&found, "toolu_01K4mynWnbCCRWnEAcHHtmUT");
    assert_eq!(Some(&json!("should-be-denied")), bash.get("result"));
    assert_eq!(None, bash.get("approval"));
}

#[test]
fn capture_05_the_write_call_carries_its_approval_approved_and_the_result() {
    let tree = final_tree("05-permission-can-use-tool");
    let found = calls(thread_of(&tree));
    let write = call(&found, "toolu_01FooZHpFpzmDvsr82dzYb33");
    assert_eq!(Some("Write"), str(write, "toolName"));
    let approval = at(&Value::Object(write.clone()), &["approval"]).clone();
    assert_eq!(
        Some("fd37592b-7c5a-4653-bb77-f4b22769cdd5"),
        str(&approval, "id")
    );
    assert_eq!(Some("decision"), str(&approval, "display"));
    assert_eq!(Some(&Value::Bool(true)), approval.get("approved"));
    assert_eq!(None, approval.get("resolution"));
    assert!(
        str(write, "result")
            .expect("a result")
            .starts_with("File created successfully at: ")
    );
    assert_eq!(Some("complete".to_owned()), status(write));
}

#[test]
fn capture_05_while_the_approval_waits_the_call_and_its_message_wait_for_the_user() {
    let waiting = tree_after_request("05-permission-can-use-tool");
    let thread = thread_of(&waiting);
    let turn = message(thread, "846b6e3f-1ec3-4fb1-ab89-af04c9749651");
    assert_eq!(Some("requires-action/interrupt".to_owned()), status(turn));
    let write = part(turn, "toolu_01FooZHpFpzmDvsr82dzYb33");
    assert_eq!(Some("requires-action/interrupt".to_owned()), status(write));
    let approval = approval_of(write);
    let mut fields: Vec<&str> = approval.keys().map(String::as_str).collect();
    fields.sort_unstable();
    assert_eq!(vec!["display", "id", "input", "suggestions"], fields);
    assert_eq!(Some(&Value::Bool(true)), thread.get("isRunning"));
}

#[test]
fn capture_24_no_message_the_list_the_cli_last_gave_four_switches_in_order_and_the_unknown_names_notice()
 {
    let tree = final_tree("24-mcp-management");
    let thread = thread_of(&tree);
    assert!(keys(thread).is_empty());
    let servers = objects(thread, "mcpServers");
    assert_eq!(1, servers.len());
    let server = servers[0];
    assert_eq!(
        vec![Some("fake-echo"), Some("connected"), Some("dynamic")],
        ["name", "status", "source"]
            .iter()
            .map(|k| str(server, k))
            .collect::<Vec<_>>()
    );
    assert_eq!(Some(&Value::Bool(false)), server.get("builtIn"));
    assert_eq!(Some(&json!(["echo"])), server.get("tools"));
    assert_eq!(None, server.get("error"));
    assert_eq!(None, thread.get("mcpServersUnreadable"));
    let switches = objects(thread, "switches");
    // The newest first: the unknown name's refusal, then the reconnect, the turn on and the turn
    // off.
    assert_eq!(
        vec![
            (Some("mcp-disable"), Some("rejected")),
            (Some("mcp-reconnect"), Some("applied")),
            (Some("mcp-enable"), Some("applied")),
            (Some("mcp-disable"), Some("applied")),
        ],
        switches
            .iter()
            .map(|s| (str(s, "kind"), str(s, "outcome")))
            .collect::<Vec<_>>()
    );
    assert_eq!(
        Some("Server not found: no-such-server"),
        str(switches[0], "detail")
    );
    assert_eq!(
        vec![Some("Server not found: no-such-server")],
        entries(thread, "notices")
            .iter()
            .map(|n| str(n, "text"))
            .collect::<Vec<_>>()
    );
}

#[test]
fn captures_06_and_07_send_nothing_so_the_thread_stays_empty() {
    for scenario in ["06-context-usage", "07-set-model-and-mode"] {
        assert!(
            keys(thread_of(&final_tree(scenario))).is_empty(),
            "{scenario}"
        );
    }
}

#[test]
fn capture_08_the_agent_call_nests_the_sub_agents_prompt_and_its_read_call_with_the_result() {
    let tree = final_tree("08-subagent-task");
    let agent = part(
        message(thread_of(&tree), "7bc9256d-6b9f-4dad-b58c-620568c6abaf"),
        "toolu_016keAu5ZSgNCvYmxd6wGT6w",
    );
    assert_eq!(Some("Agent"), str(agent, "toolName"));
    assert_eq!(Some("complete".to_owned()), status(agent));
    assert_eq!(
        vec![
            "42e60a14-f53a-4c87-ac6f-67e41762f7b9",
            "msg_011CScrubbed91eppSUf5SM4"
        ],
        keys_of(agent, "messages")
    );
    let prompt = message(agent, "42e60a14-f53a-4c87-ac6f-67e41762f7b9");
    assert_eq!(Some("user"), str(prompt, "role"));
    let prompt_parts = parts(prompt);
    assert_eq!(1, prompt_parts.len());
    assert!(
        str(prompt_parts[0], "text")
            .expect("a text")
            .starts_with("Read the file NOTES.md in the current directory")
    );
    let reply = message(agent, "msg_011CScrubbed91eppSUf5SM4");
    assert_eq!(Some("assistant"), str(reply, "role"));
    assert_eq!(
        None,
        reply.get("status"),
        "a sub-agent's message has no status"
    );
    let read = part(reply, "toolu_017AYaBDFQPgf2trBHtoP1HN");
    assert_eq!(Some("Read"), str(read, "toolName"));
    assert!(
        str(read, "result")
            .expect("a result")
            .starts_with("1\t# NOTES")
    );
    assert!(
        agent
            .get("result")
            .and_then(Value::as_array)
            .is_some_and(|items| !items.is_empty()),
        "the hand-back is the Agent call's result"
    );
}

#[test]
fn capture_08_while_the_sub_agent_works_the_agent_call_runs() {
    let steps = replay("08-subagent-task");
    let working = steps
        .iter()
        .find(|step| is_event(step, |e| matches!(e, AgentEvent::SystemTaskStarted { .. })))
        .expect("a system/task_started");
    let found = tool_calls(&working.tree);
    let agent = call(&found, "toolu_016keAu5ZSgNCvYmxd6wGT6w");
    assert_eq!(Some("running".to_owned()), status(agent));
}

#[test]
fn no_sub_agents_call_shows_as_cut_off_before_its_result_arrives() {
    for scenario in scenarios() {
        let cut = cut_off(&scenario);
        let mut line = 0;
        for (index, step) in replay(&scenario).iter().enumerate() {
            if matches!(step.input, PresenterInput::Event(_)) {
                line += 1;
            }
            // The known gap is let through only from the capture's line where the interrupt took
            // effect.
            let exempt = cut
                .as_ref()
                .filter(|it| line >= it.from_line)
                .map(|it| it.call_id);
            for nested in nested_calls(&step.tree) {
                let id = str(&nested, "toolCallId");
                if nested.get("result").is_some() || (exempt.is_some() && id == exempt) {
                    continue;
                }
                let said = status(&nested).expect("a call has a status");
                assert!(
                    !said.starts_with("incomplete"),
                    "{scenario} #{index}: {id:?} is {said}"
                );
            }
        }
        // The known gap still shows: the call the interrupt killed ends incomplete (its result,
        // the rejection, arrives at the capture's line 79 as an error).
        if let Some(cut) = cut {
            let ended: Vec<Object> = nested_calls(&final_tree(&scenario))
                .into_iter()
                .filter(|it| str(it, "toolCallId") == Some(cut.call_id))
                .collect();
            assert_eq!(1, ended.len(), "{scenario}: {}", cut.call_id);
            let said = status(&ended[0]).expect("a call has a status");
            assert!(
                said.starts_with("incomplete"),
                "{scenario}: {} is {said}",
                cut.call_id
            );
        }
    }
}

#[test]
fn captures_10_and_11_the_sub_agents_second_run_shows_its_call_running_until_the_result() {
    for (scenario, read) in [
        ("10-background-task", "toolu_01TLAR4CsrnQ4L8vCyxGTJXg"),
        ("11-background-followup", "toolu_0185uJbXrK9vvVivVJSLTxrA"),
    ] {
        let mut seen: Vec<String> = Vec::new();
        for step in replay(scenario) {
            let said = tool_calls(&step.tree)
                .get(read)
                .and_then(Value::as_object)
                .and_then(status);
            if let Some(said) = said
                && !seen.contains(&said)
            {
                seen.push(said);
            }
        }
        assert_eq!(vec!["running", "complete"], seen, "{scenario}");
    }
}

#[test]
fn capture_09_two_agent_calls_of_one_message_each_nest_their_own_sub_agent() {
    let tree = final_tree("09-parallel-subagents");
    let found = calls(thread_of(&tree));
    let first = call(&found, "toolu_01Lb8Pj8ffuCwbUXBNu6tpZe");
    let second = call(&found, "toolu_01AeVtuqRUaWjxrAn4eN4CtA");
    let roles = |agent: &Object| -> Vec<Option<String>> {
        messages(agent)
            .iter()
            .map(|m| str(m, "role").map(str::to_owned))
            .collect()
    };
    let expected = vec![Some("user".to_owned()), Some("assistant".to_owned())];
    assert_eq!(expected, roles(first));
    assert_eq!(expected, roles(second));
    let under_first = calls(first);
    let under_second = calls(second);
    assert!(
        str(
            call(&under_first, "toolu_017DX6f9jtm8Qbd7qWLAL774"),
            "result"
        )
        .expect("a result")
        .starts_with("1\t# NOTES")
    );
    assert!(
        str(
            call(&under_second, "toolu_019tWe9Kgvtduj36KbkSXbFb"),
            "result"
        )
        .expect("a result")
        .starts_with("1\t# GUIDE")
    );
    assert!(
        !under_first.contains_key("toolu_019tWe9Kgvtduj36KbkSXbFb"),
        "each sub-agent's calls stay under its own call"
    );
}

#[test]
fn capture_10_one_turn_message_then_two_messages_the_cli_said_on_its_own() {
    let tree = final_tree("10-background-task");
    let thread = thread_of(&tree);
    assert_eq!(
        vec![
            "send-1",
            "8ef2e421-4d12-48ac-b065-cacf3bc35e81",
            "msg_011CScrubbed4Cim73pcgZBm",
            "msg_011CScrubbedEDaKUXDcpXJk",
        ],
        keys(thread)
    );
    assert_eq!(
        vec![
            Some("user"),
            Some("assistant"),
            Some("assistant"),
            Some("assistant")
        ],
        messages(thread)
            .iter()
            .map(|m| str(m, "role"))
            .collect::<Vec<_>>()
    );
    assert_eq!(
        vec![
            None,
            Some("complete/stop".to_owned()),
            Some("complete/stop".to_owned()),
            Some("complete/stop".to_owned()),
        ],
        messages(thread)
            .iter()
            .map(|m| status(m))
            .collect::<Vec<_>>()
    );
    assert!(
        parts(message(thread, "msg_011CScrubbedEDaKUXDcpXJk"))
            .iter()
            .any(|p| str(p, "text").expect("a text").contains("bg-done"))
    );
}

#[test]
fn capture_10_a_resume_runs_the_thread_while_it_speaks_and_the_thread_rests_between() {
    let steps = replay("10-background-task");
    let after_turn = steps
        .iter()
        .find(|step| is_event(step, |e| matches!(e, AgentEvent::Result { .. })))
        .expect("a result");
    assert_eq!(
        Some(&Value::Bool(false)),
        thread_of(&after_turn.tree).get("isRunning")
    );
    let speaking = steps
        .iter()
        .find(|step| {
            keys(thread_of(&step.tree)).contains(&"msg_011CScrubbed4Cim73pcgZBm".to_owned())
        })
        .expect("a step where the resume speaks");
    let thread = thread_of(&speaking.tree);
    assert_eq!(Some(&Value::Bool(true)), thread.get("isRunning"));
    assert_eq!(
        Some("running".to_owned()),
        status(message(thread, "msg_011CScrubbed4Cim73pcgZBm"))
    );
}

#[test]
fn capture_11_two_user_turns_the_second_message_where_it_was_sent_then_the_resumes() {
    let tree = final_tree("11-background-followup");
    let thread = thread_of(&tree);
    assert_eq!(
        vec![
            "send-1",
            "fd3865b0-030e-4f83-b5c7-f125be3a58e3",
            "send-2",
            "461f6ba9-5e7c-40e6-a4a1-3f13ab7dfc93",
            "msg_011CScrubbedErtc8MpJCiee",
            "msg_011CScrubbedCJZpSJgv7AHg",
        ],
        keys(thread)
    );
    assert_eq!(
        vec![Some(
            "While that runs: respond with exactly one character: 4 (what is 2+2)".to_owned()
        )],
        texts(&parts(message(thread, "send-2")))
    );
    assert_eq!(
        vec![Some("4".to_owned())],
        texts(&parts(message(
            thread,
            "461f6ba9-5e7c-40e6-a4a1-3f13ab7dfc93"
        )))
    );
    let found = calls(thread);
    let blocked = call(&found, "toolu_01X3CFLpZwNx78yc9GKxjDoA");
    assert_eq!(Some(&Value::Bool(true)), blocked.get("isError"));
}

#[test]
fn capture_11_between_the_second_send_and_the_cli_taking_it_the_thread_runs() {
    let steps = replay("11-background-followup");
    let sent: Vec<usize> = (0..steps.len())
        .filter(|i| {
            matches!(&steps[*i].input, PresenterInput::UserSent(it) if it.message_id.as_str() == "send-2")
        })
        .collect();
    assert_eq!(1, sent.len());
    assert_eq!(
        Some(&Value::Bool(true)),
        thread_of(&steps[sent[0]].tree).get("isRunning")
    );
    assert_eq!(
        Some(&Value::Bool(false)),
        thread_of(&steps[sent[0] - 1].tree).get("isRunning")
    );
}

#[test]
fn capture_12_the_sub_agents_write_call_carries_the_approval_nested_under_the_agent_call() {
    let tree = final_tree("12-subagent-permission");
    let agent = part(
        message(thread_of(&tree), "7d810fd9-023c-4f86-b8a6-a8cb7f6ca80a"),
        "toolu_01VhnfAHvzvJJcXbuNmFC76z",
    );
    let write = part(
        message(agent, "msg_011CScrubbedF8tX2sfjPKaL"),
        "toolu_01PpTFMozAHSLaqmFKc6923D",
    );
    let approval = at(&Value::Object(write.clone()), &["approval"]).clone();
    assert_eq!(
        Some("c68ae115-1067-4676-be66-41f53bf3a14b"),
        str(&approval, "id")
    );
    assert_eq!(Some(&Value::Bool(true)), approval.get("approved"));
    assert_eq!(
        None,
        agent.get("approval"),
        "the approval sits on the call it gates, not on the Agent call"
    );
}

#[test]
fn capture_12_while_the_sub_agents_approval_waits_the_turn_waits_for_the_user() {
    let tree = tree_after_request("12-subagent-permission");
    let turn = message(thread_of(&tree), "7d810fd9-023c-4f86-b8a6-a8cb7f6ca80a");
    assert_eq!(Some("requires-action/interrupt".to_owned()), status(turn));
    let agent = part(turn, "toolu_01VhnfAHvzvJJcXbuNmFC76z");
    assert_eq!(Some("running".to_owned()), status(agent));
    let found = calls(agent);
    assert_eq!(
        Some("requires-action/interrupt".to_owned()),
        status(call(&found, "toolu_01PpTFMozAHSLaqmFKc6923D"))
    );
}

/// The one AskUserQuestion call of `scenario`'s last tree.
fn question(scenario: &str) -> Object {
    let tree = final_tree(scenario);
    let asks: Vec<Object> = calls(thread_of(&tree))
        .into_iter()
        .filter_map(|(_, v)| v.as_object().cloned())
        .filter(|c| str(c, "toolName") == Some("AskUserQuestion"))
        .collect();
    assert_eq!(1, asks.len(), "{scenario}: one question");
    asks.into_iter()
        .next()
        .unwrap_or_else(|| panic!("{scenario}: no question"))
}

fn approval_of(call: &Object) -> Object {
    at(&Value::Object(call.clone()), &["approval"]).clone()
}

#[test]
fn capture_13_the_question_shows_its_prompt_and_options_and_was_cancelled_unanswered() {
    let ask = question("13-ask-timeout");
    let approval = approval_of(&ask);
    assert_eq!(
        Some("9f0891e5-a636-4c70-8a63-c288c7eaf6aa"),
        str(&approval, "id")
    );
    assert_eq!(Some("select"), str(&approval, "display"));
    assert_eq!(Some("AとBどちらがいいですか？"), str(&approval, "prompt"));
    let options = objects(&approval, "options");
    assert_eq!(
        vec![Some("A"), Some("B")],
        options.iter().map(|o| str(o, "id")).collect::<Vec<_>>()
    );
    assert_eq!(
        vec![Some("answer"), Some("answer")],
        options.iter().map(|o| str(o, "kind")).collect::<Vec<_>>()
    );
    assert_eq!(
        vec![Some("Aを選択します"), Some("Bを選択します")],
        options
            .iter()
            .map(|o| str(o, "description"))
            .collect::<Vec<_>>()
    );
    assert_eq!(Some("cancelled"), str(&approval, "resolution"));
    assert_eq!(None, approval.get("approved"));
    assert_eq!(
        Some(&json!("The user did not answer the questions.")),
        ask.get("result")
    );
}

#[test]
fn capture_14_the_question_was_answered() {
    let ask = question("14-ask-answers-updatedinput");
    let approval = approval_of(&ask);
    assert_eq!(Some(&Value::Bool(true)), approval.get("approved"));
    assert_eq!(None, approval.get("resolution"));
    assert!(
        str(&ask, "result")
            .expect("a result")
            .starts_with("Your questions have been answered")
    );
}

#[test]
fn capture_15_the_question_expired_while_the_user_was_away() {
    let ask = question("15-ask-afktimeout-updatedinput");
    let approval = approval_of(&ask);
    assert_eq!(Some("expired"), str(&approval, "resolution"));
    assert_eq!(None, approval.get("approved"));
    assert!(
        str(&ask, "result")
            .expect("a result")
            .starts_with("No response after 5s")
    );
}

#[test]
fn captures_01_and_16_show_the_session_the_cli_started_the_mode_16s_status_changed_and_the_total() {
    let tree = final_tree("01-baseline-text");
    let first = Value::Object(thread_of(&tree).clone());
    let session = at(&first, &["session"]);
    assert_eq!(Some("claude-sonnet-4-6"), str(session, "model"));
    assert_eq!(Some("default"), str(session, "permissionMode"));
    assert_eq!(Some("2.1.282"), str(session, "version"));
    assert_eq!(
        Some(&json!(0.0511167)),
        at(&first, &["usage"]).get("costUsd")
    );
    let tree = final_tree("16-permission-suggestion-accept");
    let accepting = Value::Object(thread_of(&tree).clone());
    assert_eq!(
        Some("acceptEdits"),
        str(at(&accepting, &["session"]), "permissionMode"),
        "its system/status said so"
    );
    assert_eq!(
        Some(&json!(0.14087429999999998)),
        at(&accepting, &["usage"]).get("costUsd")
    );
}

#[test]
fn capture_03_offers_the_commands_of_its_initialize_response_with_their_sentences_and_01_the_names_system_init_gave()
 {
    let tree = final_tree("03-initialize-handshake");
    let detailed = objects(thread_of(&tree), "commands");
    assert_eq!(59, detailed.len());
    let config: Vec<&&Object> = detailed
        .iter()
        .filter(|c| str(c, "name") == Some("config"))
        .collect();
    assert_eq!(1, config.len());
    assert_eq!(Some("Set a setting by key"), str(config[0], "description"));
    assert_eq!(Some("key=value"), str(config[0], "argumentHint"));
    assert!(detailed.iter().all(|c| {
        !str(c, "description").expect("a description").is_empty()
            || str(c, "name") != Some("config")
    }));
    let tree = final_tree("01-baseline-text");
    let names = objects(thread_of(&tree), "commands");
    assert!(!names.is_empty(), "system/init alone names the commands");
    assert!(
        names
            .iter()
            .all(|c| str(c, "description") == Some("") && c.get("argumentHint").is_none()),
        "and only names"
    );
}

#[test]
fn capture_03_offers_the_models_of_its_initialize_response_with_the_levels_each_takes_and_06_the_context_usage()
 {
    let tree = final_tree("03-initialize-handshake");
    let models = objects(thread_of(&tree), "models");
    assert_eq!(
        vec![
            Some("default"),
            Some("claude-opus-5"),
            Some("claude-sonnet-5"),
            Some("haiku")
        ],
        models
            .iter()
            .take(4)
            .map(|m| str(m, "value"))
            .collect::<Vec<_>>()
    );
    assert_eq!(Some("claude-opus-4-8[1m]"), str(models[0], "resolvedModel"));
    assert_eq!(Some(&Value::Bool(true)), models[0].get("supportsEffort"));
    assert_eq!(5, objects_len(models[0], "supportedEffortLevels"));
    let haiku: Vec<&&Object> = models
        .iter()
        .filter(|m| str(m, "value") == Some("haiku"))
        .collect();
    assert_eq!(1, haiku.len());
    assert_eq!(
        None,
        haiku[0].get("supportsEffort"),
        "haiku takes no effort"
    );
    let tree = final_tree("06-context-usage");
    let context = at(&tree, &["threads", "byId", THREAD, "context"]);
    assert_eq!(Some(&json!(16575)), context.get("totalTokens"));
    assert_eq!(Some(&json!(200000)), context.get("maxTokens"));
    assert_eq!(Some(&json!(8)), context.get("percentage"));
    assert_eq!(Some(&json!(167000)), context.get("autoCompactThreshold"));
}

fn objects_len(node: &Object, key: &str) -> usize {
    node.get(key)
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("no array '{key}'"))
        .len()
}

#[test]
fn capture_03_says_the_permission_mode_of_its_initialize_response_and_19_the_one_it_was_started_with()
 {
    assert_eq!(
        Some("default"),
        str(
            thread_of(&final_tree("03-initialize-handshake")),
            "startPermissionMode"
        )
    );
    assert_eq!(
        Some("acceptEdits"),
        str(
            thread_of(&final_tree("19-interrupt-background")),
            "startPermissionMode"
        )
    );
}

#[test]
fn capture_28_says_the_effort_and_the_model_of_the_clis_last_settings_and_keeps_its_effort_switches()
 {
    let tree = final_tree("28-effort-live");
    let thread = thread_of(&tree);
    // The last settings, after effortLevel null, are the model's own default (high), not the
    // start's medium.
    assert_eq!(Some("high"), str(thread, "effort"));
    assert_eq!(Some("claude-sonnet-4-6"), str(thread, "appliedModel"));
    let switches = objects(thread, "switches");
    assert!(!switches.is_empty());
    assert!(switches.iter().all(|s| str(s, "kind") == Some("effort")));
    assert!(
        switches
            .iter()
            .all(|s| str(s, "outcome") == Some("applied"))
    );
}

#[test]
fn every_capture_with_an_initialize_response_has_its_mode_on_the_thread() {
    let with_initialize: Vec<(String, Value)> = scenarios()
        .into_iter()
        .map(|s| {
            let tree = final_tree(&s);
            (s, tree)
        })
        .filter(|(_, tree)| thread_of(tree).get("models").is_some())
        .collect();
    // Counted: were the filter to match none, no case would run and none would fail.
    assert_eq!(
        34,
        with_initialize.len(),
        "34 captures carry an initialize response"
    );
    for (scenario, tree) in &with_initialize {
        // Every response carries the mode: 19 was started in acceptEdits, 29 in plan, 37 in auto,
        // the rest in default.
        let expected = match scenario.as_str() {
            "19-interrupt-background" => "acceptEdits",
            "29-exit-plan-mode" => "plan",
            "37-plan-auto" => "auto",
            _ => "default",
        };
        assert_eq!(
            Some(expected),
            str(thread_of(tree), "startPermissionMode"),
            "{scenario}"
        );
    }
}

#[test]
fn capture_07_lists_the_ten_switches_newest_first_with_the_refused_ones_sentence_10_sums_its_tokens_21_compacts()
 {
    let tree = final_tree("07-set-model-and-mode");
    let switches = objects(thread_of(&tree), "switches");
    assert_eq!(
        (1..=10).rev().map(|n| Some(json!(n))).collect::<Vec<_>>(),
        switches
            .iter()
            .map(|s| s.get("seq").cloned())
            .collect::<Vec<_>>()
    );
    let refused: Vec<&&Object> = switches
        .iter()
        .filter(|s| str(s, "outcome") == Some("rejected"))
        .collect();
    assert_eq!(1, refused.len());
    assert_eq!(Some("mode"), str(refused[0], "kind"));
    assert_eq!(Some("bypassPermissions"), str(refused[0], "value"));
    assert!(
        str(refused[0], "detail")
            .expect("a detail")
            .starts_with("Cannot set permission mode to bypassPermissions")
    );
    let tree = final_tree("10-background-task");
    let usage = at(&tree, &["threads", "byId", THREAD, "usage"]);
    assert_eq!(Some(&json!(0.15600725000000004)), usage.get("costUsd"));
    assert_eq!(
        Some(&json!(1109)),
        usage.get("outputTokens"),
        "20 + 1089 of the last result, not 531 + 763 + 1109"
    );
    let tree = final_tree("21-compact");
    let compacted = thread_of(&tree);
    let compactions = objects(compacted, "compactions");
    assert_eq!(1, compactions.len());
    assert_eq!(Some("manual"), str(compactions[0], "trigger"));
    assert_eq!(Some(&json!(20072)), compactions[0].get("preTokens"));
    assert_eq!(Some(&json!(1235)), compactions[0].get("postTokens"));
    assert_eq!(
        Some(&Value::Bool(false)),
        compacted.get("compacting"),
        "it ended"
    );
    // While the CLI compacts the tree says so, and says it is over after (the key is always
    // there).
    let mut runs: Vec<Option<Value>> = Vec::new();
    for step in replay("21-compact") {
        let flag = thread_of(&step.tree).get("compacting").cloned();
        if runs.last() != Some(&flag) {
            runs.push(flag);
        }
    }
    assert_eq!(
        vec![
            Some(Value::Bool(false)),
            Some(Value::Bool(true)),
            Some(Value::Bool(false))
        ],
        runs
    );
}

#[test]
fn capture_07_has_no_init_so_no_session_and_no_total_and_one_notice_for_the_refused_mode() {
    let tree = final_tree("07-set-model-and-mode");
    let thread = thread_of(&tree);
    assert_eq!(None, thread.get("session"));
    assert_eq!(None, thread.get("usage"));
    assert_eq!(vec!["notice-1"], keys_of(thread, "notices"));
    let notice = at(
        &tree,
        &["threads", "byId", THREAD, "notices", "byId", "notice-1"],
    );
    assert_eq!(Some("control-error"), str(notice, "kind"));
    assert_eq!(
        Some("07-set-model-and-mode-req-8"),
        str(notice, "requestId")
    );
    assert!(
        str(notice, "text")
            .expect("a text")
            .starts_with("Cannot set permission mode to bypassPermissions")
    );
}

#[test]
fn captures_08_and_10_show_their_tasks_the_sub_agents_with_the_call_that_started_it_and_10s_in_the_background()
 {
    let tree = final_tree("08-subagent-task");
    let sub = at(
        &tree,
        &[
            "threads",
            "byId",
            THREAD,
            "tasks",
            "byId",
            "a9647d7f101779f28",
        ],
    );
    assert_eq!(
        Some("toolu_016keAu5ZSgNCvYmxd6wGT6w"),
        str(sub, "toolCallId")
    );
    assert_eq!(Some("Explore"), str(sub, "agentType"));
    assert_eq!(Some(&Value::Bool(false)), sub.get("background"));
    assert_eq!(Some("complete"), str(sub, "status"));
    let tree = final_tree("10-background-task");
    let background = thread_of(&tree);
    assert_eq!(
        vec!["ad723e6f8ca4b28ad", "bc4b0ae63"],
        keys_of(background, "tasks")
    );
    assert_eq!(
        vec![Some(&Value::Bool(true)), Some(&Value::Bool(true))],
        entries(background, "tasks")
            .iter()
            .map(|t| t.get("background"))
            .collect::<Vec<_>>()
    );
}

/// The first call of `thread` that carries an approval.
fn approved_call(thread: &Object) -> Object {
    calls(thread)
        .into_iter()
        .filter_map(|(_, v)| v.as_object().cloned())
        .find(|c| c.contains_key("approval"))
        .unwrap_or_else(|| panic!("no call with an approval"))
}

#[test]
fn capture_16_offers_its_two_suggestions_the_first_setting_the_mode_and_18_asks_two_questions() {
    let tree = final_tree("16-permission-suggestion-accept");
    let approval = approval_of(&approved_call(thread_of(&tree)));
    let offered = objects(&approval, "suggestions");
    assert_eq!(
        vec![Some("s1"), Some("s2")],
        offered.iter().map(|o| str(o, "id")).collect::<Vec<_>>()
    );
    assert_eq!(
        vec![Some("setMode"), Some("addDirectories")],
        offered.iter().map(|o| str(o, "kind")).collect::<Vec<_>>()
    );
    assert_eq!(Some("acceptEdits"), str(offered[0], "detail"));
    assert_eq!(
        vec![Some("session"), Some("session")],
        offered
            .iter()
            .map(|o| str(o, "destination"))
            .collect::<Vec<_>>()
    );
    let ask = approval_of(&question("18-ask-multi-question"));
    let questions = objects(&ask, "questions");
    assert_eq!(
        vec![Some("q1"), Some("q2")],
        questions.iter().map(|q| str(q, "id")).collect::<Vec<_>>()
    );
    assert_eq!(
        vec![
            Some("AとBどちらがいいですか？"),
            Some("XとYどちらにしますか？")
        ],
        questions
            .iter()
            .map(|q| str(q, "prompt"))
            .collect::<Vec<_>>()
    );
    assert_eq!(
        Some("AとBどちらがいいですか？"),
        str(&ask, "prompt"),
        "the first question is still the prompt"
    );
    assert_eq!(
        vec![Some("A"), Some("B")],
        objects(&ask, "options")
            .iter()
            .map(|o| str(o, "id"))
            .collect::<Vec<_>>()
    );
}

#[test]
fn capture_16_shows_the_suggestions_its_answer_passed_on_and_the_captured_answer_alone_shows_none()
{
    let scenario = "16-permission-suggestion-accept";
    let tree = final_tree(scenario);
    let captured = approval_of(&approved_call(thread_of(&tree)));
    assert_eq!(
        None,
        captured.get("acceptedSuggestions"),
        "the replayed answer carries only the decision"
    );
    let view = inputs(scenario, false)
        .into_iter()
        .map(|input| match input {
            PresenterInput::Decided(decided) => PresenterInput::Decided(Decided {
                passed_on: PassedOn {
                    accepted_suggestions: vec!["s1".to_owned(), "s2".to_owned()],
                    ..PassedOn::default()
                },
                ..decided
            }),
            other => other,
        })
        .fold(SessionView::default(), |view, input| view.fold(&input));
    let tree = project_tree(&view.conversation, &view.transcript, THREAD);
    let approval = approval_of(&approved_call(thread_of(&tree)));
    assert_eq!(
        Some(&json!(["s1", "s2"])),
        approval.get("acceptedSuggestions")
    );
    assert_eq!(None, approval.get("updatedInput"));
    assert_eq!(None, approval.get("failure"));
    assert_eq!(None, approval.get("failures"));
}
