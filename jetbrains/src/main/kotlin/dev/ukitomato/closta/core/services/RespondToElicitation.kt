package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.ElicitationDecision
import dev.ukitomato.closta.core.models.resolveElicitation

/**
 * Use case: return the host's answer to an MCP server's request for input to the agent, and take the request out of the
 * conversation. [content] is the form's values as a JSON object, or null for a decline, a cancel and a url request.
 *
 * If the send throws, the exception reaches the caller unchanged and the state is not advanced: the request stays
 * pending, so the host can answer again.
 */
class RespondToElicitation(
    private val session: AgentSession,
) {
    suspend operator fun invoke(
        state: ConversationState,
        decision: ElicitationDecision,
        content: String?,
    ): ConversationState {
        session.respondToElicitation(decision, content)
        return resolveElicitation(state, decision)
    }
}
