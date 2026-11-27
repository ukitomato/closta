//! Decodes the recorded captures. Mirrors ManifestTest.kt, AgentEventFixtureTest.kt, CoverageTest.kt
//! and the capture-reading part of CodecDecodeTest.kt.
//!
//! Kotlin's `assertSame` is not ported; `==` stands in where it was used.

mod common;

use closta_model::{AgentEvent, AgentEventKind};
use closta_providers::claude::protocol::decode;
use common::*;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

const EXPECTED_CAPTURES: usize = 40;
const EXPECTED_LINES: usize = 2832;
const CLI_VERSION: &str = "2.1.282";
const FIRST_TOKEN_MS: i64 = 812;

const STDOUT_MESSAGE_KINDS: usize = 45;
const OBSERVED_KINDS: usize = 21;
const DECLARED_IN_STDOUT_MESSAGE: usize = 19;
const DECLARED_IN_SDK_MESSAGE: usize = 17;
const NEVER_OBSERVED: usize = 26;
const CAPTURES_WITH_LIFECYCLE: usize = 37;
const CONTROL_PROTOCOL_LINES: usize = 115;

/// Modelled from sdk.d.ts alone, because no capture has one: their tests build the line by hand.
/// Each goes when a capture carries it.
const TYPE_ONLY: [&str; 2] = ["system/informational", "system/api_retry"];

const DIAGNOSTIC: &str =
    "[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=tool_use";

fn sha256(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn all_events() -> Vec<AgentEvent> {
    manifest()
        .scenarios
        .iter()
        .flat_map(|s| read_capture(&s.file))
        .collect()
}

fn observed_kinds() -> BTreeSet<&'static str> {
    all_events()
        .iter()
        .filter_map(|e| e.kind())
        .map(|k| k.wire_type())
        .collect()
}

fn all_kinds() -> BTreeSet<&'static str> {
    AgentEventKind::ALL.iter().map(|k| k.wire_type()).collect()
}

fn all_kinds_but_the_type_only() -> BTreeSet<&'static str> {
    all_kinds()
        .into_iter()
        .filter(|k| !TYPE_ONLY.contains(k))
        .collect()
}

/// What a line decoded to, by kind only: a failure message must not print a refusal's message, a
/// notice's content or a retry's error.
fn kind_of(event: &AgentEvent) -> String {
    match event {
        AgentEvent::UnknownKind { wire_type, .. } => format!("unknown kind {wire_type}"),
        AgentEvent::BrokenLine { .. } => "broken line".to_string(),
        known => known
            .kind()
            .map_or_else(String::new, |k| k.wire_type().to_string()),
    }
}

// --- ManifestTest -----------------------------------------------------------------------

#[test]
fn every_capture_still_has_the_bytes_the_manifest_recorded() {
    for s in manifest().scenarios {
        let bytes = bytes_of(&s.file);
        assert_eq!(s.sha256, sha256(&bytes), "{}: sha256", s.file);
        assert_eq!(
            s.lines,
            non_blank_lines(&String::from_utf8_lossy(&bytes)).len(),
            "{}: line count",
            s.file
        );
    }
}

#[test]
fn the_manifest_accounts_for_every_capture_on_disk_and_no_others() {
    let m = manifest();
    let mut listed: Vec<String> = m.scenarios.iter().map(|s| s.file.clone()).collect();
    listed.sort();

    assert_eq!(
        EXPECTED_CAPTURES, m.scenario_count,
        "manifest.json scenario_count"
    );
    assert_eq!(EXPECTED_CAPTURES, listed.len(), "entries in scenarios[]");
    assert_eq!(
        listed,
        capture_file_names(),
        "captures present next to the manifest"
    );
}

#[test]
fn the_captures_hold_the_recorded_number_of_lines_in_total() {
    let total: usize = manifest()
        .scenarios
        .iter()
        .map(|s| non_blank_lines(&text_of(&s.file)).len())
        .sum();
    assert_eq!(EXPECTED_LINES, total, "lines across all captures");
}

#[test]
fn every_capture_was_recorded_with_one_cli_version() {
    let m = manifest();
    let versions: BTreeSet<&str> = m
        .scenarios
        .iter()
        .map(|s| s.claude_version.as_str())
        .collect();
    assert_eq!(
        BTreeSet::from([CLI_VERSION]),
        versions,
        "claude_version across scenarios[]"
    );
    assert_eq!(
        CLI_VERSION, m.claude_version,
        "manifest.json claude_version"
    );
}

