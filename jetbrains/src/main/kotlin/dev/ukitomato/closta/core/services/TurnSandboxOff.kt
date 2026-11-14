package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: turn the sandbox off live, as [SwitchEffort] changes the effort: it sends the change and returns;
 * whether the sandbox is off is read back from the settings the session answers with.
 */
class TurnSandboxOff(
    private val session: AgentSession,
) {
    suspend operator fun invoke(requestId: String) {
        session.turnSandboxOff(requestId)
    }
}
