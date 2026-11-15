//! Approvals and questions sit on the tool call they gate; one that has none gets a part made for
//! it (ApprovalProjectionTest.kt).
//!
//! Kotlin's "an approval-only message keeps its node while nothing it shows changes" checks the
//! tree node's identity, which only its `ProjectionMemo` keeps; the memo is not ported, so the
//! test checks that the transcript is the same `Arc` and the node is equal.

use std::collections::BTreeSet;
use std::sync::Arc;

use closta_goldens::lines::{self, RequestLine, ResultLine};
use closta_goldens::session::Session;
use closta_goldens::tree_reading::{keys_of, message, part, status, str, tool_calls};
use closta_model::{AgentEvent, ApprovalDecision, RawJson};
use closta_presenter::input::PresenterInput;
use serde_json::{Map, Value, json};

const OPTIONS: &str = r#"[{"label":"A","description":"first"},{"label":"B"},{"x":1}]"#;

fn ask() -> String {
    format!(r#"{{"questions":[{{"question":"Which?","options":{OPTIONS}}}]}}"#)
}

fn obj<'a>(node: &'a Map<String, Value>, key: &str) -> &'a Map<String, Value> {
    node.get(key)
        .and_then(Value::as_object)
        .unwrap_or_else(|| panic!("no object '{key}'"))
}

fn approval_of(part: &Map<String, Value>) -> &Map<String, Value> {
    obj(part, "approval")
}

fn items<'a>(node: &'a Map<String, Value>, key: &str) -> Vec<&'a Map<String, Value>> {
    node.get(key)
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("no array '{key}'"))
        .iter()
        .map(|it| {
            it.as_object()
                .unwrap_or_else(|| panic!("not an object: {it}"))
        })
        .collect()
}

fn keys(node: &Map<String, Value>) -> BTreeSet<&str> {
    node.keys().map(String::as_str).collect()
}

fn set<'a>(names: &[&'a str]) -> BTreeSet<&'a str> {
    names.iter().copied().collect()
}

fn allow(id: &str) -> ApprovalDecision {
    ApprovalDecision::Allow {
        request_id: id.into(),
    }
}

fn deny(id: &str) -> ApprovalDecision {
    ApprovalDecision::Deny {
        request_id: id.into(),
    }
}

fn failed(command: Option<&str>, text: &str) -> AgentEvent {
    ResultLine {
        command,
        is_error: true,
        text,
        ..ResultLine::default()
    }
    .event()
}

fn bare(request_id: &str, tool: &str, tool_use_id: Option<&str>) -> AgentEvent {
    RequestLine::new(request_id, tool, tool_use_id).event()
}

fn tool(id: &str, name: &str) -> String {
    lines::tool_use(id, name, "{}")
}

fn assistant(id: &str, block: &str) -> AgentEvent {
    lines::assistant(id, block, None)
}