#[test]
fn every_init_reports_the_cli_version_the_manifest_recorded_for_its_capture() {
    let mut checked = 0;
    for s in manifest().scenarios {
        for e in read_capture(&s.file) {
            if let AgentEvent::SystemInit {
                claude_code_version,
                ..
            } = e
            {
                assert_eq!(
                    s.claude_version, claude_code_version,
                    "{}: system/init.claude_code_version against manifest.json",
                    s.scenario
                );
                checked += 1;
            }
        }
    }
    assert!(
        checked > 0,
        "at least one init was compared - an empty comparison proves nothing"
    );
}

#[test]
fn an_init_reports_the_model_the_capture_was_started_with() {
    let mut compared = 0;
    for s in manifest().scenarios {
        let flags = manifest_flags(&s.file);
        let Some(at) = flags.iter().position(|f| f == "--model") else {
            continue;
        };
        let requested = &flags[at + 1];
        for e in read_capture(&s.file) {
            if let AgentEvent::SystemInit { model, .. } = e {
                assert_eq!(
                    requested, &model,
                    "{}: system/init.model against the --model flag",
                    s.scenario
                );
                compared += 1;
            }
        }
    }
    assert!(
        compared > 0,
        "at least one init was compared - an empty comparison proves nothing"
    );
}

#[test]
fn the_resume_capture_records_both_clis_and_the_transcript_it_was_taken_with() {
    let file = "22-resume.ndjson";
    let resume_flags = manifest_resume_flags(file).expect("no resume_flags recorded");
    let (transcript, transcript_sha) = manifest_transcript(file).expect("no transcript recorded");

    assert!(
        resume_flags.iter().any(|f| f.starts_with("--resume=")),
        "resume_flags: {resume_flags:?}"
    );
    assert!(
        !resume_flags.iter().any(|f| f.starts_with("--session-id")),
        "resume_flags: {resume_flags:?}"
    );
    assert!(
        manifest_flags(file)
            .iter()
            .any(|f| f.starts_with("--session-id")),
        "the first CLI names the id"
    );
    assert_eq!(
        transcript_sha,
        sha256(&bytes_of(&transcript)),
        "{transcript}: sha256"
    );
}

#[test]
fn the_resume_session_at_capture_records_the_fork_flags_with_a_new_id_and_the_cut_point() {
    let flags =
        manifest_resume_flags("27-resume-session-at.ndjson").expect("no resume_flags recorded");
    assert!(
        flags.iter().any(|f| f.starts_with("--resume=")),
        "resume_flags: {flags:?}"
    );
    assert!(
        flags.iter().any(|f| f == "--fork-session"),
        "resume_flags: {flags:?}"
    );
    assert!(
        flags.iter().any(|f| f.starts_with("--session-id=")),
        "resume_flags: {flags:?}"
    );
    assert!(
        flags.iter().any(|f| f.starts_with("--resume-session-at=")),
        "resume_flags: {flags:?}"
    );
}

#[test]
fn the_attachments_capture_records_the_stdin_lines_it_was_taken_with_and_two_turns_that_both_succeeded()
 {
    let file = "23-attachments.ndjson";
    let stdin = manifest_stdin(file).expect("no stdin lines recorded");

    assert_eq!(
        stdin.sha256,
        sha256(&bytes_of(&stdin.file)),
        "{}: sha256",
        stdin.file
    );
    assert_eq!(
        stdin.lines,
        non_blank_lines(&text_of(&stdin.file)).len(),
        "{}: lines",
        stdin.file
    );
    let flags = manifest_flags(file);
    assert!(
        flags.iter().any(|f| f == "--permission-prompt-tool")
            && flags.iter().any(|f| f == "--model"),
        "flags: {flags:?}"
    );
    let results: Vec<(bool, String)> = read_capture(file)
        .into_iter()
        .filter_map(|e| match e {
            AgentEvent::Result {
                is_error, result, ..
            } => Some((is_error, result)),
            _ => None,
        })
        .collect();
    assert_eq!(2, results.len(), "one result for each turn");
    assert!(
        results.iter().all(|(is_error, _)| !is_error),
        "neither turn ended in an error"
    );
    let answers: Vec<&str> = results.iter().map(|(_, r)| r.as_str()).collect();
    assert_eq!(
        vec!["Red", "KIWI"],
        answers,
        "the answers to the picture and to the PDF"
    );
}

// --- AgentEventFixtureTest --------------------------------------------------------------

