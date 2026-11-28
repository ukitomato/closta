//! What the composer is offered, as the tree shows it (ComposerProjectionTest.kt).
//!
//! Not ported: the selection and apply answers (those inputs are not ported). Kotlin checks the
//! identity of the thread node and of its fields, which only its `ProjectionMemo` keeps; the memo
//! is not ported, so these tests check that the transcript (or the record) is the same `Arc` and
//! that the tree is equal.

use std::sync::Arc;

use closta_goldens::lines::{self, InitLine};
use closta_goldens::session::Session;
use closta_goldens::tree_reading::str;
use closta_presenter::input::PresenterInput;
use closta_presenter::records::composer::{ComposerFailure, FileSearchRecord};
use serde_json::{Map, Value, json};

fn obj<'a>(node: &'a Map<String, Value>, key: &str) -> &'a Map<String, Value> {
    node.get(key)
        .and_then(Value::as_object)
        .unwrap_or_else(|| panic!("no object '{key}'"))
}

fn commands(session: &Session) -> Vec<&Map<String, Value>> {
    session
        .thread()
        .get("commands")
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("no commands"))
        .iter()
        .map(|it| {
            it.as_object()
                .unwrap_or_else(|| panic!("not an object: {it}"))
        })
        .collect()
}

fn search(command_id: &str, matched: &str, paths: &[&str], truncated: bool) -> FileSearchRecord {
    FileSearchRecord {
        command_id: command_id.into(),
        r#match: matched.into(),
        paths: paths.iter().map(|it| (*it).to_owned()).collect(),
        truncated,
        failure: None,
    }
}

#[test]
fn a_thread_has_no_commands_or_file_search_until_the_host_says() {
    let session = Session::default();
    let thread = session.thread();
    for key in ["commands", "fileSearch", "selection", "applied"] {
        assert_eq!(None, thread.get(key), "{key}");
    }
}

#[test]
fn the_commands_of_the_initialize_response_reach_the_thread_with_their_sentence_and_hint_in_the_clis_order()
 {
    let mut session = Session::default();
    session.events([lines::initialized(
        concat!(
            r#"{"commands":[{"name":"config","description":"Set a setting by key","argumentHint":"key=value"},"#,
            r#"{"name":"help","description":"Help","argumentHint":""}]}"#
        ),
        "init-1",
    )]);
    let commands = commands(&session);
    assert_eq!(
        vec![Some("config"), Some("help")],
        commands
            .iter()
            .map(|it| str(it, "name"))
            .collect::<Vec<_>>()
    );
    let named = |name: &str| {
        let found: Vec<_> = commands
            .iter()
            .filter(|it| str(it, "name") == Some(name))
            .collect();
        assert_eq!(1, found.len(), "one command is called {name}");
        *found[0]
    };
    let (config, help) = (named("config"), named("help"));
    assert_eq!(Some("Set a setting by key"), str(config, "description"));
    assert_eq!(Some("key=value"), str(config, "argumentHint"));
    assert_eq!(None, help.get("argumentHint"), "an empty hint is no hint");
}

#[test]
fn the_names_of_system_init_reach_the_thread_with_an_empty_sentence_while_no_response_has_given_more()
 {
    let mut session = Session::default();
    session.events([InitLine {
        slash_commands: r#"["context","config"]"#,
        ..InitLine::default()
    }
    .event()]);
    assert_eq!(
        vec![(Some("context"), Some("")), (Some("config"), Some(""))],
        commands(&session)
            .iter()
            .map(|it| (str(it, "name"), str(it, "description")))
            .collect::<Vec<_>>()
    );
}

#[test]
fn a_file_search_answer_reaches_the_thread_under_the_webviews_command_id_and_the_next_one_replaces_it()
 {
    let mut session = Session::default();
    session.input(PresenterInput::FilesFound(search(
        "c7",
        "App",
        &["src/App.kt", "App.md"],
        true,
    )));
    let first = obj(session.thread(), "fileSearch");
    assert_eq!(Some("c7"), str(first, "commandId"));
    assert_eq!(Some("App"), str(first, "match"));
    assert_eq!(Some(&json!(["src/App.kt", "App.md"])), first.get("paths"));
    assert_eq!(Some(&Value::Bool(true)), first.get("truncated"));
    assert_eq!(None, first.get("failure"));
    session.input(PresenterInput::FilesFound(FileSearchRecord {
        failure: Some(ComposerFailure::UNAVAILABLE.into()),
        ..search("c8", "Ap", &[], false)
    }));
    let second = obj(session.thread(), "fileSearch");
    assert_eq!(Some("c8"), str(second, "commandId"));
    assert_eq!(Some(&Value::Bool(false)), second.get("truncated"));
    assert_eq!(Some("unavailable"), str(second, "failure"));
    assert_eq!(Some(&json!([])), second.get("paths"));
}

#[test]
fn an_answer_that_is_the_same_again_leaves_the_transcript_as_the_same_arc() {
    let mut session = Session::default();
    let record = search("c7", "App", &["src/App.kt"], false);
    session.input(PresenterInput::FilesFound(record.clone()));
    let before = Arc::clone(session.transcript());
    let thread = session.thread().clone();
    session.input(PresenterInput::FilesFound(record.clone()));
    assert!(Arc::ptr_eq(&before, session.transcript()));
    assert_eq!(&thread, session.thread());
    session.input(PresenterInput::FilesFound(FileSearchRecord {
        command_id: "c8".into(),
        ..record
    }));
    assert_eq!(
        Some("c8"),
        str(obj(session.thread(), "fileSearch"), "commandId")
    );
}

#[test]
fn an_answer_changes_only_its_own_field_and_a_message_added_later_leaves_it_where_it_was() {
    let mut session = Session::default();
    session.events([lines::initialized(
        r#"{"commands":[{"name":"config","description":"d"}]}"#,
        "init-1",
    )]);
    session.input(PresenterInput::FilesFound(search(
        "c7",
        "App",
        &["a"],
        false,
    )));
    let commands = session.thread().get("commands").cloned();
    let search = session.thread().get("fileSearch").cloned();
    let kept = session.transcript().commands.items.clone();
    session.send("send-1", "hello");
    assert!(Arc::ptr_eq(&kept, &session.transcript().commands.items));
    assert_eq!(commands.as_ref(), session.thread().get("commands"));
    assert_eq!(search.as_ref(), session.thread().get("fileSearch"));
}
