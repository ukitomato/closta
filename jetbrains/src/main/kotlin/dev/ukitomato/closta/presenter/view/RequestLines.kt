package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ConversationState

/** A line about a request: the CLI asks, or takes the ask back. */
internal fun foldRequestLine(
    transcript: Transcript,
    event: AgentEvent,
    before: ConversationState,
    after: ConversationState,
): Transcript =
    when (event) {
        is AgentEvent.ControlRequest -> foldRequest(transcript, event, after)
        is AgentEvent.ControlCancel -> foldWithdrawn(transcript, event, before)
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