#[test]
fn manifest_lists_every_recorded_capture() {
    let m = manifest();
    assert_eq!(
        EXPECTED_CAPTURES, m.scenario_count,
        "manifest.json scenario_count"
    );
    assert_eq!(
        EXPECTED_CAPTURES,
        m.scenarios.len(),
        "manifest.json scenarios[] length"
    );
}

#[test]
fn every_line_of_every_capture_becomes_an_agent_event() {
    for s in manifest().scenarios {
        let text = text_of(&s.file);
        let lines = non_blank_lines(&text);
        let events = parse_all(&text);

        assert_eq!(
            lines.len(),
            events.len(),
            "{}: one event per non-blank line",
            s.file
        );
        assert_eq!(s.lines, lines.len(), "{}: manifest.json line count", s.file);

        let unplaceable: Vec<(usize, &AgentEvent)> = events
            .iter()
            .enumerate()
            .filter(|(_, e)| !e.is_known())
            .collect();
        let mut unknown_wire_types: BTreeMap<String, usize> = BTreeMap::new();
        for (_, e) in &unplaceable {
            let key = match e {
                AgentEvent::UnknownKind { wire_type, .. } => wire_type.clone(),
                _ => "broken line".to_string(),
            };
            *unknown_wire_types.entry(key).or_default() += 1;
        }
        let expected = known_unplaced(&s.scenario);
        assert_eq!(
            expected,
            unknown_wire_types,
            "{}: the lines that did not become a known event - first at line {:?}: {:?}",
            s.file,
            unplaceable.first().map(|(i, _)| i + 1),
            unplaceable.first().map(|(_, e)| e)
        );
    }
}

#[test]
fn the_captures_hold_the_recorded_number_of_lines_in_total_as_events() {
    let total: usize = manifest()
        .scenarios
        .iter()
        .map(|s| read_capture(&s.file).len())
        .sum();
    assert_eq!(EXPECTED_LINES, total, "lines across all captures");
}

#[test]
fn a_line_carries_its_own_kind() {
    assert_eq!(
        all_kinds_but_the_type_only(),
        observed_kinds(),
        "every modelled kind should appear in the captures (but the type-only ones), and no line should invent one"
    );
}

#[test]
fn a_turn_boundary_line_becomes_command_lifecycle() {
    let event = parse(
        r#"{"type":"command_lifecycle","command_uuid":"2db4d1c4","state":"queued","uuid":"a6026949","session_id":"0d09d32e"}"#,
    );
    assert_eq!(event.kind(), Some(AgentEventKind::CommandLifecycle));
    let AgentEvent::CommandLifecycle {
        uuid,
        session_id,
        command_uuid,
        state,
    } = event
    else {
        panic!("not a CommandLifecycle: {event:?}");
    };
    assert_eq!("2db4d1c4", command_uuid);
    assert_eq!("queued", state);
    assert_eq!("a6026949", uuid);
    assert_eq!("0d09d32e", session_id);
}

#[test]
fn a_system_line_keeps_its_subtype_instead_of_collapsing_into_one_bucket() {
    let status = parse(
        r#"{"type":"system","subtype":"status","status":null,"permissionMode":"plan","uuid":"d7ad0e15","session_id":"1a0d2541"}"#,
    );
    let updated = parse(
        r#"{"type":"system","subtype":"task_updated","task_id":"a9647d7f","patch":{"status":"completed"},"uuid":"17b5da97","session_id":"fce28e10"}"#,
    );

    let AgentEvent::SystemStatus {
        status,
        permission_mode,
        ..
    } = status
    else {
        panic!("not a SystemStatus: {status:?}");
    };
    let AgentEvent::SystemTaskUpdated { task_id, patch, .. } = updated else {
        panic!("not a SystemTaskUpdated: {updated:?}");
    };
    assert_eq!(
        None, status,
        "status is null on 5 of the 34 recorded system/status lines"
    );
    assert_eq!(Some("plan".to_string()), permission_mode);
    assert_eq!("a9647d7f", task_id);
    assert_eq!(r#"{"status":"completed"}"#, patch.0);
}

#[test]
fn the_compact_result_of_a_status_is_read() {
    let status = parse(
        r#"{"type":"system","subtype":"status","status":null,"compact_result":"success","session_id":"59475b26","uuid":"991bf2d2"}"#,
    );
    let AgentEvent::SystemStatus {
        status,
        compact_result,
        ..
    } = status
    else {
        panic!("not a SystemStatus: {status:?}");
    };
    assert_eq!(None, status);
    assert_eq!(Some("success".to_string()), compact_result);
}

#[test]
fn a_nested_payload_is_carried_through_as_text_rather_than_modelled() {
    let event = parse(
        r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0},"session_id":"0d09d32e","parent_tool_use_id":null,"uuid":"3f1d0c22","ttft_ms":812}"#,
    );
    let AgentEvent::StreamEvent {
        event,
        parent_tool_use_id,
        ttft_ms,
        user_message_uuid,
        ..
    } = event
    else {
        panic!("not a StreamEvent: {event:?}");
    };
    assert_eq!(r#"{"type":"content_block_delta","index":0}"#, event.0);
    assert_eq!(
        None, parent_tool_use_id,
        "an explicit JSON null is an absent value"
    );
    assert_eq!(Some(FIRST_TOKEN_MS), ttft_ms);
    assert_eq!(
        None, user_message_uuid,
        "a field the line omits is absent, not an error"
    );
}

