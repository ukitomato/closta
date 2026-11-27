//! Statuses are read from core when the tree is built; these are the paths the captures miss
//! (StatusProjectionTest.kt).

use std::collections::BTreeSet;
use std::sync::Arc;

use closta_goldens::lines::{self, InitLine, RequestLine, ResultLine};
use closta_goldens::projector::project_tree;
use closta_goldens::session::Session;
use closta_goldens::tree_reading::{keys_of, message, messages, part, parts, status, str};
use closta_model::{ApprovalDecision, ConversationState, Turn, TurnPhase};
use closta_presenter::fold::fold_transcript;
use closta_presenter::input::PresenterInput;
use closta_presenter::transcript::Transcript;
use serde_json::{Map, Value, json};

fn obj<'a>(node: &'a Map<String, Value>, key: &str) -> &'a Map<String, Value> {
    node.get(key)
        .and_then(Value::as_object)
        .unwrap_or_else(|| panic!("no object '{key}'"))
}

fn by_id<'a>(node: &'a Map<String, Value>, collection: &str, key: &str) -> &'a Map<String, Value> {
    obj(obj(obj(node, collection), "byId"), key)
}

fn error(node: &Map<String, Value>) -> Option<&str> {
    str(obj(node, "status"), "error")
}

fn keys(node: &Map<String, Value>) -> BTreeSet<&str> {
    node.keys().map(String::as_str).collect()
}

fn is_running(session: &Session) -> Option<&Value> {
    session.thread().get("isRunning")
}

fn failed(command: Option<&str>, text: &str) -> closta_model::AgentEvent {
    ResultLine {
        command,
        is_error: true,
        text,
        ..ResultLine::default()
    }
    .event()
}

fn allow(request_id: &str) -> ApprovalDecision {
    ApprovalDecision::Allow {
        request_id: request_id.into(),
    }
}

fn agent_request() -> closta_model::AgentEvent {
    RequestLine {
        agent_id: Some("task-1"),
        ..RequestLine::new("r1", "Write", Some("write"))
    }
    .event()
}

fn tool(id: &str, name: &str) -> String {
    lines::tool_use(id, name, "{}")
}

#[test]
fn a_failed_turn_ends_incomplete_with_its_result_as_the_error() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        lines::assistant("m1", &lines::text("partial"), None),
        failed(Some("c1"), "API Error: 529"),
    ]);
    let turn = message(session.thread(), "c1");
    assert_eq!(Some("incomplete/error".into()), status(turn));
    assert_eq!(Some("API Error: 529"), error(turn));
    assert_eq!(Some(&Value::Bool(false)), is_running(&session));
}

#[test]
fn a_failure_that_says_nothing_has_no_error() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([failed(Some("c1"), "")]);
    let turn = message(session.thread(), "c1");
    assert_eq!(
        BTreeSet::from(["type", "reason"]),
        keys(obj(turn, "status"))
    );
    assert_eq!(Some("incomplete/error".into()), status(turn));
}

#[test]
fn a_sub_agent_asking_after_its_parents_turn_ended_makes_that_message_wait_and_the_thread_run() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        lines::assistant("m1", &tool("agent", "Agent"), None),
        lines::task_started("task-1", "agent", false),
        lines::result(Some("c1")),
        lines::assistant("m2", &tool("write", "Write"), Some("agent")),
        agent_request(),
    ]);
    let turn = message(session.thread(), "c1");
    assert_eq!(Some("requires-action/interrupt".into()), status(turn));
    let nested = message(part(turn, "agent"), "m2");
    assert_eq!(
        Some("requires-action/interrupt".into()),
        status(part(nested, "write"))
    );
    assert_eq!(
        None,
        nested.get("status"),
        "a sub-agent's message has none, even while it waits"
    );
    assert_eq!(Some(&Value::Bool(true)), is_running(&session));
    session.decide(allow("r1"));
    assert_eq!(
        Some("complete/stop".into()),
        status(message(session.thread(), "c1"))
    );
    assert_eq!(Some(&Value::Bool(false)), is_running(&session));
}

