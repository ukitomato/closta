//! One line of the agent CLI's stdout as core understands it. Mirrors `AgentEvent.kt`.
//!
//! One line in, one value out. The two catch-alls, [`AgentEvent::UnknownKind`] and
//! [`AgentEvent::BrokenLine`], are variants rather than errors so a reader never has to stop.

/// A JSON fragment carried through verbatim instead of being modelled.
#[derive(Clone, PartialEq, Eq, Debug)]
pub struct RawJson(pub String);

/// The stdout line kinds observed in the recorded captures. `wire_type` is the `type` field as it
/// arrives, with `/<subtype>` appended for `system` lines.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum AgentEventKind {
    StreamEvent,
    Assistant,
    CommandLifecycle,
    SystemStatus,
    User,
    ControlResponse,
    SystemInit,
    Result,
    RateLimitEvent,
    SystemBackgroundTasksChanged,
    SystemThinkingTokens,
    SystemTaskStarted,
    SystemTaskProgress,
    SystemTaskUpdated,
    SystemTaskNotification,
    ControlRequest,
    SystemCommandsChanged,
    SystemCompactBoundary,
}

impl AgentEventKind {
    /// Every kind, in the order Kotlin's `entries` lists them.
    pub const ALL: [AgentEventKind; 18] = [
        Self::StreamEvent,
        Self::Assistant,
        Self::CommandLifecycle,
        Self::SystemStatus,
        Self::User,
        Self::ControlResponse,
        Self::SystemInit,
        Self::Result,
        Self::RateLimitEvent,
        Self::SystemBackgroundTasksChanged,
        Self::SystemThinkingTokens,
        Self::SystemTaskStarted,
        Self::SystemTaskProgress,
        Self::SystemTaskUpdated,
        Self::SystemTaskNotification,
        Self::ControlRequest,
        Self::SystemCommandsChanged,
        Self::SystemCompactBoundary,
    ];

    pub fn wire_type(&self) -> &'static str {
        match self {
            Self::StreamEvent => "stream_event",
            Self::Assistant => "assistant",
            Self::CommandLifecycle => "command_lifecycle",
            Self::SystemStatus => "system/status",
            Self::User => "user",
            Self::ControlResponse => "control_response",
            Self::SystemInit => "system/init",
            Self::Result => "result",
            Self::RateLimitEvent => "rate_limit_event",
            Self::SystemBackgroundTasksChanged => "system/background_tasks_changed",
            Self::SystemThinkingTokens => "system/thinking_tokens",
            Self::SystemTaskStarted => "system/task_started",
            Self::SystemTaskProgress => "system/task_progress",
            Self::SystemTaskUpdated => "system/task_updated",
            Self::SystemTaskNotification => "system/task_notification",
            Self::ControlRequest => "control_request",
            Self::SystemCommandsChanged => "system/commands_changed",
            Self::SystemCompactBoundary => "system/compact_boundary",
        }
    }

    /// The kind for `wire_type`, or `None` when nothing declares it.
    pub fn of_wire_type(wire_type: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|k| k.wire_type() == wire_type)
    }
}