#[test]
fn a_control_request_keeps_its_payload_and_its_correlation_id() {
    let event = parse(
        r#"{"type":"control_request","request_id":"fd37592b","request":{"subtype":"can_use_tool","tool_name":"Write"}}"#,
    );
    let AgentEvent::ControlRequest {
        request_id,
        request,
        ..
    } = event
    else {
        panic!("not a ControlRequest: {event:?}");
    };
    assert_eq!("fd37592b", request_id);
    assert_eq!(
        r#"{"subtype":"can_use_tool","tool_name":"Write"}"#,
        request.0
    );
}

#[test]
fn a_trailing_newline_is_not_an_event() {
    let line = r#"{"type":"command_lifecycle","command_uuid":"c","state":"started","uuid":"u","session_id":"s"}"#;
    assert_eq!(
        1,
        parse_all(&format!("{line}\n")).len(),
        "a trailing newline"
    );
    assert_eq!(
        1,
        parse_all(&format!("{line}\n\n   \n")).len(),
        "blank lines between and after"
    );
}

// --- CoverageTest -----------------------------------------------------------------------

#[test]
fn the_captures_contain_exactly_the_kinds_that_are_modelled_but_the_ones_modelled_from_the_types_alone()
 {
    assert_eq!(
        OBSERVED_KINDS,
        observed_kinds().len(),
        "distinct kinds in the captures"
    );
    assert_eq!(
        OBSERVED_KINDS + TYPE_ONLY.len(),
        AgentEventKind::ALL.len(),
        "variants of AgentEvent that are kinds"
    );
    assert_eq!(
        all_kinds_but_the_type_only(),
        observed_kinds(),
        "a modelled kind that never arrives is a branch no test can reach"
    );
    let observed = observed_kinds();
    assert!(
        TYPE_ONLY.iter().all(|k| !observed.contains(k)),
        "a type-only kind leaves the list the day a capture carries it"
    );
}

#[test]
fn the_one_kind_with_no_official_declaration_is_one_the_captures_really_send() {
    // `command_lifecycle` appears once in sdk.d.ts, in prose on `interrupt`; `ui_invalidate` not at all.
    let undeclared = [
        AgentEventKind::CommandLifecycle,
        AgentEventKind::SystemUiInvalidate,
    ];
    let lifecycle_captures = manifest()
        .scenarios
        .iter()
        .filter(|s| {
            read_capture(&s.file)
                .iter()
                .any(|e| matches!(e, AgentEvent::CommandLifecycle { .. }))
        })
        .count();

    let observed = observed_kinds();
    assert!(
        undeclared.iter().all(|k| observed.contains(k.wire_type())),
        "the undeclared kinds are in the captures"
    );
    assert_eq!(
        CAPTURES_WITH_LIFECYCLE, lifecycle_captures,
        "captures containing command_lifecycle"
    );
    assert_eq!(
        DECLARED_IN_STDOUT_MESSAGE,
        OBSERVED_KINDS - undeclared.len(),
        "observed kinds declared in StdoutMessage (of {STDOUT_MESSAGE_KINDS} declared kinds)"
    );
}

