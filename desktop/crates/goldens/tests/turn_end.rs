//! How each turn ended and what the host found it changed (TurnEndTest.kt): as the transcript
//! keeps them, and as the rows show them, which is where Kotlin reads them.

use std::sync::Arc;

use closta_goldens::lines;
use closta_goldens::replay::replay;
use closta_model::AgentEvent;
use closta_presenter::input::{PresenterInput, SendId, TurnChangesFound, UserSent};
use closta_presenter::records::turn_end::{ChangedFile, TurnEndRecord};
use closta_presenter::rows::{ThreadRow, ThreadRows, TurnEndRow};
use closta_presenter::session::SessionView;

fn sent(ask: &str, uuid: Option<&str>) -> PresenterInput {
    PresenterInput::UserSent(UserSent {
        message_id: SendId::new(ask).unwrap_or_else(|| panic!("{ask} is not a key")),
        text: format!("do {ask}"),
        attachments: Vec::new(),
        uuid: uuid.map(str::to_owned),
    })
}

fn event(view: SessionView, event: AgentEvent) -> SessionView {
    view.fold(&PresenterInput::Event(event))
}

/// A user message `ask` sent with the uuid `c-<ask>`, and its turn, opened; the reply is one text
/// block.
fn opened(ask: &str, from: SessionView) -> SessionView {
    let command = format!("c-{ask}");
    let view = from.fold(&sent(ask, Some(&command)));
    let view = event(view, lines::queued(&command));
    let view = event(view, lines::started(&command));
    event(
        view,
        lines::assistant(
            &format!("m-{ask}"),
            &lines::text(&format!("done {ask}")),
            None,
        ),
    )
}

/// The `result` that closes `ask`'s turn. Lines.kt's `result` has a `duration_ms` of 0.
fn closed(view: SessionView, ask: &str) -> SessionView {
    event(view, lines::result(Some(&format!("c-{ask}"))))
}

fn turn(ask: &str, from: SessionView) -> SessionView {
    closed(opened(ask, from), ask)
}

fn end(view: &SessionView, turn_key: &str) -> Option<TurnEndRecord> {
    view.transcript.turn_ends.get(turn_key).cloned()
}

fn file(path: &str, added: i32) -> ChangedFile {
    ChangedFile {
        path: path.into(),
        added,
        removed: 0,
        created: false,
        deleted: false,
        revertable: true,
        counted: true,
    }
}

fn changes(view: &SessionView, ask: &str, files: Vec<ChangedFile>) -> SessionView {
    view.clone()
        .fold(&PresenterInput::TurnChangesFound(TurnChangesFound {
            ask_key: ask.into(),
            files,
            more: false,
        }))
}

#[test]
fn a_finished_turn_keeps_the_time_of_its_result_and_the_message_it_answered() {
    let steps = replay("01-baseline-text");
    let duration = steps
        .iter()
        .find_map(|step| match &step.input {
            PresenterInput::Event(AgentEvent::Result { duration_ms, .. }) => Some(*duration_ms),
            _ => None,
        })
        .expect("a result");
    let ends = &steps.last().expect("a step").view.transcript.turn_ends;

    assert_eq!(1, ends.len());
    let only = ends.values().next().expect("an end");
    assert_eq!(Some("send-1"), only.ask_key.as_deref());
    assert_eq!(Some(duration), only.duration_ms);
}

#[test]
fn an_interrupted_turn_ends_once_answering_its_message() {
    let transcript = &replay("19-interrupt-background")
        .pop()
        .expect("a step")
        .view
        .transcript;

    let asks: Vec<Option<&str>> = transcript
        .turn_ends
        .values()
        .map(|it| it.ask_key.as_deref())
        .collect();
    assert_eq!(vec![Some("send-1")], asks);
}

#[test]
fn a_running_turn_has_no_end_and_each_finished_one_answers_its_own_message() {
    let first = turn("a", SessionView::default());
    let running = opened("b", first);
    assert_eq!(
        Some(TurnEndRecord {
            ask_key: Some("a".into()),
            duration_ms: Some(0)
        }),
        end(&running, "c-a")
    );
    assert_eq!(None, end(&running, "c-b"));

    let both = closed(running, "b");
    assert_eq!(
        Some("b"),
        end(&both, "c-b").and_then(|it| it.ask_key).as_deref()
    );
}

#[test]
fn a_turn_without_a_send_of_its_uuid_answers_the_last_user_message_ahead_of_it() {
    let view = SessionView::default().fold(&sent("one", None));
    let view = event(view, lines::queued("c1"));
    let view = event(view, lines::started("c1"));
    let view = closed_with(view, "c1", 1_200);

    assert_eq!(
        Some(TurnEndRecord {
            ask_key: Some("one".into()),
            duration_ms: Some(1_200)
        }),
        end(&view, "c1")
    );
}

/// The `result` that closes `command`'s turn after `ms`; Lines.kt's `result` says 0.
fn closed_with(view: SessionView, command: &str, ms: i64) -> SessionView {
    let mut line = lines::result(Some(command));
    if let AgentEvent::Result { duration_ms, .. } = &mut line {
        *duration_ms = ms;
    }
    event(view, line)
}

#[test]
fn the_files_a_turn_changed_are_what_the_host_saw_and_a_later_finding_replaces_them() {
    let view = turn("a", SessionView::default());
    assert!(view.transcript.turn_changes.is_empty());
    let files = vec![
        file("z/Last.kt", 0),
        file("a/First.kt", 9),
        file("README.md", 1),
    ];

    let found = changes(&view, "a", files.clone());
    let again = changes(&found, "a", files.clone());
    let later = changes(&found, "a", Vec::new());

    let kept = found
        .transcript
        .turn_changes
        .get("a")
        .expect("changes of a");
    assert_eq!(files.as_slice(), &*kept.files);
    assert!(
        Arc::ptr_eq(&found.transcript, &again.transcript),
        "the same finding again changes nothing"
    );
    assert!(
        later
            .transcript
            .turn_changes
            .get("a")
            .expect("changes of a")
            .files
            .is_empty()
    );
}

