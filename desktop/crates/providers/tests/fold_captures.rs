//! Folds the recorded captures. Mirrors SessionCostTest.kt, TurnBoundaryTest.kt,
//! InitIdempotenceTest.kt, TaskLifecycleTest.kt, UnknownEventTest.kt and ControlErrorAndModeFoldTest.kt.
//!
//! Kotlin's `assertSame` is not ported; `==` stands in where it was used.
//! The approval tests of the Kotlin files are not here yet; they arrive with the approval fold.

mod common;

use closta_core::{UnknownEventTally, fold};
use closta_model::{
    AgentEvent, AgentEventKind, ConversationState, Notice, NoticeKind, RawJson, SessionInfo, Task,
    TaskStatus, Turn, TurnPhase, Usage,
};
use common::*;
use std::collections::BTreeMap;

fn fold_all(start: ConversationState, events: &[AgentEvent]) -> ConversationState {
    events.iter().fold(start, fold)
}

fn fold_capture(file: &str) -> ConversationState {
    fold_all(ConversationState::default(), &read_capture(file))
}

fn open_turns(state: &ConversationState) -> usize {
    state
        .turns
        .iter()
        .filter(|t| t.phase == TurnPhase::Open)
        .count()
}

fn closed_turns(state: &ConversationState) -> usize {
    state
        .turns
        .iter()
        .filter(|t| t.phase == TurnPhase::Closed)
        .count()
}

fn lifecycle(uuid: &str, command_uuid: &str, state: &str) -> AgentEvent {
    AgentEvent::CommandLifecycle {
        uuid: uuid.into(),
        session_id: "s".into(),
        command_uuid: command_uuid.into(),
        state: state.into(),
    }
}

fn result_for(
    user_message_uuid: Option<&str>,
    is_error: bool,
    reason: &str,
    user_message_uuids: Option<&[&str]>,
) -> AgentEvent {
    AgentEvent::Result {
        uuid: "u".into(),
        session_id: "s".into(),
        subtype: if is_error { "error" } else { "success" }.into(),
        result: reason.into(),
        is_error,
        stop_reason: Some("stop".into()),
        terminal_reason: Some("end_turn".into()),
        num_turns: 1,
        result_index: 0,
        queued_turn_count: 0,
        total_cost_usd: 0.0,
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
        user_message_uuids: user_message_uuids.map(|l| l.iter().map(|s| s.to_string()).collect()),
        origin: None,
        local_command: None,
    }
}

// --- SessionCostTest ----------------------------------------------------------------------

#[test]
fn capture_10_ends_at_the_last_cost_figure_not_the_sum_of_the_three() {
    const FINAL_COST: f64 = 0.15600725000000004;
    let sum_of_three: f64 = 0.11048720000000001 + 0.13129565 + 0.15600725000000004;

    let state = fold_capture("10-background-task.ndjson");

    assert_eq!(
        FINAL_COST, state.usage.session_cost_usd,
        "session cost is the last total, replaced not summed"
    );
    assert!(
        (sum_of_three - state.usage.session_cost_usd).abs() > 1e-9,
        "must not accumulate the running total"
    );
}

// --- TurnBoundaryTest -----------------------------------------------------------------------

#[test]
fn capture_10_closes_the_user_started_turn_and_treats_the_two_null_results_as_resumes() {
    let state = fold_capture("10-background-task.ndjson");

    assert_eq!(1, state.turns.len(), "one turn opened");
    assert_eq!(0, open_turns(&state), "no turn left open");
    assert_eq!(1, closed_turns(&state), "the user-started turn is closed");
    assert_eq!(
        2, state.spontaneous_resume_count,
        "the two null-uuid results closed nothing"
    );
}

