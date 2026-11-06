package dev.ukitomato.closta.presenter.view

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class McpRowsTest {
    private fun server(
        name: String,
        status: String,
        tools: List<String> = emptyList(),
        source: String = "dynamic",
        error: String? = null,
    ) = McpServerRecord(name, status, source, tools, error)

    private fun rows(operations: OperationRecords): List<McpRow> = (mcpList(operations) as McpList.Rows).rows

    @Test
    fun mcpRowsFromCapture24() {
        val operations =
            CaptureReplay
                .replay("24-mcp-management")
                .last()
                .transcript.operations
        val list = mcpList(operations) as McpList.Rows
        val row = list.rows.single()
        assertEquals("fake-echo", row.name)
        assertEquals("connected", row.status)
        assertEquals("connected", row.status)
        assertEquals(1, row.tools)
        assertTrue(row.enabled)
        assertTrue(row.canToggle)
        assertTrue(row.canReconnect)
        assertFalse(row.needsSignIn)
        assertFalse(row.busy)
        assertNull(row.error)
        assertFalse(list.stale)
        // The last request turned off a name the CLI does not know: its refusal is the list's notice.
        assertEquals("Server not found: no-such-server", list.notice)
    }

    @Test
    fun mcpRowsAfterTheServerWasTurnedOff() {
        val steps = CaptureReplay.replay("24-mcp-management")
        // The answer to req-4 is the list right after the turn off.
        val afterOff =
            steps
                .first { step ->
                    val input = step.input as? PresenterInput.Event
                    (input?.event as? dev.ukitomato.closta.core.models.AgentEvent.ControlResponse)?.requestId ==
                        "24-mcp-management-req-4"
                }.transcript.operations
        val row = rows(afterOff).single()
        assertEquals("disabled", row.status)
        assertFalse(row.enabled)
        assertEquals(0, row.tools)
        assertTrue(row.canToggle)
        assertFalse(row.canReconnect)
    }

    @Test
    fun mcpRowsWhileWaiting() {
        assertEquals(McpList.Waiting, mcpList(OperationRecords()))
        assertEquals(McpList.Waiting, mcpList(OperationRecords(mcpWaiting = listOf("r1"))))
    }

    @Test
    fun unreadableList() {
        assertEquals(McpList.Unreadable, mcpList(OperationRecords(mcpUnreadable = true)))
        val older = OperationRecords(mcpServers = listOf(server("a", "connected")), mcpUnreadable = true)
        val list = mcpList(older) as McpList.Rows
        assertTrue(list.stale)
        assertEquals("a", list.rows.single().name)
    }

    @Test
    fun needsAuthAsksForTheTerminal() {
        val row = rows(OperationRecords(mcpServers = listOf(server("s", "needs-auth")))).single()
        assertEquals("needs-auth", row.status)
        assertTrue(row.needsSignIn)
        assertFalse(row.canReconnect)
        assertTrue(row.canToggle)
    }

    @Test
    fun busyWhileToggling() {
        val pending = SwitchRecord("r1", 1, SwitchKind.MCP_DISABLE, "a")
        val operations =
            OperationRecords(
                mcpServers = listOf(server("a", "connected", listOf("x")), server("b", "failed", error = "refused")),
                switches = listOf(pending),
            )
        val (a, b) = rows(operations)
        assertTrue(a.busy)
        assertFalse(a.canToggle)
        assertFalse(a.canReconnect)
        assertFalse(b.busy)
        assertEquals("failed", b.status)
        assertEquals("refused", b.error)
        assertTrue(b.canReconnect)
        assertNull((mcpList(operations) as McpList.Rows).notice, "a pending switch is no notice")
        val applied = operations.copy(switches = listOf(pending.copy(outcome = SwitchOutcome.APPLIED)))
        assertFalse(rows(applied).first().busy)
    }

    @Test
    fun theHostsOwnServerCannotBeSwitched() {
        val operations =
            OperationRecords(
                mcpServers = listOf(server("ide", "connected", source = MCP_SOURCE_SDK), server("named", "connected")),
                builtInMcpServers = listOf("named"),
            )
        rows(operations).forEach { row ->
            assertFalse(row.canToggle, row.name)
            assertFalse(row.canReconnect, row.name)
        }
    }

    @Test
    fun otherStatesReadAsTheyAre() {
        val labels =
            rows(OperationRecords(mcpServers = listOf(server("p", "pending"), server("u", MCP_UNKNOWN))))
                .map { it.status to it.canToggle }
        assertEquals(listOf("pending" to true, MCP_UNKNOWN to false), labels)
    }
}