#[test]
fn a_resume_whose_result_leaves_a_request_pending_still_waits_for_the_user() {
    let mut session = Session::default();
    session.events([
        lines::assistant("m9", &tool("toolu_9", "Bash"), None),
        lines::request("r9", "Bash", Some("toolu_9"), "{}"),
        lines::result(None),
    ]);
    assert_eq!(
        1,
        session.conversation().pending_approvals.len(),
        "a successful resume result does not discard the request"
    );
    assert_eq!(
        Some("requires-action/interrupt".into()),
        status(message(session.thread(), "m9"))
    );
    assert_eq!(Some(&Value::Bool(true)), is_running(&session));
    session.decide(allow("r9"));
    assert_eq!(
        Some("complete/stop".into()),
        status(message(session.thread(), "m9"))
    );
    assert_eq!(Some(&Value::Bool(false)), is_running(&session));
}

#[test]
fn a_part_still_streaming_when_its_turn_ends_was_cut_off() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        lines::message_start("m1"),
        lines::block_start(0, &lines::text("")),
        lines::text_delta(0, "Hel"),
    ]);
    let text = |session: &Session| part(message(session.thread(), "c1"), "m1:0").clone();
    assert_eq!(Some("running".into()), status(&text(&session)));
    session.events([lines::result(Some("c1"))]);
    assert_eq!(Some("incomplete/cancelled".into()), status(&text(&session)));
    assert_eq!(Some("Hel"), str(&text(&session), "text"));
    assert_eq!(
        Some("complete/stop".into()),
        status(message(session.thread(), "c1"))
    );
}

#[test]
fn a_stopped_stream_is_complete_even_while_its_turn_runs() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        lines::message_start("m1"),
        lines::block_start(0, &lines::thinking("")),
        lines::thinking_delta(0, "hmm"),
        lines::block_stop(0),
    ]);
    let turn = message(session.thread(), "c1");
    let reasoning = part(turn, "m1:0");
    assert_eq!(Some("reasoning"), str(reasoning, "type"));
    assert_eq!(Some("hmm"), str(reasoning, "text"));
    assert_eq!(Some("complete".into()), status(reasoning));
    assert_eq!(Some("running".into()), status(turn));
}

#[test]
fn a_tool_call_left_without_a_result_when_its_turn_ends_was_cut_off_one_that_runs_is_running() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([lines::assistant("m1", &tool("toolu_1", "Bash"), None)]);
    let call = |session: &Session| status(part(message(session.thread(), "c1"), "toolu_1"));
    assert_eq!(Some("running".into()), call(&session));
    session.events([lines::result(Some("c1"))]);
    assert_eq!(Some("incomplete/cancelled".into()), call(&session));
}

#[test]
fn a_task_decides_its_calls_status_over_the_calls_result_and_a_failed_task_is_an_error() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        lines::assistant("m1", &tool("agent", "Agent"), None),
        lines::task_started("task-1", "agent", false),
        lines::user(
            "u1",
            &lines::tool_result("agent", "\"Async agent launched\"", None),
            None,
        ),
    ]);
    let agent = |session: &Session| part(message(session.thread(), "c1"), "agent").clone();
    assert_eq!(
        Some("running".into()),
        status(&agent(&session)),
        "launched is not done"
    );
    session.events([lines::task_notification("task-1", "agent", "failed")]);
    assert_eq!(Some("incomplete/error".into()), status(&agent(&session)));
    assert_eq!(Some("failed"), error(&agent(&session)));
    session.events([lines::result(Some("c1"))]);
    assert_eq!(
        Some("incomplete/error".into()),
        status(&agent(&session)),
        "the task's end outlives the turn"
    );
}

