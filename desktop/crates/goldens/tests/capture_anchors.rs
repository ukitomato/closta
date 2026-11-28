//! What the projected captures must show, asserted value by value from what the captures and the
//! recorder's scenarios say happened — independently of the goldens, which only pin what the
//! projection made (CaptureAnchorsTest.kt). Ids and texts are read off the `.ndjson` files and
//! `recorder/scenarios.mjs`.

use std::collections::HashSet;

use closta_goldens::common::{known_unplaced, legacy_excerpt};
use closta_goldens::projector::project_tree;
use closta_goldens::replay::{Step, THREAD, final_tree, inputs, replay, replay_from, scenarios};
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
        vec!["send-1", "2936960e-01f3-4830-8964-67a2a1bc6cf6"],
        keys(thread)
    );
    let user = message(thread, "send-1");
    assert_eq!(Some("user"), str(user, "role"));
    assert_eq!(None, user.get("status"));
    assert_eq!(
        vec![Some("Respond with exactly one word: pong".to_owned())],
        texts(&parts(user))
    );
    let answer = message(thread, "2936960e-01f3-4830-8964-67a2a1bc6cf6");
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
    let answer_id = "2936960e-01f3-4830-8964-67a2a1bc6cf6";
    let steps = replay("01-baseline-text");
    // 2.1.325 streams the answer as one delta; the part still runs until its content_block_stop.
    let streaming = steps
        .iter()
        .find(|step| {
            let thread = thread_of(&step.tree);
            keys(thread).len() == 2
                && parts(message(thread, answer_id))
                    .iter()
                    .any(|p| str(p, "text") == Some("pong"))
        })
        .expect("a step where the answer reads \"pong\"");
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
    let turn = message(thread_of(&tree), "1733e09b-a794-4e74-b264-4e8c1feac07a");
    assert_eq!(
        vec![Some("tool-call"), Some("text")],
        parts(turn)
            .iter()
            .map(|p| str(p, "type"))
            .collect::<Vec<_>>()
    );
    let bash = part(turn, "toolu_01X34nTfhCcSEMxmUMvxUR78");
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
    let bash = call(&found, "toolu_01LbRow5QYDQFGytVgTwRfuE");
    assert_eq!(Some(&json!("should-be-denied")), bash.get("result"));
    assert_eq!(None, bash.get("approval"));
}

#[test]
fn capture_05_the_write_call_carries_its_approval_approved_and_the_result() {
    let tree = final_tree("05-permission-can-use-tool");
    let found = calls(thread_of(&tree));
    let write = call(&found, "toolu_01S2wEQGaruCBtQJHkwEwrxu");
    assert_eq!(Some("Write"), str(write, "toolName"));
    let approval = at(&Value::Object(write.clone()), &["approval"]).clone();
    assert_eq!(
        Some("e42c7fac-e237-4ee9-a6c1-d19579abb0f3"),
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
    let turn = message(thread, "c810a2d1-b8af-4673-9506-fd49f92285c4");
    assert_eq!(Some("requires-action/interrupt".to_owned()), status(turn));
    let write = part(turn, "toolu_01S2wEQGaruCBtQJHkwEwrxu");
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
        message(thread_of(&tree), "af32f5b7-baa9-4f58-9196-5136eec2573d"),
        "toolu_01S4aVxTAg6iR87daCuzkwZQ",
    );
    assert_eq!(Some("Agent"), str(agent, "toolName"));
    assert_eq!(Some("complete".to_owned()), status(agent));
    assert_eq!(
        vec![
            "1121d477-e599-43de-941d-542c6139a2c4",
            "msg_011CScrubbed7qAAAm1qY1rq"
        ],
        keys_of(agent, "messages")
    );
    let prompt = message(agent, "1121d477-e599-43de-941d-542c6139a2c4");
    assert_eq!(Some("user"), str(prompt, "role"));
    let prompt_parts = parts(prompt);
    assert_eq!(1, prompt_parts.len());
    let prompt_text = str(prompt_parts[0], "text").expect("a text");
    assert!(
        prompt_text.starts_with("Read the file ") && prompt_text.contains("/cwd/NOTES.md"),
        "{prompt_text}"
    );
    let reply = message(agent, "msg_011CScrubbed7qAAAm1qY1rq");
    assert_eq!(Some("assistant"), str(reply, "role"));
    assert_eq!(
        None,
        reply.get("status"),
        "a sub-agent's message has no status"
    );
    let read = part(reply, "toolu_011Yw3MDkf6a4P4rzGqAqbyP");
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
    let agent = call(&found, "toolu_01S4aVxTAg6iR87daCuzkwZQ");
    assert_eq!(Some("running".to_owned()), status(agent));
}

