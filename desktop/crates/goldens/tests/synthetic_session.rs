//! The synthetic session folds to the shape it says (SyntheticSessionTest.kt): counted on the
//! transcript `SessionView` folds from it, so a line the codec cannot read or a call that lands
//! outside its sub-agent shows here.

use std::sync::Arc;

use closta_goldens::synthetic::{self, LARGEST, SyntheticTurn};
use closta_presenter::input::{PresenterInput, SendId, UserSent};
use closta_presenter::session::SessionView;
use closta_presenter::text::utf16_len;
use closta_presenter::transcript::{MessageRecord, PartRecord, Role, TextRecord, ToolCallRecord};
use closta_providers::claude::protocol::decode;

const SLACK: usize = 10_000;

fn folded(turns: &[SyntheticTurn]) -> SessionView {
    turns
        .iter()
        .enumerate()
        .fold(SessionView::default(), |view, (index, turn)| {
            let sent = PresenterInput::UserSent(UserSent {
                message_id: SendId::new(&format!("u{index}"))
                    .unwrap_or_else(|| panic!("u{index} is not a key")),
                text: turn.prompt.clone(),
                attachments: Vec::new(),
                uuid: None,
            });
            turn.lines.iter().fold(view.fold(&sent), |next, line| {
                next.fold(&PresenterInput::Event(decode(line)))
            })
        })
}

/// Every tool call in `messages`, the sub-agents' calls included.
fn calls<'a>(messages: impl Iterator<Item = &'a Arc<MessageRecord>>) -> Vec<&'a ToolCallRecord> {
    let mut found = Vec::new();
    for message in messages {
        for part in message.parts.values() {
            if let PartRecord::ToolCall(call) = part.as_ref() {
                found.push(call);
                found.extend(calls(call.messages.values()));
            }
        }
    }
    found
}

/// Every text in `messages`, the sub-agents' texts included.
fn texts<'a>(messages: impl Iterator<Item = &'a Arc<MessageRecord>>) -> Vec<&'a TextRecord> {
    let mut found = Vec::new();
    for message in messages {
        for part in message.parts.values() {
            match part.as_ref() {
                PartRecord::Text(text) => found.push(text),
                PartRecord::ToolCall(call) => found.extend(texts(call.messages.values())),
                _ => {}
            }
        }
    }
    found
}

#[test]
fn largest_has_the_shape_it_says() {
    let shape = LARGEST;
    let view = folded(&synthetic::session(&shape, 1));
    let messages = &view.transcript.messages;

    assert_eq!(
        shape.turns,
        messages.values().filter(|it| it.role == Role::User).count()
    );
    let calls = calls(messages.values());
    assert_eq!(
        shape.tools,
        calls.len(),
        "every tool call, nested ones included"
    );
    let tasks: Vec<_> = calls.iter().filter(|it| it.tool_name == "Task").collect();
    assert_eq!(shape.subagents, tasks.len());
    assert!(
        tasks.iter().all(|it| !it.messages.is_empty()),
        "each sub-agent has its conversation"
    );
    assert_eq!(
        shape.skills,
        calls.iter().filter(|it| it.tool_name == "Skill").count()
    );
    assert_eq!(
        shape.mcp,
        calls
            .iter()
            .filter(|it| it.tool_name.starts_with("mcp__"))
            .count()
    );
    assert!(
        calls.iter().all(|it| it.result.is_some()),
        "every call has its result"
    );
    let replies: Vec<usize> = texts(messages.values().filter(|it| it.role == Role::Assistant))
        .iter()
        .map(|it| utf16_len(&it.text))
        .collect();
    let total: usize = replies.iter().sum();
    assert!(
        (shape.total_text - SLACK..=shape.total_text + SLACK).contains(&total),
        "total {total}"
    );
    let longest = replies.iter().copied().max().unwrap_or(0);
    assert!(longest >= shape.longest_text, "longest {longest}");
}

#[test]
fn the_same_seed_gives_the_same_session() {
    assert_eq!(
        synthetic::session(&LARGEST, 7),
        synthetic::session(&LARGEST, 7)
    );
}

