package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: ask the CLI to move running foreground work to the background. It issues the request and returns,
 * holding no state: the answer is a `ControlResponse` carrying the request id, read by whoever made the request.
 */
class BackgroundTasks(
    private val session: AgentSession,
) {
    suspend operator fun invoke(
        toolUseId: String?,
        requestId: String,
    ) {
        session.backgroundTasks(toolUseId, requestId)
    }
}
