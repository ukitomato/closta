package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: ask for the session's cost and the plan's limits. It issues the request and returns, holding no state:
 * the answer is a `ControlResponse` carrying [requestId], read by whoever made the request.
 */
class RequestUsage(
    private val session: AgentSession,
) {
    suspend operator fun invoke(requestId: String) {
        session.requestUsage(requestId)
    }
}