#[test]
fn capture_11_closes_both_user_started_turns_and_treats_the_two_later_results_as_resumes() {
    let state = fold_capture("11-background-followup.ndjson");

    assert_eq!(2, state.turns.len(), "two turns opened");
    assert_eq!(0, open_turns(&state), "no turn left open");
    assert_eq!(
        2,
        closed_turns(&state),
        "both user-started turns are closed"
    );
    assert_eq!(
        2, state.spontaneous_resume_count,
        "the two self-resume results closed nothing"
    );
}

#[test]
fn capture_31_closes_the_message_the_cli_took_into_the_running_turn_with_that_turn() {
    let state = fold_capture("31-send-mid-turn.ndjson");

    assert_eq!(2, state.turns.len(), "both messages opened a turn");
    assert_eq!(0, open_turns(&state), "no turn left open");
    assert_eq!(
        0, state.spontaneous_resume_count,
        "the one result is the first message's"
    );
}

#[test]
fn messages_the_cli_ran_as_one_turn_all_close_with_its_result() {
    let events = [
        lifecycle("u1", "cmd-a", "queued"),
        lifecycle("u2", "cmd-a", "started"),
        lifecycle("u3", "cmd-b", "queued"),
        lifecycle("u4", "cmd-c", "queued"),
        result_for(Some("cmd-a"), false, "a", Some(&["cmd-a"])),
        lifecycle("u5", "cmd-a", "completed"),
        lifecycle("u6", "cmd-b", "started"),
        lifecycle("u7", "cmd-c", "started"),
        result_for(Some("cmd-c"), false, "bc", Some(&["cmd-b", "cmd-c"])),
        lifecycle("u8", "cmd-b", "completed"),
        lifecycle("u9", "cmd-c", "completed"),
    ];
    let state = fold_all(ConversationState::default(), &events);

    assert_eq!(3, state.turns.len(), "each message opened a turn");
    assert_eq!(0, open_turns(&state), "no turn left open");
    assert_eq!(
        0, state.spontaneous_resume_count,
        "both results answered messages"
    );
}

#[test]
fn a_result_whose_list_names_only_closed_turns_closes_nothing_and_is_a_resume() {
    let events = [
        lifecycle("u1", "cmd-a", "started"),
        result_for(Some("cmd-a"), false, "a", Some(&["cmd-a"])),
        lifecycle("u2", "cmd-b", "started"),
        result_for(Some("cmd-a"), false, "again", Some(&["cmd-a", "cmd-x"])),
    ];
    let state = fold_all(ConversationState::default(), &events);

    assert_eq!(
        TurnPhase::Open,
        state.turns.last().unwrap().phase,
        "b is not named, so it stays open"
    );
    assert_eq!(1, state.spontaneous_resume_count);
}

#[test]
fn a_completed_lifecycle_alone_closes_nothing_so_its_own_later_result_still_correlates() {
    let events = [
        lifecycle("u1", "cmd-a", "started"),
        lifecycle("u2", "cmd-a", "completed"),
    ];
    let completed = fold_all(ConversationState::default(), &events);
    let answered = fold(
        completed.clone(),
        &result_for(Some("cmd-a"), false, "done", None),
    );

    assert_eq!(
        TurnPhase::Open,
        completed.turns[0].phase,
        "completed is not a terminator"
    );
    assert_eq!(1, completed.turns.len());
    assert_eq!(
        TurnPhase::Closed,
        answered.turns[0].phase,
        "its result closes it"
    );
    assert_eq!(1, answered.turns.len());
    assert_eq!(
        0, answered.spontaneous_resume_count,
        "and is not taken for a resume"
    );
}

#[test]
fn a_taken_in_message_closes_with_the_failing_turn_and_carries_its_reason() {
    let events = [
        lifecycle("u1", "cmd-a", "started"),
        lifecycle("u2", "cmd-b", "queued"),
        lifecycle("u3", "cmd-b", "completed"),
        result_for(Some("cmd-a"), true, "boom", None),
    ];
    let turns = fold_all(ConversationState::default(), &events).turns;

    assert_eq!(
        vec![TurnPhase::Closed, TurnPhase::Closed],
        turns.iter().map(|t| t.phase).collect::<Vec<_>>()
    );
    assert_eq!(
        vec![Some("boom".to_string()), Some("boom".to_string())],
        turns
            .iter()
            .map(|t| t.incomplete_reason.clone())
            .collect::<Vec<_>>()
    );
}

