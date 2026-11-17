//! The use cases over [`AgentSession`]. Mirrors the classes in `core/services/*.kt`.
//!
//! Each one holds no state and performs no transition of its own: it issues one call through the
//! session and returns. The state moves only when the events the session emits are folded by the
//! read side. [`respond_to_approval`] is the one that also returns a state, and it moves it only
//! through the pure [`resolve_approval`].

use std::time::SystemTime;

use closta_model::{ApprovalDecision, Attachment, ConversationState};

use crate::ports::{AgentSession, Clock, SendError};
use crate::resolve_approval;

/// Sends a user message. `attachments` go before the text; `uuid` is the caller's id for the
/// message, `None` lets the session make one. Mirrors `SendMessage.kt`.
pub fn send_message(
    session: &dyn AgentSession,
    text: &str,
    attachments: &[Attachment],
    uuid: Option<&str>,
) -> Result<(), SendError> {
    session.send_user_message(text, attachments, uuid)
}

/// Changes the model live; the answer carries `request_id`. Mirrors `SwitchModel.kt`.
pub fn switch_model(
    session: &dyn AgentSession,
    model: &str,
    request_id: &str,
) -> Result<(), SendError> {
    session.set_model(model, request_id)
}

/// Changes the permission mode live; the mode in the state moves when the `system/status` that
/// follows is folded. Mirrors `SwitchPermissionMode.kt`.
pub fn switch_permission_mode(
    session: &dyn AgentSession,
    mode: &str,
    request_id: &str,
) -> Result<(), SendError> {
    session.set_permission_mode(mode, request_id)
}

/// Asks how much of the context window is used. Mirrors `RequestContextUsage.kt`.
pub fn request_context_usage(
    session: &dyn AgentSession,
    request_id: &str,
) -> Result<(), SendError> {
    session.request_context_usage(request_id)
}

/// Asks for the settings in effect. Mirrors `RequestSettings.kt`.
pub fn request_settings(session: &dyn AgentSession, request_id: &str) -> Result<(), SendError> {
    session.request_settings(request_id)
}

/// Changes the effort live; `None` puts the model's own default back. Mirrors `SwitchEffort.kt`.
pub fn switch_effort(
    session: &dyn AgentSession,
    effort: Option<&str>,
    request_id: &str,
) -> Result<(), SendError> {
    session.set_effort(effort, request_id)
}

/// Turns the sandbox off live; whether it is off is read back from the settings the session
/// answers with. Mirrors `TurnSandboxOff.kt`.
pub fn turn_sandbox_off(session: &dyn AgentSession, request_id: &str) -> Result<(), SendError> {
    session.turn_sandbox_off(request_id)
}

/// Asks which MCP servers the session has and in what state. Mirrors `RequestMcpStatus.kt`.
pub fn request_mcp_status(session: &dyn AgentSession, request_id: &str) -> Result<(), SendError> {
    session.request_mcp_status(request_id)
}

/// Turns one MCP server on or off; `enabled` is the wanted value, not a flip. Mirrors
/// `SetMcpServerEnabled.kt`.
pub fn set_mcp_server_enabled(
    session: &dyn AgentSession,
    name: &str,
    enabled: bool,
    request_id: &str,
) -> Result<(), SendError> {
    session.set_mcp_server_enabled(name, enabled, request_id)
}

/// Reconnects one MCP server. Mirrors `ReconnectMcpServer.kt`.
pub fn reconnect_mcp_server(
    session: &dyn AgentSession,
    name: &str,
    request_id: &str,
) -> Result<(), SendError> {
    session.reconnect_mcp_server(name, request_id)
}

/// Puts the files back as they were before a user message, or with `dry_run` only asks what
/// would change. Mirrors `RewindFiles.kt`.
pub fn rewind_files(
    session: &dyn AgentSession,
    user_message_id: &str,
    dry_run: bool,
    request_id: &str,
) -> Result<(), SendError> {
    session.rewind_files(user_message_id, dry_run, request_id)
}

/// Interrupts whatever the agent is doing. Mirrors `Interrupt.kt`.
pub fn interrupt(session: &dyn AgentSession) -> Result<(), SendError> {
    session.interrupt()
}

