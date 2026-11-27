package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.TurnPhase

/** Whether the withdrawal of the message [uuid] is done: its row is a withdrawn one. */
internal fun Transcript.isWithdrawn(uuid: String): Boolean = operations.cancels[uuid]?.phase == CancelPhase.CANCELLED

/**
 * What each message the user sent while a turn ran says of its withdrawal, by the message's key: only a row with
 * something to say has an entry. [live] is whether the CLI runs.
 *
 * A message can be offered only from the CLI's `queued` (core has an open turn for it) to its `started` (the
 * transcript has none), while the CLI runs: before `queued` a withdrawal is answered `cancelled: false` and leaves a
 * mark for later.
 */
internal fun askCancels(
    transcript: Transcript,
    conversation: ConversationState,
    live: Boolean,
): Map<String, AskCancel> {
    if (transcript.sentWhileRunning.isEmpty()) return emptyMap()
    val open = conversation.turns.filter { it.phase == TurnPhase.OPEN }.mapTo(HashSet()) { it.commandUuid }
    val routing = transcript.routing
    val found = HashMap<String, AskCancel>()
    for (key in transcript.sentWhileRunning) {
        val uuid = transcript.userUuids[key] ?: continue
        val started = uuid in routing.turns
        val offerable = live && uuid in open && !started && uuid !in routing.stopped
        val shown = shownCancel(transcript.operations.cancels[uuid], started, offerable)
        if (shown != null) found[key] = shown
    }
    return found
}

private fun shownCancel(
    asked: AskCancel?,
    started: Boolean,
    offerable: Boolean,
): AskCancel? =
    when {
        asked?.phase == CancelPhase.CANCELLED || asked?.phase == CancelPhase.TOO_LATE -> asked
        // The CLI began it before it answered: it is too late, whatever the answer says.
        asked != null && started -> AskCancel(CancelPhase.TOO_LATE)
        asked?.phase == CancelPhase.WAITING -> asked
        asked != null -> asked.takeIf { offerable }
        offerable -> AskCancel(CancelPhase.OFFER)
        else -> null
    }
