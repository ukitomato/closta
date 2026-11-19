//! The transcript fold (TranscriptFoldTest.kt): pure, never panicking, and an input it has no use
//! for changes nothing at all — the same `Arc`.
//!
//! Not ported: the selection and apply answers of "the answers of the host to the webview" (those
//! inputs are not ported), and the casts of "the routing a transcript hands out cannot be changed
//! through a cast" — a shared `imbl` map or `Arc<[String]>` cannot be changed through a reference
//! in Rust at all; its last assertion is kept.

use std::sync::Arc;

use closta_goldens::lines::{self, InitLine, RequestLine};
use closta_goldens::replay::{inputs, scenarios};
use closta_model::ConversationState;
use closta_model::{AgentEvent, ApprovalDecision, RawJson};
use closta_presenter::fold::fold_transcript;
use closta_presenter::fold::paths::call_input;
use closta_presenter::input::{Decided, PassedOn, PresenterInput, SendId, UserSent};
use closta_presenter::keyed::Keyed;
use closta_presenter::records::composer::{
    ComposerFailure, FileSearchRecord, SlashCommandRecord, SlashCommands,
};
use closta_presenter::session::SessionView;
use closta_presenter::text::{take_utf16, utf16_len};
use closta_presenter::transcript::{
    ApprovalOutcome, CompactionMark, CompactionOutcome, MessageRecord, PartRecord, Role,
    TextRecord, ToolCallRecord,
};

fn with(view: &SessionView, event: AgentEvent) -> SessionView {
    view.clone().fold(&PresenterInput::Event(event))
}

fn started() -> SessionView {
    [lines::queued("c1"), lines::started("c1")]
        .into_iter()
        .fold(SessionView::default(), |view, event| with(&view, event))
}

/// The transcript came through as the same `Arc`: the fold changed nothing.
fn assert_unchanged(before: &SessionView, after: &SessionView, message: &str) {
    assert!(
        Arc::ptr_eq(&before.transcript, &after.transcript),
        "{message}"
    );
}

fn message<'a>(view: &'a SessionView, key: &str) -> &'a Arc<MessageRecord> {
    view.transcript
        .messages
        .get(key)
        .unwrap_or_else(|| panic!("no message '{key}'"))
}

fn text_of(part: &PartRecord) -> &TextRecord {
    match part {
        PartRecord::Text(text) => text,
        other => panic!("not a text part: {other:?}"),
    }
}

fn call_of(part: &PartRecord) -> &ToolCallRecord {
    match part {
        PartRecord::ToolCall(call) => call,
        other => panic!("not a tool call: {other:?}"),
    }
}

fn part<'a>(message: &'a MessageRecord, key: &str) -> &'a PartRecord {
    message
        .parts
        .get(key)
        .unwrap_or_else(|| panic!("no part '{key}'"))
}

fn order<T>(keyed: &Keyed<T>) -> Vec<&str> {
    keyed.order().collect()
}

fn stream_event(frame: &str, parent: Option<&str>) -> AgentEvent {
    AgentEvent::StreamEvent {
        uuid: "se".into(),
        session_id: "s".into(),
        event: RawJson(frame.into()),
        parent_tool_use_id: parent.map(str::to_owned),
        ttft_ms: None,
        user_message_uuid: None,
        user_message_uuids: None,
    }
}

fn assistant_event(message: &str) -> AgentEvent {
    AgentEvent::Assistant {
        uuid: "a".into(),
        session_id: "s".into(),
        timestamp: "t".into(),
        request_id: Some("r".into()),
        message: RawJson(message.into()),
        parent_tool_use_id: None,
        user_message_uuid: None,
        user_message_uuids: None,
        wire_tool_inputs: None,
        subagent_type: None,
        task_description: None,
        error: None,
    }
}

fn user_event(message: &str) -> AgentEvent {
    AgentEvent::User {
        uuid: "u".into(),
        session_id: "s".into(),
        timestamp: "t".into(),
        message: RawJson(message.into()),
        parent_tool_use_id: None,
        tool_use_result: None,
        subagent_type: None,
        task_description: None,
    }
}

