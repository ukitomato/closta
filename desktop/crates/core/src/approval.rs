//! Resolves a pending request from the host's out-of-band decision. Mirrors `ApprovalResolution.kt`.

use closta_model::{ApprovalDecision, ConversationState};

/// Removes the pending request whose `request_id` equals the decision's, and returns the state.
///
/// Pure, and reads no clock: `elapsed_ms` is supplied by the caller so the AFK, answer and
/// no-answer cases can be replayed under a virtual clock. It does not change the outcome: every
/// [`ApprovalDecision`] variant removes the request the same way, because core keeps no terminal
/// state. A decision that matches nothing pending leaves the state untouched.
pub fn resolve_approval(
    mut state: ConversationState,
    decision: &ApprovalDecision,
    _elapsed_ms: i64,
) -> ConversationState {
    let request_id = decision.request_id();
    state
        .pending_approvals
        .retain(|p| p.request_id != request_id);
    state
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fold;
    use closta_model::{AgentEvent, ApprovalKind, ConversationState, RawJson};

    fn control_request(
        request_id: &str,
        tool_name: Option<&str>,
        tool_use_id: Option<&str>,
    ) -> AgentEvent {
        AgentEvent::ControlRequest {
            request_id: request_id.into(),
            request: RawJson(r#"{"subtype":"can_use_tool"}"#.into()),
            agent_id: None,
            tool_name: tool_name.map(str::to_string),
            tool_use_id: tool_use_id.map(str::to_string),
        }
    }

    fn fold_all(events: &[AgentEvent]) -> ConversationState {
        events.iter().fold(ConversationState::default(), fold)
    }

    fn ids(state: &ConversationState) -> Vec<&str> {
        state
            .pending_approvals
            .iter()
            .map(|p| p.request_id.as_str())
            .collect()
    }

    fn allow(request_id: &str) -> ApprovalDecision {
        ApprovalDecision::Allow {
            request_id: request_id.into(),
        }
    }

    #[test]
    fn an_approval_with_a_null_tool_use_id_is_still_held_keyed_by_request_id() {
        let state = fold(
            ConversationState::default(),
            &control_request("r1", Some("Write"), None),
        );

        assert_eq!(1, state.pending_approvals.len());
        let pending = &state.pending_approvals[0];
        assert_eq!("r1", pending.request_id, "held by request_id");
        assert_eq!(
            None, pending.tool_use_id,
            "a null tool_use_id does not stop it being held"
        );
        assert_eq!(ApprovalKind::Approval, pending.kind);
    }

    #[test]
    fn a_repeated_request_id_is_not_enqueued_twice() {
        let once = fold(
            ConversationState::default(),
            &control_request("r1", Some("Write"), Some("toolu_1")),
        );
        let twice = fold(once, &control_request("r1", Some("Write"), Some("toolu_1")));

        assert_eq!(
            1,
            twice.pending_approvals.len(),
            "the duplicate is guarded, not stacked"
        );
    }

    #[test]
    fn resolving_an_approval_removes_it_and_leaves_no_terminal_state() {
        let state = fold(
            ConversationState::default(),
            &control_request("r1", Some("Write"), Some("toolu_1")),
        );

        let resolved = resolve_approval(state, &allow("r1"), 0);

        assert!(
            resolved.pending_approvals.is_empty(),
            "the resolved approval is removed, not kept as a terminal state"
        );
    }

    #[test]
    fn resolving_keeps_the_other_pending_approvals_in_order() {
        let two = fold_all(&[
            control_request("r1", Some("Write"), Some("toolu_1")),
            control_request("r2", Some("AskUserQuestion"), Some("toolu_2")),
        ]);

        let resolved = resolve_approval(
            two,
            &ApprovalDecision::Deny {
                request_id: "r1".into(),
            },
            0,
        );

        assert_eq!(vec!["r2"], ids(&resolved), "only r1 is removed; r2 stays");
    }

    #[test]
    fn resolving_an_unknown_request_id_is_a_no_op() {
        let state = fold(
            ConversationState::default(),
            &control_request("r1", Some("Write"), Some("toolu_1")),
        );

        let resolved = resolve_approval(state.clone(), &allow("does-not-exist"), 0);

        assert_eq!(
            state, resolved,
            "resolving a request that is not pending changes nothing"
        );
    }
}
