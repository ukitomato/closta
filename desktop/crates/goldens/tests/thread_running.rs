//! The cases of ThreadRunningTest.kt that replay captures. The rule itself, measured reason by
//! reason, is tested next to `closta_presenter::thread_running`.

use closta_goldens::replay::{Step, THREAD, replay, replay_with, scenarios};
use closta_goldens::tree_reading::at;
use closta_model::AgentEvent;
use closta_presenter::input::PresenterInput;
use closta_presenter::thread_running::thread_is_running;
use serde_json::Value;

fn running(step: &Step) -> bool {
    thread_is_running(&step.view.conversation, &step.view.transcript)
}

fn is_send(step: &Step) -> bool {
    matches!(step.input, PresenterInput::UserSent(_))
}

fn current_turn(step: &Step) -> Option<&str> {
    step.view.transcript.routing.current_turn.as_deref()
}

fn is_result(step: &Step) -> bool {
    matches!(step.input, PresenterInput::Event(AgentEvent::Result { .. }))
}

#[test]
fn a_turn_the_api_refused_with_a_400_ends_and_so_does_the_next_one_it_refuses() {
    // Seen on Windows: after the 400 the composer kept its stop button although the CLI had ended
    // the turn.
    let steps = replay("30-deny-empty-message");
    let results: Vec<usize> = (0..steps.len()).filter(|i| is_result(&steps[*i])).collect();
    assert_eq!(2, results.len());
    for &index in &results {
        assert!(!running(&steps[index]), "after the result at #{index}");
        assert_eq!(
            None,
            current_turn(&steps[index]),
            "the result at #{index} closed the turn receiving content"
        );
    }
    assert!(!running(steps.last().expect("a step")), "at the end");
    // Each message runs from its send, before core has a turn for it, until its result.
    for send in (0..steps.len()).filter(|i| is_send(&steps[*i])) {
        let result = results
            .iter()
            .copied()
            .find(|it| *it > send)
            .expect("a result after the send");
        for (index, step) in steps.iter().enumerate().take(result).skip(send) {
            assert!(running(step), "running at #{index}");
        }
    }
}

#[test]
fn a_message_the_cli_took_into_the_running_turn_ends_with_that_turn() {
    // Seen on Windows: the CLI took a message sent mid-turn into the running turn, no result came
    // for it, and the composer kept its stop button for the rest of the conversation.
    let steps = replay("31-send-mid-turn");
    let result = steps.iter().position(is_result).expect("a result");
    let second_send = steps
        .iter()
        .rposition(|it| matches!(it.input, PresenterInput::UserSent(_)))
        .expect("a send");
    assert!(
        second_send < result,
        "the second message goes while the first turn runs"
    );
    let first_send = steps.iter().position(is_send).expect("a send");
    for (index, step) in steps.iter().enumerate().take(result).skip(first_send) {
        assert!(running(step), "running at #{index}");
    }
    assert_eq!(
        None,
        current_turn(&steps[result]),
        "the result closed both turns, the one receiving content among them"
    );
    for (index, step) in steps.iter().enumerate().skip(result) {
        assert!(!running(step), "at rest at #{index}");
    }
}

#[test]
fn no_content_goes_to_a_turn_its_result_closed() {
    // 31: the message taken in started last, so it was the turn receiving content, but the result
    // names the first. Once core closes both, what the CLI says on its own later must open a
    // resume of its own.
    let last = replay_with("31-send-mid-turn", true).pop().expect("a step");

    assert_eq!(None, last.view.transcript.routing.current_turn);
}

#[test]
fn the_trees_is_running_is_this_rule_at_every_step_of_every_capture() {
    let mut failures = Vec::new();
    for scenario in scenarios() {
        for (index, step) in replay(&scenario).iter().enumerate() {
            let thread = at(&step.tree, &["threads", "byId", THREAD]);
            if thread.get("isRunning") != Some(&Value::Bool(running(step))) {
                failures.push(format!("{scenario} #{index}"));
            }
        }
    }
    assert!(failures.is_empty(), "{failures:?}");
}

#[test]
fn a_failed_send_does_not_keep_the_thread_running() {
    use closta_presenter::input::{SendId, UserSent};
    use closta_presenter::session::SessionView;

    let id = SendId::new("s1").expect("a key");
    let sent = SessionView::default().fold(&PresenterInput::UserSent(UserSent {
        message_id: id.clone(),
        text: "hello".to_owned(),
        attachments: Vec::new(),
        uuid: None,
    }));
    assert!(thread_is_running(&sent.conversation, &sent.transcript));

    let failed = sent.fold(&PresenterInput::SendFailed(id));
    assert!(!thread_is_running(&failed.conversation, &failed.transcript));
}