#[test]
fn content_whose_raw_json_cannot_be_read_changes_nothing() {
    let before = with(
        &started(),
        lines::assistant("m1", &lines::tool_use("toolu_1", "Bash", "{}"), None),
    );
    let broken = [
        stream_event("{not json", None),
        stream_event("[]", None),
        stream_event(
            r#"{"type":"content_block_delta","index":"0","delta":{"type":"text_delta","text":"x"}}"#,
            None,
        ),
        assistant_event("{\"id\":"),
        assistant_event(r#"{"id":7,"content":[]}"#),
        assistant_event(r#"{"id":"m2","content":{}}"#),
        user_event("nope"),
        user_event(r#"{"content":[{"type":"tool_result","tool_use_id":5}]}"#),
        AgentEvent::UnknownKind {
            wire_type: "future".into(),
            raw: RawJson("{}".into()),
        },
        AgentEvent::BrokenLine {
            line: "{".into(),
            reason: "malformed".into(),
        },
    ];
    for event in broken {
        let label = format!("{event:?}");
        assert_unchanged(&before, &with(&before, event), &label);
    }
}

/// Review focus 3: an event with nothing to show returns the very `Arc` it was given, straight
/// from `fold_transcript`.
#[test]
fn an_event_with_nothing_to_show_returns_the_same_transcript() {
    let transcript = with(
        &SessionView::default(),
        lines::assistant("m1", &lines::text("hi"), None),
    )
    .transcript;
    let state = ConversationState::default();
    for event in [
        AgentEvent::UnknownKind {
            wire_type: "future".into(),
            raw: RawJson(r#"{"type":"future"}"#.into()),
        },
        assistant_event(r#"{"id":"m2","content":"not blocks"}"#),
        assistant_event(r#"{"id":"m2""#),
    ] {
        let label = format!("{event:?}");
        let folded = fold_transcript(&transcript, &PresenterInput::Event(event), &state, &state);
        assert!(Arc::ptr_eq(&transcript, &folded), "{label}");
    }
}

#[test]
fn lines_that_carry_no_content_change_nothing() {
    // task_started, task_progress and background_tasks_changed feed the running list, so they are
    // not here.
    let before = started();
    let mut seen = 0;
    for input in inputs("10-background-task", false) {
        let PresenterInput::Event(event) = input else {
            continue;
        };
        if matches!(
            event,
            AgentEvent::SystemStatus { .. }
                | AgentEvent::RateLimitEvent { .. }
                | AgentEvent::SystemTaskNotification { .. }
                | AgentEvent::SystemTaskUpdated { .. }
                | AgentEvent::SystemThinkingTokens { .. }
        ) {
            seen += 1;
            let label = format!("{event:?}");
            assert_unchanged(&before, &with(&before, event), &label);
        }
    }
    assert!(seen > 0);
    assert_unchanged(
        &before,
        &with(&before, lines::started("c1")),
        "a repeated started changes nothing",
    );
    assert_unchanged(
        &before,
        &with(
            &before,
            AgentEvent::CommandLifecycle {
                uuid: "l".into(),
                session_id: "s".into(),
                command_uuid: "c1".into(),
                state: "completed".into(),
            },
        ),
        "completed",
    );
}

fn command(name: &str, description: &str, argument_hint: Option<&str>) -> SlashCommandRecord {
    SlashCommandRecord {
        name: name.into(),
        description: description.into(),
        argument_hint: argument_hint.map(str::to_owned),
    }
}

fn commands(items: Vec<SlashCommandRecord>, detailed: bool) -> SlashCommands {
    SlashCommands {
        items: items.into(),
        detailed,
    }
}

fn init_with_commands(slash_commands: &str) -> AgentEvent {
    InitLine {
        slash_commands,
        ..InitLine::default()
    }
    .event()
}

#[test]
fn the_initialize_response_gives_the_commands_with_their_sentences_and_system_init_alone_only_their_names()
 {
    let named = with(
        &SessionView::default(),
        init_with_commands(r#"["config","context",7,""]"#),
    );
    assert_eq!(
        commands(
            vec![command("config", "", None), command("context", "", None)],
            false
        ),
        named.transcript.commands
    );
    let body = concat!(
        r#"{"commands":[{"name":"config","description":"Set a setting by key","argumentHint":"key=value"},"#,
        r#"{"name":"x"},{"description":"nameless"}]}"#
    );
    let detailed = with(&named, lines::initialized(body, "init-1"));
    assert_eq!(
        commands(
            vec![
                command("config", "Set a setting by key", Some("key=value")),
                command("x", "", None)
            ],
            true
        ),
        detailed.transcript.commands
    );
    // The names a later system/init gives never replace the sentences.
    let later = with(&detailed, init_with_commands(r#"["other"]"#));
    assert_unchanged(&detailed, &later, "a later init");
    // An initialize response read first is not replaced by a names-only list either.
    let first = with(
        &with(&SessionView::default(), lines::initialized(body, "init-1")),
        init_with_commands(r#"["other"]"#),
    );
    assert_eq!(detailed.transcript.commands, first.transcript.commands);
}

#[test]
fn a_response_that_is_an_error_or_has_no_commands_or_the_same_commands_again_changes_nothing() {
    let detailed = with(
        &SessionView::default(),
        lines::initialized(
            r#"{"commands":[{"name":"config","description":"d"}]}"#,
            "init-1",
        ),
    );
    assert_ne!(SlashCommands::default(), detailed.transcript.commands);
    for (event, label) in [
        (lines::control_error("init-1", "refused"), "an error"),
        (lines::initialized("{}", "init-1"), "no commands"),
        (
            lines::initialized(r#"{"commands":"nope"}"#, "init-1"),
            "commands that are not a list",
        ),
        (
            lines::initialized(
                r#"{"commands":[{"name":"config","description":"d"}]}"#,
                "init-1",
            ),
            "the same commands",
        ),
    ] {
        assert_unchanged(&detailed, &with(&detailed, event), label);
    }
    let empty = SessionView::default();
    assert_unchanged(
        &empty,
        &with(&empty, init_with_commands("{}")),
        "commands that are not a list",
    );
    assert_unchanged(
        &empty,
        &with(&empty, lines::init()),
        "an init with no commands",
    );
}

#[test]
fn the_answers_of_the_host_to_the_webview_are_the_last_one_only() {
    let first = FileSearchRecord {
        command_id: "c1".into(),
        r#match: "App".into(),
        paths: vec!["a/App.kt".to_owned()].into(),
        truncated: false,
        failure: None,
    };
    let second = FileSearchRecord {
        command_id: "c2".into(),
        r#match: "Ap".into(),
        paths: Vec::new().into(),
        truncated: false,
        failure: Some(ComposerFailure::UNAVAILABLE.into()),
    };
    let searched = SessionView::default()
        .fold(&PresenterInput::FilesFound(first))
        .fold(&PresenterInput::FilesFound(second.clone()));
    assert_eq!(Some(&second), searched.transcript.file_search.as_ref());
}

#[test]
fn an_empty_text_delta_changes_nothing_so_a_stream_of_empty_frames_rebuilds_nothing() {
    let streaming = with(
        &with(&started(), lines::message_start("m1")),
        lines::block_start(0, &lines::text("")),
    );
    assert_unchanged(
        &streaming,
        &with(&streaming, lines::text_delta(0, "")),
        "text",
    );
    assert_unchanged(
        &streaming,
        &with(&streaming, lines::json_delta(0, "")),
        "json",
    );
    assert_unchanged(
        &streaming,
        &with(&streaming, lines::text_delta(5, "x")),
        "a block that never started",
    );
}

fn events(view: &SessionView, events: impl IntoIterator<Item = AgentEvent>) -> SessionView {
    events
        .into_iter()
        .fold(view.clone(), |view, event| with(&view, event))
}

#[test]
fn the_finished_text_is_the_authority_over_what_streamed() {
    let streamed = events(
        &started(),
        [
            lines::message_start("m1"),
            lines::block_start(0, &lines::text("")),
            lines::text_delta(0, "Hello wrold"),
        ],
    );
    let finished = with(
        &streamed,
        lines::assistant("m1", &lines::text("Hello world"), None),
    );
    let text = text_of(part(message(&finished, "c1"), "m1:0"));
    assert_eq!("Hello world", text.text);
    assert!(text.streaming, "the stream has not said it stopped");
    let next = with(
        &finished,
        lines::assistant("m1", &lines::text("More."), None),
    );
    assert_eq!(
        vec!["m1:0", "m1:1"],
        order(&message(&next, "c1").parts),
        "each line carries the next block"
    );
}

#[test]
fn a_delta_after_its_block_stopped_changes_nothing() {
    let stopped = events(
        &started(),
        [
            lines::message_start("m1"),
            lines::block_start(0, &lines::text("")),
            lines::text_delta(0, "Hi"),
            lines::block_stop(0),
            lines::block_start(1, &lines::tool_use("toolu_1", "Bash", "{}")),
            lines::json_delta(1, "{}"),
            lines::block_stop(1),
        ],
    );
    assert_unchanged(
        &stopped,
        &with(&stopped, lines::text_delta(0, " there")),
        "text",
    );
    assert_unchanged(
        &stopped,
        &with(&stopped, lines::json_delta(1, "{}")),
        "json",
    );
    assert_unchanged(
        &stopped,
        &with(&stopped, lines::block_stop(0)),
        "stopping it again",
    );
}

#[test]
fn a_block_whose_snapshot_came_before_its_stream_is_not_written_twice() {
    let streamed = events(
        &started(),
        [
            lines::assistant("m1", &lines::text("Hello"), None),
            lines::assistant(
                "m1",
                &lines::tool_use("toolu_1", "Bash", r#"{"a":1}"#),
                None,
            ),
            lines::message_start("m1"),
            lines::block_start(0, &lines::text("")),
            lines::text_delta(0, "Hel"),
            lines::text_delta(0, "lo"),
            lines::block_start(1, &lines::tool_use("toolu_1", "Bash", "{}")),
            lines::json_delta(1, "{\"a\":1}"),
        ],
    );
    let turn = message(&streamed, "c1");
    assert_eq!("Hello", text_of(part(turn, "m1:0")).text);
    assert_eq!("{\"a\":1}", call_of(part(turn, "toolu_1")).args_text);
}

#[test]
fn stream_frames_that_claim_a_sub_agent_are_left_alone() {
    let before = started();
    let claimed = stream_event(
        r#"{"type":"message_start","message":{"id":"m1"}}"#,
        Some("agent"),
    );
    assert_unchanged(&before, &with(&before, claimed), "a sub-agent's frame");
}

#[test]
fn a_sub_agents_line_for_a_call_that_is_not_there_is_left_out() {
    let before = started();
    assert_unchanged(
        &before,
        &with(
            &before,
            lines::assistant("m2", &lines::text("orphan"), Some("nobody")),
        ),
        "assistant",
    );
    assert_unchanged(
        &before,
        &with(&before, lines::user("u1", "\"prompt\"", Some("nobody"))),
        "prompt",
    );
    assert_unchanged(
        &before,
        &with(
            &before,
            lines::user("u1", &lines::tool_result("nobody", "\"x\"", None), None),
        ),
        "tool result",
    );
}

#[test]
fn a_sub_agents_prompt_as_a_plain_string_or_as_text_blocks_is_a_nested_user_message() {
    let with_agent = with(
        &started(),
        lines::assistant("m1", &lines::tool_use("agent", "Agent", "{}"), None),
    );
    let plain = with(&with_agent, lines::user("u1", "\"Read it\"", Some("agent")));
    let call = call_of(part(message(&plain, "c1"), "agent"));
    assert_eq!(vec!["u1"], order(&call.messages));
    let prompt = call.messages.get("u1").expect("the prompt");
    assert_eq!(Role::User, prompt.role);
    assert_eq!("Read it", text_of(part(prompt, "u1:0")).text);
    let blocks = with(
        &with_agent,
        lines::user(
            "u2",
            r#"[{"type":"image"},{"type":"text","text":"Look"}]"#,
            Some("agent"),
        ),
    );
    let nested = call_of(part(message(&blocks, "c1"), "agent"))
        .messages
        .get("u2")
        .expect("the prompt");
    assert_eq!(vec!["u2:1"], order(&nested.parts));
    assert_unchanged(
        &with_agent,
        &with(
            &with_agent,
            lines::user("u3", "\"the user's own words\"", None),
        ),
        "the host already has the user's words",
    );
}

#[test]
fn a_repeated_request_is_asked_afresh_an_empty_request_id_is_not_recorded() {
    let request = |id| RequestLine::new(id, "Bash", Some("toolu_1")).event();
    let asked = with(&started(), request("r1"));
    let decided = asked.clone().fold(&PresenterInput::Decided(Decided {
        decision: ApprovalDecision::Allow {
            request_id: "r1".into(),
        },
        elapsed_ms: 5,
        passed_on: PassedOn::default(),
    }));
    let outcome = |view: &SessionView| {
        view.transcript
            .approvals
            .get("r1")
            .expect("the request")
            .outcome
    };
    assert_eq!(Some(ApprovalOutcome::Approved), outcome(&decided));
    let again = with(&decided, request("r1"));
    assert_eq!(None, outcome(&again));
    assert_unchanged(
        &asked,
        &with(&asked, request("r1")),
        "the same request again changes nothing",
    );
    assert_unchanged(&asked, &with(&asked, request("")), "an empty request id");
}

#[test]
fn a_tool_calls_id_is_its_key_even_when_the_stream_and_the_snapshot_disagree_on_the_name() {
    let view = events(
        &started(),
        [
            lines::message_start("m1"),
            lines::block_start(0, &lines::tool_use("toolu_1", "Bash", "{}")),
            lines::json_delta(0, "{\"a\":1}"),
            lines::assistant(
                "m1",
                &lines::tool_use("toolu_1", "Other", r#"{"a":1}"#),
                None,
            ),
        ],
    );
    let turn = message(&view, "c1");
    let call = call_of(part(turn, "toolu_1"));
    assert_eq!("Bash", call.tool_name);
    assert_eq!("{\"a\":1}", call.args_text);
    assert_eq!(vec!["toolu_1"], order(&turn.parts));
}

#[test]
fn a_sub_agents_prompt_claims_its_key_next_to_the_sub_agents_other_messages() {
    let view = events(
        &started(),
        [
            lines::assistant("m1", &lines::tool_use("agent", "Agent", "{}"), None),
            lines::assistant(
                "u1",
                &lines::text("an assistant message with the same id"),
                Some("agent"),
            ),
            lines::user("u1", "\"the prompt\"", Some("agent")),
        ],
    );
    let nested = &call_of(part(message(&view, "c1"), "agent")).messages;
    assert_eq!(vec!["u1", "u1~2"], order(nested));
    assert_eq!(
        vec![Role::Assistant, Role::User],
        nested.values().map(|it| it.role).collect::<Vec<_>>()
    );
    assert_eq!(
        vec!["u1~2:0"],
        order(&nested.get("u1~2").expect("the prompt").parts)
    );
}

#[test]
fn a_sub_agents_call_is_routed_under_the_call_that_started_it() {
    let routing = events(
        &started(),
        [
            lines::message_start("m1"),
            lines::block_start(0, &lines::tool_use("agent", "Agent", "{}")),
            lines::assistant("m1", &lines::tool_use("agent", "Agent", "{}"), None),
            lines::assistant("m2", &lines::tool_use("bash", "Bash", "{}"), Some("agent")),
        ],
    )
    .transcript
    .routing
    .clone();
    assert_eq!(
        Some(&["c1".to_owned(), "agent".to_owned(), "m2".to_owned()][..]),
        routing.tools.get("bash").map(|it| &it[..])
    );
}

/// Review focus 4: a delta to one message leaves every other message the same `Arc`.
#[test]
fn a_stream_delta_keeps_every_other_message_the_same_arc() {
    let send = |view: &SessionView, id: &str| {
        view.clone().fold(&PresenterInput::UserSent(UserSent {
            message_id: SendId::new(id).expect("a key"),
            text: "hi".into(),
            attachments: Vec::new(),
            uuid: None,
        }))
    };
    let first = send(&SessionView::default(), "s1");
    let streaming = events(
        &first,
        [
            lines::message_start("m1"),
            lines::block_start(0, &lines::text("")),
            lines::block_start(1, &lines::text("")),
            lines::text_delta(0, "Hel"),
        ],
    );
    let streaming = send(&streaming, "s2");
    let before = &streaming.transcript.messages;
    assert_eq!(vec!["s1", "m1", "s2"], order(before));
    let after = with(&streaming, lines::text_delta(1, "lo"));
    let messages = &after.transcript.messages;
    assert_eq!(vec!["s1", "m1", "s2"], order(messages));
    for untouched in ["s1", "s2"] {
        assert!(
            Arc::ptr_eq(
                before.get(untouched).expect("a message"),
                messages.get(untouched).expect("a message")
            ),
            "{untouched}"
        );
    }
    let (old, new) = (message(&streaming, "m1"), message(&after, "m1"));
    assert!(!Arc::ptr_eq(old, new), "the message the delta went to");
    assert!(
        Arc::ptr_eq(
            old.parts.get("m1:0").expect("a part"),
            new.parts.get("m1:0").expect("a part")
        ),
        "the other part of that message"
    );
    assert_eq!("lo", text_of(part(new, "m1:1")).text);
}

/// The same line with its JSON cut short, its strings swapped for numbers, and its arrays emptied.
fn damage(input: &PresenterInput) -> Vec<PresenterInput> {
    let PresenterInput::Event(event) = input else {
        return Vec::new();
    };
    let raw = match event {
        AgentEvent::StreamEvent { event, .. } => &event.0,
        AgentEvent::Assistant { message, .. } | AgentEvent::User { message, .. } => &message.0,
        AgentEvent::ControlRequest { request, .. } => &request.0,
        _ => return Vec::new(),
    };
    let variants = [
        take_utf16(raw, utf16_len(raw) / 2).to_owned(),
        strings_to_numbers(raw),
        empty_innermost_arrays(raw),
    ];
    variants
        .into_iter()
        .map(|text| {
            let mut damaged = event.clone();
            match &mut damaged {
                AgentEvent::StreamEvent { event, .. } => event.0 = text,
                AgentEvent::Assistant { message, .. } | AgentEvent::User { message, .. } => {
                    message.0 = text;
                }
                AgentEvent::ControlRequest { request, .. } => request.0 = text,
                _ => {}
            }
            PresenterInput::Event(damaged)
        })
        .collect()
}

/// Kotlin's `replace(Regex("\"[a-z_]+\":\"[^\"]*\""), "\"x\":1")`.
fn strings_to_numbers(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = String::with_capacity(raw.len());
    let mut copied = 0;
    let mut at = 0;
    while at < bytes.len() {
        if let Some(end) = string_member_at(bytes, at) {
            out.push_str(&raw[copied..at]);
            out.push_str("\"x\":1");
            copied = end;
            at = end;
        } else {
            at += 1;
        }
    }
    out.push_str(&raw[copied..]);
    out
}

// The end of `"name":"value"` starting at `at`, when one does.
fn string_member_at(bytes: &[u8], at: usize) -> Option<usize> {
    let mut i = at;
    (bytes.get(i) == Some(&b'"')).then_some(())?;
    i += 1;
    let name = i;
    while bytes
        .get(i)
        .is_some_and(|b| b.is_ascii_lowercase() || *b == b'_')
    {
        i += 1;
    }
    (i > name && bytes.get(i..i + 3) == Some(b"\":\"")).then_some(())?;
    i += 3;
    while bytes.get(i).is_some_and(|b| *b != b'"') {
        i += 1;
    }
    (bytes.get(i) == Some(&b'"')).then_some(i + 1)
}

/// Kotlin's `replace(Regex("\\[[^\\[\\]]*]"), "[]")`.
fn empty_innermost_arrays(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = String::with_capacity(raw.len());
    let mut copied = 0;
    let mut at = 0;
    while at < bytes.len() {
        let close = (bytes[at] == b'[')
            .then(|| {
                bytes[at + 1..]
                    .iter()
                    .position(|b| *b == b'[' || *b == b']')
            })
            .flatten()
            .map(|offset| at + 1 + offset)
            .filter(|end| bytes[*end] == b']');
        if let Some(end) = close {
            out.push_str(&raw[copied..at]);
            out.push_str("[]");
            copied = end + 1;
            at = end + 1;
        } else {
            at += 1;
        }
    }
    out.push_str(&raw[copied..]);
    out
}

#[test]
fn the_damage_is_what_the_kotlin_regexes_do() {
    assert_eq!(
        r#"{"x":1,"B":"c","x":1,"n":2}"#,
        strings_to_numbers(r#"{"type":"text","B":"c","a_b":"","n":2}"#)
    );
    assert_eq!(
        r#"{"a":[[],[]],"b":[]}"#,
        empty_innermost_arrays(r#"{"a":[[1,2],[3]],"b":["x"]}"#)
    );
}

#[test]
fn the_fold_never_panics_on_damaged_lines_from_the_captures() {
    for scenario in scenarios() {
        let mut view = SessionView::default();
        for input in inputs(&scenario, false) {
            for damaged in damage(&input) {
                let _ = view.clone().fold(&damaged);
            }
            view = view.fold(&input);
        }
    }
}

/// `foldBackground` (RunningTasks.kt): the running list itself is not part of this port, so what
/// is held here is what the fold keeps — the CLI's last list whole, each task's last progress, and
/// the call each task started from.
#[test]
fn background_lines_keep_the_last_list_the_last_progress_and_the_starting_call() {
    let changed = |tasks: &str| {
        closta_providers::claude::protocol::decode(&format!(
            r#"{{"type":"system","subtype":"background_tasks_changed","tasks":{tasks},"uuid":"u","session_id":"s"}}"#
        ))
    };
    let progress = |tool: &str, ms: i64| {
        closta_providers::claude::protocol::decode(&format!(
            r#"{{"type":"system","subtype":"task_progress","task_id":"a","tool_use_id":"toolu_a","description":"Running","subagent_type":"general-purpose","usage":{{"total_tokens":1,"tool_uses":1,"duration_ms":{ms}}},"last_tool_name":"{tool}","uuid":"u","session_id":"s"}}"#
        ))
    };
    let view = events(
        &SessionView::default(),
        [
            changed(
                r#"[{"task_id":"a","task_type":"local_agent","description":"d-a"},{"task_id":"w","ambient":true,"parent_task_id":"a","subagent_type":"x"},{"description":"no id"},7]"#,
            ),
            progress("Read", 1_000),
            progress("Bash", 2_500),
            lines::task_started("a", "toolu_a", true),
        ],
    );
    let background = &view.transcript.background;
    let live: Vec<_> = background
        .live
        .iter()
        .map(|it| {
            (
                it.task_id.as_str(),
                it.task_type.as_str(),
                it.description.as_str(),
                it.parent_task_id.as_deref(),
                it.subagent_type.as_deref(),
                it.ambient,
            )
        })
        .collect();
    assert_eq!(
        vec![
            ("a", "local_agent", "d-a", None, None, false),
            ("w", "", "", Some("a"), Some("x"), true)
        ],
        live
    );
    let last = background.progress.get("a").expect("progress of a");
    assert_eq!("Bash", last.last_tool_name);
    assert_eq!(Some(2_500), last.duration_ms);
    assert_eq!(Some("toolu_a"), last.tool_use_id.as_deref());
    assert_eq!(
        Some("toolu_a"),
        background.tool_use_ids.get("a").map(String::as_str)
    );
    let emptied = with(&view, changed("[]"));
    assert!(emptied.transcript.background.live.is_empty());
    assert_unchanged(
        &emptied,
        &with(&emptied, changed(r#"{"not":"a list"}"#)),
        "a list that cannot be read",
    );
}

/// `callInput` (TranscriptPaths.kt): the finished input of a call, wherever the call is.
#[test]
fn the_finished_input_of_a_call_is_found_wherever_the_call_is() {
    let view = events(
        &SessionView::default(),
        [
            lines::assistant("m1", &lines::tool_use("agent", "Agent", r#"{"p":1}"#), None),
            lines::assistant(
                "m2",
                &lines::tool_use("bash", "Bash", r#"{"command":"ls"}"#),
                Some("agent"),
            ),
            lines::message_start("m3"),
            lines::block_start(0, &lines::tool_use("42", "Read", "{}")),
        ],
    );
    let input = |id: &str| call_input(&view.transcript, id).map(|it| it.as_ref().clone());
    assert_eq!(Some(serde_json::json!({ "p": 1 })), input("agent"));
    assert_eq!(Some(serde_json::json!({ "command": "ls" })), input("bash"));
    assert_eq!(None, input("42"), "still streaming: no input yet");
    assert_eq!(None, input("nobody"));
}

const MANUAL_COMPACTION: &str = r#"{"trigger":"manual","pre_tokens":20072,"post_tokens":1235}"#;

fn asked(view: &SessionView, id: &str, text: &str) -> SessionView {
    view.clone().fold(&PresenterInput::UserSent(UserSent {
        message_id: SendId::new(id).unwrap_or_else(|| panic!("{id} is not a key")),
        text: text.to_owned(),
        attachments: Vec::new(),
        uuid: None,
    }))
}

#[test]
fn a_compaction_mark_remembers_the_last_message() {
    let view = asked(&started(), "u1", "/compact");
    let view = with(&view, lines::compact_boundary(MANUAL_COMPACTION));
    assert_eq!(
        vec![CompactionMark {
            after: Some("u1".to_owned()),
            outcome: CompactionOutcome::Compacted {
                trigger: "manual".to_owned(),
                pre_tokens: 20072,
                post_tokens: 1235,
            },
        }],
        view.transcript
            .compaction_marks
            .iter()
            .cloned()
            .collect::<Vec<_>>()
    );
}

#[test]
fn a_failed_compaction_is_a_mark_of_its_own() {
    let view = asked(&started(), "u1", "/compact");
    let succeeded = with(&view, lines::compact_result("success"));
    assert!(succeeded.transcript.compaction_marks.is_empty());
    let failed = with(&succeeded, lines::compact_result("error"));
    assert_eq!(
        vec![CompactionMark {
            after: Some("u1".to_owned()),
            outcome: CompactionOutcome::Failed,
        }],
        failed
            .transcript
            .compaction_marks
            .iter()
            .cloned()
            .collect::<Vec<_>>()
    );
}

#[test]
fn a_boundary_without_tokens_leaves_no_mark() {
    let view = asked(&started(), "u1", "/compact");
    let view = with(&view, lines::compact_boundary(r#"{"trigger":"auto"}"#));
    assert!(view.transcript.compaction_marks.is_empty());
}

#[test]
fn more_than_twenty_compactions_keep_every_mark() {
    let view = (0..21).fold(asked(&started(), "u1", "/compact"), |view, _| {
        with(&view, lines::compact_boundary(MANUAL_COMPACTION))
    });
    assert_eq!(21, view.transcript.compaction_marks.len());
    assert_eq!(20, view.transcript.operations.compactions.len());
}

fn send_failed(view: &SessionView, id: &str) -> SessionView {
    view.clone().fold(&PresenterInput::SendFailed(
        SendId::new(id).unwrap_or_else(|| panic!("{id} is not a key")),
    ))
}

fn not_sent(view: &SessionView) -> Vec<String> {
    let mut keys: Vec<String> = view.transcript.not_sent.iter().cloned().collect();
    keys.sort();
    keys
}

#[test]
fn a_failed_send_marks_its_message_and_takes_back_the_send() {
    let sent = asked(&SessionView::default(), "s1", "hello");
    assert_eq!(1, sent.transcript.routing.sends);

    let failed = send_failed(&sent, "s1");

    assert_eq!(vec!["s1"], not_sent(&failed));
    assert_eq!(0, failed.transcript.routing.sends);
    let (before, after) = (message(&sent, "s1"), message(&failed, "s1"));
    assert!(
        !Arc::ptr_eq(before, after),
        "a new Arc, so its row is made again"
    );
    assert_eq!(**before, **after);
}

#[test]
fn a_second_failure_of_the_same_send_changes_nothing() {
    let failed = send_failed(&asked(&SessionView::default(), "s1", "hello"), "s1");
    let again = send_failed(&failed, "s1");
    assert_unchanged(&failed, &again, "a second failure");
    assert_eq!(0, again.transcript.routing.sends);
}

#[test]
fn a_failure_of_an_unknown_send_changes_nothing() {
    let sent = asked(&SessionView::default(), "s1", "hello");
    let after = send_failed(&sent, "nobody");
    assert_unchanged(&sent, &after, "an unknown send");
    assert_eq!(1, after.transcript.routing.sends);
}

#[test]
fn a_failure_finds_the_message_under_its_claimed_key() {
    let first = asked(&SessionView::default(), "s1", "one");
    let second = asked(&first, "s1", "two");
    assert_eq!(vec!["s1", "s1~2"], order(&second.transcript.messages));

    let failed = send_failed(&second, "s1");

    assert_eq!(vec!["s1~2"], not_sent(&failed));
    assert_eq!(1, failed.transcript.routing.sends);
    assert!(Arc::ptr_eq(message(&second, "s1"), message(&failed, "s1")));
}
