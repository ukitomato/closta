package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: reload the plugins from disk. It issues the request and returns, holding no state: the answer is a
 * `ControlResponse` carrying the request id, read by whoever made the request.
 */
class ReloadPlugins(
    private val session: AgentSession,
) {
    suspend operator fun invoke(
        refuseIfBusy: Boolean,
        requestId: String,
    ) {
        session.reloadPlugins(refuseIfBusy, requestId)
    }
}