/// Asserts that no sub-agent's call of `steps` shows cut off before its result arrives, but for
/// the one `cut` names from its line on, which must end cut off.
fn assert_no_call_cut_off(steps: &[Step], scenario: &str, cut: Option<Cut>) {
    let mut line = 0;
    // A call the CLI refused on its own is shown refused (incomplete) from the refusal until its
    // result comes: it is not a call something cut off.
    let refused: HashSet<&str> = steps
        .iter()
        .filter_map(|step| match &step.input {
            PresenterInput::Event(AgentEvent::SystemPermissionDenied { tool_use_id, .. }) => {
                Some(tool_use_id.as_str())
            }
            _ => None,
        })
        .collect();
    for (index, step) in steps.iter().enumerate() {
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
            if nested.get("result").is_some()
                || (exempt.is_some() && id == exempt)
                || id.is_some_and(|it| refused.contains(it))
            {
                continue;
            }
            let said = status(&nested)
                .unwrap_or_else(|| panic!("{scenario} #{index}: a call has no status"));
            assert!(
                !said.starts_with("incomplete"),
                "{scenario} #{index}: {id:?} is {said}"
            );
        }
    }
    // The known gap still shows: the call the interrupt killed ends incomplete.
    if let Some(cut) = cut {
        let last = steps
            .last()
            .unwrap_or_else(|| panic!("{scenario}: a replay has no steps"));
        let ended: Vec<Object> = nested_calls(&last.tree)
            .into_iter()
            .filter(|it| str(it, "toolCallId") == Some(cut.call_id))
            .collect();
        assert_eq!(1, ended.len(), "{scenario}: {}", cut.call_id);
        let said = status(&ended[0]).unwrap_or_else(|| panic!("{scenario}: a call has no status"));
        assert!(
            said.starts_with("incomplete"),
            "{scenario}: {} is {said}",
            cut.call_id
        );
    }
}

#[test]
fn no_sub_agents_call_shows_as_cut_off_before_its_result_arrives() {
    for scenario in scenarios() {
        assert_no_call_cut_off(&replay(&scenario), &scenario, None);
    }
}

#[test]
fn nineteen_under_an_older_cli_the_call_the_interrupt_killed_shows_cut_off_and_stays_so_after_its_result()
 {
    // Lines an older CLI (2.1.282) sent; the current version makes no such call (see the test
    // after this).
    let scenario = "19-interrupt-background";
    let steps = replay_from(scenario, &legacy_excerpt(scenario));
    // The interrupt killed the background agent and its Bash (task_updated killed at the
    // excerpt's line 20, task_notification stopped), so the call shows incomplete with no result
    // until the rejection arrives at line 28 as its result (an error) - it stays incomplete. How
    // the tree should tell an interrupt from a rejection is still open.
    assert_no_call_cut_off(
        &steps,
        scenario,
        Some(Cut {
            call_id: "toolu_01JQzJgds9jxAZS6KpB3yPYh",
            from_line: 20,
        }),
    );
}