/// Stops one running task by the agent's own id. Mirrors `StopTask.kt`.
pub fn stop_task(session: &dyn AgentSession, task_id: &str) -> Result<(), SendError> {
    session.stop_task(task_id)
}

/// The milliseconds from `requested_at` to `now`, or 0 when the clock went backward: a negative
/// figure would mean something to [`resolve_approval`] that never happened.
pub fn elapsed_ms(requested_at: SystemTime, now: SystemTime) -> i64 {
    now.duration_since(requested_at).map_or(0, |elapsed| {
        i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX)
    })
}

/// Returns the host's decision about a pending approval and drops it from the state. Mirrors
/// `RespondToApproval.kt`.
///
/// `requested_at` is when the approval was raised; the caller tracks it. `payload` and
/// `updated_permissions` ride through unread. The decision is sent first: if that fails the error
/// comes back unchanged and no state is returned, so the caller still holds the pending approval
/// and can answer again.
pub fn respond_to_approval(
    session: &dyn AgentSession,
    clock: &dyn Clock,
    state: &ConversationState,
    decision: &ApprovalDecision,
    requested_at: SystemTime,
    payload: Option<&str>,
    updated_permissions: Option<&str>,
) -> Result<ConversationState, SendError> {
    session.respond_to_approval(decision, payload, updated_permissions)?;
    let elapsed = elapsed_ms(requested_at, clock.now());
    Ok(resolve_approval(state.clone(), decision, elapsed))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fold;
    use closta_model::{AgentEvent, ApprovalKind, PendingApproval, TurnPhase};
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{Duration, UNIX_EPOCH};

    /// One call that reached the session, with what it carried.
    #[derive(Clone, PartialEq, Debug)]
    enum Call {
        Message(String, usize, Option<String>),
        Approval(ApprovalDecision, Option<String>, Option<String>),
        Model(String, String),
        Mode(String, String),
        ContextUsage(String),
        Settings(String),
        Effort(Option<String>, String),
        SandboxOff(String),
        McpStatus(String),
        McpEnabled(String, bool, String),
        McpReconnect(String, String),
        Rewind(String, bool, String),
        Interrupt,
        StopTask(String),
    }

    /// Records every call in order. With `fails` every call is refused as closed.
    #[derive(Default)]
    struct Recording {
        calls: Mutex<Vec<Call>>,
        fails: bool,
    }

    impl Recording {
        fn failing() -> Self {
            Self {
                fails: true,
                ..Self::default()
            }
        }

        fn calls(&self) -> Vec<Call> {
            self.calls.lock().unwrap().clone()
        }

        fn record(&self, call: Call) -> Result<(), SendError> {
            if self.fails {
                return Err(SendError::Closed);
            }
            self.calls.lock().unwrap().push(call);
            Ok(())
        }
    }

    impl AgentSession for Recording {
        fn send_user_message(
            &self,
            text: &str,
            attachments: &[Attachment],
            uuid: Option<&str>,
        ) -> Result<(), SendError> {
            self.record(Call::Message(
                text.into(),
                attachments.len(),
                uuid.map(Into::into),
            ))
        }
        fn respond_to_approval(
            &self,
            decision: &ApprovalDecision,
            payload: Option<&str>,
            updated_permissions: Option<&str>,
        ) -> Result<(), SendError> {
            self.record(Call::Approval(
                decision.clone(),
                payload.map(Into::into),
                updated_permissions.map(Into::into),
            ))
        }
        fn set_model(&self, model: &str, request_id: &str) -> Result<(), SendError> {
            self.record(Call::Model(model.into(), request_id.into()))
        }
        fn set_permission_mode(&self, mode: &str, request_id: &str) -> Result<(), SendError> {
            self.record(Call::Mode(mode.into(), request_id.into()))
        }
        fn request_context_usage(&self, request_id: &str) -> Result<(), SendError> {
            self.record(Call::ContextUsage(request_id.into()))
        }
        fn request_settings(&self, request_id: &str) -> Result<(), SendError> {
            self.record(Call::Settings(request_id.into()))
        }
        fn set_effort(&self, effort: Option<&str>, request_id: &str) -> Result<(), SendError> {
            self.record(Call::Effort(effort.map(Into::into), request_id.into()))
        }
        fn turn_sandbox_off(&self, request_id: &str) -> Result<(), SendError> {
            self.record(Call::SandboxOff(request_id.into()))
        }
        fn request_mcp_status(&self, request_id: &str) -> Result<(), SendError> {
            self.record(Call::McpStatus(request_id.into()))
        }
        fn set_mcp_server_enabled(
            &self,
            name: &str,
            enabled: bool,
            request_id: &str,
        ) -> Result<(), SendError> {
            self.record(Call::McpEnabled(name.into(), enabled, request_id.into()))
        }
        fn reconnect_mcp_server(&self, name: &str, request_id: &str) -> Result<(), SendError> {
            self.record(Call::McpReconnect(name.into(), request_id.into()))
        }
        fn rewind_files(
            &self,
            user_message_id: &str,
            dry_run: bool,
            request_id: &str,
        ) -> Result<(), SendError> {
            self.record(Call::Rewind(
                user_message_id.into(),
                dry_run,
                request_id.into(),
            ))
        }
        fn interrupt(&self) -> Result<(), SendError> {
            self.record(Call::Interrupt)
        }
        fn stop_task(&self, task_id: &str) -> Result<(), SendError> {
            self.record(Call::StopTask(task_id.into()))
        }
    }

    /// A clock pinned to one instant.
    struct Fixed(SystemTime);

    impl Clock for Fixed {
        fn now(&self) -> SystemTime {
            self.0
        }
    }

    /// A clock that counts its reads, so a test can prove the use case reads the injected clock:
    /// `resolve_approval` discards the elapsed figure, so a fixed clock alone could not show it.
    struct Counting {
        at: SystemTime,
        reads: AtomicUsize,
    }

    impl Clock for Counting {
        fn now(&self) -> SystemTime {
            self.reads.fetch_add(1, Ordering::SeqCst);
            self.at
        }
    }

    fn now() -> SystemTime {
        UNIX_EPOCH + Duration::from_secs(1_790_553_605)
    }

    /// A pending approval raised five seconds before [`now`].
    fn requested_at() -> SystemTime {
        now() - Duration::from_millis(5_000)
    }

    fn two_pending() -> ConversationState {
        let pending = |id: &str, kind| PendingApproval {
            request_id: id.into(),
            kind,
            tool_use_id: None,
            agent_id: None,
        };
        ConversationState {
            pending_approvals: [
                pending("A", ApprovalKind::Approval),
                pending("B", ApprovalKind::Ask),
            ]
            .into_iter()
            .collect(),
            ..ConversationState::default()
        }
    }

    fn pending_ids(state: &ConversationState) -> Vec<String> {
        state
            .pending_approvals
            .iter()
            .map(|p| p.request_id.clone())
            .collect()
    }

    fn allow(id: &str) -> ApprovalDecision {
        ApprovalDecision::Allow {
            request_id: id.into(),
        }
    }

    #[test]
    fn send_message_sends_the_user_message_through_the_session() {
        let session = Recording::default();

        send_message(&session, "hi", &[], None).unwrap();

        assert_eq!(session.calls(), vec![Call::Message("hi".into(), 0, None)]);
    }

    #[test]
    fn switch_model_sends_the_live_model_change_with_the_callers_id() {
        let session = Recording::default();

        switch_model(&session, "claude-opus-5-5", "req-1").unwrap();

        assert_eq!(
            session.calls(),
            vec![Call::Model("claude-opus-5-5".into(), "req-1".into())]
        );
    }

    #[test]
    fn switch_permission_mode_and_request_context_usage_pass_the_callers_id_through() {
        let session = Recording::default();

        switch_permission_mode(&session, "plan", "req-2").unwrap();
        request_context_usage(&session, "req-3").unwrap();

        assert_eq!(
            session.calls(),
            vec![
                Call::Mode("plan".into(), "req-2".into()),
                Call::ContextUsage("req-3".into()),
            ]
        );
    }

    #[test]
    fn request_settings_and_switch_effort_pass_the_callers_id_through() {
        let session = Recording::default();

        request_settings(&session, "req-9").unwrap();
        switch_effort(&session, Some("high"), "req-10").unwrap();
        switch_effort(&session, None, "req-11").unwrap();

        assert_eq!(
            session.calls(),
            vec![
                Call::Settings("req-9".into()),
                Call::Effort(Some("high".into()), "req-10".into()),
                Call::Effort(None, "req-11".into()),
            ]
        );
    }

    #[test]
    fn turn_sandbox_off_passes_the_callers_id_through() {
        let session = Recording::default();

        turn_sandbox_off(&session, "req-12").unwrap();

        assert_eq!(session.calls(), vec![Call::SandboxOff("req-12".into())]);
    }

    #[test]
    fn the_mcp_use_cases_pass_the_callers_id_and_the_wanted_value_through() {
        let session = Recording::default();

        request_mcp_status(&session, "req-4").unwrap();
        set_mcp_server_enabled(&session, "fake-echo", false, "req-5").unwrap();
        set_mcp_server_enabled(&session, "fake-echo", true, "req-6").unwrap();
        reconnect_mcp_server(&session, "fake-echo", "req-7").unwrap();

        // A wanted value, not a flip.
        assert_eq!(
            session.calls(),
            vec![
                Call::McpStatus("req-4".into()),
                Call::McpEnabled("fake-echo".into(), false, "req-5".into()),
                Call::McpEnabled("fake-echo".into(), true, "req-6".into()),
                Call::McpReconnect("fake-echo".into(), "req-7".into()),
            ]
        );
    }

    #[test]
    fn send_message_passes_the_uuid_on_and_rewind_files_asks_for_the_rewind() {
        let session = Recording::default();

        send_message(&session, "hi", &[], Some("u-1")).unwrap();
        send_message(&session, "again", &[], None).unwrap();
        rewind_files(&session, "u-1", true, "req-8").unwrap();

        assert_eq!(
            session.calls(),
            vec![
                Call::Message("hi".into(), 0, Some("u-1".into())),
                Call::Message("again".into(), 0, None),
                Call::Rewind("u-1".into(), true, "req-8".into()),
            ]
        );
    }

    #[test]
    fn interrupt_sends_the_interrupt_through_the_session() {
        let session = Recording::default();

        interrupt(&session).unwrap();

        assert_eq!(session.calls(), vec![Call::Interrupt]);
    }

    #[test]
    fn the_state_advances_by_folding_the_events_the_session_emits_not_inside_a_use_case() {
        // A user-started turn opens on command_lifecycle{queued}. The session emits it and the
        // read side folds it; no use case is involved.
        let session = Recording::default();
        let opening = AgentEvent::CommandLifecycle {
            uuid: "u1".into(),
            session_id: "s1".into(),
            command_uuid: "c1".into(),
            state: "queued".into(),
        };

        let state = fold(ConversationState::default(), &opening);

        assert_eq!(
            state.turns.len(),
            1,
            "folding the emitted event opened a turn"
        );
        assert_eq!(state.turns[0].command_uuid, "c1");
        assert_eq!(state.turns[0].phase, TurnPhase::Open);
        assert!(
            session.calls().is_empty(),
            "no send happened: this is the read side"
        );
    }

    #[test]
    fn a_failed_send_reaches_the_caller_unchanged() {
        let session = Recording::failing();

        assert_eq!(
            send_message(&session, "hi", &[], None),
            Err(SendError::Closed)
        );
        assert_eq!(interrupt(&session), Err(SendError::Closed));
        assert_eq!(stop_task(&session, "a"), Err(SendError::Closed));
    }

    #[test]
    fn every_decision_variant_removes_its_target_pending_and_leaves_the_others() {
        let variants = [
            allow("A"),
            ApprovalDecision::Deny {
                request_id: "A".into(),
            },
            ApprovalDecision::Answered {
                request_id: "A".into(),
            },
            ApprovalDecision::AfkTimeout {
                request_id: "A".into(),
            },
        ];
        for decision in variants {
            let session = Recording::default();

            let next = respond_to_approval(
                &session,
                &Fixed(now()),
                &two_pending(),
                &decision,
                requested_at(),
                None,
                None,
            )
            .unwrap();

            assert_eq!(
                pending_ids(&next),
                vec!["B"],
                "{decision:?}: only A is removed"
            );
            assert_eq!(
                session.calls(),
                vec![Call::Approval(decision.clone(), None, None)],
                "{decision:?}: the decision went through the session"
            );
        }
    }

    #[test]
    fn a_failed_send_reaches_the_caller_and_the_pending_approval_stays() {
        let session = Recording::failing();
        let before = two_pending();

        let result = respond_to_approval(
            &session,
            &Fixed(now()),
            &before,
            &allow("A"),
            requested_at(),
            None,
            None,
        );

        assert_eq!(
            result,
            Err(SendError::Closed),
            "the session's own error, not wrapped"
        );
        assert_eq!(
            pending_ids(&before),
            vec!["A", "B"],
            "no new state came back, so the caller still holds both pending approvals"
        );
    }

    #[test]
    fn an_answered_decision_passes_the_raw_payload_through_opaquely() {
        let session = Recording::default();
        let answered = ApprovalDecision::Answered {
            request_id: "A".into(),
        };

        respond_to_approval(
            &session,
            &Fixed(now()),
            &two_pending(),
            &answered,
            requested_at(),
            Some(r#"{"answers":[]}"#),
            None,
        )
        .unwrap();

        assert_eq!(
            session.calls(),
            vec![Call::Approval(
                answered,
                Some(r#"{"answers":[]}"#.into()),
                None
            )]
        );
    }

    #[test]
    fn accepted_permission_suggestions_ride_through_to_the_session_and_default_to_none() {
        let session = Recording::default();
        let clock = Fixed(now());
        let suggestions = r#"[{"type":"setMode","mode":"acceptEdits","destination":"session"}]"#;

        respond_to_approval(
            &session,
            &clock,
            &two_pending(),
            &allow("A"),
            requested_at(),
            None,
            Some(suggestions),
        )
        .unwrap();
        respond_to_approval(
            &session,
            &clock,
            &two_pending(),
            &allow("B"),
            requested_at(),
            None,
            None,
        )
        .unwrap();

        assert_eq!(
            session.calls(),
            vec![
                Call::Approval(allow("A"), None, Some(suggestions.into())),
                Call::Approval(allow("B"), None, None),
            ]
        );
    }

    #[test]
    fn a_decision_for_a_request_that_is_not_pending_leaves_the_state_alone() {
        let session = Recording::default();

        let next = respond_to_approval(
            &session,
            &Fixed(now()),
            &two_pending(),
            &allow("nonexistent"),
            requested_at(),
            None,
            None,
        )
        .unwrap();

        assert_eq!(pending_ids(&next), vec!["A", "B"]);
    }

    #[test]
    fn the_use_case_reads_the_injected_clock() {
        let session = Recording::default();
        let clock = Counting {
            at: now(),
            reads: AtomicUsize::new(0),
        };

        let next = respond_to_approval(
            &session,
            &clock,
            &two_pending(),
            &ApprovalDecision::AfkTimeout {
                request_id: "A".into(),
            },
            requested_at(),
            None,
            None,
        )
        .unwrap();

        assert!(
            clock.reads.load(Ordering::SeqCst) >= 1,
            "the injected clock was read"
        );
        assert_eq!(pending_ids(&next), vec!["B"]);
    }

    #[test]
    fn a_backward_clock_gives_zero_elapsed() {
        assert_eq!(elapsed_ms(now(), requested_at()), 0, "requested after now");
        assert_eq!(elapsed_ms(requested_at(), now()), 5_000);
        assert_eq!(elapsed_ms(now(), now()), 0);
    }

    #[test]
    fn stop_task_stops_the_one_task_by_the_id_it_was_given() {
        let session = Recording::default();

        stop_task(&session, "bc4b0ae63").unwrap();

        // A stop of one task is not an interrupt.
        assert_eq!(session.calls(), vec![Call::StopTask("bc4b0ae63".into())]);
    }

    #[test]
    fn stop_task_is_stateless_so_each_call_is_its_own_request() {
        let session = Recording::default();

        for id in ["a", "b", "a"] {
            stop_task(&session, id).unwrap();
        }

        assert_eq!(
            session.calls(),
            vec![
                Call::StopTask("a".into()),
                Call::StopTask("b".into()),
                Call::StopTask("a".into()),
            ]
        );
    }
}