#[test]
fn a_sub_agents_calls_run_after_the_turn_ends_and_after_its_task_says_complete() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        lines::assistant("m1", &tool("agent", "Agent"), None),
        lines::task_started("task-1", "agent", false),
        lines::result(Some("c1")),
        lines::assistant("m2", &tool("bash", "Bash"), Some("agent")),
    ]);
    let agent = |session: &Session| part(message(session.thread(), "c1"), "agent").clone();
    assert_eq!(
        Some("running".into()),
        status(part(message(&agent(&session), "m2"), "bash"))
    );
    // A re-sent task_started after the notification leaves core's task complete while the
    // sub-agent works on.
    session.events([
        lines::task_notification("task-1", "agent", "completed"),
        lines::task_started("task-1", "agent", false),
    ]);
    session.events([lines::assistant("m3", &tool("read", "Read"), Some("agent"))]);
    let done = agent(&session);
    assert_eq!(Some("complete".into()), status(&done));
    assert_eq!(
        Some("running".into()),
        status(part(message(&done, "m2"), "bash")),
        "no result yet, and nothing cut it off"
    );
    assert_eq!(
        Some("running".into()),
        status(part(message(&done, "m3"), "read"))
    );
    session.events([lines::user(
        "u1",
        &lines::tool_result("read", "\"ok\"", None),
        Some("agent"),
    )]);
    assert_eq!(
        Some("complete".into()),
        status(part(message(&agent(&session), "m3"), "read"))
    );
}

#[test]
fn a_sub_agents_call_without_a_result_is_cut_off_when_the_call_that_started_it_failed_or_was_cut_off()
 {
    let mut failed_task = Session::default();
    failed_task.turn("c1");
    failed_task.events([
        lines::assistant("m1", &tool("agent", "Agent"), None),
        lines::task_started("task-1", "agent", false),
        lines::assistant("m2", &tool("bash", "Bash"), Some("agent")),
        lines::assistant("m2", &tool("read", "Read"), Some("agent")),
        lines::user(
            "u1",
            &lines::tool_result("read", "\"ok\"", None),
            Some("agent"),
        ),
        lines::task_notification("task-1", "agent", "failed"),
    ]);
    let agent = part(message(failed_task.thread(), "c1"), "agent");
    assert_eq!(Some("incomplete/error".into()), status(agent));
    let nested = message(agent, "m2");
    assert_eq!(
        Some("incomplete/cancelled".into()),
        status(part(nested, "bash"))
    );
    assert_eq!(
        Some("complete".into()),
        status(part(nested, "read")),
        "a call with its result is complete"
    );

    let mut cut = Session::default();
    cut.turn("c1");
    cut.events([
        lines::assistant("m1", &tool("agent", "Agent"), None),
        lines::assistant("m2", &tool("bash", "Bash"), Some("agent")),
        lines::assistant("m2", &lines::text("thinking aloud"), Some("agent")),
    ]);
    assert_eq!(
        Some("running".into()),
        status(part(
            message(part(message(cut.thread(), "c1"), "agent"), "m2"),
            "bash"
        ))
    );
    cut.events([failed(Some("c1"), "interrupted")]);
    let cut_agent = part(message(cut.thread(), "c1"), "agent");
    assert_eq!(
        Some("incomplete/cancelled".into()),
        status(cut_agent),
        "no task, no result, and its turn ended"
    );
    let nested = message(cut_agent, "m2");
    assert_eq!(
        Some("incomplete/cancelled".into()),
        status(part(nested, "bash"))
    );
    assert_eq!(
        Some("complete".into()),
        status(part(nested, "m2:1")),
        "nested text was made finished"
    );
}

#[test]
fn a_spontaneous_resume_that_fails_ends_incomplete_with_its_result_as_the_error() {
    let mut session = Session::default();
    session.events([
        lines::message_start("m9"),
        lines::block_start(0, &lines::text("")),
        lines::text_delta(0, "Back."),
    ]);
    assert_eq!(vec!["m9"], keys_of(session.thread(), "messages"));
    assert_eq!(
        Some("running".into()),
        status(message(session.thread(), "m9"))
    );
    assert_eq!(Some(&Value::Bool(true)), is_running(&session));
    session.events([lines::block_stop(0), failed(None, "overloaded")]);
    let resume = message(session.thread(), "m9");
    assert_eq!(Some("incomplete/error".into()), status(resume));
    assert_eq!(Some("overloaded"), error(resume));
    assert_eq!(Some(&Value::Bool(false)), is_running(&session));
}