#[test]
fn an_approval_with_no_tool_call_named_gets_a_part_of_its_own_at_the_end_of_the_last_assistant_message()
 {
    let mut session = Session::default();
    session.send("s1", "go");
    session.turn("c1");
    session.events([
        assistant("m1", &lines::text("I will write.")),
        lines::request("r1", "Write", None, r#"{"file_path":"/x"}"#),
    ]);
    let turn = message(session.thread(), "c1");
    assert_eq!(vec!["m1:0", "approval:r1"], keys_of(turn, "parts"));
    let derived = part(turn, "approval:r1");
    assert_eq!(Some("tool-call"), str(derived, "type"));
    assert_eq!(Some("approval:r1"), str(derived, "toolCallId"));
    assert_eq!(Some("Write"), str(derived, "toolName"));
    assert_eq!(Some(&json!({"file_path": "/x"})), derived.get("args"));
    assert_eq!(Some(r#"{"file_path":"/x"}"#), str(derived, "argsText"));
    assert_eq!(Some("requires-action/interrupt".into()), status(derived));
    assert_eq!(Some("requires-action/interrupt".into()), status(turn));
    assert_eq!(set(&["id", "display", "input"]), keys(approval_of(derived)));

    session.decide(deny("r1"));
    let turn = message(session.thread(), "c1");
    assert_eq!(
        Some(&Value::Bool(false)),
        approval_of(part(turn, "approval:r1")).get("approved")
    );
    assert_eq!(Some("running".into()), status(turn));
    session.events([lines::result(Some("c1"))]);
    assert_eq!(
        Some("incomplete/cancelled".into()),
        status(part(message(session.thread(), "c1"), "approval:r1")),
        "its turn ended without the call"
    );
}

#[test]
fn an_approval_that_arrives_before_its_tool_call_moves_onto_the_call_when_the_call_shows_up() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        assistant("m1", &lines::text("Writing.")),
        lines::request("r1", "Write", Some("toolu_1"), r#"{"file_path":"/x"}"#),
    ]);
    let derived = part(message(session.thread(), "c1"), "toolu_1");
    assert_eq!(Some("Write"), str(derived, "toolName"));
    assert_eq!(Some("r1"), str(approval_of(derived), "id"));
    session.events([assistant(
        "m1",
        &lines::tool_use("toolu_1", "Write", r#"{"file_path":"/x","content":"hi"}"#),
    )]);
    let turn = message(session.thread(), "c1");
    assert_eq!(
        vec!["m1:0", "toolu_1"],
        keys_of(turn, "parts"),
        "one part for the call, where the call is"
    );
    let real = part(turn, "toolu_1");
    assert_eq!(Some("r1"), str(approval_of(real), "id"));
    assert_eq!(Some(&json!("hi")), obj(real, "args").get("content"));
    assert_eq!(Some("requires-action/interrupt".into()), status(real));
}

#[test]
fn an_approval_before_any_assistant_message_gets_a_message_of_its_own_until_one_arrives() {
    let mut session = Session::default();
    session.send("s1", "go");
    session.events([bare("r1", "Bash", None)]);
    assert_eq!(
        vec!["s1", "approval:r1"],
        keys_of(session.thread(), "messages")
    );
    let own = message(session.thread(), "approval:r1");
    assert_eq!(Some("assistant"), str(own, "role"));
    assert_eq!(Some("requires-action/interrupt".into()), status(own));
    let calls = tool_calls(&Value::Object(own.clone()));
    assert_eq!(1, calls.len());
    assert_eq!(
        Some("Bash"),
        calls
            .values()
            .next()
            .and_then(|it| it.get("toolName")?.as_str())
    );
    session.decide(allow("r1"));
    assert_eq!(
        Some("complete/unknown".into()),
        status(message(session.thread(), "approval:r1"))
    );
    session.turn("c1");
    assert_eq!(vec!["s1", "c1"], keys_of(session.thread(), "messages"));
    assert_eq!(
        vec!["approval:r1"],
        keys_of(message(session.thread(), "c1"), "parts")
    );
}

#[test]
fn a_request_without_a_tool_name_shows_an_unknown_tool() {
    let mut session = Session::default();
    session.turn("c1");
    session.input(PresenterInput::Event(AgentEvent::ControlRequest {
        request_id: "r1".into(),
        request: RawJson("not json".into()),
        agent_id: None,
        tool_name: None,
        tool_use_id: None,
    }));
    let derived = part(message(session.thread(), "c1"), "approval:r1");
    assert_eq!(Some("unknown"), str(derived, "toolName"));
    assert_eq!(Some(&json!({})), derived.get("args"));
    assert_eq!(
        Some("not json"),
        str(derived, "argsText"),
        "the request as it came, the only account of the call"
    );
    assert_eq!(
        Some("requires-action/interrupt".into()),
        status(derived),
        "an unreadable request is still one the CLI waits on"
    );
}

#[test]
fn two_requests_for_one_missing_call_make_one_part_showing_the_latest() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        assistant("m1", &lines::text("x")),
        bare("r1", "Bash", Some("toolu_9")),
    ]);
    session.decide(allow("r1"));
    session.events([bare("r2", "Bash", Some("toolu_9"))]);
    let turn = message(session.thread(), "c1");
    assert_eq!(vec!["m1:0", "toolu_9"], keys_of(turn, "parts"));
    assert_eq!(Some("r2"), str(approval_of(part(turn, "toolu_9")), "id"));
}

#[test]
fn a_call_asked_twice_shows_the_latest_request() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        assistant("m1", &tool("toolu_1", "Bash")),
        bare("r1", "Bash", Some("toolu_1")),
    ]);
    session.decide(deny("r1"));
    session.events([bare("r2", "Bash", Some("toolu_1"))]);
    let call = part(message(session.thread(), "c1"), "toolu_1");
    assert_eq!(Some("r2"), str(approval_of(call), "id"));
    assert_eq!(Some("requires-action/interrupt".into()), status(call));
}