#[test]
fn a_failing_result_carries_its_reason_onto_the_per_turn_incomplete_reason_it_closes() {
    let events = [
        lifecycle("u1", "cmd-err", "started"),
        result_for(Some("cmd-err"), true, "boom", None),
    ];
    let state = fold_all(ConversationState::default(), &events);

    assert_eq!(1, state.turns.len());
    let turn = &state.turns[0];
    assert_eq!(
        TurnPhase::Closed,
        turn.phase,
        "the correlated result closes the turn"
    );
    assert_eq!(
        Some("boom".to_string()),
        turn.incomplete_reason,
        "a failing turn carries its reason"
    );
}

#[test]
fn a_succeeding_result_leaves_the_per_turn_incomplete_reason_null() {
    let events = [
        lifecycle("u1", "cmd-ok", "started"),
        result_for(Some("cmd-ok"), false, "done", None),
    ];
    let state = fold_all(ConversationState::default(), &events);

    assert_eq!(1, state.turns.len());
    assert_eq!(TurnPhase::Closed, state.turns[0].phase, "the turn closes");
    assert_eq!(
        None, state.turns[0].incomplete_reason,
        "a succeeding turn has no reason"
    );
}

#[test]
fn a_failing_turn_is_recorded_twice_per_turn_reason_and_a_conversation_level_error_notice() {
    let failing = fold_all(
        ConversationState::default(),
        &[
            lifecycle("u1", "cmd-err", "started"),
            result_for(Some("cmd-err"), true, "boom", None),
        ],
    );
    let succeeding = fold_all(
        ConversationState::default(),
        &[
            lifecycle("u1", "cmd-ok", "started"),
            result_for(Some("cmd-ok"), false, "done", None),
        ],
    );

    let error_notices: Vec<&Notice> = failing
        .notices
        .iter()
        .filter(|n| n.kind == NoticeKind::Error)
        .collect();
    assert_eq!(
        1,
        error_notices.len(),
        "a failing result adds one conversation-level ERROR notice"
    );
    assert_eq!(
        "boom", error_notices[0].message,
        "the ERROR notice carries the result text"
    );
    assert!(
        succeeding
            .notices
            .iter()
            .all(|n| n.kind != NoticeKind::Error),
        "a succeeding result adds no ERROR notice (symmetry)"
    );
}

#[test]
fn normal_captures_leave_every_closed_turns_incomplete_reason_null() {
    for file in ["10-background-task.ndjson", "11-background-followup.ndjson"] {
        let state = fold_capture(file);
        assert!(
            state.turns.iter().all(|t| t.incomplete_reason.is_none()),
            "{file}: no recorded turn failed, so every incompleteReason is null"
        );
    }
}

// --- InitIdempotenceTest --------------------------------------------------------------------

fn second_init() -> AgentEvent {
    AgentEvent::SystemInit {
        uuid: "u".into(),
        session_id: "s2".into(),
        cwd: "/repo".into(),
        model: "second-model".into(),
        permission_mode: "default".into(),
        api_key_source: "none".into(),
        claude_code_version: "2.1.282".into(),
        output_style: "text".into(),
        view_mode: "normal".into(),
        scratchpad_path: Some("/tmp".into()),
        messaging_socket_path: "/tmp/sock".into(),
        fast_mode_state: "off".into(),
        tools: RawJson("[]".into()),
        mcp_servers: RawJson("[]".into()),
        slash_commands: RawJson("[]".into()),
        terminal_slash_commands: RawJson("[]".into()),
        agents: RawJson("[]".into()),
        skills: RawJson("[]".into()),
        plugins: RawJson("[]".into()),
        capabilities: RawJson("{}".into()),
        memory_paths: RawJson("[]".into()),
        analytics_disabled: false,
        product_feedback_disabled: false,
        per_turn_effort_active: false,
        fast_mode_disabled_reason: None,
    }
}

