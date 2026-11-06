package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: interrupt whatever the agent is currently doing.
 *
 * A first-class command over [AgentSession] that holds no state and performs no transition — it issues
 * the interrupt and returns; any resulting state change flows from folding the events the agent emits
 * afterwards.
 */
class Interrupt(
    private val session: AgentSession,
) {
    suspend operator fun invoke() {
        session.interrupt()
    }
}
