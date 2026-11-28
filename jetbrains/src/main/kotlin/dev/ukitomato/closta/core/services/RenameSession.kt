package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: name the running session as the user chose in the host. It issues the request and returns, holding no
 * state: the answer is a `ControlResponse` carrying [requestId], read by whoever made the request.
 */
class RenameSession(
    private val session: AgentSession,
) {
    suspend operator fun invoke(
        title: String,
        sessionId: String,
        requestId: String,
    ) {
        session.renameSession(title, sessionId, requestId)
    }
}
