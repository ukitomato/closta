package dev.ukitomato.closta.providers.claude.protocol

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * The write direction for the MCP control requests. The lines to match are the ones the recorder wrote
 * to the CLI's stdin in capture 24 (`24-mcp-management.stdin.jsonl`), the CLI that answered them: their keys, their
 * types and their order, byte for byte.
 */
class StdinMcpTest {
    private val captured: Map<String, String> =
        CaptureFixtures
            .nonBlankLines(CaptureFixtures.textOf(STDIN))
            .associateBy { JsonParser.parseString(it).asJsonObject["request_id"].asString }

    private fun line(number: Int): String = captured.getValue("$CAPTURE-req-$number")

    private fun request(number: Int): JsonObject =
        JsonParser.parseString(line(number)).asJsonObject["request"].asJsonObject

    @Test
    fun `the capture holds the status, the toggles and the reconnect the recorder sent`() {
        assertEquals(
            listOf(
                "initialize",
                "mcp_status",
                "mcp_toggle",
                "mcp_status",
                "mcp_toggle",
                "mcp_status",
                "mcp_reconnect",
                "mcp_status",
                "mcp_toggle",
            ),
            (1..9).map { request(it)["subtype"].asString },
        )
    }

    @Test
    fun `mcp_status is written as the recorder wrote it`() {
        assertEquals(line(2), StdinEncoder.mcpStatus("$CAPTURE-req-2"))
        assertEquals(line(8), StdinEncoder.mcpStatus("$CAPTURE-req-8"))
    }

    @Test
    fun `mcp_toggle is written as the recorder wrote it, off and on, and for a name the CLI does not know`() {
        assertEquals(line(3), StdinEncoder.mcpToggle("$CAPTURE-req-3", "fake-echo", false))
        assertEquals(line(5), StdinEncoder.mcpToggle("$CAPTURE-req-5", "fake-echo", true))
        assertEquals(line(9), StdinEncoder.mcpToggle("$CAPTURE-req-9", "no-such-server", false))
    }

    @Test
    fun `mcp_reconnect is written as the recorder wrote it`() {
        assertEquals(line(7), StdinEncoder.mcpReconnect("$CAPTURE-req-7", "fake-echo"))
    }

    @Test
    fun `a name with a quote or a newline stays one line of one JSON text`() {
        val written = StdinEncoder.mcpToggle("id", "a\"b\nc", true)
        assertEquals(1, written.lines().size)
        assertEquals(
            "a\"b\nc",
            JsonParser
                .parseString(written)
                .asJsonObject["request"]
                .asJsonObject["serverName"]
                .asString,
        )
    }

    private companion object {
        const val CAPTURE = "24-mcp-management"
        const val STDIN = "24-mcp-management.stdin.jsonl"
    }
}
