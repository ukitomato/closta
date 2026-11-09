package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: change the model live.
 *
 * A first-class command over [AgentSession] that holds no state and performs no transition — it sends
 * the live change and returns; the state moves only when the resulting events (e.g. a fresh
 * `system/init`) are folded by the read side. Persisting the chosen model as a
 * default is a downstream settings concern, out of scope here.
 *
 * It takes the caller's [requestId], which the answer comes back with.
 */
class SwitchModel(
    private val session: AgentSession,
) {
    suspend operator fun invoke(
        model: String,
        requestId: String,
    ) {
        session.setModel(model, requestId)
    }
}
