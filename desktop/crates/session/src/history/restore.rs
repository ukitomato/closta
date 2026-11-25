//! How a resumed session puts its record back. RestoreSteps.kt and SessionViewHistory.kt.

use closta_model::AgentEvent;
use closta_presenter::input::PresenterInput;
use closta_presenter::session::SessionView;

/// How many of the newest lines a resumed session shows first.
pub const RESTORE_TAIL_LINES: usize = 400;

/// The steps a resumed session puts its record back in, each a set of lines and how many older
/// ones it leaves out: the newest [`RESTORE_TAIL_LINES`] first (the rest counted with `dropped`),
/// then every line. A record no longer than that is one step. Each step is meant for the view from
/// before the restore, so the second replaces the first. goldens/tests/record_read_budget.rs times
/// the same rule (with [`restored`]) on a copy of its own: change both together.
pub fn restore_steps(events: &[AgentEvent], dropped: i32) -> Vec<(Vec<AgentEvent>, i32)> {
    let Some(left_out) = events
        .len()
        .checked_sub(RESTORE_TAIL_LINES)
        .filter(|n| *n > 0)
    else {
        return vec![(events.to_vec(), dropped)];
    };
    let left_out = i32::try_from(left_out).unwrap_or(i32::MAX);
    vec![
        (
            events[events.len() - RESTORE_TAIL_LINES..].to_vec(),
            left_out.saturating_add(dropped),
        ),
        (events.to_vec(), dropped),
    ]
}

/// `view` with the earlier conversation put back: each line of the record folded as a restored
/// line, then that everything is back with `dropped` older lines left out.
pub fn restored(view: SessionView, events: &[AgentEvent], dropped: i32) -> SessionView {
    events
        .iter()
        .fold(view, |view, event| {
            view.fold(&PresenterInput::Restored(event.clone()))
        })
        .fold(&PresenterInput::HistoryRestored(dropped))
}

/// `view` with the record of the resumed session said to be unreadable: it goes on without its
/// earlier conversation.
pub fn history_unavailable(view: SessionView) -> SessionView {
    view.fold(&PresenterInput::HistoryUnavailable)
}

#[cfg(test)]
mod tests {
    use closta_model::RawJson;

    use super::*;

    fn assistant(n: usize) -> AgentEvent {
        AgentEvent::Assistant {
            uuid: format!("a{n}"),
            session_id: "s".to_owned(),
            timestamp: "t".to_owned(),
            request_id: Some(format!("r{n}")),
            message: RawJson(format!(
                r#"{{"id":"msg_{n}","type":"message","role":"assistant","content":[{{"type":"text","text":"line {n}"}}]}}"#
            )),
            parent_tool_use_id: None,
            user_message_uuid: None,
            user_message_uuids: None,
            wire_tool_inputs: None,
            subagent_type: None,
            task_description: None,
            error: None,
        }
    }

    fn events(count: usize) -> Vec<AgentEvent> {
        (0..count).map(assistant).collect()
    }

    #[test]
    fn the_tail_comes_first_then_everything() {
        let events = events(1_000);

        let steps = restore_steps(&events, 0);

        assert_eq!(
            steps,
            [
                (events[1_000 - RESTORE_TAIL_LINES..].to_vec(), 600),
                (events.clone(), 0),
            ]
        );
    }

    #[test]
    fn a_short_record_is_one_step() {
        let events = events(300);

        assert_eq!(restore_steps(&events, 2), [(events.clone(), 2)]);
    }

    #[test]
    fn a_dropped_count_is_kept_in_both_steps() {
        let steps = restore_steps(&events(1_000), 7);

        assert_eq!(
            steps
                .iter()
                .map(|(_, dropped)| *dropped)
                .collect::<Vec<_>>(),
            [607, 7]
        );
    }

    #[test]
    fn the_second_step_replaces_the_first() {
        let events = events(1_000);
        let base = SessionView::default();

        let views: Vec<SessionView> = restore_steps(&events, 0)
            .into_iter()
            .map(|(lines, dropped)| restored(base.clone(), &lines, dropped))
            .collect();

        let whole = restored(base.clone(), &events, 0);
        assert_eq!(whole.transcript, views[1].transcript);
        assert_ne!(views[0].transcript, views[1].transcript);
        assert_ne!(whole.transcript, base.transcript);
    }

    #[test]
    fn an_unavailable_history_is_folded_into_the_transcript() {
        let base = SessionView::default();

        let after = history_unavailable(base.clone());

        assert_eq!(
            after,
            base.fold(&PresenterInput::HistoryUnavailable),
            "the same as folding HistoryUnavailable"
        );
        assert_ne!(after.transcript, SessionView::default().transcript);
    }
}
