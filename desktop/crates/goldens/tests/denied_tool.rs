//! `system/permission_denied` (captures 44 and 10): the CLI refused a call on its own, and its
//! line says so. Also `system/informational`, which no capture carries: those rows are made by
//! hand and say so in their names (DeniedToolTest.kt).

use std::sync::Arc;

use closta_goldens::replay::inputs;
use closta_model::AgentEvent;
use closta_presenter::input::PresenterInput;
use closta_presenter::keyed::{Keyed, of_cli_id};
use closta_presenter::rows::{NoticeLevel, NoticeRow, ThreadRow, ThreadRows, ToolRow};
use closta_presenter::session::SessionView;
use closta_presenter::tool_line::ToolLineState;
use closta_presenter::transcript::{Denial, MessageRecord, PartRecord, ToolCallRecord, Transcript};

fn inputs_of(scenario: &str) -> Vec<PresenterInput> {
    inputs(scenario, true)
}

fn run(inputs: &[PresenterInput]) -> Arc<Transcript> {
    inputs
        .iter()
        .fold(SessionView::default(), SessionView::fold)
        .transcript
}

/// Every call of `messages`, a sub-agent's under the call that started it.
fn calls(messages: &Keyed<MessageRecord>) -> Vec<ToolCallRecord> {
    messages
        .values()
        .flat_map(|message| {
            message
                .parts
                .values()
                .filter_map(|part| match part.as_ref() {
                    PartRecord::ToolCall(call) => Some(call.clone()),
                    _ => None,
                })
                .collect::<Vec<_>>()
        })
        .flat_map(|call| {
            let nested = calls(&call.messages);
            std::iter::once(call).chain(nested)
        })
        .collect()
}

fn rows(transcript: &Transcript) -> Vec<ThreadRow> {
    ThreadRows::default().of(transcript)
}

fn tool_rows(transcript: &Transcript) -> Vec<Arc<ToolRow>> {
    rows(transcript)
        .into_iter()
        .filter_map(|row| match row {
            ThreadRow::Tool(it) => Some(it),
            _ => None,
        })
        .collect()
}

fn notice_rows(transcript: &Transcript) -> Vec<Arc<NoticeRow>> {
    rows(transcript)
        .into_iter()
        .filter_map(|row| match row {
            ThreadRow::Notice(it) => Some(it),
            _ => None,
        })
        .collect()
}

fn is_denied(input: &PresenterInput) -> bool {
    matches!(
        input,
        PresenterInput::Event(AgentEvent::SystemPermissionDenied { .. })
    )
}

/// The one refusal among `inputs`.
fn denial_of(inputs: &[PresenterInput]) -> AgentEvent {
    let mut found = inputs.iter().filter(|it| is_denied(it));
    let Some(PresenterInput::Event(event)) = found.next() else {
        panic!("no permission_denied");
    };
    assert!(found.next().is_none(), "more than one permission_denied");
    event.clone()
}

fn single<T: Clone>(items: &[T]) -> T {
    assert_eq!(1, items.len(), "expected one");
    items[0].clone()
}

// DeniedToolTest.kt: the Bash call 44 refused is a denied line with the reason type mode.
#[test]
fn capture_44_the_bash_call_refused_is_a_denied_line_with_the_reason_type_mode() {
    let transcript = run(&inputs_of("44-permission-denied"));
    let bash = single(
        &calls(&transcript.messages)
            .into_iter()
            .filter(|it| it.tool_name == "Bash")
            .collect::<Vec<_>>(),
    );
    let line = single(
        &tool_rows(&transcript)
            .into_iter()
            .filter(|it| it.tool_name == "Bash")
            .collect::<Vec<_>>(),
    )
    .line
    .clone();

    assert_eq!(
        Some("mode"),
        bash.denied
            .as_ref()
            .and_then(|it| it.reason_type.as_deref())
    );
    assert_eq!(ToolLineState::Denied, line.state);
    assert_eq!(bash.denied, line.denial);
}

// DeniedToolTest.kt: the refusal is kept when it comes before the line it refuses, and put on the
// line when it is made.
#[test]
fn the_refusal_is_kept_when_it_comes_before_the_line_it_refuses_and_put_on_the_line_when_it_is_made()
 {
    let mut inputs = inputs_of("44-permission-denied");
    let at = inputs
        .iter()
        .position(is_denied)
        .unwrap_or_else(|| panic!("44 has a permission_denied"));
    let denied = inputs.remove(at);
    inputs.insert(0, denied);
    let early = run(&inputs);
    let bash = single(
        &tool_rows(&early)
            .into_iter()
            .filter(|it| it.tool_name == "Bash")
            .collect::<Vec<_>>(),
    );

    assert_eq!(ToolLineState::Denied, bash.line.state);
    assert!(
        early.denials.is_empty(),
        "what was waiting for its line is spent: {:?}",
        early.denials
    );
}

// DeniedToolTest.kt: a sub-agent's refused call in 10 is marked too, and the other calls are not.
#[test]
fn capture_10_a_sub_agents_refused_call_is_marked_too_and_the_other_calls_are_not() {
    let transcript = run(&inputs_of("10-background-task"));
    let all = calls(&transcript.messages);
    let denied: Vec<&ToolCallRecord> = all.iter().filter(|it| it.denied.is_some()).collect();

    assert_eq!(
        vec!["Monitor"],
        denied
            .iter()
            .map(|it| it.tool_name.as_str())
            .collect::<Vec<_>>()
    );
    assert_eq!(
        Some("subcommandResults"),
        denied[0]
            .denied
            .as_ref()
            .and_then(|it| it.reason_type.as_deref())
    );
    assert!(all.len() > denied.len());
}

