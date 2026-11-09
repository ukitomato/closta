package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: turn one MCP server on or off. [enabled] is the wanted value, not a flip. It issues the request and
 * returns, holding no state: the answer is a `ControlResponse` carrying [requestId].
 */
class SetMcpServerEnabled(
    private val session: AgentSession,
) {
    suspend operator fun invoke(
        name: String,
        enabled: Boolean,
        requestId: String,
    ) {
        session.setMcpServerEnabled(name, enabled, requestId)
    }
}
