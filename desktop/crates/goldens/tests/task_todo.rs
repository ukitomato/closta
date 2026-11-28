//! `TaskCreate` and `TaskUpdate` calls read as the to-do list they build, as `TodoWrite`'s does
//! (TaskTodoTest.kt).

use std::sync::Arc;

use closta_goldens::replay::{inputs, replay};
use closta_goldens::synthetic::stream_script::{StreamScript, tool_use};
use closta_presenter::input::{PresenterInput, SendId, UserSent};
use closta_presenter::rows::{Divider, ThreadRow, ThreadRows, TodoItem, TodoRow};
use closta_presenter::session::SessionView;
use closta_presenter::transcript::{PartRecord, Transcript};
use closta_providers::claude::protocol::decode;
use serde_json::{Value, json};

const SESSION: &str = "s";
const TASK_CREATE: &str = "TaskCreate";
const TASK_UPDATE: &str = "TaskUpdate";

/// One call of a turn: its tool, its input and the answer it gets (none: not answered yet).
type Call = (&'static str, Value, Option<&'static str>);

fn todos(transcript: &Transcript) -> Vec<Arc<TodoRow>> {
    todos_in(&ThreadRows::default().of(transcript))
}

fn todos_in(rows: &[ThreadRow]) -> Vec<Arc<TodoRow>> {
    rows.iter()
        .filter_map(|row| match row {
            ThreadRow::Todo(it) => Some(Arc::clone(it)),
            _ => None,
        })
        .collect()
}

fn item(content: &str, status: &str) -> TodoItem {
    TodoItem {
        content: content.into(),
        status: status.into(),
    }
}

fn lists(rows: &[Arc<TodoRow>]) -> Vec<Vec<TodoItem>> {
    rows.iter().map(|it| it.items.clone()).collect()
}

fn create(subject: &str, answer: Option<&'static str>) -> Call {
    (
        TASK_CREATE,
        json!({"subject": subject, "description": subject}),
        answer,
    )
}

fn update(input: Value, answer: Option<&'static str>) -> Call {
    (TASK_UPDATE, input, answer)
}

/// One turn of `calls`, each in an assistant line of its own; a call with an answer is answered.
fn turn(prompt: &str, calls: &[Call]) -> Vec<PresenterInput> {
    let command = format!("c-{prompt}");
    let mut script = StreamScript::new(SESSION);
    script.lifecycle(&command, "queued");
    script.lifecycle(&command, "started");
    for (index, (name, input, answer)) in calls.iter().enumerate() {
        let id = format!("t-{prompt}-{index}");
        script.assistant(
            &format!("m-{prompt}-{index}"),
            vec![tool_use(&id, name, input.clone())],
            None,
        );
        if let Some(answer) = answer {
            script.tool_result(&id, answer, None, false);
        }
    }
    script.result("done");
    script.lifecycle(&command, "completed");
    let mut all = vec![PresenterInput::UserSent(UserSent {
        message_id: SendId::new(&format!("u-{prompt}")).unwrap_or_else(|| panic!("a key")),
        text: prompt.to_owned(),
        attachments: Vec::new(),
        uuid: Some(command),
    })];
    all.extend(
        script
            .lines()
            .iter()
            .map(|line| PresenterInput::Event(decode(line))),
    );
    all
}

fn transcript_of(all: &[PresenterInput]) -> Arc<Transcript> {
    let view = all.iter().fold(SessionView::default(), SessionView::fold);
    Arc::clone(&view.transcript)
}

fn capture_20() -> Vec<closta_goldens::replay::Step> {
    replay("20-todowrite")
}

#[test]
fn captures_20_tasks_make_two_lists_the_second_with_the_build_in_progress() {
    let steps = capture_20();
    let transcript = &steps.last().expect("20 has steps").view.transcript;
    let rows = ThreadRows::default().of(transcript);

    assert_eq!(
        vec![
            vec![item("write tests", "pending"), item("run build", "pending")],
            vec![
                item("write tests", "pending"),
                item("run build", "in_progress")
            ],
        ],
        lists(&todos_in(&rows))
    );
    assert!(
        !rows.iter().any(|row| matches!(row, ThreadRow::Tool(tool)
            if tool.tool_name == TASK_CREATE || tool.tool_name == TASK_UPDATE)),
        "{rows:?}"
    );
    assert!(
        rows.iter()
            .any(|row| matches!(row, ThreadRow::Tool(tool) if tool.tool_name == "ToolSearch")),
        "other tools stay tool rows"
    );
}

#[test]
fn an_update_of_a_task_not_yet_created_adds_nothing() {
    let transcript = transcript_of(&turn(
        "a",
        &[
            create(
                "write tests",
                Some("Task #1 created successfully: write tests"),
            ),
            update(
                json!({"taskId": "9", "status": "in_progress"}),
                Some("Updated task #9 status"),
            ),
        ],
    ));

    assert_eq!(
        vec![vec![item("write tests", "pending")]],
        lists(&todos(&transcript))
    );
}

#[test]
fn a_task_updated_to_deleted_leaves_the_list() {
    let transcript = transcript_of(&turn(
        "a",
        &[
            create(
                "write tests",
                Some("Task #1 created successfully: write tests"),
            ),
            update(
                json!({"taskId": "1", "status": "deleted"}),
                Some("Updated task #1 deleted"),
            ),
        ],
    ));

    assert_eq!(vec![Vec::<TodoItem>::new()], lists(&todos(&transcript)));
}

