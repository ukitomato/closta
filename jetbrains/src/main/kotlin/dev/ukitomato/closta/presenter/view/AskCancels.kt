package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.TurnPhase

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
    if (transcript.sentWhileRunning.isEmpty() && transcript.withdrawn.isEmpty()) return emptyMap()
    val open = conversation.turns.filter { it.phase == TurnPhase.OPEN }.mapTo(HashSet()) { it.commandUuid }
    val routing = transcript.routing
    val found = HashMap<String, AskCancel>()
    // A withdrawn message stays withdrawn, whatever the tables have since pushed out.
    transcript.withdrawn.forEach { found[it] = AskCancel(CancelPhase.CANCELLED) }
    for (key in transcript.sentWhileRunning.filter { it !in found }) {
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

/** The CLI that held the queue is gone: no message of it can be withdrawn any more. */
internal fun Transcript.queueEnded(): Transcript =
    if (sentWhileRunning.isEmpty()) this else copy(sentWhileRunning = emptySet())

/** Whether the lifecycle line says the CLI cancelled a turn core still held open. */
internal fun cancelsOpenTurn(
    event: AgentEvent.CommandLifecycle,
    before: ConversationState,
): Boolean =
    event.state == CANCELLED_REASON &&
        before.turns.any { it.commandUuid == event.commandUuid && it.phase == TurnPhase.OPEN }

private const val CANCELLED_REASON = "cancelled"
