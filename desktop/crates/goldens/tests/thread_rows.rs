//! The conversation as rows, and the rows a transcript keeps from the last one (ThreadRowsTest.kt).

use std::sync::Arc;

use closta_goldens::lines::{self, ResultLine};
use closta_goldens::replay::replay;
use closta_goldens::synthetic::stream_script::{StreamScript, text, tool_use};
use closta_model::AgentEvent;
use closta_presenter::input::{PresenterInput, SendId, UserSent};
use closta_presenter::keyed::Keyed;
use closta_presenter::rows::{ThreadRow, ThreadRows, TodoItem, agent_rows, agent_transcript};
use closta_presenter::session::SessionView;
use closta_presenter::transcript::{
    ApprovalRecord, MessageRecord, MessageSource, PartRecord, Role, TextRecord, ToolCallRecord,
    Transcript,
};
use closta_providers::claude::protocol::decode;
use serde_json::{Value, json};

const SESSION: &str = "s";
const NOT_LOGGED_IN: &str = "Not logged in · Please run /login";

fn sent(id: &str, text: &str, uuid: &str) -> PresenterInput {
    PresenterInput::UserSent(UserSent {
        message_id: SendId::new(id).unwrap_or_else(|| panic!("{id} is not a key")),
        text: text.to_owned(),
        attachments: Vec::new(),
        uuid: Some(uuid.to_owned()),
    })
}

fn events(view: SessionView, events: impl IntoIterator<Item = AgentEvent>) -> SessionView {
    events
        .into_iter()
        .fold(view, |view, event| view.fold(&PresenterInput::Event(event)))
}

/// One turn as the CLI frames it: queued and started, `script`'s lines, the result, completed.
fn fold(prompt: &str, script: &StreamScript, from: SessionView) -> SessionView {
    let command = format!("c-{prompt}");
    let mut open = StreamScript::new(SESSION);
    open.lifecycle(&command, "queued");
    open.lifecycle(&command, "started");
    let mut close = StreamScript::new(SESSION);
    close.result("done");
    close.lifecycle(&command, "completed");
    let view = from.fold(&sent(&format!("u-{prompt}"), prompt, &command));
    let all = [open.lines(), script.lines(), close.lines()].concat();
    events(view, all.iter().map(|line| decode(line)))
}

fn script(write: impl FnOnce(&mut StreamScript)) -> StreamScript {
    let mut script = StreamScript::new(SESSION);
    write(&mut script);
    script
}

/// Each tool call in a message of its own, answered before the next, as the CLI sends them.
fn tools(calls: &[(&str, Value)]) -> StreamScript {
    script(|script| {
        for (index, (name, input)) in calls.iter().enumerate() {
            script.assistant(
                &format!("m{index}"),
                vec![tool_use(&format!("t{index}"), name, input.clone())],
                None,
            );
            script.tool_result(&format!("t{index}"), "ok", None, false);
        }
    })
}

fn rows_of(view: &SessionView) -> Vec<ThreadRow> {
    ThreadRows::default().of(&view.transcript)
}

fn last_transcript(scenario: &str) -> Arc<Transcript> {
    replay(scenario)
        .pop()
        .unwrap_or_else(|| panic!("{scenario}: no step"))
        .view
        .transcript
}

#[test]
fn a_user_message_is_one_ask_row_with_its_attachments() {
    let transcript = last_transcript("23-attachments");
    let asks: Vec<_> = ThreadRows::default()
        .of(&transcript)
        .into_iter()
        .filter_map(|row| match row {
            ThreadRow::Ask(ask) => Some(ask),
            _ => None,
        })
        .collect();
    let sent: Vec<Vec<_>> = transcript
        .messages
        .values()
        .filter(|it| it.role == Role::User)
        .map(|message| {
            message
                .parts
                .values()
                .filter_map(|part| match part.as_ref() {
                    PartRecord::Attachment(it) => Some(it.clone()),
                    _ => None,
                })
                .collect()
        })
        .collect();
    assert_eq!(sent.len(), asks.len());
    assert_eq!(
        sent,
        asks.iter()
            .map(|it| it.attachments.clone())
            .collect::<Vec<_>>()
    );
    assert!(asks.iter().any(|it| !it.attachments.is_empty()));
}

