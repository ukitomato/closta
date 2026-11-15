//! Whether the host may send a rewind of the files (RewindRefusal.kt).

use closta_model::ConversationState;

use crate::records::rewind::RewindOutcome;
use crate::transcript::Transcript;

/// The sentence of a rewind the host refused because no such message is known.
pub const REWIND_UNKNOWN_MESSAGE: &str = "This message cannot be rewound.";

/// The sentence of a rewind the host refused because a turn is running.
pub const REWIND_TURN_RUNNING: &str = "A turn is running.";

/// The sentence of a real rewind the host refused because the files were not checked first.
pub const REWIND_CHECK_FIRST: &str = "Check the files first.";

/// Why the host must not send the rewind of the files to `message_id` to the CLI, or `None` when
/// it may. `mid_turn` is whether the thread is running (`thread_is_running`'s rule, which the
/// screen's `isRunning` follows: a send the CLI has not opened a turn for counts). A pure function
/// of what the host knows, so the rule is measured alone.
///
///  - the message is not one the host sent the CLI under a uuid it remembers (for a message of a
///    nested conversation, or one that is not in the thread): [`REWIND_UNKNOWN_MESSAGE`];
///  - a turn is running: [`REWIND_TURN_RUNNING`];
///  - a real rewind (not `dry_run`) that does not follow a dry run of the same message that said
///    it could, with no user message sent and no turn (the CLI's own included) since:
///    [`REWIND_CHECK_FIRST`]. The files may have changed since the list was shown. `turns` is
///    [`turns_so_far`] now.
pub fn rewind_refusal(
    transcript: &Transcript,
    turns: i32,
    message_id: &str,
    dry_run: bool,
    mid_turn: bool,
) -> Option<&'static str> {
    if !transcript.user_uuids.contains_key(message_id) {
        Some(REWIND_UNKNOWN_MESSAGE)
    } else if mid_turn {
        Some(REWIND_TURN_RUNNING)
    } else if !dry_run && !checked(transcript, turns, message_id) {
        Some(REWIND_CHECK_FIRST)
    } else {
        None
    }
}

/// How many turns the conversation has had: the closed ones and the ones the CLI began on its own.
/// Both only grow, so a change of it says the CLI has moved since.
pub fn turns_so_far(conversation: &ConversationState) -> i32 {
    i32::try_from(conversation.turns.len())
        .unwrap_or(i32::MAX)
        .wrapping_add(conversation.spontaneous_resume_count)
}

fn checked(transcript: &Transcript, turns: i32, message_id: &str) -> bool {
    transcript.operations.rewind.as_ref().is_some_and(|last| {
        last.message_id == message_id
            && last.dry_run
            && last.outcome == RewindOutcome::Done
            && last.sends_at == transcript.routing.sends
            && last.turns_at == turns
    })
}