#[test]
fn a_derived_part_goes_to_the_last_assistant_message_not_an_earlier_turns() {
    let mut session = Session::default();
    session.send("s1", "one");
    session.turn("c1");
    session.events([
        assistant("m1", &lines::text("first")),
        lines::result(Some("c1")),
    ]);
    session.send("s2", "two");
    session.turn("c2");
    session.events([bare("r1", "Bash", None)]);
    assert_eq!(
        vec!["m1:0"],
        keys_of(message(session.thread(), "c1"), "parts")
    );
    assert_eq!(
        vec!["approval:r1"],
        keys_of(message(session.thread(), "c2"), "parts")
    );
}

#[test]
fn a_failed_resume_result_discards_a_pending_approval_while_the_turn_goes_on() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        assistant("m1", &tool("toolu_1", "Write")),
        bare("r1", "Write", Some("toolu_1")),
    ]);
    let before = Arc::clone(session.transcript());
    session.events([failed(None, "boom")]);
    assert!(
        Arc::ptr_eq(&before, session.transcript()),
        "the transcript has nothing to do with it; only core's pending changed"
    );
    let call = part(message(session.thread(), "c1"), "toolu_1");
    assert_eq!(Some("cancelled"), str(approval_of(call), "resolution"));
    assert_eq!(
        Some("running".into()),
        status(call),
        "its turn is still open"
    );
    assert_eq!(
        Some("running".into()),
        status(message(session.thread(), "c1"))
    );
}

#[test]
fn a_call_asked_twice_shows_the_request_still_waiting_over_a_later_one_already_answered() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        assistant("m1", &tool("toolu_1", "Bash")),
        bare("r1", "Bash", Some("toolu_1")),
        bare("r2", "Bash", Some("toolu_1")),
    ]);
    assert_eq!(
        Some("r2"),
        str(
            approval_of(part(message(session.thread(), "c1"), "toolu_1")),
            "id"
        ),
        "both wait: the latest"
    );
    session.decide(allow("r2"));
    let call = part(message(session.thread(), "c1"), "toolu_1");
    assert_eq!(
        Some("r1"),
        str(approval_of(call), "id"),
        "the one still waiting"
    );
    assert_eq!(Some("requires-action/interrupt".into()), status(call));
    session.decide(allow("r1"));
    assert_eq!(
        Some("r2"),
        str(
            approval_of(part(message(session.thread(), "c1"), "toolu_1")),
            "id"
        ),
        "none waits: the latest"
    );
}

#[test]
fn a_derived_part_stays_in_the_message_its_request_arrived_in() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        assistant("m1", &lines::text("first")),
        bare("r1", "Bash", None),
        lines::result(Some("c1")),
    ]);
    session.send("s2", "two");
    session.turn("c2");
    session.events([assistant("m2", &lines::text("second"))]);
    assert_eq!(
        vec!["m1:0", "approval:r1"],
        keys_of(message(session.thread(), "c1"), "parts")
    );
    assert_eq!(
        vec!["m2:0"],
        keys_of(message(session.thread(), "c2"), "parts")
    );
}

#[test]
fn a_request_that_arrived_before_any_assistant_message_goes_to_the_last_one_once_there_are_some() {
    let mut session = Session::default();
    session.send("s1", "go");
    session.events([bare("r1", "Bash", None)]);
    session.turn("c1");
    session.events([
        assistant("m1", &lines::text("first")),
        lines::result(Some("c1")),
    ]);
    session.send("s2", "two");
    session.turn("c2");
    assert_eq!(
        vec!["m1:0"],
        keys_of(message(session.thread(), "c1"), "parts")
    );
    assert_eq!(
        vec!["approval:r1"],
        keys_of(message(session.thread(), "c2"), "parts")
    );
}

#[test]
fn an_approval_only_message_stays_the_same_while_nothing_it_shows_changes() {
    let mut session = Session::default();
    session.send("s1", "go");
    session.events([bare("r1", "Bash", None)]);
    let before = message(session.thread(), "approval:r1").clone();
    let transcript = Arc::clone(session.transcript());
    session.events([lines::queued("c1")]);
    assert!(
        Arc::ptr_eq(&transcript, session.transcript()),
        "core's turns changed, the transcript did not"
    );
    assert_eq!(&before, message(session.thread(), "approval:r1"));
}