#[test]
fn capture_19_the_sub_agents_bash_the_cli_blocked_is_complete_with_its_error_and_the_killed_agent_call_is_cut_off()
 {
    // 2.1.325 blocks the sub-agent's foreground `sleep 60 && ...` before it runs, so the
    // interrupt kills only the agent: its call ends incomplete, and the Bash ends with the CLI's
    // error as its result.
    let tree = final_tree("19-interrupt-background");
    let found = calls(thread_of(&tree));
    let agent = call(&found, "toolu_01BiqomDJ1sVovYfssAzASCx");
    let said = status(agent).expect("a call has a status");
    assert!(said.starts_with("incomplete"), "{said}");
    let under = calls(agent);
    let bash = call(&under, "toolu_01FAgiPzfH8134p6bKg7pKXJ");
    assert_eq!(Some("complete".to_owned()), status(bash));
    assert_eq!(Some(&Value::Bool(true)), bash.get("isError"));
}

#[test]
fn captures_10_and_11_the_sub_agents_second_run_shows_its_call_running_until_the_result() {
    // 10: lines an older CLI (2.1.282) sent; the current version makes no second run in 10. 11
    // still has one.
    for (scenario, read, steps) in [
        (
            "10-background-task",
            "toolu_01TLAR4CsrnQ4L8vCyxGTJXg",
            replay_from("10-background-task", &legacy_excerpt("10-background-task")),
        ),
        (
            "11-background-followup",
            "toolu_015a6ZhgFQhMA7NgEDjGokyi",
            replay("11-background-followup"),
        ),
    ] {
        let mut seen: Vec<String> = Vec::new();
        for step in steps {
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
    let first = call(&found, "toolu_01E79HHrgMyadV8MCS46uqpP");
    let second = call(&found, "toolu_013HREkWuoSa8wpsKe2fduA1");
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
            call(&under_first, "toolu_01VKkb2wZN3mNsdhYJMXgaAG"),
            "result"
        )
        .expect("a result")
        .starts_with("1\t# NOTES")
    );
    assert!(
        str(
            call(&under_second, "toolu_019BKjQdHjgkQak6Coft7SBJ"),
            "result"
        )
        .expect("a result")
        .starts_with("1\t# GUIDE")
    );
    assert!(
        !under_first.contains_key("toolu_019BKjQdHjgkQak6Coft7SBJ"),
        "each sub-agent's calls stay under its own call"
    );
}

#[test]
fn capture_10_one_turn_message_then_a_message_the_cli_said_on_its_own() {
    let tree = final_tree("10-background-task");
    let thread = thread_of(&tree);
    assert_eq!(
        vec![
            "send-1",
            "d4fed6c0-ab40-495c-9ef9-ef10a67ccae1",
            "msg_011CScrubbed4itd4JRxk33t",
        ],
        keys(thread)
    );
    assert_eq!(
        vec![Some("user"), Some("assistant"), Some("assistant")],
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
        ],
        messages(thread)
            .iter()
            .map(|m| status(m))
            .collect::<Vec<_>>()
    );
    assert!(
        parts(message(thread, "msg_011CScrubbed4itd4JRxk33t"))
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
            keys(thread_of(&step.tree)).contains(&"msg_011CScrubbed4itd4JRxk33t".to_owned())
        })
        .expect("a step where the resume speaks");
    let thread = thread_of(&speaking.tree);
    assert_eq!(Some(&Value::Bool(true)), thread.get("isRunning"));
    assert_eq!(
        Some("running".to_owned()),
        status(message(thread, "msg_011CScrubbed4itd4JRxk33t"))
    );
}