/// The lines 2.1.319 writes for send `command` when logged out: no stream events, an assistant
/// line with no request_id that names its error, an error result, and the command cancelled.
fn signed_out(command: &str, from: SessionView) -> SessionView {
    let mut lifecycle = StreamScript::new(SESSION);
    lifecycle.lifecycle(command, "queued");
    lifecycle.lifecycle(command, "started");
    let reply = decode(&format!(
        concat!(
            r#"{{"type":"assistant","message":{{"id":"m-{command}","model":"<synthetic>","role":"assistant","#,
            r#""type":"message","content":[{{"type":"text","text":{text}}}]}},"#,
            r#""parent_tool_use_id":null,"session_id":"s","uuid":"a-{command}","timestamp":"t","#,
            r#""user_message_uuid":"{command}","error":"authentication_failed","is_api_error_message":true}}"#
        ),
        command = command,
        text = lines::quote(NOT_LOGGED_IN),
    ));
    let result = ResultLine {
        command: Some(command),
        is_error: true,
        text: NOT_LOGGED_IN,
        ..ResultLine::default()
    }
    .event();
    let mut cancelled = StreamScript::new(SESSION);
    cancelled.lifecycle(command, "cancelled");
    let view = from.fold(&sent(&format!("u-{command}"), "hi", command));
    let mut all: Vec<AgentEvent> = lifecycle.lines().iter().map(|it| decode(it)).collect();
    all.push(reply);
    all.push(result);
    all.extend(cancelled.lines().iter().map(|it| decode(it)));
    events(view, all)
}