#[test]
fn an_init_applied_to_a_populated_state_replaces_only_the_session() {
    let populated = ConversationState {
        turns: vec![Turn {
            command_uuid: "cmd-1".into(),
            phase: TurnPhase::Closed,
            incomplete_reason: None,
            lifecycle_done: false,
        }],
        usage: Usage {
            session_cost_usd: 0.5,
        },
        tasks: vec![Task {
            task_id: "t1".into(),
            parent_tool_use_id: Some("tool-1".into()),
            subagent_type: Some("Explore".into()),
            is_backgrounded: false,
            spawn_depth: Some(1),
            status: TaskStatus::Running,
            incomplete_reason: None,
        }],
        thinking_estimate: Some(1234),
        spontaneous_resume_count: 2,
        ..ConversationState::default()
    };

    let after = fold(populated.clone(), &second_init());

    assert!(
        after.session.is_some(),
        "the second init establishes the session"
    );
    assert_eq!("second-model", after.session.as_ref().unwrap().model);
    assert_eq!(populated.turns, after.turns, "turns survive a re-init");
    assert_eq!(populated.usage, after.usage, "usage survives a re-init");
    assert_eq!(populated.tasks, after.tasks, "tasks survive a re-init");
    assert_eq!(
        populated.thinking_estimate, after.thinking_estimate,
        "thinking estimate survives"
    );
    assert_eq!(
        populated.spontaneous_resume_count, after.spontaneous_resume_count,
        "resume count survives"
    );
}

#[test]
fn captures_whose_init_repeats_keep_the_state_they_accumulated() {
    let ten = fold_capture("10-background-task.ndjson");
    let eleven = fold_capture("11-background-followup.ndjson");

    assert!(ten.session.is_some(), "10: session established");
    assert_eq!(1, ten.turns.len(), "10: the turn survived the later inits");
    assert!(
        ten.usage.session_cost_usd > 0.0,
        "10: cost survived the later inits"
    );
    assert!(!ten.tasks.is_empty(), "10: tasks survived the later inits");
    assert!(eleven.session.is_some(), "11: session established");
    assert_eq!(
        2,
        eleven.turns.len(),
        "11: both turns survived the later inits"
    );
    assert!(
        eleven.usage.session_cost_usd > 0.0,
        "11: cost survived the later inits"
    );
}

#[test]
fn the_handshake_capture_folds_without_breaking() {
    let three = fold_capture("03-initialize-handshake.ndjson");

    assert!(
        three.session.is_some(),
        "03: the single init established the session"
    );
    assert_eq!(1, three.turns.len(), "03: one turn");
    assert_eq!(
        TurnPhase::Closed,
        three.turns[0].phase,
        "03: the turn closed on its result"
    );
}

// --- TaskLifecycleTest ----------------------------------------------------------------------

fn task_started(task_id: &str, tool_use_id: &str) -> AgentEvent {
    AgentEvent::SystemTaskStarted {
        uuid: "u".into(),
        session_id: "s".into(),
        task_id: task_id.into(),
        tool_use_id: tool_use_id.into(),
        description: "d".into(),
        task_type: "general".into(),
        is_backgrounded: true,
        subagent_type: Some("general-purpose".into()),
        spawn_depth: Some(1),
        prompt: None,
        owned_by_subagent: None,
    }
}

fn task_completed(task_id: &str, tool_use_id: &str) -> AgentEvent {
    AgentEvent::SystemTaskNotification {
        uuid: "u".into(),
        session_id: "s".into(),
        task_id: task_id.into(),
        tool_use_id: tool_use_id.into(),
        status: "completed".into(),
        output_file: "out".into(),
        summary: "done".into(),
        usage: None,
    }
}

