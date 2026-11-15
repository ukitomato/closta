//! What the host did with an approval's answer, as the tree shows it: the suggestions it passed on,
//! the input it sent when that is a rewrite, and the answers it could not pass on
//! (ApprovalAnswerProjectionTest.kt).

use std::sync::Arc;

use closta_goldens::lines::{self, RequestLine};
use closta_goldens::session::Session;
use closta_goldens::tree_reading::{message, part};
use closta_model::ApprovalDecision;
use closta_presenter::input::{AnswerFailed, Decided, PassedOn, PresenterInput};
use closta_presenter::json::parse;
use serde_json::{Map, Value, json};

const SUGGESTIONS: &str = concat!(
    r#"[{"type":"setMode","mode":"acceptEdits","destination":"session"},"#,
    r#"{"type":"addDirectories","directories":["/a","/b"],"destination":"userSettings"}]"#
);
const INPUT: &str = r#"{"command":"ls"}"#;

fn asked() -> Session {
    let mut session = Session::default();
    session.turn("c1");
    session.events([
        lines::assistant("m1", &lines::tool_use("toolu_1", "Bash", INPUT), None),
        RequestLine {
            input: INPUT,
            suggestions: Some(SUGGESTIONS),
            ..RequestLine::new("r1", "Bash", Some("toolu_1"))
        }
        .event(),
    ]);
    session
}

fn approval(session: &Session) -> &Map<String, Value> {
    part(message(session.thread(), "c1"), "toolu_1")
        .get("approval")
        .and_then(Value::as_object)
        .unwrap_or_else(|| panic!("no approval"))
}

fn allow() -> ApprovalDecision {
    ApprovalDecision::Allow {
        request_id: "r1".into(),
    }
}

fn deny() -> ApprovalDecision {
    ApprovalDecision::Deny {
        request_id: "r1".into(),
    }
}

fn decided(decision: ApprovalDecision, passed_on: PassedOn) -> PresenterInput {
    PresenterInput::Decided(Decided {
        decision,
        elapsed_ms: 1_000,
        passed_on,
    })
}

fn object(text: &str) -> Option<Arc<Map<String, Value>>> {
    match parse(text) {
        Some(Value::Object(fields)) => Some(Arc::new(fields)),
        _ => panic!("not an object: {text}"),
    }
}

fn failed(approval_id: &str, message: &str) -> PresenterInput {
    PresenterInput::AnswerFailed(AnswerFailed {
        approval_id: approval_id.into(),
        message: message.into(),
    })
}

#[test]
fn an_allow_that_passed_suggestions_on_shows_their_ids_and_one_that_did_not_shows_none() {
    let accepted_on = || PassedOn {
        accepted_suggestions: vec!["s1".into()],
        ..PassedOn::default()
    };
    let mut accepted = asked();
    accepted.input(decided(allow(), accepted_on()));
    assert_eq!(
        Some(&json!(["s1"])),
        approval(&accepted).get("acceptedSuggestions")
    );

    let mut plain = asked();
    plain.decide(allow());
    assert_eq!(None, approval(&plain).get("acceptedSuggestions"));

    let mut denied = asked();
    denied.input(decided(deny(), accepted_on()));
    assert_eq!(
        None,
        approval(&denied).get("acceptedSuggestions"),
        "a denial passes nothing on"
    );
}

#[test]
fn a_suggestion_keeps_the_item_as_the_cli_sent_it_and_the_tree_does_not_carry_it() {
    let session = asked();
    let kept = &session
        .transcript()
        .approvals
        .get("r1")
        .expect("r1")
        .suggestions;
    assert_eq!(
        parse(SUGGESTIONS),
        Some(Value::Array(
            kept.iter()
                .map(|it| parse(&it.raw).expect("raw is JSON"))
                .collect()
        ))
    );
    let shown = approval(&session)
        .get("suggestions")
        .and_then(Value::as_array)
        .expect("suggestions");
    assert!(
        !shown
            .iter()
            .any(|it| it.as_object().is_some_and(|it| it.contains_key("raw"))),
        "raw is the host's, not the screen's"
    );
}

#[test]
fn an_input_is_shown_only_when_it_is_not_the_requests_own() {
    let mut same = asked();
    same.input(decided(
        allow(),
        PassedOn {
            input: object(INPUT),
            ..PassedOn::default()
        },
    ));
    assert_eq!(None, approval(&same).get("updatedInput"));

    let mut rewritten = asked();
    rewritten.input(decided(
        allow(),
        PassedOn {
            input: object(r#"{"command":"ls -la"}"#),
            ..PassedOn::default()
        },
    ));
    assert_eq!(
        Some(&json!({"command": "ls -la"})),
        approval(&rewritten).get("updatedInput")
    );

    let mut answered = asked();
    answered.input(decided(
        deny(),
        PassedOn {
            input: object(r#"{"command":"x"}"#),
            ..PassedOn::default()
        },
    ));
    assert_eq!(
        None,
        approval(&answered).get("updatedInput"),
        "a denial runs nothing"
    );
}

#[test]
fn answers_not_passed_on_are_counted_each_one_a_change_and_the_next_answer_clears_the_sentence() {
    let mut session = asked();
    session.input(failed("r1", "could not"));
    let first = approval(&session);
    assert_eq!(Some(&json!("could not")), first.get("failure"));
    assert_eq!(Some(&json!(1)), first.get("failures"));

    session.input(failed("r1", "could not"));
    assert_eq!(
        Some(&json!(2)),
        approval(&session).get("failures"),
        "the same sentence again is still a change"
    );

    session.decide(allow());
    let settled = approval(&session);
    assert_eq!(
        None,
        settled.get("failure"),
        "an answer that went through clears the sentence"
    );
    assert_eq!(
        Some(&json!(2)),
        settled.get("failures"),
        "and keeps the count"
    );
    assert_eq!(Some(&Value::Bool(true)), settled.get("approved"));
}

#[test]
fn a_failure_for_an_approval_that_is_settled_or_unknown_changes_nothing() {
    let mut session = asked();
    session.decide(allow());
    let before = Arc::clone(session.transcript());
    session.input(failed("r1", "late"));
    assert!(
        Arc::ptr_eq(&before, session.transcript()),
        "an approval already settled stays as it ended"
    );
    session.input(failed("nope", "x"));
    assert!(Arc::ptr_eq(&before, session.transcript()));
}

#[test]
fn a_failure_for_an_approval_the_cli_cancelled_changes_nothing_it_is_not_one_still_open_to_answer()
{
    let mut session = asked();
    session.events([lines::result(Some("c1"))]);
    assert_eq!(
        Some(&json!("cancelled")),
        approval(&session).get("resolution")
    );
    let before = Arc::clone(session.transcript());
    session.input(failed("r1", "late"));
    assert!(
        Arc::ptr_eq(&before, session.transcript()),
        "a cancelled approval carries no failure of an answer it could not take"
    );
    assert_eq!(None, approval(&session).get("failure"));
    assert_eq!(None, approval(&session).get("failures"));
}

#[test]
fn the_records_of_a_request_and_its_suggestions_print_without_what_they_hold() {
    let session = asked();
    let record = session.transcript().approvals.get("r1").expect("r1");
    let passed = PassedOn {
        input: object(r#"{"k":"SECRET"}"#),
        ..PassedOn::default()
    };
    let printed = format!("{record:?} {:?} {passed:?}", record.suggestions);
    for secret in ["command", "acceptEdits", "/a", "SECRET", "directories"] {
        assert!(!printed.contains(secret), "{printed}");
    }
}