#[test]
fn the_control_protocol_is_why_the_denominator_is_stdout_message_and_not_sdk_message() {
    let control_only = [
        AgentEventKind::ControlRequest,
        AgentEventKind::ControlResponse,
    ];
    let control_lines: usize = manifest()
        .scenarios
        .iter()
        .map(|s| {
            read_capture(&s.file)
                .iter()
                .filter(|e| e.kind().is_some_and(|k| control_only.contains(&k)))
                .count()
        })
        .sum();

    let observed = observed_kinds();
    assert!(
        control_only
            .iter()
            .all(|k| observed.contains(k.wire_type())),
        "the control kinds are recorded"
    );
    assert_eq!(
        CONTROL_PROTOCOL_LINES, control_lines,
        "recorded control-protocol lines"
    );
    assert_eq!(
        DECLARED_IN_SDK_MESSAGE,
        DECLARED_IN_STDOUT_MESSAGE - control_only.len(),
        "observed kinds declared in SDKMessage"
    );
}

#[test]
fn the_declared_kinds_that_never_arrive_are_left_unmodelled() {
    assert_eq!(
        NEVER_OBSERVED,
        STDOUT_MESSAGE_KINDS - DECLARED_IN_STDOUT_MESSAGE,
        "declared kinds absent from all {EXPECTED_LINES} recorded lines"
    );
}

// --- CodecDecodeTest: the tests that read captures --------------------------------------

#[test]
fn an_init_with_no_scratchpad_path_is_placed_with_the_path_null() {
    for (scenario, line) in [
        ("16-permission-suggestion-accept", 5),
        ("21-compact", 4),
        ("21-compact", 21),
    ] {
        let event = capture_line(scenario, line);
        let AgentEvent::SystemInit {
            scratchpad_path, ..
        } = event
        else {
            panic!("{scenario} line {line}: not a SystemInit: {event:?}");
        };
        assert_eq!(None, scratchpad_path, "{scenario} line {line}");
    }
}

#[test]
fn commands_changed_and_compact_boundary_lines_become_typed_values() {
    for line in [1, 7, 8] {
        let event = capture_line("16-permission-suggestion-accept", line);
        assert!(
            matches!(event, AgentEvent::SystemCommandsChanged { .. }),
            "line {line}: {event:?}"
        );
    }
    let boundary = capture_line("21-compact", 22);
    let AgentEvent::SystemCompactBoundary {
        compact_metadata,
        logical_parent_uuid,
        ..
    } = boundary
    else {
        panic!("not a SystemCompactBoundary: {boundary:?}");
    };
    assert!(compact_metadata.0.contains("trigger") && compact_metadata.0.contains("pre_tokens"));
    assert!(
        logical_parent_uuid.is_some(),
        "21 line 22 carries logical_parent_uuid"
    );
}

#[test]
fn the_result_of_a_local_command_is_placed_with_its_optional_fields_absent() {
    let event = capture_line("21-compact", 25);
    let AgentEvent::Result {
        local_command,
        stop_reason,
        terminal_reason,
        ttft_ms,
        ttft_stream_ms,
        time_to_request_ms,
        first_content_frame_ms,
        ..
    } = event
    else {
        panic!("not a Result: {event:?}");
    };
    assert_eq!(Some("compact".to_string()), local_command);
    assert_eq!(None, stop_reason);
    assert_eq!(None, terminal_reason);
    assert_eq!(None, ttft_ms);
    assert_eq!(None, ttft_stream_ms);
    assert_eq!(None, time_to_request_ms);
    assert_eq!(None, first_content_frame_ms);
}

#[test]
fn a_model_turn_result_still_carries_its_timing_fields_and_no_local_command() {
    let mut results = read_capture("01-baseline-text.ndjson")
        .into_iter()
        .filter(|e| matches!(e, AgentEvent::Result { .. }));
    let result = results.next().expect("no result in 01");
    assert!(results.next().is_none(), "more than one result in 01");
    let AgentEvent::Result {
        local_command,
        ttft_ms,
        terminal_reason,
        ..
    } = result
    else {
        unreachable!();
    };
    assert_eq!(None, local_command);
    assert!(ttft_ms.is_some() && terminal_reason.is_some());
}

#[test]
fn a_result_names_every_message_its_turn_took_in_in_order() {
    // 31: the second message, sent while the first ran, was taken into the first's turn.
    let event = capture_line("31-send-mid-turn", 54);
    let AgentEvent::Result {
        user_message_uuid,
        user_message_uuids,
        ..
    } = event
    else {
        panic!("not a Result: {event:?}");
    };
    let uuids = user_message_uuids.unwrap_or_default();
    assert_eq!(2, uuids.len());
    assert_eq!(user_message_uuid.as_ref(), uuids.first());
}

