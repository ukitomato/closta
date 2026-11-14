//! Whether a thread is running (ThreadRunning.kt).

use closta_model::{ConversationState, TurnPhase};

use crate::transcript::Transcript;

/// Whether a thread is running: the one rule the tree's `isRunning` and the host's "in a turn"
/// both follow.
///
/// It runs while a turn is open, while the CLI speaks on its own (a resume that is open), while it
/// waits on an approval the tree shows (one with an id: the webview cannot answer without one),
/// and between a send and core's turn for it (core opens one turn per message the CLI takes,
/// queued or started). A turn a stop ended (`Routing::stopped`) does not run, whether or not a
/// `result` named it.
pub fn thread_is_running(conversation: &ConversationState, transcript: &Transcript) -> bool {
    let routing = &transcript.routing;
    conversation
        .turns
        .iter()
        .any(|turn| turn.phase == TurnPhase::Open && !routing.stopped.contains(&turn.command_uuid))
        || routing.open_resume.is_some()
        || conversation
            .pending_approvals
            .iter()
            .any(|approval| !approval.request_id.is_empty())
        || usize::try_from(routing.sends).is_ok_and(|sends| sends > conversation.turns.len())
}

#[cfg(test)]
mod tests {
    use closta_model::{ApprovalKind, ConversationState, PendingApproval, Turn, TurnPhase};

    use super::*;
    use crate::transcript::{Routing, Transcript};

    fn running(conversation: &ConversationState, routing: Routing) -> bool {
        thread_is_running(
            conversation,
            &Transcript {
                routing,
                ..Transcript::default()
            },
        )
    }

    fn turn(command_uuid: &str, phase: TurnPhase) -> Turn {
        Turn {
            command_uuid: command_uuid.into(),
            phase,
            incomplete_reason: None,
            lifecycle_done: false,
        }
    }

    fn with_turn(phase: TurnPhase) -> ConversationState {
        ConversationState {
            turns: vec![turn("c1", phase)],
            ..ConversationState::default()
        }
    }

    fn with_approval(request_id: &str) -> ConversationState {
        ConversationState {
            pending_approvals: vec![PendingApproval {
                request_id: request_id.into(),
                kind: ApprovalKind::Approval,
                tool_use_id: None,
                agent_id: None,
            }],
            ..ConversationState::default()
        }
    }

    #[test]
    fn a_thread_with_nothing_in_it_is_at_rest() {
        assert!(!running(&ConversationState::default(), Routing::default()));
    }

    #[test]
    fn an_open_turn_runs_a_closed_one_does_not() {
        assert!(running(&with_turn(TurnPhase::Open), Routing::default()));
        assert!(!running(&with_turn(TurnPhase::Closed), Routing::default()));
    }

    #[test]
    fn a_turn_a_stop_ended_does_not_run() {
        let stopped = Routing {
            stopped: ["c1".to_owned()].into_iter().collect(),
            ..Routing::default()
        };

        assert!(!running(&with_turn(TurnPhase::Open), stopped));
    }

    #[test]
    fn a_resume_the_cli_opened_on_its_own_runs() {
        let open = Routing {
            open_resume: Some("m1".into()),
            ..Routing::default()
        };

        assert!(running(&ConversationState::default(), open));
    }

    #[test]
    fn an_approval_waited_on_runs_but_one_with_no_id_is_not_shown_and_does_not() {
        assert!(running(&with_approval("r1"), Routing::default()));
        assert!(!running(&with_approval(""), Routing::default()));
    }

    #[test]
    fn a_send_core_has_opened_no_turn_for_yet_runs_and_stops_once_the_turn_is_there() {
        let sent = || Routing {
            sends: 1,
            ..Routing::default()
        };

        assert!(running(&ConversationState::default(), sent()));
        assert!(!running(&with_turn(TurnPhase::Closed), sent()));
    }
}