#[test]
fn an_answer_after_the_cli_stopped_waiting_changes_nothing() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        assistant("m1", &tool("toolu_1", "Write")),
        bare("r1", "Write", Some("toolu_1")),
        lines::result(Some("c1")),
    ]);
    let before = Arc::clone(session.transcript());
    session.decide(allow("r1"));
    assert!(Arc::ptr_eq(&before, session.transcript()));
    assert_eq!(
        Some("cancelled"),
        str(
            approval_of(part(message(session.thread(), "c1"), "toolu_1")),
            "resolution"
        )
    );
}

#[test]
fn a_request_asked_again_while_core_holds_it_shows_what_it_asks_now() {
    let mut session = Session::default();
    session.turn("c1");
    let which = r#"{"questions":[{"question":"Which?","options":[{"label":"A"}]}]}"#;
    let which_one = r#"{"questions":[{"question":"Which one?","options":[{"label":"A"}]}]}"#;
    session.events([
        assistant("m1", &tool("toolu_q", "AskUserQuestion")),
        lines::request("r1", "AskUserQuestion", Some("toolu_q"), which),
    ]);
    // Kotlin checks the identity of core's list; core keeps a `Vec`, so it is compared by value.
    let held = session.conversation().pending_approvals.clone();
    session.events([lines::request(
        "r1",
        "AskUserQuestion",
        Some("toolu_q"),
        which_one,
    )]);
    assert_eq!(
        held,
        session.conversation().pending_approvals,
        "core did not enqueue it again"
    );
    assert_eq!(
        Some("Which one?"),
        str(
            approval_of(part(message(session.thread(), "c1"), "toolu_q")),
            "prompt"
        )
    );
}

#[test]
fn an_approval_only_message_shows_the_request_discarded_when_a_failed_result_releases_it() {
    let mut session = Session::default();
    session.send("s1", "go");
    session.events([bare("r1", "Bash", None)]);
    assert_eq!(
        Some("requires-action/interrupt".into()),
        status(message(session.thread(), "approval:r1"))
    );
    let before = Arc::clone(session.transcript());
    session.events([failed(None, "boom")]);
    assert!(
        Arc::ptr_eq(&before, session.transcript()),
        "only core's pending changed"
    );
    let own = message(session.thread(), "approval:r1");
    assert_eq!(Some("complete/unknown".into()), status(own));
    assert_eq!(
        Some("cancelled"),
        str(approval_of(part(own, "approval:r1")), "resolution")
    );
}

#[test]
fn a_pending_request_the_tree_cannot_show_does_not_keep_the_thread_running() {
    let mut session = Session::default();
    session.events([bare("", "Bash", None)]);
    assert_eq!(
        1,
        session.conversation().pending_approvals.len(),
        "core holds it"
    );
    assert!(keys_of(session.thread(), "messages").is_empty());
    assert_eq!(Some(&Value::Bool(false)), session.thread().get("isRunning"));
}

#[test]
fn an_approval_the_turns_result_discarded_shows_as_cancelled() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        assistant("m1", &tool("toolu_1", "Write")),
        bare("r1", "Write", Some("toolu_1")),
    ]);
    session.events([failed(Some("c1"), "interrupted")]);
    let call = part(message(session.thread(), "c1"), "toolu_1");
    assert_eq!(Some("cancelled"), str(approval_of(call), "resolution"));
    assert_eq!(None, approval_of(call).get("approved"));
    assert_eq!(
        Some("incomplete/cancelled".into()),
        status(call),
        "its turn ended and it never ran"
    );
    assert_eq!(
        Some("incomplete/error".into()),
        status(message(session.thread(), "c1"))
    );
}

#[test]
fn a_question_shows_its_first_questions_prompt_and_every_option_with_a_label() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        assistant("m1", &lines::tool_use("toolu_q", "AskUserQuestion", &ask())),
        lines::request("r1", "AskUserQuestion", Some("toolu_q"), &ask()),
    ]);
    let approval = approval_of(part(message(session.thread(), "c1"), "toolu_q"));
    assert_eq!(Some("select"), str(approval, "display"));
    assert_eq!(Some("Which?"), str(approval, "prompt"));
    assert_eq!(
        Some(&json!([
            {"id": "A", "kind": "answer", "label": "A", "description": "first"},
            {"id": "B", "kind": "answer", "label": "B"},
        ])),
        approval.get("options")
    );
}

