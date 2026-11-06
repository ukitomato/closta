package dev.ukitomato.closta.core.models

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The pending-approval queue is keyed by `request_id` alone: a null `tool_use_id` still enqueues, a
 * repeated `request_id` does not double-enqueue, and resolving removes it, leaving no terminal state
 * behind. Uses hand-built events so the queue mechanics are pinned
 * independently of any capture.
 */
class ApprovalQueueTest {
    @Test
    fun `an approval with a null tool_use_id is still held, keyed by request_id`() {
        val state = fold(ConversationState(), controlRequest(requestId = "r1", toolName = "Write", toolUseId = null))

        val pending = state.pendingApprovals.single()
        assertEquals("r1", pending.requestId, "held by request_id")
        assertNull(pending.toolUseId, "a null tool_use_id does not stop it being held")
    }

    @Test
    fun `a repeated request_id is not enqueued twice`() {
        val once = fold(ConversationState(), controlRequest("r1", "Write", "toolu_1"))
        val twice = fold(once, controlRequest("r1", "Write", "toolu_1"))

        assertEquals(1, twice.pendingApprovals.size, "the duplicate request_id is guarded, not stacked")
    }

    @Test
    fun `resolving an approval removes it and leaves no terminal state`() {
        val state = fold(ConversationState(), controlRequest("r1", "Write", "toolu_1"))

        val resolved = resolveApproval(state, ApprovalDecision.Allow("r1"), elapsedMs = 0)

        assertTrue(
            resolved.pendingApprovals.isEmpty(),
            "the resolved approval is removed, not kept as a terminal state",
        )
    }

    @Test
    fun `resolving keeps the other pending approvals, in order`() {
        val two =
            listOf(
                controlRequest("r1", "Write", "toolu_1"),
                controlRequest("r2", "AskUserQuestion", "toolu_2"),
            ).fold(ConversationState(), ::fold)

        val resolved = resolveApproval(two, ApprovalDecision.Deny("r1"), elapsedMs = 0)

        assertEquals(listOf("r2"), resolved.pendingApprovals.map { it.requestId }, "only r1 is removed; r2 stays")
    }

    @Test
    fun `resolving an unknown request_id is a no-op`() {
        val state = fold(ConversationState(), controlRequest("r1", "Write", "toolu_1"))

        val resolved = resolveApproval(state, ApprovalDecision.Allow("does-not-exist"), elapsedMs = 0)

        assertEquals(state, resolved, "resolving a request that is not pending changes nothing")
    }

    private companion object {
        fun controlRequest(
            requestId: String,
            toolName: String?,
            toolUseId: String?,
        ): AgentEvent.ControlRequest =
            AgentEvent.ControlRequest(
                requestId = requestId,
                request = RawJson("""{"subtype":"can_use_tool"}"""),
                toolName = toolName,
                toolUseId = toolUseId,
            )
    }
}
