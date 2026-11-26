//! What the tree says of the history of sessions (HistoryProjectionTest.kt): the earlier
//! conversation put back from the record of capture 22 says what the first CLI's own stdout said,
//! ends at a mark, and is not running; the list of saved sessions; a record that could not be read;
//! a resume that was turned down.
//!
//! Kotlin also holds each tree to the contract (`TreeChecks`), which stays on the Kotlin side.

use std::sync::Arc;

use closta_goldens::projector::project_tree;
use closta_goldens::records::read_capture_record;
use closta_goldens::replay::{THREAD, inputs};
use closta_goldens::tree_reading::{at, entries, keys_of, messages, parts, status, str};
use closta_model::{AgentEvent, RawJson, SavedSessionSummary};
use closta_presenter::input::{PresenterInput, ResumeRefusal, ResumeRefused, SessionsListed};
use closta_presenter::json::compact;
use closta_presenter::keyed::of_cli_id;
use closta_presenter::records::history::{HISTORY_UNAVAILABLE_TEXT, RESUME_REFUSED_ELSEWHERE};
use closta_presenter::session::SessionView;
use serde_json::{Map, Value, json};

const SESSION: &str = "336ed47b-2675-4317-b3f5-a3b48abb03a2";
const TIME: &str = "2026-10-17T05:40:20.000Z";
const CAPTURE: &str = "22-resume.ndjson";

fn fold(state: SessionView, inputs: impl IntoIterator<Item = PresenterInput>) -> SessionView {
    inputs
        .into_iter()
        .fold(state, |held, input| held.fold(&input))
}

fn thread(state: &SessionView) -> Map<String, Value> {
    let tree = project_tree(&state.conversation, &state.transcript, THREAD);
    at(&tree, &["threads", "byId", THREAD]).clone()
}

/// What a session that is opened puts back: each line of the record, then the mark.
fn restored(events: Vec<AgentEvent>, dropped: i32) -> SessionView {
    fold(
        SessionView::default(),
        events
            .into_iter()
            .map(PresenterInput::Restored)
            .chain([PresenterInput::HistoryRestored(dropped)]),
    )
}

fn is_mark(input: &PresenterInput) -> bool {
    matches!(input, PresenterInput::Event(AgentEvent::UnknownKind { .. }))
}

/// What the first CLI's own stdout made: the capture's inputs up to the recorder's mark.
fn first_cli() -> SessionView {
    let inputs = inputs("22-resume", false);
    let mark = inputs
        .iter()
        .position(is_mark)
        .unwrap_or_else(|| panic!("the recorder's mark is among the inputs"));
    assert!(mark > 0, "the recorder's mark is among the inputs");
    fold(SessionView::default(), inputs.into_iter().take(mark))
}

/// The record of capture 22, read by the providers' reader as the CLI saved it.
fn record_events() -> Vec<AgentEvent> {
    read_capture_record(CAPTURE).read.events
}

/// A message as the screen would read it, with the keys left out: its role, its status and what
/// its parts say.
fn shape(thread: &Map<String, Value>) -> Vec<String> {
    messages(thread)
        .into_iter()
        .map(|message| {
            let said = parts(message)
                .into_iter()
                .map(|part| {
                    [
                        str(part, "type").map(str::to_owned),
                        str(part, "text").map(|it| format!("\"{it}\"")),
                        str(part, "toolName").map(str::to_owned),
                        // The arguments as the tree parses them: the text a stream spelt them in is
                        // the stream's own.
                        part.get("args").map(|it| format!("args {}", compact(it))),
                        part.get("result")
                            .map(|it| format!("result {}", compact(it))),
                        status(part),
                    ]
                    .into_iter()
                    .flatten()
                    .collect::<Vec<_>>()
                    .join(" ")
                })
                .collect::<Vec<_>>()
                .join(" | ");
            format!(
                "{} {} [{said}]",
                str(message, "role").unwrap_or("null"),
                status(message).as_deref().unwrap_or("null")
            )
        })
        .collect()
}

