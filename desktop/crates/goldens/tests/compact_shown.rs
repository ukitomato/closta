//! Capture 21: `/compact` is shown as a divider in the thread, and as a status while it runs
//! (CompactShownTest.kt). The failures no capture carries are made by hand from 21's own lines and
//! say so in their names.

use closta_goldens::lines;
use closta_goldens::replay::{inputs, replay};
use closta_model::AgentEvent;
use closta_presenter::composer_state::composer_state;
use closta_presenter::input::PresenterInput;
use closta_presenter::rows::{Divider, ThreadRow, ThreadRows};
use closta_presenter::session::SessionView;

fn inputs_21() -> Vec<PresenterInput> {
    inputs("21-compact", false)
}

fn event_of(input: &PresenterInput) -> Option<&AgentEvent> {
    match input {
        PresenterInput::Event(event) => Some(event),
        _ => None,
    }
}

/// The status that ends a compaction: no status, and a `compact_result`.
fn is_result_status(event: Option<&AgentEvent>) -> bool {
    matches!(
        event,
        Some(AgentEvent::SystemStatus {
            status: None,
            compact_result: Some(_),
            ..
        })
    )
}

fn run(inputs: &[PresenterInput]) -> SessionView {
    inputs
        .iter()
        .fold(SessionView::default(), SessionView::fold)
}

fn with(view: &SessionView, event: AgentEvent) -> SessionView {
    view.clone().fold(&PresenterInput::Event(event))
}

/// What every divider row of the thread marks.
fn compacted(view: &SessionView) -> Vec<Divider> {
    ThreadRows::default()
        .of(&view.transcript)
        .into_iter()
        .filter_map(|row| match row {
            ThreadRow::Divider(it) => Some(it.divider.clone()),
            _ => None,
        })
        .collect()
}

/// `input` with the status that ends the compaction saying it failed.
fn failed_status(input: &PresenterInput) -> PresenterInput {
    match event_of(input) {
        Some(AgentEvent::SystemStatus {
            uuid,
            session_id,
            status,
            permission_mode,
            ..
        }) if is_result_status(event_of(input)) => {
            PresenterInput::Event(AgentEvent::SystemStatus {
                uuid: uuid.clone(),
                session_id: session_id.clone(),
                status: status.clone(),
                permission_mode: permission_mode.clone(),
                compact_result: Some("failed".to_owned()),
            })
        }
        _ => input.clone(),
    }
}

fn divider(trigger: &str, pre_tokens: i64, post_tokens: Option<i64>, failed: bool) -> Divider {
    Divider::Compacted {
        trigger: trigger.to_owned(),
        pre_tokens,
        post_tokens,
        failed,
    }
}

// CompactShownTest.kt: `21 the thread has one divider with the trigger and both counts`.
#[test]
fn capture_21_the_thread_has_one_divider_with_the_trigger_and_both_counts() {
    // 21 line 21: the boundary's `compact_metadata`.
    assert_eq!(
        vec![divider("manual", 21819, Some(3447), false)],
        compacted(&run(&inputs_21()))
    );
}

// CompactShownTest.kt: `21 compacting is true after the compacting status and false after the one
// that ends it`.
#[test]
fn capture_21_compacting_is_true_after_the_compacting_status_and_false_after_the_one_that_ends_it()
{
    let mut view = SessionView::default();
    let mut seen: Vec<(Option<String>, bool)> = Vec::new();
    for input in inputs_21() {
        view = view.fold(&input);
        if let Some(AgentEvent::SystemStatus { status, .. }) = event_of(&input) {
            let compacting = composer_state(&view.conversation, &view.transcript).compacting;
            seen.push((status.clone(), compacting));
        }
    }
    let said: Vec<bool> = seen
        .iter()
        .filter(|it| it.0.as_deref() == Some("compacting"))
        .map(|it| it.1)
        .collect();
    assert_eq!(vec![true], said, "{seen:?}");
    let last_closing = seen
        .iter()
        .rev()
        .find(|it| it.0.is_none())
        .unwrap_or_else(|| panic!("no status closes the compaction: {seen:?}"));
    assert!(!last_closing.1, "{seen:?}");
}

