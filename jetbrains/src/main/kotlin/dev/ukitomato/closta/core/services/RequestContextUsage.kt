package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: ask how much of the context window is used. It issues the request and returns, holding no state:
 * the answer is a `ControlResponse` carrying [requestId], read by whoever made the request.
 */
class RequestContextUsage(
    private val session: AgentSession,
) {
    suspend operator fun invoke(requestId: String) {
        session.requestContextUsage(requestId)
    }
}