fn quoted(text: &str) -> String {
    format!("\"{}\"", text.replace('\\', "\\\\").replace('"', "\\\""))
}

fn user(uuid: &str, content: &str) -> AgentEvent {
    AgentEvent::User {
        uuid: uuid.into(),
        session_id: SESSION.into(),
        timestamp: TIME.into(),
        message: RawJson(format!(
            r#"{{"role":"user","content":{}}}"#,
            quoted(content)
        )),
        parent_tool_use_id: None,
        tool_use_result: None,
        subagent_type: None,
        task_description: None,
    }
}

fn assistant(uuid: &str, message: String) -> AgentEvent {
    AgentEvent::Assistant {
        uuid: uuid.into(),
        session_id: SESSION.into(),
        timestamp: TIME.into(),
        request_id: Some("req".into()),
        message: RawJson(message),
        parent_tool_use_id: None,
        user_message_uuid: None,
        user_message_uuids: None,
        wire_tool_inputs: None,
        subagent_type: None,
        task_description: None,
        error: None,
    }
}

fn said(uuid: &str, message_id: &str, text: &str) -> AgentEvent {
    assistant(
        uuid,
        format!(
            r#"{{"id":"{message_id}","role":"assistant","content":[{{"type":"text","text":{}}}]}}"#,
            quoted(text)
        ),
    )
}

fn asked(uuid: &str, message_id: &str, tool_use_id: &str) -> AgentEvent {
    assistant(
        uuid,
        format!(
            concat!(
                r#"{{"id":"{message_id}","role":"assistant","content":["#,
                r#"{{"type":"tool_use","id":"{tool_use_id}","name":"Bash","input":{{"command":"ls"}}}}]}}"#
            ),
            message_id = message_id,
            tool_use_id = tool_use_id
        ),
    )
}

fn roles(thread: &Map<String, Value>) -> Vec<String> {
    messages(thread)
        .into_iter()
        .map(|it| str(it, "role").unwrap_or("null").to_owned())
        .collect()
}

fn texts(message: &Map<String, Value>) -> Vec<Option<String>> {
    parts(message)
        .into_iter()
        .map(|it| str(it, "text").map(str::to_owned))
        .collect()
}

#[test]
fn the_record_of_capture_22_put_back_says_what_the_first_clis_stdout_said() {
    let back = thread(&restored(record_events(), 0));
    let live = thread(&first_cli());

    assert_eq!(
        2,
        messages(&live).len(),
        "the user's words and the assistant's turn"
    );
    assert_eq!(
        shape(&live),
        shape(&back),
        "the same roles, statuses, words, tool and result"
    );
    assert_eq!(vec!["user", "assistant"], roles(&back));
    let last = shape(&back).last().cloned().unwrap_or_default();
    assert!(last.contains("tool-call Bash"), "{:?}", shape(&back));
}

#[test]
fn what_was_put_back_ends_at_a_mark_and_none_of_it_is_running() {
    let back = thread(&restored(record_events(), 0));

    let keys = keys_of(&back, "messages");
    assert_eq!(
        Some(&json!(keys.last().unwrap_or_else(|| panic!("a message")))),
        back.get("restoredUntil")
    );
    assert_eq!(Some(&json!(2)), back.get("restoredCount"));
    assert_eq!(
        None,
        back.get("restoredPartly"),
        "the record was put back whole"
    );
    assert_eq!(
        Some(&json!(false)),
        back.get("isRunning"),
        "a record is not a turn that goes on"
    );
    assert_eq!(
        vec!["complete/stop".to_owned()],
        messages(&back)
            .into_iter()
            .filter_map(status)
            .collect::<Vec<_>>()
    );
}

#[test]
fn a_record_the_host_left_the_oldest_lines_of_out_says_so() {
    let back = thread(&restored(record_events(), 12));

    assert_eq!(Some(&json!(true)), back.get("restoredPartly"));
    assert_eq!(
        Some(&json!(2)),
        back.get("restoredCount"),
        "the count is of messages put back, not of lines"
    );
}