/// A turn is mixed in per this many turns of the shape: half of [`LARGEST`]'s, so one comes
/// before its `/clear`.
const INTERVAL: usize = 100;
/// The `/clear`: the user's line, queued, started, the reset, the new init, completed.
const CLEAR_STEPS: usize = 1 + 2 + 1 + 1 + 1;
/// The compaction, as capture 21 lines 16 to 22, 24 and 25: the user's line, queued, started,
/// `compacting`, the status that ends it, the init, the boundary, the summary's user line, the
/// result, completed.
const COMPACT_STEPS: usize = 1 + 2 + 1 + 1 + 1 + 1 + 1 + 1 + 1;
/// The tasks: the user's line, queued, started, three creates and two updates with their answers,
/// the result, completed.
const TASKS_STEPS: usize = 1 + 2 + (3 + 2) * 2 + 1 + 1;

fn fold_all(steps: &[PresenterInput]) -> SessionView {
    steps
        .iter()
        .fold(SessionView::default(), |view, step| view.fold(step))
}

#[test]
fn the_session_lines_are_mixed_in_at_their_interval() {
    use closta_presenter::rows::{Divider, ThreadRow, ThreadRows};

    let plain = synthetic::steps(&LARGEST);
    let mixed = synthetic::steps_with_session_lines(&LARGEST);
    let rows = ThreadRows::default().of(&fold_all(&mixed).transcript);
    let plain_rows = ThreadRows::default().of(&fold_all(&plain).transcript);

    let cleared = rows
        .iter()
        .filter(|row| {
            matches!(row, ThreadRow::Divider(it) if matches!(it.divider, Divider::Cleared { .. }))
        })
        .count();
    let compacted = rows
        .iter()
        .filter(|row| {
            matches!(row, ThreadRow::Divider(it) if matches!(it.divider, Divider::Compacted { .. }))
        })
        .count();
    let todos = rows
        .iter()
        .filter(|row| matches!(row, ThreadRow::Todo(_)))
        .count();
    let turns = LARGEST.turns / INTERVAL;
    assert!(
        !plain_rows
            .iter()
            .any(|row| matches!(row, ThreadRow::Divider(_) | ThreadRow::Todo(_))),
        "the plain session has none of these rows"
    );
    assert_eq!(1, cleared, "one clear in the whole conversation");
    assert_eq!(turns, compacted);
    assert_eq!(turns, todos);
    assert_eq!(
        plain.len() + CLEAR_STEPS + turns * (COMPACT_STEPS + TASKS_STEPS),
        mixed.len()
    );
}

#[test]
fn a_longer_session_gets_a_compaction_and_a_task_list_per_interval_but_one_clear() {
    use closta_presenter::rows::{Divider, ThreadRow, ThreadRows};

    let rows = ThreadRows::default()
        .of(&fold_all(&synthetic::steps_with_session_lines(&synthetic::DOUBLED)).transcript);
    let count = |wanted: fn(&ThreadRow) -> bool| rows.iter().filter(|row| wanted(row)).count();
    let turns = synthetic::DOUBLED.turns / INTERVAL;
    assert_eq!(4, turns);
    assert_eq!(
        1,
        count(
            |row| matches!(row, ThreadRow::Divider(it) if matches!(it.divider, Divider::Cleared { .. }))
        )
    );
    assert_eq!(
        turns,
        count(
            |row| matches!(row, ThreadRow::Divider(it) if matches!(it.divider, Divider::Compacted { .. }))
        )
    );
    assert_eq!(turns, count(|row| matches!(row, ThreadRow::Todo(_))));
}

#[test]
fn the_clear_comes_three_quarters_of_the_way_so_most_rows_stay_in_the_measured_conversation() {
    use closta_presenter::rows::{Divider, ThreadRow, ThreadRows};

    let rows = ThreadRows::default()
        .of(&fold_all(&synthetic::steps_with_session_lines(&LARGEST)).transcript);
    let at = rows
        .iter()
        .position(|row| matches!(row, ThreadRow::Divider(it) if matches!(it.divider, Divider::Cleared { .. })))
        .unwrap_or_else(|| panic!("no clear"));
    assert!(
        (rows.len() * 2 / 3..rows.len() * 5 / 6).contains(&at),
        "the clear is row {at} of {}",
        rows.len()
    );
}

fn is_cleared(row: &closta_presenter::rows::ThreadRow) -> bool {
    use closta_presenter::rows::{Divider, ThreadRow};
    matches!(row, ThreadRow::Divider(it) if matches!(it.divider, Divider::Cleared { .. }))
}