/// One line of the agent CLI's stdout. Twenty variants: the eighteen [`AgentEventKind`]s plus
/// [`AgentEvent::UnknownKind`] and [`AgentEvent::BrokenLine`].
///
/// Not `Eq`: `Result::total_cost_usd` is an `f64`.
#[derive(Clone, PartialEq, Debug)]
pub enum AgentEvent {
    StreamEvent {
        uuid: String,
        session_id: String,
        event: RawJson,
        parent_tool_use_id: Option<String>,
        ttft_ms: Option<i64>,
        user_message_uuid: Option<String>,
        user_message_uuids: Option<RawJson>,
    },
    Assistant {
        uuid: String,
        session_id: String,
        timestamp: String,
        request_id: Option<String>,
        message: RawJson,
        parent_tool_use_id: Option<String>,
        user_message_uuid: Option<String>,
        user_message_uuids: Option<RawJson>,
        wire_tool_inputs: Option<RawJson>,
        subagent_type: Option<String>,
        task_description: Option<String>,
        error: Option<String>,
    },
    CommandLifecycle {
        uuid: String,
        session_id: String,
        command_uuid: String,
        state: String,
    },
    SystemStatus {
        uuid: String,
        session_id: String,
        status: Option<String>,
        permission_mode: Option<String>,
    },
    User {
        uuid: String,
        session_id: String,
        timestamp: String,
        message: RawJson,
        parent_tool_use_id: Option<String>,
        tool_use_result: Option<RawJson>,
        subagent_type: Option<String>,
        task_description: Option<String>,
    },
    ControlResponse {
        response: RawJson,
        request_id: Option<String>,
        subtype: Option<String>,
        error: Option<String>,
    },
    SystemInit {
        uuid: String,
        session_id: String,
        cwd: String,
        model: String,
        permission_mode: String,
        api_key_source: String,
        claude_code_version: String,
        output_style: String,
        view_mode: String,
        scratchpad_path: Option<String>,
        messaging_socket_path: String,
        fast_mode_state: String,
        tools: RawJson,
        mcp_servers: RawJson,
        slash_commands: RawJson,
        terminal_slash_commands: RawJson,
        agents: RawJson,
        skills: RawJson,
        plugins: RawJson,
        capabilities: RawJson,
        memory_paths: RawJson,
        analytics_disabled: bool,
        product_feedback_disabled: bool,
        per_turn_effort_active: bool,
        fast_mode_disabled_reason: Option<String>,
    },
    Result {
        uuid: String,
        session_id: String,
        subtype: String,
        result: String,
        is_error: bool,
        stop_reason: Option<String>,
        terminal_reason: Option<String>,
        num_turns: i32,
        result_index: i32,
        queued_turn_count: i32,
        total_cost_usd: f64,
        duration_ms: i64,
        duration_api_ms: i64,
        ttft_ms: Option<i64>,
        ttft_stream_ms: Option<i64>,
        time_to_request_ms: Option<i64>,
        first_content_frame_ms: Option<i64>,
        fast_mode_state: String,
        usage: RawJson,
        model_usage: RawJson,
        permission_denials: RawJson,
        subagent_stats: RawJson,
        api_error_status: Option<String>,
        fast_mode_disabled_reason: Option<String>,
        request_sent_wall_ms: Option<i64>,
        user_message_uuid: Option<String>,
        user_message_uuids: Option<Vec<String>>,
        origin: Option<RawJson>,
        local_command: Option<String>,
    },
    RateLimitEvent {
        uuid: String,
        session_id: String,
        rate_limit_info: RawJson,
    },
    SystemBackgroundTasksChanged {
        uuid: String,
        session_id: String,
        tasks: RawJson,
    },
    SystemThinkingTokens {
        uuid: String,
        session_id: String,
        estimated_tokens: i64,
        estimated_tokens_delta: i64,
        user_message_uuid: Option<String>,
    },
    SystemTaskStarted {
        uuid: String,
        session_id: String,
        task_id: String,
        tool_use_id: String,
        description: String,
        task_type: String,
        is_backgrounded: bool,
        subagent_type: Option<String>,
        spawn_depth: Option<i32>,
        prompt: Option<String>,
        owned_by_subagent: Option<bool>,
    },
    SystemTaskProgress {
        uuid: String,
        session_id: String,
        task_id: String,
        description: String,
        subagent_type: String,
        last_tool_name: String,
        usage: RawJson,
        tool_use_id: Option<String>,
    },
    SystemTaskUpdated {
        uuid: String,
        session_id: String,
        task_id: String,
        patch: RawJson,
    },
    SystemTaskNotification {
        uuid: String,
        session_id: String,
        task_id: String,
        tool_use_id: String,
        status: String,
        output_file: String,
        summary: String,
        usage: Option<RawJson>,
    },
    ControlRequest {
        request_id: String,
        request: RawJson,
        agent_id: Option<String>,
        tool_name: Option<String>,
        tool_use_id: Option<String>,
    },
    SystemCommandsChanged {
        uuid: String,
        session_id: String,
        commands: RawJson,
    },
    SystemCompactBoundary {
        uuid: String,
        session_id: String,
        compact_metadata: RawJson,
        logical_parent_uuid: Option<String>,
    },
    /// A well-formed JSON object whose `type` is not one of the eighteen, or that lacks a field
    /// the declared shape needs. Kept whole.
    UnknownKind { wire_type: String, raw: RawJson },
    /// A line that is not a JSON object.
    BrokenLine { line: String, reason: String },
}

impl AgentEvent {
    /// The kind of a declared line; `None` for the two catch-alls.
    pub fn kind(&self) -> Option<AgentEventKind> {
        Some(match self {
            Self::StreamEvent { .. } => AgentEventKind::StreamEvent,
            Self::Assistant { .. } => AgentEventKind::Assistant,
            Self::CommandLifecycle { .. } => AgentEventKind::CommandLifecycle,
            Self::SystemStatus { .. } => AgentEventKind::SystemStatus,
            Self::User { .. } => AgentEventKind::User,
            Self::ControlResponse { .. } => AgentEventKind::ControlResponse,
            Self::SystemInit { .. } => AgentEventKind::SystemInit,
            Self::Result { .. } => AgentEventKind::Result,
            Self::RateLimitEvent { .. } => AgentEventKind::RateLimitEvent,
            Self::SystemBackgroundTasksChanged { .. } => {
                AgentEventKind::SystemBackgroundTasksChanged
            }
            Self::SystemThinkingTokens { .. } => AgentEventKind::SystemThinkingTokens,
            Self::SystemTaskStarted { .. } => AgentEventKind::SystemTaskStarted,
            Self::SystemTaskProgress { .. } => AgentEventKind::SystemTaskProgress,
            Self::SystemTaskUpdated { .. } => AgentEventKind::SystemTaskUpdated,
            Self::SystemTaskNotification { .. } => AgentEventKind::SystemTaskNotification,
            Self::ControlRequest { .. } => AgentEventKind::ControlRequest,
            Self::SystemCommandsChanged { .. } => AgentEventKind::SystemCommandsChanged,
            Self::SystemCompactBoundary { .. } => AgentEventKind::SystemCompactBoundary,
            Self::UnknownKind { .. } | Self::BrokenLine { .. } => return None,
        })
    }

    pub fn is_known(&self) -> bool {
        self.kind().is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wire_types_round_trip_and_are_unique() {
        for kind in AgentEventKind::ALL {
            assert_eq!(AgentEventKind::of_wire_type(kind.wire_type()), Some(kind));
        }
        assert_eq!(AgentEventKind::of_wire_type("holographic_telemetry"), None);
        assert_eq!(AgentEventKind::of_wire_type("system"), None);
    }

    #[test]
    fn catch_alls_have_no_kind() {
        let unknown = AgentEvent::UnknownKind {
            wire_type: "x".into(),
            raw: RawJson("{}".into()),
        };
        let broken = AgentEvent::BrokenLine {
            line: "x".into(),
            reason: "r".into(),
        };
        assert_eq!(unknown.kind(), None);
        assert!(!broken.is_known());
    }
}