#[test]
fn the_new_turn_of_the_resumed_session_comes_after_the_mark_and_the_mark_stays_where_it_was() {
    let back = restored(record_events(), 0);
    let until = thread(&back).get("restoredUntil").cloned();
    let second: Vec<PresenterInput> = inputs("22-resume", false)
        .into_iter()
        .skip_while(|it| !is_mark(it))
        .skip(1)
        .collect();

    let after = thread(&fold(back, second));

    let keys = keys_of(&after, "messages");
    assert_eq!(
        vec!["user", "assistant", "user", "assistant"],
        roles(&after)
    );
    assert_eq!(
        until.as_ref(),
        after.get("restoredUntil"),
        "what was put back is still what ends at the mark"
    );
    assert_eq!(
        Some(&json!(keys[1])),
        after.get("restoredUntil"),
        "the mark is the second message, before the new turn"
    );
    assert_eq!(Some(&json!(2)), after.get("restoredCount"));
    assert_eq!(
        Some(&json!(false)),
        after.get("isRunning"),
        "the new turn ended with its result"
    );
    let last = messages(&after)
        .into_iter()
        .last()
        .unwrap_or_else(|| panic!("a message"));
    assert_eq!(
        Some("pong".to_owned()),
        texts(last).into_iter().last().flatten()
    );
}

#[test]
fn a_call_without_a_result_before_the_mark_is_not_running_and_the_message_that_holds_it_has_ended()
{
    // The record of a session that was cut off in the middle of a tool call: the call has no
    // result.
    let cut = restored(vec![user("u1", "ls"), asked("a1", "msg_1", "toolu_1")], 0);

    let back = thread(&cut);

    assert_eq!(Some(&json!(false)), back.get("isRunning"));
    let last = messages(&back)
        .into_iter()
        .last()
        .unwrap_or_else(|| panic!("a message"));
    let calls = parts(last);
    assert_eq!(1, calls.len());
    assert_eq!(Some("tool-call"), str(calls[0], "type"));
    assert_eq!(
        Some("incomplete/cancelled".to_owned()),
        status(calls[0]),
        "a call with no result is a call that was cut off"
    );
    assert_eq!(Some("complete/stop".to_owned()), status(last));
}

#[test]
fn without_the_mark_what_the_record_left_open_is_still_running_which_is_what_the_mark_ends() {
    let open = fold(
        SessionView::default(),
        [user("u1", "ls"), asked("a1", "msg_1", "toolu_1")].map(PresenterInput::Restored),
    );

    let before = thread(&open);
    let after = thread(&open.fold(&PresenterInput::HistoryRestored(0)));

    assert_eq!(
        Some(&json!(true)),
        before.get("isRunning"),
        "an assistant message with no end is a running one"
    );
    assert_eq!(Some(&json!(false)), after.get("isRunning"));
}

#[test]
fn what_the_assistant_said_after_the_user_spoke_again_is_a_message_of_its_own() {
    let record = vec![
        user("u1", "first"),
        said("a1", "msg_1", "one"),
        user("u2", "second"),
        said("a2", "msg_2", "two"),
        said("a3", "msg_3", "three"),
    ];

    let back = thread(&restored(record, 0));

    assert_eq!(
        vec!["user", "assistant", "user", "assistant"],
        roles(&back),
        "two turns are two assistant messages, not one"
    );
    let all = messages(&back);
    assert_eq!(vec![Some("one".to_owned())], texts(all[1]));
    assert_eq!(
        vec![Some("two".to_owned()), Some("three".to_owned())],
        texts(all[3])
    );
    assert_eq!(Some(&json!(4)), back.get("restoredCount"));
}

