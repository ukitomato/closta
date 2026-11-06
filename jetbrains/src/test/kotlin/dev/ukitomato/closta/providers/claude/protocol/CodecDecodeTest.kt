package dev.ukitomato.closta.providers.claude.protocol

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The production decoder's defensive behaviour: a line it cannot place still comes back as
 * a value, sorted into the counter that matches its cause. A stdout reader that threw would stop
 * reading and deadlock the CLI behind a full pipe, so [StreamJsonCodec.decode] never throws.
 */
class CodecDecodeTest {
    @Test
    fun `a line that is not JSON becomes a broken line`() {
        val broken = assertInstanceOf(AgentEvent.BrokenLine::class.java, StreamJsonCodec.decode("not json at all"))

        assertAll(
            { assertEquals("not json at all", broken.line, "the bytes are kept so the damage can be looked at") },
            { assertTrue(broken.reason.isNotBlank(), "a damaged line says why it could not be read") },
        )
    }

    @Test
    fun `a strict reader rejects an unquoted literal rather than guessing a value`() {
        // A lenient reader would turn this into a plausible-looking value and hide the damage.
        val event = StreamJsonCodec.decode("""{"type":"assistant", this is not JSON""")

        assertInstanceOf(AgentEvent.BrokenLine::class.java, event)
    }

    @Test
    fun `a top-level value that is not an object is a broken line`() {
        assertAll(
            { assertInstanceOf(AgentEvent.BrokenLine::class.java, StreamJsonCodec.decode("42")) },
            { assertInstanceOf(AgentEvent.BrokenLine::class.java, StreamJsonCodec.decode("[1,2,3]")) },
            { assertInstanceOf(AgentEvent.BrokenLine::class.java, StreamJsonCodec.decode("")) },
        )
    }

    @Test
    fun `an unknown wire type is counted as unknown and kept whole`() {
        val line = """{"type":"holographic_telemetry","uuid":"u","session_id":"s"}"""

        val unknown = assertInstanceOf(AgentEvent.UnknownKind::class.java, StreamJsonCodec.decode(line))
        assertAll(
            { assertEquals("holographic_telemetry", unknown.wireType) },
            { assertEquals(line, unknown.raw.text, "the whole line is kept, not a message about it") },
        )
    }

    @Test
    fun `an unknown system subtype keeps its subtype rather than collapsing into system`() {
        val line = """{"type":"system","subtype":"quantum_entangled","uuid":"u","session_id":"s"}"""

        val unknown = assertInstanceOf(AgentEvent.UnknownKind::class.java, StreamJsonCodec.decode(line))
        assertEquals("system/quantum_entangled", unknown.wireType)
    }

    @Test
    fun `a known kind missing a required field is counted as unknown`() {
        // `state` is on every recorded command_lifecycle line; its absence means the shape moved.
        val line = """{"type":"command_lifecycle","command_uuid":"c","uuid":"u","session_id":"s"}"""

        val unknown = assertInstanceOf(AgentEvent.UnknownKind::class.java, StreamJsonCodec.decode(line))
        assertEquals("command_lifecycle", unknown.wireType)
    }

    @Test
    fun `decode never throws, whatever the input`() {
        val inputs =
            listOf(
                "",
                "   ",
                "null",
                "\"a string\"",
                "{not even close",
                """{"type":"system"}""",
                """{"type":"result"}""",
            )

        assertDoesNotThrow {
            inputs.forEach { StreamJsonCodec.decode(it) }
        }
    }

    // --- depth limit ----------------------------------------------------------------------

    /** A line whose deepest nesting is exactly [depth] (the top-level object counts as 1). */
    private fun lineNestedTo(depth: Int): String {
        val inner = "{\"a\":".repeat(depth - 2) + "{}" + "}".repeat(depth - 2)
        return """{"type":"holographic_telemetry","n":$inner}"""
    }

    @Test
    fun `a line nested 10000 deep is a broken line and decode does not throw`() {
        val event = assertDoesNotThrow<AgentEvent> { StreamJsonCodec.decode(lineNestedTo(10_000)) }

        val broken = assertInstanceOf(AgentEvent.BrokenLine::class.java, event)
        assertTrue("nesting" in broken.reason, "the reason names the cause: ${broken.reason}")
    }

    @Test
    fun `the limit is exact - 201 levels is broken and 200 levels is placed`() {
        assertAll(
            { assertInstanceOf(AgentEvent.BrokenLine::class.java, StreamJsonCodec.decode(lineNestedTo(201))) },
            { assertInstanceOf(AgentEvent.UnknownKind::class.java, StreamJsonCodec.decode(lineNestedTo(200))) },
            { assertEquals(200, StreamJsonCodec.MAX_DEPTH) },
        )
    }

    @Test
    fun `brackets inside a string are not counted as nesting`() {
        val brackets = "[".repeat(500) + "{".repeat(500)
        val escaped = """a\"[""" + "[".repeat(500)
        assertAll(
            {
                val line = """{"type":"holographic_telemetry","s":"$brackets"}"""
                assertInstanceOf(AgentEvent.UnknownKind::class.java, StreamJsonCodec.decode(line))
            },
            {
                // An escaped quote does not end the string, so the brackets after it are still inside it.
                val line = """{"type":"holographic_telemetry","s":"$escaped"}"""
                assertInstanceOf(AgentEvent.UnknownKind::class.java, StreamJsonCodec.decode(line))
            },
        )
    }

