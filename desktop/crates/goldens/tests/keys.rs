//! Keys come from two places — the host and the CLI — and every one must be a key the webview
//! accepts (KeysTest.kt).
//!
//! The first case, `of_cli_id` itself, is tested next to `closta_presenter::keyed`. Kotlin's
//! `TreeProjector().project` refuses an empty list and the same thread twice; the projector here
//! takes one thread, so only its refusal of a thread id that is not a key is kept. A collection's
//! order cannot be changed through a cast in Rust at all: what is kept is that a put leaves the
//! collection it was made from as it was.

use std::panic::catch_unwind;
use std::sync::Arc;

use closta_goldens::lines::{self, RequestLine};
use closta_goldens::projector::project_tree;
use closta_goldens::session::Session;
use closta_goldens::tree_reading::{keys_of, message, messages, part, status, str};
use closta_model::{ApprovalDecision, ConversationState};
use closta_presenter::input::SendId;
use closta_presenter::keyed::Keyed;
use closta_presenter::transcript::Transcript;
use serde_json::{Value, json};

#[test]
#[ignore = "needs task 5: foldLifecycle and foldRequest"]
fn cli_ids_that_are_not_keys_are_escaped_wherever_they_name_something_and_still_correlate() {
    let mut session = Session::default();
    session.send("send-1", "go");
    session.turn("7");
    session.events([
        lines::message_start("__proto__"),
        lines::block_start(0, &lines::tool_use("42", "Bash", "{}")),
        lines::assistant(
            "__proto__",
            &lines::tool_use("42", "Bash", r#"{"command":"ls"}"#),
            None,
        ),
        RequestLine::new("0", "Bash", Some("42")).event(),
    ]);
    let waiting = part(message(session.thread(), "id:7"), "id:42").clone();
    assert_eq!(Some(&json!("id:42")), waiting.get("toolCallId"));
    assert_eq!(Some("requires-action/interrupt".into()), status(&waiting));
    assert_eq!(
        Some("0"),
        waiting
            .get("approval")
            .and_then(Value::as_object)
            .and_then(|it| str(it, "id")),
        "the approval keeps the request id the host answers with"
    );
    session.decide(ApprovalDecision::Allow {
        request_id: "0".into(),
    });
    session.events([
        lines::user("u-1", &lines::tool_result("42", "\"ok\"", None), None),
        lines::result(Some("7")),
    ]);
    let done = part(message(session.thread(), "id:7"), "id:42");
    assert_eq!(Some(&json!("ok")), done.get("result"));
    assert_eq!(Some("complete".into()), status(done));
    assert_eq!(
        vec!["send-1", "id:7"],
        keys_of(session.thread(), "messages")
    );
}

#[test]
#[ignore = "needs task 5: foldLifecycle"]
fn a_host_id_that_a_cli_id_also_takes_gets_a_key_of_its_own() {
    let mut session = Session::default();
    session.send("abc", "first");
    session.turn("abc");
    session.send("abc", "again");
    assert_eq!(
        vec!["abc", "abc~2", "abc~3"],
        keys_of(session.thread(), "messages")
    );
    assert_eq!(
        vec![Some("user"), Some("assistant"), Some("user")],
        messages(session.thread())
            .into_iter()
            .map(|it| str(it, "role"))
            .collect::<Vec<_>>()
    );
    assert_eq!(
        vec!["abc~3:0"],
        keys_of(message(session.thread(), "abc~3"), "parts")
    );
}

#[test]
fn the_hosts_ids_must_be_keys() {
    for bad in ["", "12", "__proto__", "constructor", "prototype"] {
        assert_eq!(None, SendId::new(bad), "{bad}");
        let refused = catch_unwind(|| {
            project_tree(&ConversationState::default(), &Transcript::default(), bad)
        });
        assert!(refused.is_err(), "{bad}");
    }
}

#[test]
fn a_put_leaves_the_collection_it_was_made_from_as_it_was() {
    let keyed = Keyed::new()
        .put("a".into(), Arc::new("1"))
        .put("b".into(), Arc::new("2"));
    let more = keyed.put("c".into(), Arc::new("3"));
    assert_eq!(vec!["a", "b"], keyed.order().collect::<Vec<_>>());
    assert_eq!(vec!["a", "b", "c"], more.order().collect::<Vec<_>>());
}
