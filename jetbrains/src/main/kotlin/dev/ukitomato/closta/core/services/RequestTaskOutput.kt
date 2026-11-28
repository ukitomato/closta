package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: ask for the end of a background shell task's output. It issues the request and returns, holding no state:
 * the answer is a `ControlResponse` carrying the request id, read by whoever made the request.
 */
class RequestTaskOutput(
    private val session: AgentSession,
) {
    suspend operator fun invoke(
        taskId: String,
        requestId: String,
    ) {
        session.requestTaskOutput(taskId, requestId)
    }
}
