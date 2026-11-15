//! The rule for refusing a rewind of the files, alone: what the host calls before it writes
//! (RewindRefusalTest.kt).

use std::sync::Arc;

use closta_model::{ConversationState, Turn, TurnPhase};
use closta_presenter::records::operations::OperationRecords;
use closta_presenter::records::rewind::{RewindOutcome, RewindRecord};
use closta_presenter::rewind_refusal::{
    REWIND_CHECK_FIRST, REWIND_TURN_RUNNING, REWIND_UNKNOWN_MESSAGE, rewind_refusal, turns_so_far,
};
use closta_presenter::transcript::{Routing, Transcript};

fn transcript_with(rewind: Option<RewindRecord>, sends: i32, known: &[(&str, &str)]) -> Transcript {
    Transcript {
        routing: Routing {
            sends,
            ..Routing::default()
        },
        operations: Arc::new(OperationRecords {
            rewind,
            ..OperationRecords::default()
        }),
        user_uuids: known
            .iter()
            .map(|(key, uuid)| ((*key).to_owned(), (*uuid).to_owned()))
            .collect(),
        ..Transcript::default()
    }
}

fn transcript(rewind: Option<RewindRecord>) -> Transcript {
    transcript_with(rewind, 1, &[("send-1", "uuid-1")])
}

#[derive(Clone)]
struct Checked {
    sends_at: i32,
    turns_at: i32,
    dry_run: bool,
    outcome: RewindOutcome,
    message_id: &'static str,
}

impl Default for Checked {
    fn default() -> Self {
        Self {
            sends_at: 1,
            turns_at: 0,
            dry_run: true,
            outcome: RewindOutcome::Done,
            message_id: "send-1",
        }
    }
}

impl Checked {
    fn record(&self) -> Option<RewindRecord> {
        Some(RewindRecord {
            request_id: Some("r".into()),
            command_id: "c".into(),
            message_id: self.message_id.into(),
            dry_run: self.dry_run,
            sends_at: self.sends_at,
            turns_at: self.turns_at,
            outcome: self.outcome,
            ..RewindRecord::default()
        })
    }
}

fn checked() -> Option<RewindRecord> {
    Checked::default().record()
}

#[test]
fn a_message_with_no_uuid_is_refused_whatever_else_is_true() {
    assert_eq!(
        Some(REWIND_UNKNOWN_MESSAGE),
        rewind_refusal(&transcript(None), 0, "send-7", true, false)
    );
    assert_eq!(
        Some(REWIND_UNKNOWN_MESSAGE),
        rewind_refusal(&transcript(None), 0, "send-7", true, true)
    );
}

#[test]
fn a_running_turn_refuses_both_the_dry_run_and_the_real_one() {
    assert_eq!(
        Some(REWIND_TURN_RUNNING),
        rewind_refusal(&transcript(checked()), 0, "send-1", true, true)
    );
    assert_eq!(
        Some(REWIND_TURN_RUNNING),
        rewind_refusal(&transcript(checked()), 0, "send-1", false, true)
    );
}

#[test]
fn a_dry_run_is_allowed_with_nothing_before_it() {
    assert_eq!(
        None,
        rewind_refusal(&transcript(None), 0, "send-1", true, false)
    );
}

#[test]
fn a_real_rewind_is_allowed_only_after_a_dry_run_of_the_same_message_that_was_done_with_no_send_since()
 {
    assert_eq!(
        None,
        rewind_refusal(&transcript(checked()), 0, "send-1", false, false)
    );
    assert_eq!(
        Some(REWIND_CHECK_FIRST),
        rewind_refusal(&transcript(None), 0, "send-1", false, false),
        "no dry run"
    );
    for outcome in [RewindOutcome::Pending, RewindOutcome::Refused] {
        let record = Checked {
            outcome,
            ..Checked::default()
        }
        .record();
        assert_eq!(
            Some(REWIND_CHECK_FIRST),
            rewind_refusal(&transcript(record), 0, "send-1", false, false),
            "{outcome:?}"
        );
    }
    let real = Checked {
        dry_run: false,
        ..Checked::default()
    }
    .record();
    assert_eq!(
        Some(REWIND_CHECK_FIRST),
        rewind_refusal(&transcript(real), 0, "send-1", false, false),
        "the last one was a real rewind"
    );
    let other = Checked {
        message_id: "send-2",
        ..Checked::default()
    }
    .record();
    assert_eq!(
        Some(REWIND_CHECK_FIRST),
        rewind_refusal(
            &transcript_with(other, 1, &[("send-1", "u1"), ("send-2", "u2")]),
            0,
            "send-1",
            false,
            false
        ),
        "a dry run of another message"
    );
}

#[test]
fn a_message_sent_after_the_dry_run_makes_the_real_rewind_refused_and_the_dry_run_again_is_allowed()
{
    let later = transcript_with(checked(), 2, &[("send-1", "uuid-1")]);
    assert_eq!(
        Some(REWIND_CHECK_FIRST),
        rewind_refusal(&later, 0, "send-1", false, false)
    );
    assert_eq!(None, rewind_refusal(&later, 0, "send-1", true, false));
}

#[test]
fn a_real_rewind_is_allowed_when_the_turns_are_the_same_as_at_the_dry_run_and_refused_when_there_are_more()
 {
    let at_three = || {
        transcript(
            Checked {
                turns_at: 3,
                ..Checked::default()
            }
            .record(),
        )
    };
    assert_eq!(None, rewind_refusal(&at_three(), 3, "send-1", false, false));
    assert_eq!(
        Some(REWIND_CHECK_FIRST),
        rewind_refusal(&at_three(), 4, "send-1", false, false),
        "a turn since, whoever began it"
    );
    assert_eq!(
        None,
        rewind_refusal(&at_three(), 4, "send-1", true, false),
        "a dry run again"
    );
}

#[test]
fn turns_so_far_is_the_turns_and_the_turns_the_cli_began_on_its_own() {
    let turn = Turn {
        command_uuid: "u1".into(),
        phase: TurnPhase::Closed,
        incomplete_reason: None,
        lifecycle_done: false,
    };
    assert_eq!(0, turns_so_far(&ConversationState::default()));
    assert_eq!(
        2,
        turns_so_far(&ConversationState {
            turns: imbl::vector![turn.clone(), turn.clone()],
            ..ConversationState::default()
        })
    );
    assert_eq!(
        3,
        turns_so_far(&ConversationState {
            turns: imbl::vector![turn.clone(), turn],
            spontaneous_resume_count: 1,
            ..ConversationState::default()
        })
    );
    assert_eq!(
        1,
        turns_so_far(&ConversationState {
            spontaneous_resume_count: 1,
            ..ConversationState::default()
        })
    );
}