#[test]
fn capture_08_keeps_one_subagent_with_a_parent_link_resolved_complete_by_the_notification() {
    let state = fold_capture("08-subagent-task.ndjson");

    assert_eq!(1, state.tasks.len(), "08: one subagent task");
    let task = &state.tasks[0];
    assert_eq!(Some("Explore".to_string()), task.subagent_type);
    assert!(
        task.parent_tool_use_id
            .as_deref()
            .expect("the parent Agent's tool_use_id is held by id")
            .starts_with("toolu_"),
        "parent link is a tool_use_id, not an index"
    );
    assert_eq!(Some(1), task.spawn_depth);
    assert_eq!(
        TaskStatus::Complete,
        task.status,
        "completion comes from task_notification.status"
    );
}

#[test]
fn capture_09_keeps_two_subagents_each_parent_linked_and_completed() {
    let state = fold_capture("09-parallel-subagents.ndjson");

    assert_eq!(2, state.tasks.len(), "09: two parallel subagent tasks");
    let ids: std::collections::BTreeSet<&str> =
        state.tasks.iter().map(|t| t.task_id.as_str()).collect();
    assert_eq!(2, ids.len(), "distinct task ids");
    assert!(
        state.tasks.iter().all(|t| t
            .parent_tool_use_id
            .as_deref()
            .is_some_and(|p| p.starts_with("toolu_"))),
        "each linked by tool_use_id"
    );
    assert!(
        state.tasks.iter().all(|t| t.status == TaskStatus::Complete),
        "both resolved complete by notification"
    );
}

#[test]
fn a_task_started_that_arrives_after_completion_does_not_demote_the_task_back_to_running() {
    let events = [
        task_started("tX", "toolu_x"),
        task_completed("tX", "toolu_x"),
        task_started("tX", "toolu_x"),
    ];

    let state = fold_all(ConversationState::default(), &events);

    assert_eq!(1, state.tasks.len(), "still one task");
    assert_eq!(
        TaskStatus::Complete,
        state.tasks[0].status,
        "a late task_started must not demote a completed task to running"
    );
}

// --- UnknownEventTest -----------------------------------------------------------------------

const COMMAND_LIFECYCLE_LINES: usize = 117;

fn all_events() -> Vec<AgentEvent> {
    manifest()
        .scenarios
        .iter()
        .flat_map(|s| read_capture(&s.file))
        .collect()
}

#[test]
fn the_recorded_captures_leave_nothing_uncounted() {
    let recorded = all_events();
    let mut known: BTreeMap<String, i32> = BTreeMap::new();
    for (_, rows) in KNOWN_UNPLACED {
        for (wire_type, n) in *rows {
            *known.entry(wire_type.to_string()).or_default() += *n as i32;
        }
    }
    let all = UnknownEventTally::of(&recorded);
    assert_eq!(
        known, all.unknown_by_wire_type,
        "the known gaps, and nothing else"
    );
    assert_eq!(
        0, all.broken_line_count,
        "unreadable lines across all the captures"
    );

    let placed: Vec<AgentEvent> = manifest()
        .scenarios
        .iter()
        .filter(|s| !KNOWN_UNPLACED.iter().any(|(name, _)| *name == s.scenario))
        .flat_map(|s| read_capture(&s.file))
        .collect();
    let tally = UnknownEventTally::of(&placed);

    assert_eq!(
        0,
        tally.unknown_count(),
        "unknown kinds in the captures: {:?}",
        tally.unknown_by_wire_type
    );
    assert_eq!(
        0, tally.broken_line_count,
        "unreadable lines in the captures"
    );
    assert!(
        tally.is_clean(),
        "the captures are the baseline the counter is measured against"
    );
    assert_eq!(None, tally.first_unknown, "nothing to keep a sample of");
}

