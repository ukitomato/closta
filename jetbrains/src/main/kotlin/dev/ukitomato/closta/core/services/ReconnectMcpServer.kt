package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: reconnect one MCP server. It issues the request and returns, holding no state: the answer is a
 * `ControlResponse` carrying [requestId].
 */
class ReconnectMcpServer(
    private val session: AgentSession,
) {
    suspend operator fun invoke(
        name: String,
        requestId: String,
    ) {
        session.reconnectMcpServer(name, requestId)
    }
}
