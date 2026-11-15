//! How each turn ended and what the host found it changed, as the transcript keeps them
//! (TurnEndTest.kt). Kotlin reads them through `ThreadRows`, the IDE's native rows, which are not
//! ported; these tests read the transcript the rows are made from.

use std::sync::Arc;

use closta_goldens::lines;
use closta_goldens::replay::replay;
use closta_model::AgentEvent;
use closta_presenter::input::{PresenterInput, SendId, TurnChangesFound, UserSent};
use closta_presenter::records::turn_end::{ChangedFile, TurnEndRecord};
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
