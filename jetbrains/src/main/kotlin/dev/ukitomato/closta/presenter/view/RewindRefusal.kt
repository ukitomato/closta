package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ConversationState

/** The sentence of a rewind the host refused because no such message is known. */
const val REWIND_UNKNOWN_MESSAGE = "This message cannot be rewound."

/** The sentence of a rewind the host refused because a turn is running. */
const val REWIND_TURN_RUNNING = "A turn is running."

/** The sentence of a real rewind the host refused because the files were not checked first. */
const val REWIND_CHECK_FIRST = "Check the files first."

/**
 * Why the host must not send the rewind of the files to [messageId] to the CLI, or null when it may.
 * [midTurn] is whether the thread is running (`threadIsRunning`'s rule, which the screen's `isRunning` follows: a send
 * the CLI has not opened a turn for counts). A pure function of what the host knows, so the rule is measured alone.
 *
 *  - the message is not one the host sent the CLI under a uuid it remembers (for a message of a nested conversation,
 *    or one that is not in the thread): [REWIND_UNKNOWN_MESSAGE];
 *  - a turn is running: [REWIND_TURN_RUNNING];
 *  - a real rewind (not [dryRun]) that does not follow a dry run of the same message that said it could, with no user
 *    message sent and no turn (the CLI's own included) since: [REWIND_CHECK_FIRST]. The files may have changed since
 *    the list was shown. [turns] is [turnsSoFar] now.
 */
fun rewindRefusal(
    transcript: Transcript,
    turns: Int,
    messageId: String,
    dryRun: Boolean,
    midTurn: Boolean,
): String? =
    when {
        messageId !in transcript.userUuids -> REWIND_UNKNOWN_MESSAGE
        midTurn -> REWIND_TURN_RUNNING
        !dryRun && !checked(transcript, turns, messageId) -> REWIND_CHECK_FIRST
        else -> null
    }

/**
 * How many turns the conversation has had: the closed ones and the ones the CLI began on its own. Both only
 * grow, so a change of it says the CLI has moved since.
 */
fun turnsSoFar(conversation: ConversationState): Int = conversation.turns.size + conversation.spontaneousResumeCount

private fun checked(
    transcript: Transcript,
    turns: Int,
    messageId: String,
): Boolean {
    val last = transcript.operations.rewind ?: return false
    return last.messageId == messageId &&
        last.dryRun &&
        last.outcome == RewindOutcome.DONE &&
        last.sendsAt == transcript.routing.sends &&
        last.turnsAt == turns
}