#[test]
fn a_result_without_the_list_has_none_and_one_with_stray_entries_keeps_only_its_strings() {
    let line = &non_blank_lines(&text_of("31-send-mid-turn.ndjson"))[53];
    let json: Value = serde_json::from_str(line).unwrap();
    let mut without = json.clone();
    without
        .as_object_mut()
        .unwrap()
        .remove("user_message_uuids");
    let mut stray = json;
    stray.as_object_mut().unwrap().insert(
        "user_message_uuids".to_string(),
        serde_json::json!(["a", 1, null]),
    );

    let AgentEvent::Result {
        user_message_uuids: none,
        ..
    } = decode(&without.to_string())
    else {
        panic!("without: not a Result");
    };
    let AgentEvent::Result {
        user_message_uuids: kept,
        ..
    } = decode(&stray.to_string())
    else {
        panic!("stray: not a Result");
    };
    assert_eq!(None, none);
    assert_eq!(Some(vec!["a".to_string()]), kept);
}

#[test]
fn an_error_result_without_a_result_text_says_what_went_wrong_with_its_errors() {
    // sdk.d.ts SDKResultError has errors and no result. 32 was interrupted while a foreground Bash ran.
    let event = capture_line("32-interrupt-foreground", 80);
    let AgentEvent::Result {
        subtype,
        is_error,
        terminal_reason,
        result,
        ..
    } = event
    else {
        panic!("not a Result: {event:?}");
    };
    assert_eq!("error_during_execution", subtype);
    assert!(is_error);
    assert_eq!(Some("aborted_streaming".to_string()), terminal_reason);
    assert_eq!(DIAGNOSTIC, result);
}

#[test]
fn a_result_written_before_initialize_decodes() {
    // 36: a CLI that refuses to start (the sandbox is required but bwrap is missing) writes this one result and
    // exits without answering initialize; it has no queued_turn_count, fast_mode_state or subagent_stats.
    let event = capture_line("36-sandbox-unavailable", 1);
    let AgentEvent::Result {
        is_error,
        num_turns,
        result,
        queued_turn_count,
        fast_mode_state,
        subagent_stats,
        ..
    } = event
    else {
        panic!("not a Result: {event:?}");
    };
    assert!(is_error);
    assert_eq!(0, num_turns);
    assert!(
        result.starts_with("Sandbox required but unavailable:"),
        "{result}"
    );
    assert_eq!(None, queued_turn_count);
    assert_eq!(None, fast_mode_state);
    assert_eq!(None, subagent_stats);
}

#[test]
fn a_control_response_lifts_request_id_subtype_and_error_and_a_success_lifts_no_error() {
    let rejected = capture_line("07-set-model-and-mode", 9);
    let accepted = capture_line("07-set-model-and-mode", 4);
    let AgentEvent::ControlResponse {
        request_id: rej_id,
        subtype: rej_sub,
        error: rej_err,
        ..
    } = rejected
    else {
        panic!("not a ControlResponse: {rejected:?}");
    };
    let AgentEvent::ControlResponse {
        request_id: acc_id,
        subtype: acc_sub,
        error: acc_err,
        ..
    } = accepted
    else {
        panic!("not a ControlResponse: {accepted:?}");
    };
    assert_eq!(Some("07-set-model-and-mode-req-8".to_string()), rej_id);
    assert_eq!(Some("error".to_string()), rej_sub);
    assert!(
        rej_err
            .unwrap()
            .starts_with("Cannot set permission mode to bypassPermissions")
    );
    assert_eq!(Some("success".to_string()), acc_sub);
    assert_eq!(Some("07-set-model-and-mode-req-6".to_string()), acc_id);
    assert_eq!(None, acc_err);
}

// --- CodecDecodeTest: the five kinds the 2.1.325 CLI sends or declares -------------------

#[test]
fn the_status_that_ends_a_compaction_carries_its_result() {
    // CodecDecodeTest.kt: the status that ends a compaction carries its result
    let event = capture_line("21-compact", 19);
    let AgentEvent::SystemStatus {
        status,
        compact_result,
        ..
    } = event
    else {
        panic!("21 line 19: not a SystemStatus: {}", kind_of(&event));
    };
    assert_eq!(None, status);
    assert_eq!(Some("success".to_string()), compact_result);
}