#[test]
fn the_users_words_are_a_message_only_when_they_come_back_from_the_record_never_from_stdout() {
    let line = user("u1", "from stdout");

    let live = thread(&fold(
        SessionView::default(),
        [PresenterInput::Event(line.clone())],
    ));
    let back = thread(&restored(vec![line], 0));

    assert_eq!(
        0,
        messages(&live).len(),
        "the CLI does not echo the user's words, so a line of them is not a message"
    );
    assert_eq!(vec!["user"], roles(&back));
    let only = messages(&back);
    assert_eq!(1, only.len());
    assert_eq!(vec![Some("from stdout".to_owned())], texts(only[0]));
}

#[test]
fn a_user_message_put_back_is_found_again_by_its_key_under_the_uuid_the_record_gave_it() {
    let events = record_events();
    let state = restored(events.clone(), 0);
    let users: Vec<String> = messages(&thread(&state))
        .into_iter()
        .filter(|it| str(it, "role") == Some("user"))
        .filter_map(|it| str(it, "id").map(str::to_owned))
        .collect();
    let uuids: Vec<String> = events
        .iter()
        .filter_map(|it| match it {
            AgentEvent::User {
                uuid,
                parent_tool_use_id: None,
                ..
            } => Some(uuid.clone()),
            _ => None,
        })
        .filter(|uuid| users.contains(&of_cli_id(uuid)))
        .collect();
    assert!(!users.is_empty());
    assert_eq!(users.len(), uuids.len());
    for uuid in &uuids {
        assert_eq!(
            Some(uuid),
            state.transcript.user_uuids.get(&of_cli_id(uuid))
        );
    }
    // What stdout says of a user line is not a message, so it names no uuid.
    let live = fold(
        SessionView::default(),
        [PresenterInput::Event(user("u1", "from stdout"))],
    );
    assert!(live.transcript.user_uuids.is_empty());
}

#[test]
fn a_sub_agents_prompt_put_back_stays_where_a_sub_agents_prompt_is_not_a_message_of_the_thread() {
    let nested = match user("u9", "dig") {
        AgentEvent::User {
            uuid,
            session_id,
            timestamp,
            message,
            tool_use_result,
            subagent_type,
            task_description,
            ..
        } => AgentEvent::User {
            uuid,
            session_id,
            timestamp,
            message,
            parent_tool_use_id: Some("toolu_1".into()),
            tool_use_result,
            subagent_type,
            task_description,
        },
        other => other,
    };

    let back = thread(&restored(vec![asked("a1", "msg_1", "toolu_1"), nested], 0));

    assert_eq!(vec!["assistant"], roles(&back));
}

#[test]
fn an_empty_record_puts_nothing_back_and_marks_nothing() {
    let back = thread(&restored(Vec::new(), 0));

    assert_eq!(0, messages(&back).len());
    assert_eq!(None, back.get("restoredUntil"));
    assert_eq!(None, back.get("restoredCount"));
}

// ---- the list ----

fn summary(id: &str, title: &str, at: i64) -> SavedSessionSummary {
    SavedSessionSummary {
        id: id.into(),
        title: title.into(),
        updated_at_ms: at,
        bytes: 10,
    }
}

fn listed(
    sessions: Vec<SavedSessionSummary>,
    current_id: &str,
    unreadable: bool,
) -> PresenterInput {
    PresenterInput::SessionsListed(SessionsListed {
        sessions,
        current_id: current_id.into(),
        unreadable,
    })
}

fn after(input: PresenterInput) -> SessionView {
    SessionView::default().fold(&input)
}

#[test]
fn the_list_of_saved_sessions_is_the_threads_saved_sessions_with_the_current_one_marked() {
    let input = listed(
        vec![
            summary("a", "Explain the build", 3_000),
            summary("b", "b", 2_000),
        ],
        "b",
        false,
    );

    let saved = thread(&after(input)).get("savedSessions").cloned();

    assert_eq!(
        Some(json!([
            { "id": "a", "title": "Explain the build", "updatedAt": 3_000, "current": false },
            { "id": "b", "title": "b", "updatedAt": 2_000, "current": true },
        ])),
        saved
    );
}

fn saved_count(thread: &Map<String, Value>) -> usize {
    thread
        .get("savedSessions")
        .and_then(Value::as_array)
        .map_or(0, Vec::len)
}