#[test]
fn a_question_whose_request_does_not_say_what_it_asks_reads_it_from_its_tool_call() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        assistant("m1", &lines::tool_use("toolu_q", "AskUserQuestion", &ask())),
        bare("r1", "AskUserQuestion", Some("toolu_q")),
    ]);
    let approval = approval_of(part(message(session.thread(), "c1"), "toolu_q"));
    assert_eq!(Some("select"), str(approval, "display"));
    assert_eq!(Some("Which?"), str(approval, "prompt"));
    assert_eq!(
        vec![Some("A"), Some("B")],
        items(approval, "options")
            .into_iter()
            .map(|it| str(it, "id"))
            .collect::<Vec<_>>()
    );
}

#[test]
fn a_question_with_no_options_to_read_anywhere_shows_as_a_decision_with_its_text_and_still_settles_as_one()
 {
    let mut session = Session::default();
    session.turn("c1");
    let no_options = r#"{"questions":[{"question":"Which?","options":[{"x":1}]}]}"#;
    session.events([
        assistant(
            "m1",
            &lines::tool_use("toolu_q", "AskUserQuestion", no_options),
        ),
        lines::request("r1", "AskUserQuestion", Some("toolu_q"), no_options),
    ]);
    let approval = approval_of(part(message(session.thread(), "c1"), "toolu_q"));
    let shown: Map<String, Value> = approval
        .iter()
        .filter(|(key, _)| *key != "input" && *key != "questions")
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    assert_eq!(
        json!({"id": "r1", "display": "decision", "prompt": "Which?"}),
        Value::Object(shown)
    );
    // The question is still listed, with the options it has: none.
    let listed = items(approval, "questions");
    assert_eq!(1, listed.len());
    assert_eq!(Some(&json!("q1")), listed[0].get("id"));
    assert_eq!(Some(&json!([])), listed[0].get("options"));
    session.decide_after(allow("r1"), 0);
    assert_eq!(
        Some("cancelled"),
        str(
            approval_of(part(message(session.thread(), "c1"), "toolu_q")),
            "resolution"
        ),
        "an immediate allow of a question is no answer"
    );
}

