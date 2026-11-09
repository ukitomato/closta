//! Folds one [`AgentEvent`] into a [`ConversationState`]. Mirrors `ConversationFold.kt`.
//!
//! `fold` is pure and never panics: an `UnknownKind` or `BrokenLine`, or any event carrying nothing
//! this fold reflects, leaves the state untouched. It reads only the typed top-level fields of an
//! event; every nested `RawJson` stays unopened.

use closta_model::{
    AgentEvent, ApprovalKind, ConversationState, Notice, NoticeKind, PendingApproval, SessionInfo,
    Task, TaskStatus, Turn, TurnPhase,
};

const LIFECYCLE_QUEUED: &str = "queued";
const LIFECYCLE_STARTED: &str = "started";
const LIFECYCLE_COMPLETED: &str = "completed";
const TASK_COMPLETED: &str = "completed";
const CONTROL_ERROR_SUBTYPE: &str = "error";
const ASK_USER_QUESTION: &str = "AskUserQuestion";

pub fn fold(state: ConversationState, event: &AgentEvent) -> ConversationState {
    match event {
        AgentEvent::SystemInit { .. } => fold_init(state, event),
        AgentEvent::CommandLifecycle { .. } => fold_lifecycle(state, event),
        AgentEvent::Result { .. } => fold_result(state, event),
        AgentEvent::SystemThinkingTokens {
            estimated_tokens, ..
        } => ConversationState {
            thinking_estimate: Some(*estimated_tokens),
            ..state
        },
        AgentEvent::SystemTaskStarted { .. } => fold_task_started(state, event),
        AgentEvent::SystemTaskNotification { .. } => fold_task_notification(state, event),
        AgentEvent::ControlResponse { .. } => fold_control_response(state, event),
        AgentEvent::SystemStatus { .. } => fold_status(state, event),

        AgentEvent::ControlRequest { .. } => fold_control_request(state, event),

        // Carries no typed field that changes the domain state core keeps.
        AgentEvent::Assistant { .. }
        | AgentEvent::User { .. }
        | AgentEvent::StreamEvent { .. }
        | AgentEvent::SystemTaskProgress { .. }
        | AgentEvent::RateLimitEvent { .. }
        | AgentEvent::SystemTaskUpdated { .. }
        | AgentEvent::SystemBackgroundTasksChanged { .. }
        | AgentEvent::SystemCommandsChanged { .. }
        | AgentEvent::SystemCompactBoundary { .. }
        | AgentEvent::UnknownKind { .. }
        | AgentEvent::BrokenLine { .. } => state,
    }
}

/// `system/init` is idempotent: it (re)establishes the session from typed fields and touches
/// nothing else, because it arrives on every self-resume.
fn fold_init(state: ConversationState, event: &AgentEvent) -> ConversationState {
    let AgentEvent::SystemInit {
        session_id,
        model,
        permission_mode,
        cwd,
        claude_code_version,
        ..
    } = event
    else {
        return state;
    };
    ConversationState {
        session: Some(SessionInfo {
            session_id: session_id.clone(),
            model: model.clone(),
            permission_mode: permission_mode.clone(),
            cwd: cwd.clone(),
            version: claude_code_version.clone(),
        }),
        ..state
    }
}

/// A `control_response` with subtype `error` becomes a `ControlError` notice carrying the error
/// text and the `request_id`. Any other response changes nothing.
fn fold_control_response(mut state: ConversationState, event: &AgentEvent) -> ConversationState {
    let AgentEvent::ControlResponse {
        subtype,
        error,
        request_id,
        ..
    } = event
    else {
        return state;
    };
    if subtype.as_deref() == Some(CONTROL_ERROR_SUBTYPE) {
        state.notices.push(Notice {
            kind: NoticeKind::ControlError,
            message: error.clone().unwrap_or_default(),
            request_id: request_id.clone(),
        });
    }
    state
}

/// `system/status` replaces the session's permission mode when there is a session. With no
/// session yet the line is dropped.
fn fold_status(mut state: ConversationState, event: &AgentEvent) -> ConversationState {
    let AgentEvent::SystemStatus {
        permission_mode: Some(mode),
        ..
    } = event
    else {
        return state;
    };
    if let Some(session) = state.session.as_mut() {
        session.permission_mode = mode.clone();
    }
    state
}