#[test]
fn a_new_list_replaces_the_last_an_empty_one_is_a_list_and_none_has_no_key() {
    let none = thread(&SessionView::default());
    let first = after(listed(vec![summary("a", "x", 1)], "z", false));
    let empty = first.clone().fold(&listed(Vec::new(), "z", false));

    assert_eq!(None, none.get("savedSessions"), "not listed yet");
    assert_eq!(1, saved_count(&thread(&first)));
    assert_eq!(
        Some(&json!([])),
        thread(&empty).get("savedSessions"),
        "listed, and the project has none"
    );
}

#[test]
fn a_list_that_could_not_be_read_leaves_the_last_one_and_says_so_and_a_list_that_can_makes_it_say_nothing()
 {
    let first = after(listed(vec![summary("a", "x", 1)], "z", false));
    let failed = first.fold(&listed(Vec::new(), "z", true));
    let again = failed
        .clone()
        .fold(&listed(vec![summary("a", "x", 1)], "z", false));

    assert_eq!(
        Some(&json!(true)),
        thread(&failed).get("savedSessionsUnreadable")
    );
    assert_eq!(
        1,
        saved_count(&thread(&failed)),
        "the list the tree had stays"
    );
    assert_eq!(None, thread(&again).get("savedSessionsUnreadable"));
    assert_eq!(
        None,
        thread(&after(listed(Vec::new(), "z", true))).get("savedSessions")
    );
}

#[test]
fn listing_again_with_nothing_new_leaves_the_transcript_as_it_was() {
    let input = listed(vec![summary("a", "x", 1)], "z", false);
    let once = after(input.clone());

    assert!(
        Arc::ptr_eq(&once.transcript, &once.clone().fold(&input).transcript),
        "the same Arc: nothing above it looks changed"
    );
}

// ---- what could not be read, and what was turned down ----

#[test]
fn a_record_that_could_not_be_read_is_the_threads_first_notice_ahead_of_the_clis() {
    let said = thread(&after(PresenterInput::HistoryUnavailable));

    let notices = entries(&said, "notices");
    assert_eq!(1, notices.len());
    assert_eq!(Some("notice-1"), str(notices[0], "id"));
    assert_eq!(Some("error"), str(notices[0], "kind"));
    assert_eq!(Some(HISTORY_UNAVAILABLE_TEXT), str(notices[0], "text"));
    assert_eq!(None, said.get("restoredUntil"));
}

fn refused_switch(reason: ResumeRefusal) -> Map<String, Value> {
    let refused = thread(&after(PresenterInput::ResumeRefused(ResumeRefused {
        request_id: "r1".into(),
        session_id: SESSION.into(),
        reason,
    })));
    let switches = refused
        .get("switches")
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("switches"));
    assert_eq!(1, switches.len());
    switches[0]
        .as_object()
        .unwrap_or_else(|| panic!("a switch"))
        .clone()
}

#[test]
fn a_resume_turned_down_while_a_turn_runs_is_a_refused_switch_of_the_resume_kind() {
    let switch = refused_switch(ResumeRefusal::Turn);

    assert_eq!(Some(&json!("resume")), switch.get("kind"));
    assert_eq!(Some(&json!(SESSION)), switch.get("value"));
    assert_eq!(Some(&json!("rejected")), switch.get("outcome"));
    assert_eq!(Some(&json!("A turn is running")), switch.get("detail"));
}

#[test]
fn a_resume_turned_down_because_another_tab_has_it_is_a_refused_switch_with_that_sentence() {
    let switch = refused_switch(ResumeRefusal::Elsewhere);

    assert_eq!(Some(&json!("resume")), switch.get("kind"));
    assert_eq!(Some(&json!("rejected")), switch.get("outcome"));
    assert_eq!(
        Some(&json!("It is open in another tab")),
        switch.get("detail")
    );
    assert_eq!(RESUME_REFUSED_ELSEWHERE, "It is open in another tab");
}
