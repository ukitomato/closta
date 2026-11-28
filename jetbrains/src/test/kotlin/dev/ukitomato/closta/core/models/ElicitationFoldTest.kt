package dev.ukitomato.closta.core.models

import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** An MCP server's request for input is held with the approvals; the line is modelled from the types alone. */
class ElicitationFoldTest {
    private fun elicitation(id: String) =
        AgentEvent.Elicitation(
            requestId = id,
            serverName = "files",
            mode = "form",
            elicitationId = null,
            request = RawJson("""{"subtype":"elicitation","mcp_server_name":"files","message":"Name?"}"""),
        )

    private fun failedResult() =
        AgentEvent.Result(
            uuid = "u",
            sessionId = "s",
            subtype = "error_during_execution",
            result = "",
            isError = true,
            numTurns = 1,
            resultIndex = 0,
            totalCostUsd = 0.0,
            durationMs = 1,
            durationApiMs = 1,
            usage = RawJson("{}"),
            modelUsage = RawJson("{}"),
            permissionDenials = RawJson("[]"),
        )

    private fun ids(state: ConversationState) = state.pendingApprovals.map { it.requestId }

    @Test
    fun `type only - an elicitation is one pending request of its own kind without a tool`() {
        val state = fold(ConversationState(), elicitation("e1"))

        val pending = state.pendingApprovals.single()
        assertAll(
            { assertEquals("e1", pending.requestId) },
            { assertEquals(ApprovalKind.ELICITATION, pending.kind) },
            { assertNull(pending.toolUseId) },
            { assertNull(pending.agentId) },
        )
    }

    @Test
    fun `type only - the same request id twice is held once`() {
        val state = fold(fold(ConversationState(), elicitation("e1")), elicitation("e1"))

        assertEquals(listOf("e1"), ids(state))
    }

    @Test
    fun `type only - a result and a withdrawal both drop it`() {
        val pending = fold(ConversationState(), elicitation("e1"))

        assertAll(
            { assertEquals(emptyList<String>(), ids(fold(pending, failedResult()))) },
            { assertEquals(emptyList<String>(), ids(fold(pending, AgentEvent.ControlCancel("e1")))) },
        )
    }

    @Test
    fun `type only - a withdrawn or ended elicitation that comes again is not held again`() {
        val pending = fold(ConversationState(), elicitation("e1"))

        assertAll(
            {
                assertEquals(
                    emptyList<String>(),
                    ids(fold(fold(pending, AgentEvent.ControlCancel("e1")), elicitation("e1"))),
                )
            },
            { assertEquals(emptyList<String>(), ids(fold(fold(pending, failedResult()), elicitation("e1")))) },
        )
    }

    @Test
    fun `type only - an answered elicitation that comes again late is not held again`() {
        val pending = fold(ConversationState(), elicitation("e1"))

        val answered = resolveElicitation(pending, ElicitationDecision("e1", ElicitationAction.ACCEPT))
        val later = fold(answered, elicitation("e1"))

        assertAll(
            { assertEquals(emptyList<String>(), ids(answered)) },
            { assertEquals(listOf("e1"), answered.settledElicitations) },
            { assertEquals(emptyList<String>(), ids(later)) },
            { assertEquals(listOf("e2"), ids(fold(later, elicitation("e2"))), "another request is held as before") },
        )
    }

    @Test
    fun `type only - the settled ids stop at 256 and the oldest is forgotten`() {
        var state = ConversationState()
        for (n in 1..257) {
            state = fold(state, elicitation("e$n"))
            state = resolveElicitation(state, ElicitationDecision("e$n", ElicitationAction.DECLINE))
        }

        assertAll(
            { assertEquals(256, state.settledElicitations.size) },
            { assertEquals("e2", state.settledElicitations.first()) },
            { assertEquals("e257", state.settledElicitations.last()) },
            { assertEquals(listOf("e1"), ids(fold(state, elicitation("e1")))) },
            { assertEquals(emptyList<String>(), ids(fold(state, elicitation("e2")))) },
        )
    }

    @Test
    fun `type only - answering a request that is not pending changes nothing`() {
        val pending = fold(ConversationState(), elicitation("e1"))

        assertEquals(pending, resolveElicitation(pending, ElicitationDecision("zz", ElicitationAction.CANCEL)))
    }

    @Test
    fun `type only - the end of a url elicitation changes nothing`() {
        val pending = fold(ConversationState(), elicitation("e1"))

        assertEquals(pending, fold(pending, AgentEvent.SystemElicitationComplete("u", "s", "files", "id1")))
    }
}
