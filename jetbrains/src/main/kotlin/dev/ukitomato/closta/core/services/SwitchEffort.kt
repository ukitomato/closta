package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: change the effort live, as [SwitchModel] changes the model: it sends the change and returns; what
 * the session then uses is read back from the settings it answers with.
 */
class SwitchEffort(
    private val session: AgentSession,
) {
    suspend operator fun invoke(
        effort: String?,
        requestId: String,
    ) {
        session.setEffort(effort, requestId)
    }
}