/// `command_lifecycle{queued|started}` opens a turn keyed by `command_uuid`, once. `completed`
/// opens nothing: it only marks an open turn `lifecycle_done`.
fn fold_lifecycle(mut state: ConversationState, event: &AgentEvent) -> ConversationState {
    let AgentEvent::CommandLifecycle {
        command_uuid,
        state: lifecycle_state,
        ..
    } = event
    else {
        return state;
    };
    match lifecycle_state.as_str() {
        LIFECYCLE_QUEUED | LIFECYCLE_STARTED => {
            if !state.turns.iter().any(|t| &t.command_uuid == command_uuid) {
                state.turns.push(Turn {
                    command_uuid: command_uuid.clone(),
                    phase: TurnPhase::Open,
                    incomplete_reason: None,
                    lifecycle_done: false,
                });
            }
        }
        LIFECYCLE_COMPLETED => {
            for turn in &mut state.turns {
                if turn.phase == TurnPhase::Open && &turn.command_uuid == command_uuid {
                    turn.lifecycle_done = true;
                }
            }
        }
        _ => {}
    }
    state
}

/// A `result` replaces the session cost, may raise an error notice, and closes the open turns it
/// named (`user_message_uuid` or `user_message_uuids`) plus open turns whose lifecycle already
/// completed. A `result` that names no open turn closes nothing and counts as a spontaneous
/// resume. A `result` that closes a turn, or that failed, also discards the pending approvals: the
/// CLI has stopped waiting on them. A successful self-resume does not, because the CLI is still
/// blocking on those requests.
fn fold_result(mut state: ConversationState, event: &AgentEvent) -> ConversationState {
    let AgentEvent::Result {
        total_cost_usd,
        is_error,
        result,
        user_message_uuid,
        user_message_uuids,
        ..
    } = event
    else {
        return state;
    };
    state.usage.session_cost_usd = *total_cost_usd;
    if *is_error {
        state.notices.push(Notice {
            kind: NoticeKind::Error,
            message: result.clone(),
            request_id: None,
        });
    }

    let named = |uuid: &String| {
        user_message_uuid.as_ref() == Some(uuid)
            || user_message_uuids
                .as_ref()
                .is_some_and(|l| l.contains(uuid))
    };
    let closes = state
        .turns
        .iter()
        .any(|t| t.phase == TurnPhase::Open && named(&t.command_uuid));
    if closes {
        let reason = is_error.then(|| result.clone());
        for turn in &mut state.turns {
            let answered = named(&turn.command_uuid) || turn.lifecycle_done;
            if turn.phase == TurnPhase::Open && answered {
                turn.phase = TurnPhase::Closed;
                turn.incomplete_reason = reason.clone();
            }
        }
    } else {
        state.spontaneous_resume_count += 1;
    }

    if closes || *is_error {
        state.pending_approvals.clear();
    }
    state
}

/// A `control_request` enqueues a pending approval keyed by its `request_id`. The kind comes from
/// the typed tool name (`AskUserQuestion` is `Ask`, else `Approval`). A repeat of a `request_id`
/// already pending is not enqueued twice.
fn fold_control_request(mut state: ConversationState, event: &AgentEvent) -> ConversationState {
    let AgentEvent::ControlRequest {
        request_id,
        agent_id,
        tool_name,
        tool_use_id,
        ..
    } = event
    else {
        return state;
    };
    if state
        .pending_approvals
        .iter()
        .any(|p| &p.request_id == request_id)
    {
        return state;
    }
    let kind = if tool_name.as_deref() == Some(ASK_USER_QUESTION) {
        ApprovalKind::Ask
    } else {
        ApprovalKind::Approval
    };
    state.pending_approvals.push(PendingApproval {
        request_id: request_id.clone(),
        kind,
        tool_use_id: tool_use_id.clone(),
        agent_id: agent_id.clone(),
    });
    state
}

/// `task_started` records a task as running keyed by `task_id`. A repeat refreshes a still-running
/// record but never demotes a resolved one back to running.
fn fold_task_started(mut state: ConversationState, event: &AgentEvent) -> ConversationState {
    let AgentEvent::SystemTaskStarted {
        task_id,
        tool_use_id,
        subagent_type,
        is_backgrounded,
        spawn_depth,
        ..
    } = event
    else {
        return state;
    };
    let started = Task {
        task_id: task_id.clone(),
        parent_tool_use_id: Some(tool_use_id.clone()),
        subagent_type: subagent_type.clone(),
        is_backgrounded: *is_backgrounded,
        spawn_depth: *spawn_depth,
        status: TaskStatus::Running,
        incomplete_reason: None,
    };
    upsert_by_id(&mut state.tasks, started, |existing| {
        existing.status == TaskStatus::Running
    });
    state
}