#[test]
fn options_that_share_a_label_get_ids_of_their_own() {
    let mut session = Session::default();
    session.turn("c1");
    let labels =
        r#"[{"label":"A"},{"label":"A","description":"again"},{"label":"A"},{"label":"A~2"}]"#;
    let shared = format!(r#"{{"questions":[{{"question":"Which?","options":{labels}}}]}}"#);
    session.events([
        assistant(
            "m1",
            &lines::tool_use("toolu_q", "AskUserQuestion", &shared),
        ),
        lines::request("r1", "AskUserQuestion", Some("toolu_q"), &shared),
    ]);
    let approval = approval_of(part(message(session.thread(), "c1"), "toolu_q"));
    let options = items(approval, "options");
    assert_eq!(
        vec![Some("A"), Some("A~2"), Some("A~3"), Some("A~2~2")],
        options.iter().map(|it| str(it, "id")).collect::<Vec<_>>()
    );
    assert_eq!(
        vec![Some("A"), Some("A"), Some("A"), Some("A~2")],
        options
            .iter()
            .map(|it| str(it, "label"))
            .collect::<Vec<_>>()
    );
}

#[test]
fn the_hosts_answer_shows_as_the_approval_mapping_says() {
    fn outcome(
        tool_name: &str,
        decision: fn(&str) -> ApprovalDecision,
        elapsed_ms: i64,
    ) -> (String, Option<String>) {
        let mut session = Session::default();
        session.turn("c1");
        session.events([
            assistant("m1", &tool("toolu_1", tool_name)),
            bare("r1", tool_name, Some("toolu_1")),
        ]);
        session.decide_after(decision("r1"), elapsed_ms);
        let approval = approval_of(part(message(session.thread(), "c1"), "toolu_1"));
        let approved = approval
            .get("approved")
            .map_or_else(|| "-".to_owned(), |it| it.to_string());
        (approved, str(approval, "resolution").map(str::to_owned))
    }
    fn answered(id: &str) -> ApprovalDecision {
        ApprovalDecision::Answered {
            request_id: id.into(),
        }
    }
    fn afk(id: &str) -> ApprovalDecision {
        ApprovalDecision::AfkTimeout {
            request_id: id.into(),
        }
    }
    let said = |approved: &str, resolution: Option<&str>| {
        (approved.to_owned(), resolution.map(str::to_owned))
    };
    assert_eq!(said("true", None), outcome("Write", allow, 0));
    assert_eq!(said("true", None), outcome("Write", allow, 5_000));
    assert_eq!(said("false", None), outcome("Write", deny, 5_000));
    assert_eq!(said("true", None), outcome("Write", answered, 5_000));
    assert_eq!(said("-", Some("expired")), outcome("Write", afk, 5_000));
    assert_eq!(
        said("-", Some("cancelled")),
        outcome("AskUserQuestion", allow, 0)
    );
    assert_eq!(
        said("-", Some("cancelled")),
        outcome("AskUserQuestion", allow, 5_000),
        "held or not, an allow without answers is no answer"
    );
    assert_eq!(said("false", None), outcome("AskUserQuestion", deny, 0));
    assert_eq!(said("true", None), outcome("AskUserQuestion", answered, 0));
    assert_eq!(
        said("-", Some("expired")),
        outcome("AskUserQuestion", afk, 5_000)
    );
}

#[test]
fn an_answer_to_a_request_nobody_asked_changes_nothing() {
    let mut session = Session::default();
    session.turn("c1");
    let before = Arc::clone(session.transcript());
    session.decide(allow("nobody"));
    assert_eq!(before, *session.transcript());
    assert!(Arc::ptr_eq(&before, session.transcript()));
}

#[test]
fn an_approval_waiting_on_a_sub_agents_call_makes_its_turn_wait_too() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        assistant("m1", &tool("agent", "Agent")),
        lines::task_started("task-1", "agent", false),
        lines::assistant("m2", &tool("write", "Write"), Some("agent")),
        RequestLine {
            agent_id: Some("task-1"),
            ..RequestLine::new("r1", "Write", Some("write"))
        }
        .event(),
    ]);
    let turn = message(session.thread(), "c1");
    assert_eq!(Some("requires-action/interrupt".into()), status(turn));
    assert_eq!(Some("running".into()), status(part(turn, "agent")));
    assert_eq!(
        Some("requires-action/interrupt".into()),
        status(part(message(part(turn, "agent"), "m2"), "write"))
    );
}

#[test]
fn the_clis_suggestions_show_by_kind_detail_and_destination_each_with_the_id_of_its_place() {
    let mut session = Session::default();
    session.turn("c1");
    let offered = concat!(
        r#"[{"type":"setMode","mode":"acceptEdits","destination":"session"},"#,
        r#"{"kind":"no type here"},"#,
        r#"{"type":"addDirectories","directories":["/a","/b"],"destination":"projectSettings"},"#,
        r#"{"type":"addRules","rules":[{"toolName":"Bash"}]}]"#
    );
    session.events([
        assistant(
            "m1",
            &lines::tool_use("toolu_1", "Write", r#"{"file_path":"/x"}"#),
        ),
        RequestLine {
            input: r#"{"file_path":"/x"}"#,
            suggestions: Some(offered),
            ..RequestLine::new("r1", "Write", Some("toolu_1"))
        }
        .event(),
    ]);
    let approval = approval_of(part(message(session.thread(), "c1"), "toolu_1"));
    let suggestions = items(approval, "suggestions");
    let field =
        |key: &str| -> Vec<Option<&str>> { suggestions.iter().map(|it| str(it, key)).collect() };
    assert_eq!(
        vec![Some("s1"), Some("s3"), Some("s4")],
        field("id"),
        "ids by place in the CLI's list"
    );
    assert_eq!(
        vec![Some("setMode"), Some("addDirectories"), Some("addRules")],
        field("kind")
    );
    assert_eq!(
        vec![Some("acceptEdits"), Some("/a\n/b"), Some("Bash")],
        field("detail")
    );
    assert_eq!(
        vec![Some("session"), Some("projectSettings"), None],
        field("destination")
    );
    assert_eq!(
        set(&["id", "kind", "detail"]),
        keys(suggestions[2]),
        "no destination when the CLI gave none"
    );
    assert_eq!(Some(&json!({"file_path": "/x"})), approval.get("input"));
}

#[test]
fn a_request_without_suggestions_or_with_an_input_that_is_not_an_object_shows_neither() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        assistant("m1", &tool("toolu_1", "Bash")),
        lines::request("r1", "Bash", Some("toolu_1"), "[1,2]"),
    ]);
    let approval = approval_of(part(message(session.thread(), "c1"), "toolu_1"));
    assert_eq!(None, approval.get("suggestions"));
    assert_eq!(None, approval.get("input"));
}

