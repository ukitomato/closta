//! An input that touches one message leaves every other record the same `Arc`
//! (ReferenceStabilityTest.kt, the transcript's half).
//!
//! The cases that hold tree nodes to identity are not ported: the projector here has no memo
//! (`ProjectionMemo`), so it builds every node afresh. What the transcript reuses is ported: a
//! frame that adds nothing leaves the transcript the same `Arc`, and a streamed text delta
//! rebuilds only the path down to its part — held here on the transcript's records rather than on
//! the tree's nodes.

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