#[test]
fn a_ui_invalidate_line_becomes_a_typed_value_with_its_event() {
    // CodecDecodeTest.kt: a ui_invalidate line becomes a typed value with its event. Not in sdk.d.ts;
    // the captures carry it at the start of a session.
    for (scenario, line) in [("01-baseline-text", 1), ("08-subagent-task", 2)] {
        let event = capture_line(scenario, line);
        let AgentEvent::SystemUiInvalidate {
            uuid,
            session_id,
            event,
        } = &event
        else {
            panic!(
                "{scenario} line {line}: not a SystemUiInvalidate: {}",
                kind_of(&event)
            );
        };
        assert_eq!(
            Some("ui.render"),
            event.as_deref(),
            "{scenario} line {line}"
        );
        assert!(
            !uuid.is_empty() && !session_id.is_empty(),
            "{scenario} line {line}"
        );
    }
}

#[test]
fn a_conversation_reset_line_becomes_a_typed_reset_naming_the_clear_that_made_it() {
    // CodecDecodeTest.kt: a conversation_reset line becomes a typed reset naming the clear that made it.
    // 41: the second message sent was `/clear`; the reset names it and the conversation it starts.
    let mut commands: Vec<String> = Vec::new();
    for e in read_capture("41-clear-reset.ndjson") {
        if let AgentEvent::CommandLifecycle { command_uuid, .. } = e
            && !commands.contains(&command_uuid)
        {
            commands.push(command_uuid);
        }
    }
    let event = capture_line("41-clear-reset", 18);
    let AgentEvent::ConversationReset {
        session_id,
        new_conversation_id,
        trigger,
        user_message_uuid,
        timestamp,
        ..
    } = event
    else {
        panic!("41 line 18: not a ConversationReset: {}", kind_of(&event));
    };
    assert_eq!(Some("clear".to_string()), trigger);
    assert_eq!(
        Some("84d712ce-9cd0-4cec-b51e-4dfe8cf10d9a".to_string()),
        user_message_uuid
    );
    assert_eq!(
        Some(&commands[1]),
        user_message_uuid.as_ref(),
        "the second command sent is the /clear the reset names"
    );
    assert_eq!("c0817532-7496-4d9c-8870-b9c088a63253", new_conversation_id);
    assert_eq!(Some("2026-11-14T12:26:36.305Z".to_string()), timestamp);
    assert_eq!(
        "a6635625-53e9-40b5-adfb-977a4e9163b2", session_id,
        "the line still carries the old id"
    );
}

#[test]
fn a_conversation_reset_without_its_optional_fields_is_still_a_reset() {
    // CodecDecodeTest.kt: a conversation_reset of an older CLI, without its optional fields, is still a reset
    let event = parse(
        r#"{"type":"conversation_reset","new_conversation_id":"n","uuid":"u","session_id":"s"}"#,
    );
    assert_eq!(
        AgentEvent::ConversationReset {
            uuid: "u".into(),
            session_id: "s".into(),
            new_conversation_id: "n".into(),
            trigger: None,
            user_message_uuid: None,
            timestamp: None,
        },
        event
    );
}

#[test]
fn a_permission_denied_line_becomes_a_typed_refusal_naming_the_call_and_the_kind_of_decision() {
    // CodecDecodeTest.kt: a permission_denied line becomes a typed refusal naming the call and the kind
    // of decision
    let event = capture_line("44-permission-denied", 23);
    let AgentEvent::SystemPermissionDenied {
        tool_name,
        tool_use_id,
        agent_id,
        decision_reason_type,
        decision_reason,
        message,
        ..
    } = &event
    else {
        panic!(
            "44 line 23: not a SystemPermissionDenied: {}",
            kind_of(&event)
        );
    };
    assert_eq!("Bash", tool_name);
    assert_eq!("toolu_01LeMqLTAqR4JiZqRuLiYC21", tool_use_id);
    assert_eq!(Some("mode"), decision_reason_type.as_deref());
    assert!(
        decision_reason.is_none(),
        "44 line 23 has no decision_reason"
    );
    assert!(agent_id.is_none(), "44 line 23 is the main agent's refusal");
    assert!(
        !message.is_empty(),
        "44 line 23 says what the model was told"
    );
}

#[test]
fn a_sub_agents_permission_denied_line_carries_the_agent_id() {
    // CodecDecodeTest.kt: a sub-agent's permission_denied line carries the agent id
    let event = capture_line("10-background-task", 72);
    let AgentEvent::SystemPermissionDenied {
        tool_name,
        agent_id,
        decision_reason_type,
        ..
    } = &event
    else {
        panic!(
            "10 line 72: not a SystemPermissionDenied: {}",
            kind_of(&event)
        );
    };
    assert_eq!("Monitor", tool_name);
    assert_eq!(Some("a40aca0599667cba4"), agent_id.as_deref());
    assert_eq!(Some("subcommandResults"), decision_reason_type.as_deref());
}

