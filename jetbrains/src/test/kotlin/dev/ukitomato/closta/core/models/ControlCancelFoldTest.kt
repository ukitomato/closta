package dev.ukitomato.closta.core.models

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** A request the CLI takes back stops being pending; the line is modelled from the types alone, so these say so. */
class ControlCancelFoldTest {
    private fun request(id: String) =
        AgentEvent.ControlRequest(
            requestId = id,
            request = RawJson("""{"subtype":"can_use_tool","tool_name":"Write","input":{}}"""),
            agentId = null,
            toolName = "Write",
            toolUseId = null,
        )

    @Test
    fun `type only - a withdrawal of a pending request empties the queue`() {
        val pending = fold(ConversationState(), request("r1"))
        assertEquals(listOf("r1"), pending.pendingApprovals.map { it.requestId })

        val withdrawn = fold(pending, AgentEvent.ControlCancel("r1"))

        assertEquals(emptyList<String>(), withdrawn.pendingApprovals.map { it.requestId })
    }

    @Test
    fun `type only - a withdrawal of a request nobody holds changes nothing`() {
        val pending = fold(fold(ConversationState(), request("r1")), request("r2"))

        val after = fold(pending, AgentEvent.ControlCancel("unknown"))

        assertEquals(pending, after)
    }

    @Test
    fun `type only - a withdrawal removes only the request it names`() {
        val pending = fold(fold(ConversationState(), request("r1")), request("r2"))

        val after = fold(pending, AgentEvent.ControlCancel("r1"))

        assertEquals(listOf("r2"), after.pendingApprovals.map { it.requestId })
    }
}