/// `task_notification` is the authority on completion: `completed` resolves to `Complete`, any
/// other status to `Incomplete` carrying that status. An unknown `task_id` is ignored.
fn fold_task_notification(mut state: ConversationState, event: &AgentEvent) -> ConversationState {
    let AgentEvent::SystemTaskNotification {
        task_id, status, ..
    } = event
    else {
        return state;
    };
    for task in state.tasks.iter_mut().filter(|t| &t.task_id == task_id) {
        if status == TASK_COMPLETED {
            task.status = TaskStatus::Complete;
            task.incomplete_reason = None;
        } else {
            task.status = TaskStatus::Incomplete;
            task.incomplete_reason = Some(status.clone());
        }
    }
    state
}

/// Replaces the task with the same `task_id` by `task` when `replace` says so, or appends it,
/// keeping arrival order stable.
fn upsert_by_id(tasks: &mut Vec<Task>, task: Task, replace: impl Fn(&Task) -> bool) {
    let mut found = false;
    for existing in tasks.iter_mut().filter(|t| t.task_id == task.task_id) {
        found = true;
        if replace(existing) {
            *existing = task.clone();
        }
    }
    if !found {
        tasks.push(task);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use closta_model::{RawJson, Usage};

    fn result_for(user_message_uuid: Option<&str>, cost: f64) -> AgentEvent {
        AgentEvent::Result {
            uuid: "u".into(),
            session_id: "s".into(),
            subtype: "success".into(),
            result: "ok".into(),
            is_error: false,
            stop_reason: Some("stop".into()),
            terminal_reason: Some("end_turn".into()),
            num_turns: 1,
            result_index: 0,
            queued_turn_count: 0,
            total_cost_usd: cost,
            duration_ms: 1,
            duration_api_ms: 1,
            ttft_ms: Some(1),
            ttft_stream_ms: Some(1),
            time_to_request_ms: Some(1),
            first_content_frame_ms: Some(1),
            fast_mode_state: "off".into(),
            usage: RawJson("{}".into()),
            model_usage: RawJson("{}".into()),
            permission_denials: RawJson("[]".into()),
            subagent_stats: RawJson("{}".into()),
            api_error_status: None,
            fast_mode_disabled_reason: None,
            request_sent_wall_ms: None,
            user_message_uuid: user_message_uuid.map(str::to_string),
            user_message_uuids: None,
            origin: None,
            local_command: None,
        }
    }

    fn open_turn(command_uuid: &str) -> Turn {
        Turn {
            command_uuid: command_uuid.into(),
            phase: TurnPhase::Open,
            incomplete_reason: None,
            lifecycle_done: false,
        }
    }

    #[test]
    fn unknown_and_broken_lines_leave_an_established_state_untouched() {
        let before = ConversationState {
            session: Some(SessionInfo {
                session_id: "s".into(),
                model: "model".into(),
                permission_mode: "default".into(),
                cwd: "/repo".into(),
                version: "2.1.282".into(),
            }),
            turns: vec![open_turn("cmd-1")],
            usage: Usage {
                session_cost_usd: 0.25,
            },
            ..ConversationState::default()
        };

        let after = [
            AgentEvent::UnknownKind {
                wire_type: "some_future_kind".into(),
                raw: RawJson(r#"{"type":"some_future_kind"}"#.into()),
            },
            AgentEvent::BrokenLine {
                line: "not json at all".into(),
                reason: "malformed JSON".into(),
            },
        ]
        .iter()
        .fold(before.clone(), fold);

        assert_eq!(
            before, after,
            "unknown/broken lines must not change the state"
        );
    }

    #[test]
    fn a_result_matching_no_open_turn_closes_nothing_and_only_replaces_cost() {
        let before = ConversationState {
            turns: vec![open_turn("cmd-1")],
            ..ConversationState::default()
        };

        let after = fold(before, &result_for(Some("cmd-unknown"), 0.42));

        assert_eq!(
            TurnPhase::Open,
            after.turns[0].phase,
            "the open turn stays open"
        );
        assert_eq!(
            1, after.spontaneous_resume_count,
            "an unmatched result is counted as a resume"
        );
        assert_eq!(0.42, after.usage.session_cost_usd, "cost is still replaced");
    }

    #[test]
    fn non_ascii_text_passes_through_the_fold_unchanged() {
        let status = AgentEvent::ControlResponse {
            response: RawJson("{}".into()),
            request_id: Some("要求-1".into()),
            subtype: Some("error".into()),
            error: Some("失敗しました🙂".into()),
        };

        let after = fold(ConversationState::default(), &status);

        assert_eq!("失敗しました🙂", after.notices[0].message);
        assert_eq!(Some("要求-1".to_string()), after.notices[0].request_id);
    }
}