#[test]
fn capture_11_two_user_turns_the_second_message_where_it_was_sent_then_the_resumes() {
    let tree = final_tree("11-background-followup");
    let thread = thread_of(&tree);
    assert_eq!(
        vec![
            "send-1",
            "137ae7e8-71d8-4325-b5d7-bf495b3391a3",
            "send-2",
            "e489ee2b-236d-4061-bfa3-d0ec69fa8fd2",
            "msg_011CScrubbedFYeqBLKGzXCB",
            "msg_011CScrubbedr1ANx1S2QoGc",
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
            "e489ee2b-236d-4061-bfa3-d0ec69fa8fd2"
        )))
    );
    let found = calls(thread);
    let blocked = call(&found, "toolu_01X5tmhWyS8HbdJ4eDYH7bQo");
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
        message(thread_of(&tree), "2214261d-c819-490e-ade3-07249b64d3f0"),
        "toolu_01Ugvt3iFFuXLnUxzD8HQaim",
    );
    let write = part(
        message(agent, "msg_011CScrubbedFy3MF3W4Zv3W"),
        "toolu_01EQdLNPPVwHuZQYn15Hjf5G",
    );
    let approval = at(&Value::Object(write.clone()), &["approval"]).clone();
    assert_eq!(
        Some("8ede2c03-477c-4eeb-8df6-49eb8b5e8eda"),
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
    let turn = message(thread_of(&tree), "2214261d-c819-490e-ade3-07249b64d3f0");
    assert_eq!(Some("requires-action/interrupt".to_owned()), status(turn));
    let agent = part(turn, "toolu_01Ugvt3iFFuXLnUxzD8HQaim");
    assert_eq!(Some("running".to_owned()), status(agent));
    let found = calls(agent);
    assert_eq!(
        Some("requires-action/interrupt".to_owned()),
        status(call(&found, "toolu_01EQdLNPPVwHuZQYn15Hjf5G"))
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
        Some("83bc36d7-6561-4c72-b33f-019b65e4903e"),
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
    // 2.1.325 answers the away report with this error rather than with the expiry.
    let result = str(&ask, "result").expect("a result");
    assert!(
        result.starts_with(
            "The app reported that nobody answered this question, but Claude Code did not accept the report"
        ),
        "{result}"
    );
}

#[test]
fn fifteen_under_an_older_cli_the_away_report_came_back_as_the_expiry() {
    // Lines an older CLI (2.1.282) sent; the current version does not accept the report.
    let scenario = "15-ask-afktimeout-updatedinput";
    let steps = replay_from(scenario, &legacy_excerpt(scenario));
    let tree = &steps.last().expect("a replay has steps").tree;
    let asks: Vec<Object> = calls(thread_of(tree))
        .into_iter()
        .filter_map(|(_, v)| v.as_object().cloned())
        .filter(|c| str(c, "toolName") == Some("AskUserQuestion"))
        .collect();
    assert_eq!(1, asks.len(), "{scenario}: one question");
    let ask = &asks[0];
    let approval = approval_of(ask);
    assert_eq!(Some("expired"), str(&approval, "resolution"));
    assert_eq!(None, approval.get("approved"));
    assert!(
        str(ask, "result")
            .expect("a result")
            .starts_with("No response after 5s")
    );
}

#[test]
fn captures_01_and_16_show_the_session_the_cli_started_the_mode_16s_status_changed_and_the_total() {
    let tree = final_tree("01-baseline-text");
    let first = Value::Object(thread_of(&tree).clone());
    let session = at(&first, &["session"]);
    assert_eq!(Some("claude-opus-5-5"), str(session, "model"));
    assert_eq!(Some("default"), str(session, "permissionMode"));
    assert_eq!(Some("2.1.325"), str(session, "version"));
    assert_eq!(
        Some(&json!(0.12213600000000001)),
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
        Some(&json!(0.1513491)),
        at(&accepting, &["usage"]).get("costUsd")
    );
}

#[test]
fn capture_03_offers_its_initialize_commands_with_their_sentences_and_01_those_of_its_commands_changed()
 {
    let tree = final_tree("03-initialize-handshake");
    let detailed = objects(thread_of(&tree), "commands");
    assert_eq!(59, detailed.len());
    let config = command_named(&detailed, "config");
    assert_eq!(Some("Set a setting by key"), str(config, "description"));
    assert_eq!(Some("key=value"), str(config, "argumentHint"));
    assert!(detailed.iter().all(|c| {
        !str(c, "description").expect("a description").is_empty()
            || str(c, "name") != Some("config")
    }));
    let tree = final_tree("01-baseline-text");
    let names = objects(thread_of(&tree), "commands");
    assert_eq!(59, names.len());
    let design = command_named(&names, "design");
    assert_eq!(
        Some("Grant or revoke Claude agent access to your Design projects"),
        str(design, "description")
    );
    assert_eq!(Some("consent | revoke"), str(design, "argumentHint"));
    assert_eq!(
        Some("design"),
        str(names[0], "name"),
        "and it is the first the CLI listed"
    );
}

/// The command called `name`, the only one of that name in `commands`.
fn command_named<'a>(commands: &[&'a Object], name: &str) -> &'a Object {
    let found: Vec<&&Object> = commands
        .iter()
        .filter(|c| str(c, "name") == Some(name))
        .collect();
    assert_eq!(1, found.len(), "one command is called {name}");
    found[0]
}