// DeniedToolTest.kt: a refusal of a call nobody drew leaves the transcript with it waiting and no
// row.
#[test]
fn a_refusal_of_a_call_nobody_drew_leaves_the_transcript_with_it_waiting_and_no_row() {
    let ghost = denied("toolu_ghost", Some("mode"), None);
    let transcript = run(&[PresenterInput::Event(ghost)]);

    assert_eq!(
        Some(&Denial {
            reason_type: Some("mode".to_owned()),
            reason: None,
        }),
        transcript.denials.get(&of_cli_id("toolu_ghost"))
    );
    assert!(rows(&transcript).is_empty());
}

// DeniedToolTest.kt: a refusal said twice marks the call once. The second, the same refusal,
// leaves the very transcript it was given.
#[test]
fn a_refusal_said_twice_marks_the_call_once() {
    let inputs = inputs_of("44-permission-denied");
    let event = denial_of(&inputs);
    let once = inputs
        .iter()
        .fold(SessionView::default(), SessionView::fold);
    let again = once.clone().fold(&PresenterInput::Event(event.clone()));
    let bash = single(
        &calls(&again.transcript.messages)
            .into_iter()
            .filter(|it| it.tool_name == "Bash")
            .collect::<Vec<_>>(),
    );
    let AgentEvent::SystemPermissionDenied {
        decision_reason_type,
        decision_reason,
        ..
    } = event
    else {
        panic!("not a permission_denied");
    };

    assert_eq!(
        Some(Denial {
            reason_type: decision_reason_type,
            reason: decision_reason,
        }),
        bash.denied
    );
    assert!(Arc::ptr_eq(&once.transcript, &again.transcript));
}

// DeniedToolTest.kt: type only - an informational line of level info makes no row.
#[test]
fn type_only_an_informational_line_of_level_info_makes_no_row() {
    // The same line of another level is a row: the line is read and folded.
    let notice = run(&[informational(0, "notice", None, "words")]);
    assert_eq!(1, notice_rows(&notice).len());

    let transcript = run(&[informational(0, "info", None, "words")]);

    assert!(notice_rows(&transcript).is_empty());
}

// DeniedToolTest.kt: type only - the levels notice, suggestion and warning make rows, and an
// unknown level is a notice.
#[test]
fn type_only_the_levels_notice_suggestion_and_warning_make_rows_and_an_unknown_level_is_a_notice() {
    let levels: Vec<NoticeLevel> = ["notice", "suggestion", "warning", "something-new"]
        .into_iter()
        .enumerate()
        .map(|(n, level)| {
            single(&notice_rows(&run(&[informational(
                n, level, None, "words",
            )])))
            .level
        })
        .collect();

    assert_eq!(
        vec![
            NoticeLevel::Notice,
            NoticeLevel::Suggestion,
            NoticeLevel::Warning,
            NoticeLevel::Notice,
        ],
        levels
    );
}

// DeniedToolTest.kt: type only - a warning that prevents continuation says the CLI stopped, others
// do not.
#[test]
fn type_only_a_warning_that_prevents_continuation_says_the_cli_stopped_others_do_not() {
    let stopped = |prevent: Option<bool>| {
        single(&notice_rows(&run(&[informational(
            0, "warning", prevent, "words",
        )])))
        .stopped
    };

    assert!(stopped(Some(true)));
    assert!(!stopped(Some(false)));
    assert!(!stopped(None));
}

// DeniedToolTest.kt: type only - two informational lines are two rows with their words.
#[test]
fn type_only_two_informational_lines_are_two_rows_with_their_words() {
    let rows = notice_rows(&run(&[
        informational(0, "notice", None, "one"),
        informational(1, "warning", None, "two"),
    ]));

    assert_eq!(
        vec!["one", "two"],
        rows.iter()
            .map(|it| it.content.as_str())
            .collect::<Vec<_>>()
    );
    let mut keys: Vec<&str> = rows.iter().map(|it| it.key.as_str()).collect();
    keys.dedup();
    assert_eq!(2, keys.len());
}

fn denied(tool_use_id: &str, reason_type: Option<&str>, reason: Option<&str>) -> AgentEvent {
    AgentEvent::SystemPermissionDenied {
        uuid: format!("u-{tool_use_id}"),
        session_id: "s".to_owned(),
        tool_name: "Bash".to_owned(),
        tool_use_id: tool_use_id.to_owned(),
        agent_id: None,
        decision_reason_type: reason_type.map(str::to_owned),
        decision_reason: reason.map(str::to_owned),
        message: "denied".to_owned(),
    }
}

fn informational(n: usize, level: &str, prevent: Option<bool>, content: &str) -> PresenterInput {
    PresenterInput::Event(AgentEvent::SystemInformational {
        uuid: format!("info-{n}"),
        session_id: "s".to_owned(),
        content: content.to_owned(),
        level: level.to_owned(),
        tool_use_id: None,
        prevent_continuation: prevent,
        tag: None,
    })
}