#[test]
fn command_lifecycle_is_a_kind_of_its_own_and_not_an_unknown() {
    let events = all_events();
    let lifecycle_lines = events
        .iter()
        .filter(|e| matches!(e, AgentEvent::CommandLifecycle { .. }))
        .count();

    assert_eq!(
        COMMAND_LIFECYCLE_LINES, lifecycle_lines,
        "recorded command_lifecycle lines"
    );
    assert!(
        events.iter().all(|e| !matches!(
            e,
            AgentEvent::UnknownKind { wire_type, .. } if wire_type == "command_lifecycle"
        )),
        "command_lifecycle must not be counted as unknown"
    );
    assert_eq!(
        Some(AgentEventKind::CommandLifecycle),
        AgentEventKind::of_wire_type("command_lifecycle"),
        "the wire type resolves to a declared kind"
    );
}

#[test]
fn an_injected_unknown_kind_is_counted_and_kept() {
    let line = r#"{"type":"holographic_telemetry","uuid":"u","session_id":"s"}"#;

    let event = parse(line);
    let tally = UnknownEventTally::default().accept(&event);

    let AgentEvent::UnknownKind { wire_type, .. } = &event else {
        panic!("expected UnknownKind, got {event:?}");
    };
    assert_eq!("holographic_telemetry", wire_type);
    assert_eq!(1, tally.unknown_count());
    assert_eq!(
        0, tally.broken_line_count,
        "a new kind is not a damaged line"
    );
    assert_eq!(
        BTreeMap::from([("holographic_telemetry".to_string(), 1)]),
        tally.unknown_by_wire_type
    );
    assert_eq!(
        Some(line),
        tally.first_unknown.as_ref().map(|r| r.0.as_str()),
        "the sample is the line itself"
    );
}

#[test]
fn an_unknown_system_subtype_is_counted_under_its_subtype() {
    let line = r#"{"type":"system","subtype":"quantum_entangled","uuid":"u","session_id":"s"}"#;

    let event = parse(line);
    let AgentEvent::UnknownKind { wire_type, .. } = &event else {
        panic!("expected UnknownKind, got {event:?}");
    };
    assert_eq!("system/quantum_entangled", wire_type);
}

#[test]
fn a_known_kind_that_lost_a_required_field_is_counted_as_unknown() {
    let line = r#"{"type":"command_lifecycle","command_uuid":"c","uuid":"u","session_id":"s"}"#;

    let event = parse(line);
    let AgentEvent::UnknownKind { wire_type, .. } = &event else {
        panic!("expected UnknownKind, got {event:?}");
    };
    assert_eq!("command_lifecycle", wire_type);
}

#[test]
fn a_damaged_line_is_counted_separately_from_an_unknown_kind() {
    let damaged = "{\"type\":\"assistant\", this is not JSON";

    let event = parse(damaged);
    let tally = UnknownEventTally::default().accept(&event);

    let AgentEvent::BrokenLine { line, reason } = &event else {
        panic!("expected BrokenLine, got {event:?}");
    };
    assert_eq!(
        damaged, line,
        "the bytes are kept so the damage can be looked at"
    );
    assert!(
        !reason.trim().is_empty(),
        "a damaged line says why it could not be read"
    );
    assert_eq!(1, tally.broken_line_count);
    assert_eq!(0, tally.unknown_count(), "a damaged line is not a new kind");
    assert_eq!(Some(damaged), tally.first_broken_line.as_deref());
}

#[test]
fn the_two_counters_add_up_without_merging() {
    let lines = [
        r#"{"type":"holographic_telemetry","uuid":"u1","session_id":"s"}"#,
        r#"{"type":"holographic_telemetry","uuid":"u2","session_id":"s"}"#,
        r#"{"type":"tachyon_pulse","uuid":"u3","session_id":"s"}"#,
        "not json at all",
        r#"{"type":"command_lifecycle","command_uuid":"c","state":"queued","uuid":"u4","session_id":"s"}"#,
    ];

    let events: Vec<AgentEvent> = lines.iter().map(|l| parse(l)).collect();
    let tally = UnknownEventTally::of(&events);

    assert_eq!(
        BTreeMap::from([
            ("holographic_telemetry".to_string(), 2),
            ("tachyon_pulse".to_string(), 1)
        ]),
        tally.unknown_by_wire_type
    );
    assert_eq!(3, tally.unknown_count());
    assert_eq!(1, tally.broken_line_count);
    assert_eq!(4, tally.total_count());
    assert!(!tally.is_clean());
    assert_eq!(
        Some(lines[0]),
        tally.first_unknown.as_ref().map(|r| r.0.as_str()),
        "the sample is the first unknown, not the last"
    );
    assert_eq!(Some("not json at all"), tally.first_broken_line.as_deref());
}