#[test]
fn capture_03_offers_the_models_of_its_initialize_response_with_the_levels_each_takes_and_06_the_context_usage()
 {
    let tree = final_tree("03-initialize-handshake");
    let models = objects(thread_of(&tree), "models");
    assert_eq!(
        vec![
            Some("default"),
            Some("opus"),
            Some("claude-opus-5"),
            Some("sonnet")
        ],
        models
            .iter()
            .take(4)
            .map(|m| str(m, "value"))
            .collect::<Vec<_>>()
    );
    assert_eq!(Some("claude-opus-5-5"), str(models[0], "resolvedModel"));
    assert_eq!(Some(&Value::Bool(true)), models[0].get("supportsEffort"));
    assert_eq!(4, objects_len(models[0], "supportedEffortLevels"));
    let haiku: Vec<&&Object> = models
        .iter()
        .filter(|m| str(m, "value") == Some("claude-haiku-4-5-20251001"))
        .collect();
    assert_eq!(1, haiku.len());
    assert_eq!(
        None,
        haiku[0].get("supportsEffort"),
        "Haiku 4.5 takes no effort"
    );
    let tree = final_tree("06-context-usage");
    let context = at(&tree, &["threads", "byId", THREAD, "context"]);
    assert_eq!(Some(&json!(11645)), context.get("totalTokens"));
    assert_eq!(Some(&json!(1000000)), context.get("maxTokens"));
    assert_eq!(Some(&json!(1)), context.get("percentage"));
    assert_eq!(Some(&json!(967000)), context.get("autoCompactThreshold"));
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
        38,
        with_initialize.len(),
        "38 captures carry an initialize response"
    );
    for (scenario, tree) in &with_initialize {
        // Every response carries the mode: 19 was started in acceptEdits, 29 in plan, 37 in auto,
        // 44 in dontAsk, the rest in default.
        let expected = match scenario.as_str() {
            "19-interrupt-background" => "acceptEdits",
            "29-exit-plan-mode" => "plan",
            "37-plan-auto" => "auto",
            "44-permission-denied" => "dontAsk",
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
    assert_eq!(Some(&json!(0.21946859999999999)), usage.get("costUsd"));
    assert_eq!(
        Some(&json!(1519)),
        usage.get("outputTokens"),
        "the last result's, not 256 + 1519"
    );
    let tree = final_tree("21-compact");
    let compacted = thread_of(&tree);
    let compactions = objects(compacted, "compactions");
    assert_eq!(1, compactions.len());
    assert_eq!(Some("manual"), str(compactions[0], "trigger"));
    assert_eq!(Some(&json!(21819)), compactions[0].get("preTokens"));
    assert_eq!(Some(&json!(3447)), compactions[0].get("postTokens"));
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
            "a592487ec976885dc",
        ],
    );
    assert_eq!(
        Some("toolu_01S4aVxTAg6iR87daCuzkwZQ"),
        str(sub, "toolCallId")
    );
    assert_eq!(Some("Explore"), str(sub, "agentType"));
    assert_eq!(Some(&Value::Bool(false)), sub.get("background"));
    assert_eq!(Some("complete"), str(sub, "status"));
    let tree = final_tree("10-background-task");
    let background = thread_of(&tree);
    // The sub-agent and its Bash in the background, then the sub-agent's own foreground Bash
    // (`until grep`).
    assert_eq!(
        vec!["a40aca0599667cba4", "b9eajvrtk", "bho6ze5ur"],
        keys_of(background, "tasks")
    );
    assert_eq!(
        vec![
            Some(&Value::Bool(true)),
            Some(&Value::Bool(true)),
            Some(&Value::Bool(false))
        ],
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
