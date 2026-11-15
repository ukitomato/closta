//! Where content goes follows what core decided about the same input, not a copy of core's rule
//! (CoreDecisionTest.kt).

use std::sync::Arc;

use closta_goldens::lines::{self, RequestLine};
use closta_goldens::session::Session;
use closta_goldens::tree_reading::{keys_of, message, status};
use closta_model::{ApprovalKind, ConversationState, PendingApproval};
use closta_presenter::fold::fold_transcript;
use closta_presenter::input::PresenterInput;
use closta_presenter::session::SessionView;
use closta_presenter::transcript::Transcript;
use serde_json::Value;

fn text(id: &str, said: &str) -> closta_model::AgentEvent {
    lines::assistant(id, &lines::text(said), None)
}

#[test]
fn a_second_result_for_a_turn_core_already_closed_ends_the_open_resume() {
    let mut session = Session::default();
    session.send("s1", "go");
    session.turn("cmdX");
    session.events([text("m1", "done"), lines::result(Some("cmdX"))]);
    session.events([text("msg_r", "and one more thing")]);
    assert_eq!(
        Some("running".into()),
        status(message(session.thread(), "msg_r"))
    );
    session.events([lines::result(Some("cmdX"))]);
    assert_eq!(
        1,
        session.conversation().spontaneous_resume_count,
        "core closed nothing and counted a resume"
    );
    assert_eq!(
        Some("complete/stop".into()),
        status(message(session.thread(), "msg_r"))
    );
    assert_eq!(Some(&Value::Bool(false)), session.thread().get("isRunning"));
}

#[test]
fn a_result_that_closes_the_current_turn_stops_routing_content_to_it() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([lines::result(Some("c1")), text("m9", "on my own")]);
    assert_eq!(vec!["c1", "m9"], keys_of(session.thread(), "messages"));
    assert!(keys_of(message(session.thread(), "c1"), "parts").is_empty());
}

#[test]
fn a_result_for_an_earlier_turn_leaves_the_turn_that_started_after_it_receiving_content() {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        text("m1", "one"),
        lines::queued("c2"),
        lines::started("c2"),
        lines::result(Some("c1")),
    ]);
    session.events([text("m2", "two")]);
    assert_eq!(
        vec!["c1", "c2"],
        keys_of(session.thread(), "messages"),
        "no resume opened"
    );
    assert_eq!(
        vec!["m2:0"],
        keys_of(message(session.thread(), "c2"), "parts")
    );
    assert_eq!(
        Some("running".into()),
        status(message(session.thread(), "c2"))
    );
}

#[test]
fn a_request_is_a_question_when_core_holds_it_as_one_and_keeps_its_kind_when_core_holds_nothing_for_it()
 {
    let question = PresenterInput::Event(RequestLine::new("r1", "AskUserQuestion", None).event());
    let ask_of = |transcript: &Transcript| transcript.approvals.get("r1").expect("r1").ask;
    let nothing = ConversationState::default();

    let asked = SessionView::default().fold(&question);
    assert!(ask_of(&asked.transcript), "core's kind for it is ASK");
    let bare = fold_transcript(&Arc::default(), &question, &nothing, &nothing);
    assert!(!ask_of(&bare), "nothing from core: not a question");
    let again = fold_transcript(&asked.transcript, &question, &asked.conversation, &nothing);
    assert!(
        ask_of(&again),
        "nothing from core this time: the record keeps its kind"
    );
    let plain = ConversationState {
        pending_approvals: vec![PendingApproval {
            request_id: "r1".into(),
            kind: ApprovalKind::Approval,
            tool_use_id: None,
            agent_id: None,
        }]
        .into(),
        ..ConversationState::default()
    };
    let told = fold_transcript(&Arc::default(), &question, &nothing, &plain);
    assert!(
        !ask_of(&told),
        "core says it is not a question, whatever the tool name"
    );
}

#[test]
fn the_thread_runs_from_a_send_until_core_opens_a_turn_for_it() {
    let mut session = Session::default();
    session.send("s1", "one");
    session.send("s2", "two");
    session.events([lines::queued("c1")]);
    assert_eq!(Some(&Value::Bool(true)), session.thread().get("isRunning"));
    session.events([lines::started("c1"), lines::result(Some("c1"))]);
    assert_eq!(
        Some(&Value::Bool(true)),
        session.thread().get("isRunning"),
        "one send is not taken yet"
    );
    session.events([
        lines::queued("c2"),
        lines::started("c2"),
        lines::result(Some("c2")),
    ]);
    assert_eq!(Some(&Value::Bool(false)), session.thread().get("isRunning"));
}
