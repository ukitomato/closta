package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: ask for the permission rules the session runs with. It issues the request and returns, holding no state:
 * the answer is a `ControlResponse` carrying [requestId], read by whoever made the request.
 */
class RequestPermissionRules(
    private val session: AgentSession,
) {
    suspend operator fun invoke(requestId: String) {
        session.requestPermissionRules(requestId)
    }
}
