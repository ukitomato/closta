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

/// A turn is mixed in per this many turns of the shape.
const INTERVAL: usize = 200;
/// The `/clear`: the user's line, queued, started, the reset, the new init, completed.
const CLEAR_STEPS: usize = 1 + 2 + 1 + 1 + 1;
/// The compaction: the user's line, queued, started, `compacting`, the boundary, the status that
/// ends it, the result, completed.
const COMPACT_STEPS: usize = 1 + 2 + 1 + 1 + 1 + 1 + 1;
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
    assert_eq!(2, turns);
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
        (rows.len() / 2..rows.len() * 9 / 10).contains(&at),
        "the clear is row {at} of {}",
        rows.len()
    );
}
