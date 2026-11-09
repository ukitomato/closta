package dev.ukitomato.closta.core.models

import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * A subagent-issued approval is attributed to its origin by `agent_id`, which equals the spawning
 * `task_started.task_id`. The value is read from the typed
 * [AgentEvent.ControlRequest.agentId] that `CaptureFixtures` lifts from the `request` object, so core
 * never opens the `RawJson`. A main-conversation approval carries no `agent_id`.
 */
class SubagentApprovalTest {
    @Test
    fun `capture 12 attributes the approval to the subagent by agent_id, matching a task_id`() {
        val events = CaptureFixtures.readCapture("12-subagent-permission.ndjson")

        val atRequest = foldThrough(events) { it is AgentEvent.ControlRequest }
        val pending = atRequest.pendingApprovals.single()

        assertEquals("ac9bfb270bbfbff94", pending.agentId, "12: the approval is attributed to the subagent by agent_id")
        assertTrue(
            atRequest.tasks.any { it.taskId == pending.agentId },
            "12: agent_id equals the spawning task_started.task_id",
        )
    }

    @Test
    fun `capture 05 is a main-conversation approval and carries no agent_id`() {
        val events = CaptureFixtures.readCapture("05-permission-can-use-tool.ndjson")

        val atRequest = foldThrough(events) { it is AgentEvent.ControlRequest }

        assertNull(atRequest.pendingApprovals.single().agentId, "05: a main-conversation approval has no agent_id")
    }

    private companion object {
        fun foldThrough(
            events: List<AgentEvent>,
            stop: (AgentEvent) -> Boolean,
        ): ConversationState {
            var state = ConversationState()
            for (event in events) {
                state = fold(state, event)
                if (stop(event)) break
            }
            return state
        }
    }
}