#[test]
fn content_after_a_resume_ended_opens_the_next_resume() {
    let mut session = Session::default();
    session.events([
        lines::assistant("m1", &lines::text("one"), None),
        lines::result(None),
        lines::assistant("m2", &lines::text("two"), None),
    ]);
    assert_eq!(vec!["m1", "m2"], keys_of(session.thread(), "messages"));
    assert_eq!(
        vec![Some("complete/stop".to_owned()), Some("running".to_owned())],
        messages(session.thread())
            .into_iter()
            .map(status)
            .collect::<Vec<_>>()
    );
}

#[test]
fn a_resume_that_runs_a_tool_spans_two_anthropic_messages_and_is_one_message() {
    let mut session = Session::default();
    session.events([
        lines::message_start("m1"),
        lines::block_start(0, &tool("toolu_1", "Read")),
        lines::assistant(
            "m1",
            &lines::tool_use("toolu_1", "Read", r#"{"file_path":"/f"}"#),
            None,
        ),
        lines::message_stop(),
        lines::user("u1", &lines::tool_result("toolu_1", "\"text\"", None), None),
        lines::message_start("m2"),
        lines::assistant("m2", &lines::text("Read it."), None),
    ]);
    assert_eq!(vec!["m1"], keys_of(session.thread(), "messages"));
    assert_eq!(
        vec!["toolu_1", "m2:0"],
        keys_of(message(session.thread(), "m1"), "parts")
    );
    session.events([lines::result(None)]);
    assert_eq!(
        Some("complete/stop".into()),
        status(message(session.thread(), "m1"))
    );
}

#[test]
fn the_thread_runs_from_a_send_until_the_clis_result_and_stays_running_for_a_send_it_never_took() {
    let mut session = Session::default();
    assert_eq!(Some(&Value::Bool(false)), is_running(&session));
    session.send("s1", "hi");
    assert_eq!(
        Some(&Value::Bool(true)),
        is_running(&session),
        "sent, not yet taken"
    );
    session.events([lines::queued("c1")]);
    assert_eq!(Some(&Value::Bool(true)), is_running(&session), "queued");
    assert_eq!(
        vec!["s1"],
        keys_of(session.thread(), "messages"),
        "a queued turn has no message yet"
    );
    session.events([lines::started("c1"), lines::result(Some("c1"))]);
    assert_eq!(Some(&Value::Bool(false)), is_running(&session));
    session.send("s2", "again");
    assert_eq!(Some(&Value::Bool(true)), is_running(&session));
}

#[test]
fn a_turn_core_does_not_know_shows_as_complete_for_an_unknown_reason() {
    // A transcript that saw a turn start that this core state never saw: the caller passed another
    // conversation.
    let empty = ConversationState::default();
    let transcript = fold_transcript(
        &Arc::new(Transcript::default()),
        &PresenterInput::Event(lines::started("c1")),
        &empty,
        &empty,
    );
    let turn_status = |state: &ConversationState| {
        let tree = project_tree(state, &transcript, "t1");
        status(message(
            closta_goldens::tree_reading::at(&tree, &["threads", "byId", "t1"]),
            "c1",
        ))
    };
    assert_eq!(Some("complete/unknown".into()), turn_status(&empty));
    let open = ConversationState {
        turns: vec![Turn {
            command_uuid: "c1".into(),
            phase: TurnPhase::Open,
            incomplete_reason: None,
            lifecycle_done: false,
        }]
        .into(),
        ..ConversationState::default()
    };
    assert_eq!(Some("running".into()), turn_status(&open));
}

#[test]
fn a_block_of_a_type_this_version_does_not_know_is_a_part_of_that_type_alone() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        lines::assistant("m1", r#"{"type":"redacted_thinking","data":"x"}"#, None),
        lines::assistant("m1", r#"{"type":"tool-call","id":"x"}"#, None),
        lines::assistant("m1", r#"{"data":"no type"}"#, None),
    ]);
    let shown = parts(message(session.thread(), "c1"));
    assert_eq!(
        vec![Some("redacted_thinking"), Some("unknown"), Some("unknown")],
        shown.iter().map(|it| str(it, "type")).collect::<Vec<_>>()
    );
    for shown in shown {
        assert_eq!(BTreeSet::from(["type"]), keys(shown));
    }
}

#[test]
fn user_parts_have_no_status_assistant_parts_do() {
    let mut session = Session::default();
    session.send("s1", "hi");
    session.turn("c1");
    session.events([lines::assistant("m1", &lines::text("yo"), None)]);
    let words = part(message(session.thread(), "s1"), "s1:0");
    assert_eq!(None, words.get("status"));
    assert_eq!(Some("hi"), str(words, "text"));
    assert_eq!(
        Some("complete".into()),
        status(part(message(session.thread(), "c1"), "m1:0"))
    );
}

#[test]
fn a_thread_has_no_session_or_usage_until_the_cli_starts_one_then_its_model_mode_cwd_and_version() {
    let mut session = Session::default();
    assert_eq!(None, session.thread().get("session"));
    assert_eq!(
        None,
        session.thread().get("usage"),
        "no session, so no total to show"
    );
    session.events([InitLine {
        model: "claude-sonnet-5-5",
        mode: "default",
        cwd: "/work",
        ..InitLine::default()
    }
    .event()]);
    let shown = obj(session.thread(), "session");
    assert_eq!(
        BTreeSet::from(["model", "permissionMode", "cwd", "version"]),
        keys(shown)
    );
    assert_eq!(Some("claude-sonnet-5-5"), str(shown, "model"));
    assert_eq!(Some("default"), str(shown, "permissionMode"));
    assert_eq!(Some("/work"), str(shown, "cwd"));
    assert_eq!(Some("2.1.325"), str(shown, "version"));
    assert_eq!(
        Some(&json!(0.0)),
        obj(session.thread(), "usage").get("costUsd"),
        "a total of nothing is still shown"
    );
}

#[test]
fn a_status_that_changes_only_the_permission_mode_shows_in_the_tree() {
    let mut session = Session::default();
    session.events([lines::init()]);
    let before = obj(session.thread(), "session").clone();
    session.events([lines::status("acceptEdits")]);
    let after = obj(session.thread(), "session");
    assert_eq!(Some("acceptEdits"), str(after, "permissionMode"));
    assert_eq!(str(&before, "model"), str(after, "model"));
    assert_eq!(
        Some("default"),
        str(&before, "permissionMode"),
        "the node it replaced is untouched"
    );
}

fn costing(command: &str, cost: f64) -> closta_model::AgentEvent {
    ResultLine {
        command: Some(command),
        cost,
        ..ResultLine::default()
    }
    .event()
}

#[test]
fn a_result_that_changes_only_the_total_shows_the_new_total() {
    let mut session = Session::default();
    session.events([lines::init()]);
    for (command, cost) in [("c1", 0.0123), ("c2", 0.00001), ("c3", 12.5)] {
        session.turn(command);
        session.events([costing(command, cost)]);
        assert_eq!(
            Some(&json!(cost)),
            obj(session.thread(), "usage").get("costUsd")
        );
    }
}

#[test]
fn a_result_that_changes_only_the_total_with_the_turns_and_the_transcript_as_they_were_shows_the_new_total()
 {
    let mut session = Session::default();
    session.events([lines::init()]);
    session.turn("c1");
    session.events([costing("c1", 0.01)]);
    let turns = session.conversation().turns.clone();
    let transcript = Arc::clone(session.transcript());
    // One the CLI sends after its turn closed: core adds it to the total and to nothing else.
    session.events([costing("c1", 0.02)]);
    assert!(
        turns.ptr_eq(&session.conversation().turns),
        "the turns are the same, so only the total can tell"
    );
    assert!(
        Arc::ptr_eq(&transcript, session.transcript()),
        "and the transcript is the same"
    );
    assert_eq!(
        Some(&json!(0.02)),
        obj(session.thread(), "usage").get("costUsd")
    );
}

#[test]
fn a_notice_shows_with_its_kind_and_the_request_it_answers_and_the_next_notice_is_added_after_it() {
    let mut session = Session::default();
    assert_eq!(
        None,
        session.thread().get("notices"),
        "none while there is none"
    );
    session.events([lines::control_error("req-9", "mode not allowed")]);
    let first = by_id(session.thread(), "notices", "notice-1").clone();
    assert_eq!(
        BTreeSet::from(["id", "kind", "text", "requestId"]),
        keys(&first)
    );
    assert_eq!(Some("control-error"), str(&first, "kind"));
    assert_eq!(Some("mode not allowed"), str(&first, "text"));
    assert_eq!(Some("req-9"), str(&first, "requestId"));
    session.events([lines::control_error("req-10", "model unknown")]);
    assert_eq!(
        vec!["notice-1", "notice-2"],
        keys_of(session.thread(), "notices")
    );
    assert_eq!(
        Some("req-10"),
        str(by_id(session.thread(), "notices", "notice-2"), "requestId")
    );
    assert_eq!(
        &first,
        by_id(session.thread(), "notices", "notice-1"),
        "the first is as it was"
    );
}

#[test]
fn a_failed_result_raises_an_error_notice_without_a_request() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([failed(Some("c1"), "API Error: 529")]);
    let notice = by_id(session.thread(), "notices", "notice-1");
    assert_eq!(Some("error"), str(notice, "kind"));
    assert_eq!(Some("API Error: 529"), str(notice, "text"));
    assert_eq!(None, notice.get("requestId"));
}