#[test]
fn two_questions_are_both_listed_with_their_own_ids_and_the_first_is_still_the_prompt_and_options()
{
    let mut session = Session::default();
    session.turn("c1");
    let two = concat!(
        r#"{"questions":["#,
        r#"{"question":"A or B?","multiSelect":false,"#,
        r#""options":[{"label":"A","description":"first"},{"label":"B"}]},"#,
        r#"{"question":"X or Y?","multiSelect":true,"options":[{"label":"X"},{"label":"X"}]}]}"#
    );
    session.events([
        assistant("m1", &lines::tool_use("toolu_q", "AskUserQuestion", two)),
        lines::request("r1", "AskUserQuestion", Some("toolu_q"), two),
    ]);
    let approval = approval_of(part(message(session.thread(), "c1"), "toolu_q"));
    let ids = |nodes: Vec<&Map<String, Value>>| -> Vec<Option<String>> {
        nodes
            .into_iter()
            .map(|it| str(it, "id").map(str::to_owned))
            .collect()
    };
    let owned = |names: &[&str]| -> Vec<Option<String>> {
        names.iter().map(|it| Some((*it).to_owned())).collect()
    };
    assert_eq!(Some("A or B?"), str(approval, "prompt"));
    assert_eq!(owned(&["A", "B"]), ids(items(approval, "options")));
    let questions = items(approval, "questions");
    assert_eq!(owned(&["q1", "q2"]), ids(questions.clone()));
    assert_eq!(
        vec![Some("A or B?"), Some("X or Y?")],
        questions
            .iter()
            .map(|it| str(it, "prompt"))
            .collect::<Vec<_>>()
    );
    assert_eq!(
        vec![Some(&Value::Bool(false)), Some(&Value::Bool(true))],
        questions
            .iter()
            .map(|it| it.get("multiSelect"))
            .collect::<Vec<_>>()
    );
    assert_eq!(owned(&["A", "B"]), ids(items(questions[0], "options")));
    assert_eq!(
        Some("first"),
        str(items(questions[0], "options")[0], "description")
    );
    assert_eq!(
        owned(&["X", "X~2"]),
        ids(items(questions[1], "options")),
        "unique within a question"
    );
    assert_eq!(
        set(&["id", "label"]),
        keys(items(questions[0], "options")[1])
    );
}

#[test]
fn the_questions_come_from_the_calls_own_input_when_the_request_names_none() {
    let mut session = Session::default();
    session.turn("c1");
    let two = concat!(
        r#"{"questions":[{"question":"One?","options":[{"label":"A"}]},"#,
        r#"{"question":"Two?","options":[{"label":"B"}]}]}"#
    );
    session.events([
        assistant("m1", &lines::tool_use("toolu_q", "AskUserQuestion", two)),
        bare("r1", "AskUserQuestion", Some("toolu_q")),
    ]);
    let approval = approval_of(part(message(session.thread(), "c1"), "toolu_q"));
    assert_eq!(
        vec![Some("q1"), Some("q2")],
        items(approval, "questions")
            .into_iter()
            .map(|it| str(it, "id"))
            .collect::<Vec<_>>()
    );
    assert_eq!(Some("One?"), str(approval, "prompt"));
}

#[test]
fn an_approval_that_is_not_a_question_has_no_questions() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        assistant("m1", &tool("toolu_1", "Bash")),
        lines::request("r1", "Bash", Some("toolu_1"), &ask()),
    ]);
    assert_eq!(
        None,
        approval_of(part(message(session.thread(), "c1"), "toolu_1")).get("questions")
    );
}