// CompactShownTest.kt: `21 with no status closing the compaction, it is not said once the turn is
// over`.
#[test]
fn capture_21_with_no_status_closing_the_compaction_it_is_not_said_once_the_turn_is_over() {
    let all = inputs_21();
    let compacting = all
        .iter()
        .position(|it| {
            matches!(event_of(it), Some(AgentEvent::SystemStatus { status: Some(s), .. }) if s == "compacting")
        })
        .unwrap_or_else(|| panic!("21 says it is compacting"));
    let unclosed: Vec<PresenterInput> = all
        .iter()
        .enumerate()
        .filter(|(index, input)| {
            *index <= compacting
                || !matches!(
                    event_of(input),
                    Some(AgentEvent::SystemStatus { status: None, .. })
                )
        })
        .map(|(_, input)| input.clone())
        .collect();
    let view = run(&unclosed);

    assert!(
        view.transcript.operations.compacting,
        "the CLI never said it stopped"
    );
    assert!(!composer_state(&view.conversation, &view.transcript).compacting);
}

// CompactShownTest.kt: `type only - a failed result before the boundary makes the divider failed`.
#[test]
fn type_only_a_failed_result_before_the_boundary_makes_the_divider_failed() {
    let failed: Vec<PresenterInput> = inputs_21().iter().map(failed_status).collect();
    assert_eq!(
        vec![divider("manual", 21819, Some(3447), true)],
        compacted(&run(&failed))
    );
}

// CompactShownTest.kt: `type only - a failure with no boundary is shown at the result, once`.
#[test]
fn type_only_a_failure_with_no_boundary_is_shown_at_the_result_once() {
    let list: Vec<PresenterInput> = inputs_21()
        .iter()
        .map(failed_status)
        .filter(|it| !matches!(event_of(it), Some(AgentEvent::SystemCompactBoundary { .. })))
        .collect();
    let view = run(&list);

    assert_eq!(vec![divider("unknown", 0, None, true)], compacted(&view));
    assert_eq!(
        None, view.transcript.compact_failure,
        "the result used it up"
    );
}

// CompactShownTest.kt: `type only - a conversation reset drops a failure waiting for its boundary`.
#[test]
fn type_only_a_conversation_reset_drops_a_failure_waiting_for_its_boundary() {
    let failed = with(
        &SessionView::default(),
        AgentEvent::SystemStatus {
            uuid: "st".to_owned(),
            session_id: "s-1".to_owned(),
            status: None,
            permission_mode: None,
            compact_result: Some("failed".to_owned()),
        },
    );
    let reset = AgentEvent::ConversationReset {
        uuid: "rs".to_owned(),
        session_id: "s-1".to_owned(),
        new_conversation_id: "s-2".to_owned(),
        trigger: None,
        user_message_uuid: None,
        timestamp: Some("2026-11-14T12:26:36.305Z".to_owned()),
    };

    assert_eq!(Some("st"), failed.transcript.compact_failure.as_deref());
    assert_eq!(None, with(&failed, reset).transcript.compact_failure);
}

// CompactShownTest.kt: `the compact part is a part of its own type in the tree`.
#[test]
fn the_compact_part_is_a_part_of_its_own_type_in_the_tree() {
    let tree = replay("21-compact")
        .pop()
        .unwrap_or_else(|| panic!("21 gives no step"))
        .tree;
    let text = serde_json::to_string(&tree).unwrap_or_default();
    assert!(text.contains(r#""type":"compacted""#), "{text}");
}

/// Not ported from Kotlin, which has no test of the rule (Review Focus 5): SessionLineFold.kt:96
/// (a22fa03) makes no divider of a boundary that does not say how many tokens it began with.
#[test]
fn a_boundary_with_no_pre_tokens_makes_no_divider() {
    let turn = [lines::queued("c1"), lines::started("c1")]
        .into_iter()
        .fold(SessionView::default(), |view, event| with(&view, event));
    let counted = with(
        &turn,
        lines::compact_boundary(r#"{"trigger":"auto","pre_tokens":9,"post_tokens":3}"#),
    );
    assert_eq!(
        vec![divider("auto", 9, Some(3), false)],
        compacted(&counted),
        "a boundary with its counts makes one"
    );

    let uncounted = with(
        &turn,
        lines::compact_boundary(r#"{"trigger":"auto","post_tokens":3}"#),
    );
    assert!(compacted(&uncounted).is_empty());
    assert!(
        std::sync::Arc::ptr_eq(&turn.transcript, &uncounted.transcript),
        "the transcript is the same"
    );
}