    // --- init, the two new kinds, /compact's result ---------------------------------------

    private val diagnostic = "[ede_diagnostic] result_type=user last_content_type=n/a stop_reason=tool_use"

    private fun captureLine(
        scenario: String,
        lineNumber: Int,
    ): AgentEvent =
        StreamJsonCodec.decode(
            CaptureFixtures.nonBlankLines(CaptureFixtures.textOf("$scenario.ndjson"))[lineNumber - 1],
        )

    @Test
    fun `an init with no scratchpad_path is placed, with the path null`() {
        val inits = listOf("16-permission-suggestion-accept" to 5, "21-compact" to 4, "21-compact" to 21)
        inits.forEach { (scenario, line) ->
            val init = assertInstanceOf(AgentEvent.SystemInit::class.java, captureLine(scenario, line))
            assertNull(init.scratchpadPath, "$scenario line $line")
        }
    }

    @Test
    fun `commands_changed and compact_boundary lines become typed values`() {
        val changed =
            listOf(1, 7, 8).map { captureLine("16-permission-suggestion-accept", it) }
        val boundary = captureLine("21-compact", 22)

        assertAll(
            { changed.forEach { assertInstanceOf(AgentEvent.SystemCommandsChanged::class.java, it) } },
            {
                val value = assertInstanceOf(AgentEvent.SystemCompactBoundary::class.java, boundary)
                assertTrue("trigger" in value.compactMetadata.text && "pre_tokens" in value.compactMetadata.text)
                assertTrue(value.logicalParentUuid != null, "21 line 22 carries logical_parent_uuid")
            },
        )
    }

    @Test
    fun `the result of a local command is placed with its optional fields absent`() {
        val result = assertInstanceOf(AgentEvent.Result::class.java, captureLine("21-compact", 25))

        assertAll(
            { assertEquals("compact", result.localCommand) },
            { assertNull(result.stopReason) },
            { assertNull(result.terminalReason) },
            { assertNull(result.ttftMs) },
            { assertNull(result.ttftStreamMs) },
            { assertNull(result.timeToRequestMs) },
            { assertNull(result.firstContentFrameMs) },
        )
    }

    @Test
    fun `a model-turn result still carries its timing fields and no local command`() {
        val result =
            CaptureFixtures.readCapture("01-baseline-text.ndjson").filterIsInstance<AgentEvent.Result>().single()
        assertAll(
            { assertNull(result.localCommand) },
            { assertTrue(result.ttftMs != null && result.terminalReason != null) },
        )
    }

    @Test
    fun `an error result without a result text says what went wrong with its errors`() {
        // sdk.d.ts SDKResultError has errors and no result. 32 was interrupted while a foreground Bash ran.
        val result = assertInstanceOf(AgentEvent.Result::class.java, captureLine("32-interrupt-foreground", 80))

        assertAll(
            { assertEquals("error_during_execution", result.subtype) },
            { assertTrue(result.isError) },
            { assertEquals("aborted_streaming", result.terminalReason) },
            { assertEquals(diagnostic, result.result) },
        )
    }

    // --- control_request subtype, control_response ----------------------------------------

    @Test
    fun `only can_use_tool becomes a ControlRequest`() {
        val approval =
            """{"type":"control_request","request_id":"r1","request":{"subtype":"can_use_tool","tool_name":"Write"}}"""
        val mcp =
            """{"type":"control_request","request_id":"r2",""" +
                """"request":{"subtype":"mcp_message","server_name":"s","message":{}}}"""
        val noSubtype = """{"type":"control_request","request_id":"r3","request":{"tool_name":"Write"}}"""
        val noRequest = """{"type":"control_request","request_id":"r4"}"""

        assertAll(
            { assertInstanceOf(AgentEvent.ControlRequest::class.java, StreamJsonCodec.decode(approval)) },
            {
                val unknown = assertInstanceOf(AgentEvent.UnknownKind::class.java, StreamJsonCodec.decode(mcp))
                assertEquals("control_request/mcp_message", unknown.wireType)
                assertEquals(mcp.replace(" ", ""), unknown.raw.text.replace(" ", ""), "kept whole")
            },
            {
                val unknown = assertInstanceOf(AgentEvent.UnknownKind::class.java, StreamJsonCodec.decode(noSubtype))
                assertEquals("control_request", unknown.wireType)
            },
            {
                val unknown = assertInstanceOf(AgentEvent.UnknownKind::class.java, StreamJsonCodec.decode(noRequest))
                assertEquals("control_request", unknown.wireType)
            },
        )
    }

    @Test
    fun `a control response lifts request_id, subtype and error, and a success lifts no error`() {
        val rejected = assertInstanceOf(AgentEvent.ControlResponse::class.java, captureLine("07-set-model-and-mode", 9))
        val accepted = assertInstanceOf(AgentEvent.ControlResponse::class.java, captureLine("07-set-model-and-mode", 4))

        assertAll(
            { assertEquals("07-set-model-and-mode-req-8", rejected.requestId) },
            { assertEquals("error", rejected.subtype) },
            { assertTrue(rejected.error!!.startsWith("Cannot set permission mode to bypassPermissions")) },
            { assertEquals("success", accepted.subtype) },
            { assertEquals("07-set-model-and-mode-req-6", accepted.requestId) },
            { assertNull(accepted.error) },
        )
    }
}