#[test]
fn an_informational_line_becomes_a_typed_value_with_its_level_and_flags() {
    // CodecDecodeTest.kt: type only - an informational line becomes a typed value with its level and flags
    let event = parse(concat!(
        r#"{"type":"system","subtype":"informational","content":"Stop hook said no","level":"warning","#,
        r#""prevent_continuation":true,"tag":"x","tool_use_id":"toolu_1","uuid":"u","session_id":"s"}"#
    ));
    assert_eq!(
        AgentEvent::SystemInformational {
            uuid: "u".into(),
            session_id: "s".into(),
            content: "Stop hook said no".into(),
            level: "warning".into(),
            tool_use_id: Some("toolu_1".into()),
            prevent_continuation: Some(true),
            tag: Some("x".into()),
        },
        event
    );
}

#[test]
fn an_informational_line_without_its_optional_fields_still_decodes() {
    // CodecDecodeTest.kt: type only - an informational line without its optional fields still decodes
    let event = parse(
        r#"{"type":"system","subtype":"informational","content":"hi","level":"info","uuid":"u","session_id":"s"}"#,
    );
    let AgentEvent::SystemInformational {
        tool_use_id,
        prevent_continuation,
        tag,
        ..
    } = &event
    else {
        panic!("not a SystemInformational: {}", kind_of(&event));
    };
    assert_eq!(None, *prevent_continuation);
    assert_eq!(None, *tag);
    assert_eq!(None, *tool_use_id);
}

#[test]
fn an_api_retry_line_becomes_a_typed_value_and_a_null_status_stays_null() {
    // CodecDecodeTest.kt: type only - an api retry line becomes a typed value, and a null status stays null
    let line = concat!(
        r#"{"type":"system","subtype":"api_retry","attempt":2,"max_retries":10,"retry_delay_ms":2500,"#,
        r#""error_status":529,"error":"overloaded","uuid":"u","session_id":"s"}"#
    );
    assert_eq!(
        AgentEvent::SystemApiRetry {
            uuid: "u".into(),
            session_id: "s".into(),
            attempt: 2,
            max_retries: 10,
            retry_delay_ms: 2500,
            error_status: Some(529),
            error: Some("overloaded".into()),
        },
        parse(line)
    );
    let no_status = parse(&line.replace(r#""error_status":529"#, r#""error_status":null"#));
    let AgentEvent::SystemApiRetry { error_status, .. } = &no_status else {
        panic!("not a SystemApiRetry: {}", kind_of(&no_status));
    };
    assert_eq!(None, *error_status);
}

#[test]
fn a_new_kind_missing_a_required_field_is_unknown() {
    let cases = [
        (
            "system/permission_denied",
            r#"{"type":"system","subtype":"permission_denied","tool_name":"Bash","message":"m","uuid":"u","session_id":"s"}"#,
        ),
        (
            "system/api_retry",
            r#"{"type":"system","subtype":"api_retry","attempt":"two","max_retries":10,"retry_delay_ms":2500,"error_status":null,"error":null,"uuid":"u","session_id":"s"}"#,
        ),
        (
            "conversation_reset",
            r#"{"type":"conversation_reset","trigger":"clear","uuid":"u","session_id":"s"}"#,
        ),
    ];
    for (wire_type, line) in cases {
        let event = parse(line);
        assert!(
            matches!(&event, AgentEvent::UnknownKind { wire_type: w, .. } if w == wire_type),
            "{wire_type}: {}",
            kind_of(&event)
        );
    }
}

#[test]
fn there_are_twenty_three_kinds() {
    assert_eq!(23, AgentEventKind::ALL.len());
    let last_five: Vec<(AgentEventKind, &str)> = AgentEventKind::ALL[18..]
        .iter()
        .map(|k| (*k, k.wire_type()))
        .collect();
    assert_eq!(
        vec![
            (AgentEventKind::SystemUiInvalidate, "system/ui_invalidate"),
            (AgentEventKind::ConversationReset, "conversation_reset"),
            (
                AgentEventKind::SystemPermissionDenied,
                "system/permission_denied"
            ),
            (AgentEventKind::SystemInformational, "system/informational"),
            (AgentEventKind::SystemApiRetry, "system/api_retry"),
        ],
        last_five
    );
}