#[test]
fn a_known_line_leaves_the_counter_untouched() {
    let known = parse(
        r#"{"type":"command_lifecycle","command_uuid":"c","state":"completed","uuid":"u","session_id":"s"}"#,
    );

    assert_eq!(
        UnknownEventTally::default(),
        UnknownEventTally::default().accept(&known)
    );
}

// --- ControlErrorAndModeFoldTest ------------------------------------------------------------

fn session(mode: &str) -> SessionInfo {
    SessionInfo {
        session_id: "s".into(),
        model: "m".into(),
        permission_mode: mode.into(),
        cwd: "/c".into(),
        version: "2.1.282".into(),
    }
}

fn status(mode: Option<&str>) -> AgentEvent {
    AgentEvent::SystemStatus {
        uuid: "u".into(),
        session_id: "s".into(),
        status: None,
        permission_mode: mode.map(str::to_string),
    }
}

fn with_session(mode: &str) -> ConversationState {
    ConversationState {
        session: Some(session(mode)),
        ..ConversationState::default()
    }
}

#[test]
fn an_error_control_response_leaves_one_notice_with_the_text_and_the_request_id() {
    let rejected = parse(
        r#"{"type":"control_response","response":{"subtype":"error","request_id":"req-8","error":"nope"}}"#,
    );

    let end = fold(ConversationState::default(), &rejected);

    assert_eq!(
        vec![Notice {
            kind: NoticeKind::ControlError,
            message: "nope".into(),
            request_id: Some("req-8".into())
        }],
        end.notices
    );
}

#[test]
fn a_success_control_response_changes_nothing() {
    let start = with_session("default");
    let ok = parse(
        r#"{"type":"control_response","response":{"subtype":"success","request_id":"r","response":{"mode":"plan"}}}"#,
    );

    assert_eq!(start, fold(start.clone(), &ok));
}

#[test]
fn a_status_with_a_mode_replaces_the_sessions_mode() {
    let end = fold(with_session("default"), &status(Some("acceptEdits")));

    assert_eq!(
        Some("acceptEdits"),
        end.session.as_ref().map(|s| s.permission_mode.as_str())
    );
}

#[test]
fn a_status_with_no_mode_or_with_no_session_changes_nothing() {
    let with = with_session("default");
    assert_eq!(
        with,
        fold(with.clone(), &status(None)),
        "no mode in the line"
    );
    assert_eq!(
        None,
        fold(ConversationState::default(), &status(Some("plan"))).session,
        "no session yet: the line is dropped"
    );
    assert_eq!(
        ConversationState::default(),
        fold(ConversationState::default(), &status(Some("plan")))
    );
}

#[test]
fn commands_changed_and_compact_boundary_leave_the_state_as_it_was() {
    let start = with_session("default");
    let changed = AgentEvent::SystemCommandsChanged {
        uuid: "u".into(),
        session_id: "s".into(),
        commands: RawJson("[]".into()),
    };
    let boundary = AgentEvent::SystemCompactBoundary {
        uuid: "u".into(),
        session_id: "s".into(),
        compact_metadata: RawJson(r#"{"trigger":"manual","pre_tokens":1}"#.into()),
        logical_parent_uuid: None,
    };

    assert_eq!(start, fold(start.clone(), &changed));
    assert_eq!(start, fold(start.clone(), &boundary));
}