/// Task 8's review: in [`LARGEST`] a compaction and a task list come before the `/clear` too, so
/// the measured conversation holds them, not only the rows after the divider.
#[test]
fn the_largest_session_compacts_and_keeps_tasks_before_its_clear_too() {
    use closta_presenter::rows::{Divider, ThreadRow, ThreadRows};

    let rows = ThreadRows::default()
        .of(&fold_all(&synthetic::steps_with_session_lines(&LARGEST)).transcript);
    let clear = rows
        .iter()
        .position(is_cleared)
        .unwrap_or_else(|| panic!("no clear"));
    let before = &rows[..clear];
    let after = &rows[clear..];
    let compacted = |rows: &[ThreadRow]| {
        rows.iter()
            .filter(|row| matches!(row, ThreadRow::Divider(it) if matches!(it.divider, Divider::Compacted { .. })))
            .count()
    };
    let todos = |rows: &[ThreadRow]| {
        rows.iter()
            .filter(|row| matches!(row, ThreadRow::Todo(_)))
            .count()
    };

    assert_eq!(1, compacted(before));
    assert_eq!(1, todos(before));
    assert_eq!(1, compacted(after));
    assert_eq!(1, todos(after));
}

/// The kind of `input`, as its `Debug` names it.
fn kind(input: &PresenterInput) -> String {
    let debug = format!("{input:?}");
    let event = debug.strip_prefix("Event(").unwrap_or(&debug);
    event
        .split(|it: char| !it.is_alphanumeric())
        .next()
        .unwrap_or_default()
        .to_owned()
}

/// Task 8's review: a compaction's lines come in capture 21's order (lines 16 to 22, 24 and 25:
/// queued, started, `compacting`, the status that ends it, the init, the boundary, the summary's
/// user line, the result, completed).
#[test]
fn a_compaction_comes_in_capture_21s_order() {
    use closta_model::AgentEvent;

    let steps = synthetic::steps_with_session_lines(&LARGEST);
    let at = steps
        .iter()
        .position(|step| matches!(step, PresenterInput::UserSent(it) if it.text == "/compact"))
        .unwrap_or_else(|| panic!("no compaction"));
    let turn = &steps[at + 1..at + COMPACT_STEPS];

    assert_eq!(
        vec![
            "CommandLifecycle",
            "CommandLifecycle",
            "SystemStatus",
            "SystemStatus",
            "SystemInit",
            "SystemCompactBoundary",
            "User",
            "Result",
            "CommandLifecycle",
        ],
        turn.iter().map(kind).collect::<Vec<_>>()
    );
    let statuses: Vec<Option<&str>> = turn
        .iter()
        .filter_map(|step| match step {
            PresenterInput::Event(AgentEvent::SystemStatus { status, .. }) => {
                Some(status.as_deref())
            }
            _ => None,
        })
        .collect();
    assert_eq!(vec![Some("compacting"), None], statuses);
}

/// The session id `input`'s line says, as its `Debug` shows it; `None` for one that says none.
fn session_of(input: &PresenterInput) -> Option<String> {
    let debug = format!("{input:?}");
    let (_, rest) = debug.split_once("session_id: \"")?;
    rest.split_once('"').map(|(id, _)| id.to_owned())
}

/// Task 8's review: the lines after the `/clear`'s reset say the new session's id, as the CLI's
/// do in capture 41 (lines 20 on), and the lines before it the first one's.
#[test]
fn the_lines_after_the_clear_say_the_new_session() {
    use closta_model::AgentEvent;

    let steps = synthetic::steps_with_session_lines(&LARGEST);
    let reset = steps
        .iter()
        .position(|step| {
            matches!(
                step,
                PresenterInput::Event(AgentEvent::ConversationReset { .. })
            )
        })
        .unwrap_or_else(|| panic!("no reset"));
    let said = |steps: &[PresenterInput]| {
        let mut ids: Vec<String> = steps.iter().filter_map(session_of).collect();
        ids.sort();
        ids.dedup();
        ids
    };

    assert_eq!(vec!["synthetic".to_owned()], said(&steps[..=reset]));
    assert_eq!(
        vec!["synthetic-cleared".to_owned()],
        said(&steps[reset + 1..])
    );
}
