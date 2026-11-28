package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ConversationState

/** A line about a request: the CLI asks, takes the ask back, or says what the user did outside Closta. */
internal fun foldRequestLine(
    transcript: Transcript,
    event: AgentEvent,
    before: ConversationState,
    after: ConversationState,
): Transcript =
    when (event) {
        is AgentEvent.ControlRequest -> foldRequest(transcript, event, after)
        is AgentEvent.ControlCancel -> foldElicitationWithdrawn(foldWithdrawn(transcript, event, before), event, before)
        is AgentEvent.Elicitation -> foldElicitation(transcript, event)
        is AgentEvent.SystemElicitationComplete -> foldElicitationComplete(transcript, event)
        else -> transcript
    }

/** A request the CLI took back, while core still held it, ends as withdrawn: one already answered stays as it ended. */
private fun foldWithdrawn(
    transcript: Transcript,
    event: AgentEvent.ControlCancel,
    before: ConversationState,
): Transcript {
    val record = transcript.approvals[event.requestId]
    val held = before.pendingApprovals.any { it.requestId == event.requestId }
    if (record == null || record.outcome != null || !held) return transcript
    return transcript.copy(
        approvals = transcript.approvals.put(record.requestId, record.copy(outcome = ApprovalOutcome.WITHDRAWN)),
    )
}

/** Where a request that arrives now sits: the top-level assistant message receiving content, else the last one. */
internal fun Transcript.anchor(): String? {
    val lastAssistant = messages.order.lastOrNull { messages[it]?.role == Role.ASSISTANT }
    return routing.currentTurn ?: routing.openResume ?: lastAssistant
}
