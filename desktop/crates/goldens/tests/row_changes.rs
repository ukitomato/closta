//! The changes a surface is handed after each update, checked over every capture: applied to the
//! rows it had, they give the rows there are now, and no row whose content changed is left out.

use std::collections::HashMap;
use std::ops::Range;

use closta_goldens::lines::{self, ResultLine};
use closta_goldens::replay::{self, replay};
use closta_goldens::synthetic::stream_script::StreamScript;
use closta_model::AgentEvent;
use closta_presenter::input::{PresenterInput, SendId, UserSent};
use closta_presenter::rows::{ThreadRow, ThreadRows};
use closta_presenter::session::SessionView;
use closta_providers::claude::protocol::decode;
use closta_shell::rows::{RowChange, row_changes};

const SESSION: &str = "s";
const NOT_LOGGED_IN: &str = "Not logged in · Please run /login";

fn keys(rows: &[ThreadRow]) -> Vec<String> {
    rows.iter().map(|row| row.key().to_owned()).collect()
}

/// The keys `before` turns into under `changes`, the new rows' keys read from `after`.
fn applied(before: &[ThreadRow], after: &[ThreadRow], changes: &[RowChange]) -> Vec<String> {
    let mut out = keys(before);
    for change in changes {
        if let RowChange::Splice { range, count } = change {
            let new = keys(&after[range.start..range.start + count]);
            out.splice(range.clone(), new);
        }
    }
    out
}

/// The indices of `after` the changes say to draw again: the splice's new rows and the
/// remeasured ones.
fn covered(changes: &[RowChange]) -> Vec<Range<usize>> {
    changes
        .iter()
        .map(|change| match change {
            RowChange::Splice { range, count } => range.start..range.start + count,
            RowChange::Remeasure(range) => range.clone(),
        })
        .collect()
}

/// What is wrong with `changes` from `before` to `after`, if anything.
fn check(before: &[ThreadRow], after: &[ThreadRow], changes: &[RowChange]) -> Option<String> {
    if changes
        .iter()
        .filter(|it| matches!(it, RowChange::Splice { .. }))
        .count()
        > 1
    {
        return Some(format!("more than one splice: {changes:?}"));
    }
    let keys_now = applied(before, after, changes);
    if keys_now != keys(after) {
        return Some(format!(
            "the changes give {keys_now:?}, not {:?}",
            keys(after)
        ));
    }
    let ranges = covered(changes);
    let old: HashMap<&str, &ThreadRow> = before.iter().map(|row| (row.key(), row)).collect();
    let missed: Vec<usize> = (0..after.len())
        .filter(|at| {
            let row = &after[*at];
            let changed = !old
                .get(row.key())
                .is_some_and(|old| old.same(row) || *old == row);
            changed && !ranges.iter().any(|range| range.contains(at))
        })
        .collect();
    (!missed.is_empty())
        .then(|| format!("rows changed but not drawn again: {missed:?} in {changes:?}"))
}

#[test]
fn applying_the_changes_turns_the_old_keys_into_the_new_for_every_capture() {
    let mut failures = Vec::new();
    for scenario in replay::scenarios() {
        let mut rows = ThreadRows::default();
        let mut view = SessionView::default();
        let mut before = rows.of(&view.transcript);
        for (step, input) in replay::inputs(&scenario, false).iter().enumerate() {
            view = std::mem::take(&mut view).fold(input);
            let after = rows.of(&view.transcript);
            let changes = row_changes(&before, &after);
            if let Some(failure) = check(&before, &after, &changes) {
                failures.push(format!("{scenario} step {step}: {failure}"));
            }
            before = after;
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn an_answered_card_is_remeasured_in_place() {
    let steps = replay("05-permission-can-use-tool");
    let answer = steps
        .iter()
        .position(|step| matches!(step.input, PresenterInput::Decided(_)))
        .unwrap_or_else(|| panic!("no answer"));
    let mut rows = ThreadRows::default();
    let before = rows.of(&steps[answer - 1].view.transcript);
    let after = rows.of(&steps[answer].view.transcript);
    let card = after
        .iter()
        .position(|row| matches!(row, ThreadRow::Card(card) if card.card.answered().is_some()))
        .unwrap_or_else(|| panic!("no answered card"));

    let changes = row_changes(&before, &after);
    assert!(
        !changes
            .iter()
            .any(|it| matches!(it, RowChange::Splice { .. })),
        "{changes:?}"
    );
    assert!(
        changes
            .iter()
            .any(|it| matches!(it, RowChange::Remeasure(range) if range.contains(&card))),
        "{changes:?}"
    );
}

fn sent(id: &str, text: &str, uuid: &str) -> PresenterInput {
    PresenterInput::UserSent(UserSent {
        message_id: SendId::new(id).unwrap_or_else(|| panic!("{id} is not a key")),
        text: text.to_owned(),
        attachments: Vec::new(),
        uuid: Some(uuid.to_owned()),
    })
}

/// The lines 2.1.319 writes for send `command` when logged out, as `thread_rows.rs` builds them.
fn signed_out(command: &str, from: SessionView) -> SessionView {
    let mut lifecycle = StreamScript::new(SESSION);
    lifecycle.lifecycle(command, "queued");
    lifecycle.lifecycle(command, "started");
    let reply = decode(&format!(
        concat!(
            r#"{{"type":"assistant","message":{{"id":"m-{command}","model":"<synthetic>","role":"assistant","#,
            r#""type":"message","content":[{{"type":"text","text":{text}}}]}},"#,
            r#""parent_tool_use_id":null,"session_id":"s","uuid":"a-{command}","timestamp":"t","#,
            r#""user_message_uuid":"{command}","error":"authentication_failed","is_api_error_message":true}}"#
        ),
        command = command,
        text = lines::quote(NOT_LOGGED_IN),
    ));
    let result = ResultLine {
        command: Some(command),
        is_error: true,
        text: NOT_LOGGED_IN,
        ..ResultLine::default()
    }
    .event();
    let mut cancelled = StreamScript::new(SESSION);
    cancelled.lifecycle(command, "cancelled");
    let view = from.fold(&sent(&format!("u-{command}"), "hi", command));
    let mut all: Vec<AgentEvent> = lifecycle.lines().iter().map(|it| decode(it)).collect();
    all.push(reply);
    all.push(result);
    all.extend(cancelled.lines().iter().map(|it| decode(it)));
    all.into_iter()
        .fold(view, |view, event| view.fold(&PresenterInput::Event(event)))
}

#[test]
fn the_sign_in_row_does_not_change_when_nothing_else_does() {
    let view = signed_out("c1", SessionView::default());
    let mut rows = ThreadRows::default();
    let before = rows.of(&view.transcript);
    let after = rows.of(&view.transcript);
    assert!(before.iter().any(|row| matches!(row, ThreadRow::SignIn(_))));
    assert_eq!(row_changes(&before, &after), []);
}
