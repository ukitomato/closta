//! An input that touches one record leaves every other record the same `Arc`
//! (ReferenceStabilityTest.kt, the transcript's half).
//!
//! The cases that hold tree nodes to identity are not ported: the projector here has no memo
//! (`ProjectionMemo`), so it builds every node afresh. What the transcript reuses is ported and held
//! on the transcript's records rather than on the tree's nodes: an input that shows nothing new and
//! a frame that adds nothing leave the transcript the same `Arc`, a streamed text delta rebuilds
//! only the path down to its part, and an answer to an approval rebuilds only that approval.

use std::sync::Arc;

use closta_goldens::replay::{Step, inputs, replay, scenarios};
use closta_model::AgentEvent;
use closta_presenter::input::PresenterInput;

fn frame(input: &PresenterInput) -> Option<&str> {
    match input {
        PresenterInput::Event(AgentEvent::StreamEvent { event, .. }) => Some(&event.0),
        _ => None,
    }
}

fn adds_nothing(frame: &str) -> bool {
    let empty_delta = [r#""text":"""#, r#""thinking":"""#, r#""partial_json":"""#]
        .iter()
        .any(|it| frame.contains(it));
    frame.contains("\"signature_delta\"")
        || frame.contains("\"message_delta\"")
        || (frame.contains("\"content_block_delta\"") && empty_delta)
}

fn is_text_delta(input: &PresenterInput) -> bool {
    frame(input).is_some_and(|it| it.contains("\"text_delta\"") && !it.contains(r#""text":"""#))
}

#[test]
fn an_input_that_shows_nothing_new_leaves_the_transcript_the_same_arc() {
    // 06, 24, 28, 34, 35 and 40 are control requests only: none has an init, a status or a rate
    // limit to be quiet about.
    let control_only = [
        "06-context-usage",
        "24-mcp-management",
        "28-effort-live",
        "34-sandbox-launch",
        "35-sandbox-project-setting",
        "40-sandbox-same-id",
    ];
    let scenarios = scenarios();
    assert_eq!(44, scenarios.len());
    for scenario in scenarios {
        let steps = replay(&scenario);
        let mut quiet = 0;
        for index in 1..steps.len() {
            let PresenterInput::Event(event) = &steps[index].input else {
                continue;
            };
            let (before, after) = (&steps[index - 1].view, &steps[index].view);
            // An init or a status shows nothing new unless it changed the session, which the
            // transcript's readers show, or whether the CLI is compacting, which they show too.
            let same_session = before.conversation.session == after.conversation.session;
            let same_compacting =
                before.transcript.operations.compacting == after.transcript.operations.compacting;
            let quiet_event = matches!(event, AgentEvent::RateLimitEvent { .. })
                || (same_session
                    && same_compacting
                    && matches!(
                        event,
                        AgentEvent::SystemStatus { .. } | AgentEvent::SystemInit { .. }
                    ));
            if !quiet_event {
                continue;
            }
            quiet += 1;
            assert!(
                Arc::ptr_eq(&before.transcript, &after.transcript),
                "{scenario} #{index}: {:?}",
                event.kind()
            );
        }
        if !control_only.contains(&scenario.as_str()) {
            assert!(quiet > 0, "{scenario}");
        }
    }
}

#[test]
fn a_frame_that_adds_nothing_leaves_the_transcript_the_same_arc() {
    // 06, 07, 24, 28, 34, 35 and 40 are control requests only: they have no streamed text.
    let control_only = [
        "06-context-usage",
        "07-set-model-and-mode",
        "24-mcp-management",
        "28-effort-live",
        "34-sandbox-launch",
        "35-sandbox-project-setting",
        "40-sandbox-same-id",
    ];
    for scenario in scenarios() {
        let steps = replay(&scenario);
        let mut empty = 0;
        for index in 1..steps.len() {
            let Some(text) = frame(&steps[index].input) else {
                continue;
            };
            if !adds_nothing(text) {
                continue;
            }
            empty += 1;
            assert!(
                Arc::ptr_eq(
                    &steps[index - 1].view.transcript,
                    &steps[index].view.transcript
                ),
                "{scenario} #{index}: {text}"
            );
        }
        if !control_only.contains(&scenario.as_str()) {
            assert!(empty > 0, "{scenario}");
        }
    }
}

fn changed<'a>(before: &'a Step, after: &'a Step) -> Vec<&'a str> {
    let (old, new) = (
        &before.view.transcript.messages,
        &after.view.transcript.messages,
    );
    old.order()
        .filter(|key| match (old.get(key), new.get(key)) {
            (Some(a), Some(b)) => !Arc::ptr_eq(a, b),
            _ => true,
        })
        .collect()
}

#[test]
fn a_streamed_text_delta_rebuilds_only_the_path_down_to_its_part() {
    let streamed: Vec<String> = scenarios()
        .into_iter()
        .filter(|scenario| inputs(scenario, false).iter().any(is_text_delta))
        .collect();
    assert!(!streamed.is_empty());
    for scenario in streamed {
        let steps = replay(&scenario);
        let mut deltas = 0;
        for index in 1..steps.len() {
            if !is_text_delta(&steps[index].input) {
                continue;
            }
            deltas += 1;
            let (before, after) = (&steps[index - 1], &steps[index]);
            let (old, new) = (
                &before.view.transcript.messages,
                &after.view.transcript.messages,
            );
            assert!(old.same_order(new), "{scenario} #{index}: messages order");
            let touched = changed(before, after);
            let [message] = touched[..] else {
                panic!("{scenario} #{index}: one message rebuilt, got {touched:?}");
            };
            let (old, new) = (
                old.get(message).expect("a message"),
                new.get(message).expect("a message"),
            );
            assert!(
                old.parts.same_order(&new.parts),
                "{scenario} #{index}: parts order"
            );
            let rebuilt: Vec<&str> = old
                .parts
                .order()
                .filter(|key| {
                    !Arc::ptr_eq(
                        old.parts.get(key).expect("a part"),
                        new.parts.get(key).expect("a part"),
                    )
                })
                .collect();
            assert_eq!(
                1,
                rebuilt.len(),
                "{scenario} #{index}: one part rebuilt, got {rebuilt:?}"
            );
        }
        assert!(deltas > 0, "{scenario}");
    }
}

/// Kotlin holds the tree to this: the answer rebuilds the message `c810a2d1-…` that shows the
/// approval. The transcript keeps approvals in `approvals`, not inside a message, so here the
/// messages stay the very same collection and only the answered approval is rebuilt; that the row
/// showing it is rebuilt is the rows' business.
#[test]
fn an_answer_to_an_approval_rebuilds_the_record_it_answers_and_nothing_else() {
    let steps = replay("05-permission-can-use-tool");
    let answer = steps
        .iter()
        .position(|step| matches!(step.input, PresenterInput::Decided(_)))
        .expect("an answer");
    let (before, after) = (
        &steps[answer - 1].view.transcript,
        &steps[answer].view.transcript,
    );
    assert!(before.messages.same(&after.messages));
    assert!(before.approvals.same_order(&after.approvals));
    let touched: Vec<&str> = before
        .approvals
        .order()
        .filter(
            |key| match (before.approvals.get(key), after.approvals.get(key)) {
                (Some(a), Some(b)) => !Arc::ptr_eq(a, b),
                _ => true,
            },
        )
        .collect();
    assert_eq!(vec!["e42c7fac-e237-4ee9-a6c1-d19579abb0f3"], touched);
    let PresenterInput::Decided(decided) = &steps[answer].input else {
        unreachable!()
    };
    assert_eq!(
        "e42c7fac-e237-4ee9-a6c1-d19579abb0f3",
        decided.decision.request_id()
    );
}