#[test]
fn a_reply_the_cli_made_itself_is_shown_as_text_with_a_sign_in_row_after_it() {
    let rows = rows_of(&signed_out("c1", SessionView::default()));
    let texts: Vec<&str> = rows
        .iter()
        .filter_map(|row| match row {
            ThreadRow::Text(it) => Some(it.markdown.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(vec![NOT_LOGGED_IN], texts);
    // Right after the reply that says so, and once: the `/login` it names cannot be run from here.
    let sign_ins: Vec<usize> = (0..rows.len())
        .filter(|at| matches!(rows[*at], ThreadRow::SignIn(_)))
        .collect();
    let text = rows
        .iter()
        .position(|it| matches!(it, ThreadRow::Text(_)))
        .expect("a text row");
    assert_eq!(vec![text + 1], sign_ins);
}

#[test]
fn the_sign_in_row_goes_once_a_reply_comes_from_the_model() {
    // 2.1.319 reads the credentials again on the next send, so the session goes on after signing
    // in.
    let twice = signed_out("c2", signed_out("c1", SessionView::default()));
    let sign_ins = rows_of(&twice)
        .iter()
        .filter(|it| matches!(it, ThreadRow::SignIn(_)))
        .count();
    assert_eq!(1, sign_ins, "only the last");

    let after = fold(
        "again",
        &script(|it| it.assistant("m2", vec![text("ok")], None)),
        twice,
    );
    assert!(
        !rows_of(&after)
            .iter()
            .any(|it| matches!(it, ThreadRow::SignIn(_)))
    );
}

#[test]
fn read_only_tools_in_a_row_fold_into_one_explored_row() {
    let view = fold(
        "look",
        &tools(&[
            ("Read", json!({"file_path": "/a/A.kt"})),
            ("Grep", json!({"pattern": "login"})),
            ("Read", json!({"file_path": "/a/B.kt"})),
        ]),
        SessionView::default(),
    );
    let rows = rows_of(&view);
    let explored: Vec<_> = rows
        .iter()
        .filter_map(|row| match row {
            ThreadRow::Explored(it) => Some(it),
            _ => None,
        })
        .collect();
    assert_eq!(1, explored.len());
    assert_eq!(3, explored[0].lines().len());
    assert!(!rows.iter().any(|it| matches!(it, ThreadRow::Tool(_))));
}

#[test]
fn a_single_read_stays_a_tool_row() {
    let rows = rows_of(&fold(
        "look",
        &tools(&[("Read", json!({"file_path": "/a/A.kt"}))]),
        SessionView::default(),
    ));
    assert!(!rows.iter().any(|it| matches!(it, ThreadRow::Explored(_))));
    let tools: Vec<&str> = rows
        .iter()
        .filter_map(|row| match row {
            ThreadRow::Tool(it) => Some(it.tool_name.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(vec!["Read"], tools);
}

#[test]
fn todo_write_is_a_todo_row() {
    let todos = json!({"todos": [
        {"content": "方針を決める", "status": "completed", "activeForm": "決めている"},
        {"content": "テストを足す", "status": "in_progress", "activeForm": "足している"},
        {"content": "状態の無い項目"},
        {"status": "completed"},
        "not an object",
    ]});
    let rows = rows_of(&fold(
        "plan",
        &tools(&[("TodoWrite", todos)]),
        SessionView::default(),
    ));
    let todo: Vec<_> = rows
        .iter()
        .filter_map(|row| match row {
            ThreadRow::Todo(it) => Some(it),
            _ => None,
        })
        .collect();
    assert_eq!(1, todo.len());
    let item = |content: &str, status: &str| TodoItem {
        content: content.into(),
        status: status.into(),
    };
    assert_eq!(
        vec![
            item("方針を決める", "completed"),
            item("テストを足す", "in_progress"),
            item("状態の無い項目", "pending"),
        ],
        todo[0].items
    );
    assert!(!rows.iter().any(|it| matches!(it, ThreadRow::Tool(_))));
}

#[test]
fn sub_agent_messages_are_not_rows() {
    let rows = ThreadRows::default().of(&last_transcript("08-subagent-task"));
    for row in &rows {
        match row {
            ThreadRow::Tool(it) => assert_eq!(0, it.depth),
            ThreadRow::Explored(it) => assert_eq!(0, it.depth),
            _ => {}
        }
    }
    let agents = rows
        .iter()
        .filter(|row| match row {
            ThreadRow::Tool(it) => it.tool_name == "Agent" || it.tool_name == "Task",
            _ => false,
        })
        .count();
    assert_eq!(1, agents);
}

#[test]
fn unchanged_messages_keep_their_row_objects() {
    let first = fold(
        "one",
        &script(|it| it.assistant("a1", vec![text("最初の返事")], None)),
        SessionView::default(),
    );
    let second = fold(
        "two",
        &script(|it| it.stream_text("a2", "二つ目の返事", 4)),
        first,
    );
    let mut rows = ThreadRows::default();
    let before = rows.of(&second.transcript);
    let grown = fold(
        "three",
        &script(|it| it.stream_text("a3", "三つ目", 4)),
        second,
    );
    let after = rows.of(&grown.transcript);
    for (index, row) in before.iter().enumerate() {
        assert!(row.same(&after[index]), "{index}: {row:?}");
    }
    assert!(after.len() > before.len());
}

/// The counterpart of Task 1's transcript test: the answer rebuilds one approval record, so of
/// the rows only its card is made again.
#[test]
fn an_answer_to_an_approval_remakes_only_its_card() {
    let steps = replay("05-permission-can-use-tool");
    let answer = steps
        .iter()
        .position(|step| matches!(step.input, PresenterInput::Decided(_)))
        .expect("an answer");
    let mut rows = ThreadRows::default();
    let before = rows.of(&steps[answer - 1].view.transcript);
    let after = rows.of(&steps[answer].view.transcript);

    assert_eq!(before.len(), after.len());
    let remade: Vec<&ThreadRow> = before
        .iter()
        .zip(&after)
        .filter(|(old, new)| !old.same(new))
        .map(|(_, new)| new)
        .collect();
    assert_eq!(1, remade.len(), "{remade:?}");
    let ThreadRow::Card(card) = remade[0] else {
        panic!("not a card: {:?}", remade[0])
    };
    assert!(card.card.answered().is_some());
}

fn ask_and_reply(words: &str) -> SessionView {
    let view = SessionView::default().fold(&sent("ask", words, "c-ask"));
    let script = script(|it| {
        it.lifecycle("c-ask", "queued");
        it.lifecycle("c-ask", "started");
        it.assistant("m1", vec![text(&format!("reply to {words}"))], None);
    });
    events(view, script.lines().iter().map(|it| decode(it)))
}

/// Another session, or a rewound one, with the same keys: its records are other objects, so the
/// rows are its own and none is the last transcript's.
#[test]
fn a_new_transcript_with_the_same_keys_gets_its_own_rows() {
    let one = ask_and_reply("one");
    let two = ask_and_reply("two");
    let mut rows = ThreadRows::default();
    let first = rows.of(&one.transcript);
    let second = rows.of(&two.transcript);

    assert_eq!(
        first.iter().map(ThreadRow::key).collect::<Vec<_>>(),
        second.iter().map(ThreadRow::key).collect::<Vec<_>>()
    );
    let ThreadRow::Ask(ask) = &second[0] else {
        panic!("not an ask: {:?}", second[0])
    };
    assert_eq!("two", ask.text);
    let ThreadRow::Text(reply) = &second[1] else {
        panic!("not a text: {:?}", second[1])
    };
    assert_eq!("reply to two", reply.markdown);
    assert!(first.iter().zip(&second).all(|(old, new)| !old.same(new)));
}

fn approval(request_id: &str, anchor: Option<&str>) -> Arc<ApprovalRecord> {
    Arc::new(ApprovalRecord {
        request_id: request_id.into(),
        tool_name: Some("Bash".into()),
        input: Some(Arc::new(json!({"command": "ls"}))),
        anchor: anchor.map(str::to_owned),
        ..ApprovalRecord::default()
    })
}

fn reply(key: &str) -> Arc<MessageRecord> {
    let part = PartRecord::Text(TextRecord {
        reasoning: false,
        text: "hello".into(),
        streaming: false,
    });
    Arc::new(MessageRecord {
        key: key.into(),
        role: Role::Assistant,
        source: MessageSource::Nested,
        parts: Keyed::new().put("p".into(), Arc::new(part)),
    })
}

fn with_approvals(approvals: &[Arc<ApprovalRecord>]) -> Transcript {
    Transcript {
        messages: Keyed::new().put("m1".into(), reply("m1")),
        approvals: approvals.iter().fold(Keyed::new(), |all, it| {
            all.put(it.request_id.clone(), Arc::clone(it))
        }),
        ..Transcript::default()
    }
}

/// A request whose message is not, or no longer, in the conversation still has to be answered:
/// after every row, by its anchor in the order the anchors first came (Kotlin's `groupBy`), and in
/// arrival order within one anchor.
#[test]
fn a_card_whose_message_is_gone_goes_last() {
    let transcript = with_approvals(&[
        approval("A", None),
        approval("B", Some("gone")),
        approval("D", Some("m1")),
        approval("C", None),
    ]);
    let keys: Vec<String> = ThreadRows::default()
        .of(&transcript)
        .iter()
        .map(|it| it.key().to_owned())
        .collect();
    assert_eq!(
        vec!["m1/p", "m1/card:D", "card:A", "card:C", "gone/card:B"],
        keys
    );

    // Many anchors, so an order taken from a hash table would show.
    let anchors = ["x9", "x3", "x7", "x1", "x8", "x2", "x6", "x4", "x5", "x0"];
    let mut approvals = Vec::new();
    for round in 0..2 {
        for anchor in anchors {
            approvals.push(approval(&format!("{anchor}-{round}"), Some(anchor)));
        }
    }
    let rows = ThreadRows::default().of(&with_approvals(&approvals));
    let cards: Vec<&str> = rows.iter().skip(1).map(ThreadRow::key).collect();
    let expected: Vec<String> = anchors
        .iter()
        .flat_map(|anchor| (0..2).map(move |round| format!("{anchor}/card:{anchor}-{round}")))
        .collect();
    assert_eq!(expected, cards);
    for row in &rows[1..] {
        let ThreadRow::Card(card) = row else {
            panic!("not a card: {row:?}")
        };
        assert_eq!(None, card.card.answered(), "it can still be answered");
    }
}

#[test]
fn thread_rows_is_send() {
    fn assert_send<T: Send>() {}
    assert_send::<ThreadRows>();
}

fn agent(tool_use_id: &str, messages: Keyed<MessageRecord>) -> PartRecord {
    PartRecord::ToolCall(ToolCallRecord {
        tool_use_id: tool_use_id.into(),
        tool_name: "Agent".into(),
        messages,
        ..ToolCallRecord::default()
    })
}

fn holding(key: &str, part: PartRecord) -> Keyed<MessageRecord> {
    Keyed::new().put(
        key.into(),
        Arc::new(MessageRecord {
            key: key.into(),
            role: Role::Assistant,
            source: MessageSource::Nested,
            parts: Keyed::new().put("p".into(), Arc::new(part)),
        }),
    )
}

/// A sub-agent's call is found however deep it sits, and its tab reads its own messages.
#[test]
fn a_sub_agents_rows_are_its_own_messages_however_deep_its_call() {
    let deepest = TextRecord {
        text: "deep".into(),
        ..TextRecord::default()
    };
    let inner = holding("deepest", PartRecord::Text(deepest));
    let inner = holding("inner", agent("t-inner", inner));
    let transcript = Transcript {
        messages: holding("top", agent("t-outer", inner.clone())),
        ..Transcript::default()
    };

    let found = agent_transcript(&transcript, "t-outer").expect("the outer call");
    assert!(found.messages.same(&inner));
    let rows = agent_rows(&transcript, "t-inner");
    assert_eq!(
        vec!["deepest/p"],
        rows.iter().map(ThreadRow::key).collect::<Vec<_>>()
    );
    let ThreadRow::Tool(call) = &agent_rows(&transcript, "t-outer")[0] else {
        panic!("not a tool row")
    };
    assert_eq!("t-inner", call.tool_use_id);
    assert!(agent_transcript(&transcript, "t-inner").is_some());
    assert!(agent_transcript(&transcript, "no-such-call").is_none());
    assert!(agent_rows(&transcript, "no-such-call").is_empty());
}
