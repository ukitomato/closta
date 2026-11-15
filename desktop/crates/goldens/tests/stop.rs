//! Stop ends the turn on screen: the turns open when stop was pressed stop running at the next
//! `result`, whatever turn that `result` names (StopTest.kt).

use std::sync::Arc;

use closta_goldens::lines::{self, ResultLine};
use closta_presenter::input::{PresenterInput, SendId, UserSent};
use closta_presenter::session::SessionView;
use closta_presenter::thread_running::thread_is_running;
use std::collections::BTreeSet;

fn feed(view: &SessionView, inputs: impl IntoIterator<Item = PresenterInput>) -> SessionView {
    inputs
        .into_iter()
        .fold(view.clone(), |state, input| state.fold(&input))
}

fn running(view: &SessionView) -> bool {
    thread_is_running(&view.conversation, &view.transcript)
}

/// The composer's `stopping`, as ComposerState.kt words it: running, with turns kept for the next
/// `result` to end.
fn stopping(view: &SessionView) -> bool {
    running(view) && !view.transcript.routing.stopping.is_empty()
}

fn sent(id: &str, text: &str) -> PresenterInput {
    PresenterInput::UserSent(UserSent {
        message_id: SendId::new(id).unwrap_or_else(|| panic!("{id} is not a key")),
        text: text.into(),
        attachments: Vec::new(),
        uuid: None,
    })
}

fn event(event: closta_model::AgentEvent) -> PresenterInput {
    PresenterInput::Event(event)
}

fn running_turn() -> SessionView {
    feed(
        &SessionView::default(),
        [
            sent("send-1", "list the files"),
            event(lines::queued("c1")),
            event(lines::started("c1")),
        ],
    )
}

fn result(command: Option<&str>, is_error: bool) -> PresenterInput {
    event(
        ResultLine {
            command,
            is_error,
            ..ResultLine::default()
        }
        .event(),
    )
}

fn set(names: &[&str]) -> BTreeSet<String> {
    names.iter().map(|it| (*it).to_owned()).collect()
}

fn listed<'a>(names: impl IntoIterator<Item = &'a String>) -> BTreeSet<String> {
    names.into_iter().cloned().collect()
}

#[test]
fn a_turn_open_when_stop_was_pressed_ends_at_the_next_result_even_one_that_names_no_turn() {
    let stopped = feed(&running_turn(), [PresenterInput::StopRequested]);
    assert!(
        running(&stopped),
        "still running until the CLI says something"
    );
    assert!(stopping(&stopped));

    let ended = feed(&stopped, [result(None, true)]);
    assert!(!running(&ended));
    assert!(!stopping(&ended));
    assert_eq!(set(&["c1"]), listed(&ended.transcript.routing.stopped));
    assert_eq!(set(&[]), listed(&ended.transcript.routing.stopping));
}

#[test]
fn a_result_that_names_the_turn_ends_it_as_before() {
    let ended = feed(
        &running_turn(),
        [PresenterInput::StopRequested, result(Some("c1"), false)],
    );
    assert!(!running(&ended));
}

#[test]
fn a_send_core_has_no_turn_for_yet_still_runs_after_the_stop() {
    let sent_more = feed(&running_turn(), [sent("send-2", "and the tests")]);
    let ended = feed(
        &sent_more,
        [PresenterInput::StopRequested, result(None, false)],
    );
    assert!(
        running(&ended),
        "the second message was given to the CLI and has no turn yet"
    );
}

#[test]
fn a_turn_started_after_the_stop_is_not_stopped_by_it() {
    let stopped = feed(&running_turn(), [PresenterInput::StopRequested]);
    let next = feed(
        &stopped,
        [
            result(Some("c1"), false),
            sent("send-2", "again"),
            event(lines::queued("c2")),
            event(lines::started("c2")),
        ],
    );
    assert!(running(&next));
    assert!(!stopping(&next));
}

#[test]
fn a_result_with_nothing_stopping_leaves_the_routing_as_it_was() {
    let before = running_turn().transcript.routing.clone();
    let after = feed(&running_turn(), [result(Some("c1"), false)])
        .transcript
        .routing
        .clone();
    assert_eq!(set(&[]), listed(&after.stopped));
    assert_eq!(before.stopping, after.stopping);
}

#[test]
fn stop_with_nothing_running_changes_nothing() {
    let idle = SessionView::default();
    let after = idle.clone().fold(&PresenterInput::StopRequested);
    assert!(Arc::ptr_eq(&idle.transcript, &after.transcript));
    assert!(!stopping(&after));
}