// The same, as the rows show them.

fn ends(rows: &[ThreadRow]) -> Vec<Arc<TurnEndRow>> {
    rows.iter()
        .filter_map(|row| match row {
            ThreadRow::TurnEnd(it) => Some(Arc::clone(it)),
            _ => None,
        })
        .collect()
}

fn ends_of(view: &SessionView) -> Vec<Arc<TurnEndRow>> {
    ends(&ThreadRows::default().of(&view.transcript))
}

#[test]
fn a_turn_end_row_follows_each_finished_turn() {
    let steps = replay("01-baseline-text");
    let duration = steps
        .iter()
        .find_map(|step| match &step.input {
            PresenterInput::Event(AgentEvent::Result { duration_ms, .. }) => Some(*duration_ms),
            _ => None,
        })
        .expect("a result");
    let rows = ThreadRows::default().of(&steps.last().expect("a step").view.transcript);
    let Some(ThreadRow::TurnEnd(end)) = rows.last() else {
        panic!("the last row is not a turn end: {:?}", rows.last())
    };
    assert_eq!(Some(duration), end.duration_ms);
    assert_eq!("send-1", end.ask_key);
    assert_eq!(None, end.changes);
}

#[test]
fn a_turn_end_row_waits_for_changes() {
    let view = turn("a", SessionView::default());
    let before = ends_of(&view);
    assert_eq!(1, before.len());
    assert_eq!(None, before[0].changes);

    let found = changes(&view, "a", vec![file("src/A.kt", 2)]);
    let after = ends_of(&found);
    assert_eq!(1, after.len());
    assert_eq!(Some(1), after[0].changes.as_ref().map(|it| it.files.len()));
}

#[test]
fn an_interrupted_turn_has_one_turn_end_row() {
    let transcript = &replay("19-interrupt-background")
        .pop()
        .expect("a step")
        .view
        .transcript;
    let asks: Vec<String> = ends(&ThreadRows::default().of(transcript))
        .iter()
        .map(|it| it.ask_key.clone())
        .collect();
    assert_eq!(vec!["send-1"], asks);
}

#[test]
fn a_running_turn_has_no_turn_end_row() {
    let running = opened("b", turn("a", SessionView::default()));
    let rows = ThreadRows::default().of(&running.transcript);
    let asks: Vec<String> = ends(&rows).iter().map(|it| it.ask_key.clone()).collect();
    assert_eq!(vec!["a"], asks);
    assert!(!matches!(rows.last(), Some(ThreadRow::TurnEnd(_))));
}

#[test]
fn a_turn_end_row_has_the_files_the_host_saw() {
    let files = vec![
        ChangedFile {
            path: "z/Last.kt".into(),
            added: 0,
            removed: 4,
            created: false,
            deleted: true,
            revertable: true,
            counted: true,
        },
        ChangedFile {
            path: "a/First.kt".into(),
            added: 9,
            removed: 0,
            created: true,
            deleted: false,
            revertable: true,
            counted: true,
        },
        ChangedFile {
            path: "README.md".into(),
            added: 1,
            removed: 1,
            created: false,
            deleted: false,
            revertable: true,
            counted: true,
        },
    ];
    let view = changes(&turn("a", SessionView::default()), "a", files.clone());
    let end = ends_of(&view);
    assert_eq!(1, end.len());
    assert_eq!(
        Some(files.as_slice()),
        end[0].changes.as_ref().map(|it| &*it.files)
    );
}

#[test]
fn each_turn_ends_after_its_own_reply() {
    let view = turn("b", turn("a", SessionView::default()));
    let rows = ThreadRows::default().of(&view.transcript);
    let kinds: Vec<&str> = rows
        .iter()
        .map(|row| match row {
            ThreadRow::Ask(_) => "Ask",
            ThreadRow::Text(_) => "Text",
            ThreadRow::TurnEnd(_) => "TurnEnd",
            _ => "other",
        })
        .collect();
    assert_eq!(
        vec!["Ask", "Text", "TurnEnd", "Ask", "Text", "TurnEnd"],
        kinds
    );
    let asks: Vec<String> = ends(&rows).iter().map(|it| it.ask_key.clone()).collect();
    assert_eq!(vec!["a", "b"], asks);
}

#[test]
fn a_turn_end_row_keeps_its_identity() {
    let mut rows = ThreadRows::default();
    let next = opened("b", turn("a", SessionView::default()));
    let first = ends(&rows.of(&next.transcript));
    assert_eq!(1, first.len());
    let closed_b = ends(&rows.of(&closed(next.clone(), "b").transcript));
    assert!(Arc::ptr_eq(&first[0], &closed_b[0]));
    let found = changes(&next, "a", Vec::new());
    let changed = ends(&rows.of(&found.transcript));
    assert!(!Arc::ptr_eq(&first[0], &changed[0]));
}

#[test]
fn only_a_turn_followed_by_another_ask_offers_rewind() {
    let mut rows = ThreadRows::default();
    let alone = turn("a", SessionView::default());
    let last = ends(&rows.of(&alone.transcript));
    assert_eq!(1, last.len());
    assert!(!last[0].followed);

    let next = turn("b", alone);
    let both = ends(&rows.of(&next.transcript));
    assert_eq!(
        vec![true, false],
        both.iter().map(|it| it.followed).collect::<Vec<_>>()
    );
    assert!(!Arc::ptr_eq(&last[0], &both[0]));
}
