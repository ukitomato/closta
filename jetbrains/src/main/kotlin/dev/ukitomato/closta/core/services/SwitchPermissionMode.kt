package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: change the permission mode live. Like [SwitchModel] it holds no state and performs no transition:
 * the mode in the state moves when the `system/status` that follows is folded. [requestId] is the caller's mark of
 * correlation, which the answer comes back with.
 */
class SwitchPermissionMode(
    private val session: AgentSession,
) {
    suspend operator fun invoke(
        mode: String,
        requestId: String,
    ) {
        session.setPermissionMode(mode, requestId)
    }
}
