package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: put the files back as they were before a user message, or ask what that would change. It issues
 * the request and returns, holding no state: the answer is a `ControlResponse` carrying [requestId], read by whoever
 * made the request.
 */
class RewindFiles(
    private val session: AgentSession,
) {
    suspend operator fun invoke(
        userMessageId: String,
        dryRun: Boolean,
        requestId: String,
    ) {
        session.rewindFiles(userMessageId, dryRun, requestId)
    }
}