#[test]
fn tasks_not_yet_answered_are_numbered_as_they_were_created() {
    let transcript = transcript_of(&turn(
        "a",
        &[
            create("write tests", None),
            create("run build", None),
            update(
                json!({"taskId": 2, "status": "completed", "subject": "run the build"}),
                None,
            ),
        ],
    ));

    assert_eq!(
        vec![vec![
            item("write tests", "pending"),
            item("run the build", "completed")
        ]],
        lists(&todos(&transcript))
    );
}

#[test]
fn a_task_not_yet_answered_never_shares_its_number_with_one_the_cli_numbered() {
    let transcript = transcript_of(&turn(
        "a",
        &[
            create("write tests", None),
            create("run build", Some("Task #1 created successfully: run build")),
            update(
                json!({"taskId": "1", "status": "completed"}),
                Some("Updated task #1 status"),
            ),
        ],
    ));

    assert_eq!(
        vec![vec![
            item("write tests", "pending"),
            item("run build", "completed")
        ]],
        lists(&todos(&transcript))
    );
}

#[test]
fn a_list_after_a_clear_starts_empty() {
    let before = turn(
        "before",
        &[create(
            "before the clear",
            Some("Task #1 created successfully: before the clear"),
        )],
    );
    let after = turn(
        "after",
        &[create(
            "after the clear",
            Some("Task #1 created successfully: after the clear"),
        )],
    );
    let all = [before, inputs("41-clear-reset", true), after].concat();
    let rows = ThreadRows::default().of(&transcript_of(&all));
    let divider = rows
        .iter()
        .position(|row| {
            matches!(row, ThreadRow::Divider(it) if matches!(it.divider, Divider::Cleared { .. }))
        })
        .expect("the clear leaves a divider");
    let at = |list: &Arc<TodoRow>| {
        rows.iter()
            .position(|row| matches!(row, ThreadRow::Todo(it) if Arc::ptr_eq(it, list)))
            .expect("the list is a row")
    };
    let found = todos_in(&rows);

    assert_eq!(
        vec![
            vec![item("before the clear", "pending")],
            vec![item("after the clear", "pending")],
        ],
        lists(&found)
    );
    assert!(at(&found[0]) < divider && at(&found[1]) > divider);
}

#[test]
fn a_run_of_task_calls_is_one_list_keyed_by_its_last_call_and_opening_as_its_first() {
    let transcript = transcript_of(&turn(
        "a",
        &[
            create(
                "write tests",
                Some("Task #1 created successfully: write tests"),
            ),
            create("run build", Some("Task #2 created successfully: run build")),
        ],
    ));
    let reply = transcript
        .messages
        .values()
        .find(|message| {
            message
                .parts
                .values()
                .any(|part| matches!(part.as_ref(), PartRecord::ToolCall(_)))
        })
        .expect("the turn has a reply with calls");
    let calls: Vec<&str> = reply
        .parts
        .order()
        .filter(|key| {
            matches!(
                reply.parts.get(key).map(|it| it.as_ref()),
                Some(PartRecord::ToolCall(_))
            )
        })
        .collect();
    let rows = todos(&transcript);

    assert_eq!(2, calls.len(), "both calls in the turn's one reply");
    assert_eq!(1, rows.len());
    assert_eq!(
        format!("{}/{}", reply.key, calls.last().expect("two calls")),
        rows[0].key
    );
    assert_eq!(
        reply.parts.order().next() == calls.first().copied(),
        rows[0].opens
    );
    assert!(rows[0].opens, "the first call opens the reply");
}

#[test]
fn the_same_transcript_gives_the_same_list_objects() {
    let steps = capture_20();
    let transcript = &steps.last().expect("20 has steps").view.transcript;
    let mut rows = ThreadRows::default();
    let first = todos_in(&rows.of(transcript));
    let second = todos_in(&rows.of(transcript));

    assert_eq!(2, first.len());
    assert_eq!(2, second.len());
    for (was, now) in first.iter().zip(&second) {
        assert!(Arc::ptr_eq(was, now));
    }
}

#[test]
fn a_list_keeps_its_object_while_the_thread_grows_after_it() {
    let steps = capture_20();
    let both = vec![item("write tests", "pending"), item("run build", "pending")];
    let mut rows = ThreadRows::default();
    let early = steps
        .iter()
        .find_map(|step| {
            todos_in(&rows.of(&step.view.transcript))
                .into_iter()
                .next()
                .filter(|it| it.items == both)
        })
        .expect("the first list appears with both tasks pending");
    let last = todos_in(&rows.of(&steps.last().expect("20 has steps").view.transcript));

    assert_eq!(2, last.len());
    assert!(Arc::ptr_eq(&early, &last[0]));
}

// The same number after the clear would overwrite the task, so this one is numbered 2: only an
// emptied board shows the clear.
#[test]
fn a_clear_empties_the_board_so_a_task_numbered_after_it_is_alone() {
    let before = turn(
        "before",
        &[create(
            "before the clear",
            Some("Task #1 created successfully: before the clear"),
        )],
    );
    let after = turn(
        "after",
        &[create(
            "after the clear",
            Some("Task #2 created successfully: after the clear"),
        )],
    );
    let all = [before, inputs("41-clear-reset", true), after].concat();
    let found = todos(&transcript_of(&all));

    assert_eq!(2, found.len(), "a list on each side of the clear");
    assert_eq!(
        vec![item("after the clear", "pending")],
        found[1].items,
        "nothing of the first conversation"
    );
}