#[test]
fn a_task_shows_what_started_it_and_how_it_stands_and_the_tool_call_has_the_same_key() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        lines::assistant("m1", &tool("agent", "Agent"), None),
        lines::task_started("task-1", "agent", true),
    ]);
    let running = by_id(session.thread(), "tasks", "task-1");
    let mut shown = keys(running);
    shown.remove("agentType");
    assert_eq!(
        BTreeSet::from(["id", "toolCallId", "background", "status"]),
        shown
    );
    assert_eq!(Some("agent"), str(running, "toolCallId"));
    assert_eq!(Some(&Value::Bool(true)), running.get("background"));
    assert_eq!(Some("running"), str(running, "status"));
    // The key names a part: the tool call is there under it.
    assert_eq!(
        Some("agent"),
        str(part(message(session.thread(), "c1"), "agent"), "toolCallId")
    );
    session.events([lines::task_notification("task-1", "agent", "completed")]);
    assert_eq!(
        Some("complete"),
        str(by_id(session.thread(), "tasks", "task-1"), "status")
    );
    assert_eq!(vec!["task-1"], keys_of(session.thread(), "tasks"));
}

#[test]
fn a_task_that_failed_is_incomplete_with_the_reason_core_kept() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        lines::assistant("m1", &tool("agent", "Agent"), None),
        lines::task_started("task-1", "agent", false),
        lines::task_notification("task-1", "agent", "failed"),
    ]);
    let task = by_id(session.thread(), "tasks", "task-1");
    assert_eq!(Some("incomplete"), str(task, "status"));
    assert_eq!(Some(&Value::Bool(false)), task.get("background"));
    let tasks = &session.conversation().tasks;
    assert_eq!(1, tasks.len(), "one task");
    let kept = &tasks[0];
    assert_eq!(kept.incomplete_reason.as_deref(), str(task, "reason"));
}
