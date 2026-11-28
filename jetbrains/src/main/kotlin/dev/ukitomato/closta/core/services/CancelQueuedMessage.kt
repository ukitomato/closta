package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: withdraw a message the CLI has queued and not started. It issues the request and returns, holding no
 * state: the answer is a `ControlResponse` carrying [requestId], read by whoever made the request.
 */
class CancelQueuedMessage(
    private val session: AgentSession,
) {
    suspend operator fun invoke(
        messageUuid: String,
        requestId: String,
    ) {
        session.cancelQueuedMessage(messageUuid, requestId)
    }
}
