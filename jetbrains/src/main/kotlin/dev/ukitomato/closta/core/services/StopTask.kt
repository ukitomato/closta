package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession

/**
 * Use case: stop one running task of the agent, by the CLI's task id.
 *
 * The same shape as [Interrupt]: a first-class command over [AgentSession] that holds no state and performs no
 * transition. It issues the request and returns; the task's end flows from folding the events the agent emits
 * afterwards (a `task_notification` that says it stopped).
 */
class StopTask(
    private val session: AgentSession,
) {
    suspend operator fun invoke(taskId: String) {
        session.stopTask(taskId)
    }
}
