package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.models.Attachment

/**
 * Use case: send a user message to the agent.
 *
 * A first-class command over an interface, not a procedure (a use case is a first-class type). It holds no
 * state and performs no transition — it issues one IO through [AgentSession] and returns. The state
 * moves only when the resulting [dev.ukitomato.closta.core.models.AgentEvent]s are folded
 * by the read side (the pump at the composition root), never here.
 */
class SendMessage(
    private val session: AgentSession,
) {
    suspend operator fun invoke(
        text: String,
        attachments: List<Attachment> = emptyList(),
        uuid: String? = null,
    ) {
        session.sendUserMessage(text, attachments, uuid)
    }
}
