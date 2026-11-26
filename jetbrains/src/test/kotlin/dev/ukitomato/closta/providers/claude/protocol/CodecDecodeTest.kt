package dev.ukitomato.closta.providers.claude.protocol

import com.google.gson.JsonParser
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNotNull
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
    fun `an assistant message the CLI made itself has no request_id and says its error`() {
        // sdk.d.ts SDKAssistantMessage: request_id and error are optional. Seen from 2.1.319 when logged out.
        val line =
            """{"type":"assistant","message":{"id":"m1","model":"<synthetic>","role":"assistant",""" +
                """"type":"message","content":[{"type":"text","text":"Not logged in · Please run /login"}]},""" +
                """"parent_tool_use_id":null,"session_id":"s","uuid":"u","timestamp":"t",""" +
                """"user_message_uuid":"c1","error":"authentication_failed","is_api_error_message":true}"""

        val assistant = assertInstanceOf(AgentEvent.Assistant::class.java, StreamJsonCodec.decode(line))
        assertAll(
            { assertNull(assistant.requestId) },
            { assertEquals("authentication_failed", assistant.error) },
            { assertEquals("c1", assistant.userMessageUuid) },
        )
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
    fun `the status that ends a compaction carries its result`() {
        val value = assertInstanceOf(AgentEvent.SystemStatus::class.java, captureLine("21-compact", 19))

        assertAll(
            { assertEquals(null, value.status) },
            { assertEquals("success", value.compactResult) },
        )
    }

    @Test
    fun `a ui_invalidate line becomes a typed value with its event`() {
        // Not in sdk.d.ts; the captures carry it at the start of a session.
        val value = assertInstanceOf(AgentEvent.SystemUiInvalidate::class.java, captureLine("02-tool-bash-autorun", 1))

        assertAll(
            { assertEquals("ui.render", value.event) },
            { assertTrue(value.uuid.isNotBlank() && value.sessionId.isNotBlank()) },
        )
    }

    @Test
    fun `a permission_denied line becomes a typed refusal naming the call and the kind of decision`() {
        val value =
            assertInstanceOf(AgentEvent.SystemPermissionDenied::class.java, captureLine("44-permission-denied", 23))

        assertAll(
            { assertEquals("Bash", value.toolName) },
            { assertTrue(value.toolUseId.startsWith("toolu_")) },
            { assertEquals("mode", value.decisionReasonType) },
            { assertNull(value.decisionReason) },
            { assertNull(value.agentId) },
            { assertTrue(value.message.startsWith("Permission to use Bash has been denied")) },
        )
    }

    @Test
    fun `a sub-agent's permission_denied line carries the agent id`() {
        val line =
            CaptureFixtures
                .nonBlankLines(CaptureFixtures.textOf("10-background-task.ndjson"))
                .first { "permission_denied" in it }
        val value = assertInstanceOf(AgentEvent.SystemPermissionDenied::class.java, StreamJsonCodec.decode(line))

        assertAll(
            { assertEquals("Monitor", value.toolName) },
            { assertEquals("subcommandResults", value.decisionReasonType) },
            { assertNotNull(value.agentId) },
        )
    }

    @Test
    fun `type only - an api retry line becomes a typed value, and a null status stays null`() {
        val line =
            """{"type":"system","subtype":"api_retry","attempt":2,"max_retries":10,"retry_delay_ms":2500,""" +
                """"error_status":529,"error":"overloaded","uuid":"u","session_id":"s"}"""
        val value = assertInstanceOf(AgentEvent.SystemApiRetry::class.java, StreamJsonCodec.decode(line))
        val noStatus =
            assertInstanceOf(
                AgentEvent.SystemApiRetry::class.java,
                StreamJsonCodec.decode(line.replace("\"error_status\":529", "\"error_status\":null")),
            )

        assertAll(
            { assertEquals(AgentEvent.SystemApiRetry("u", "s", 2, 10, 2500, 529, "overloaded"), value) },
            { assertNull(noStatus.errorStatus) },
        )
    }

    @Test
    fun `type only - a withdrawal line carries the request id, and one without it is unknown`() {
        val line = """{"type":"control_cancel_request","request_id":"r1"}"""

        assertAll(
            { assertEquals(AgentEvent.ControlCancel("r1"), StreamJsonCodec.decode(line)) },
            {
                assertInstanceOf(
                    AgentEvent.UnknownKind::class.java,
                    StreamJsonCodec.decode("""{"type":"control_cancel_request"}"""),
                )
            },
        )
    }

    @Test
    fun `type only - an informational line becomes a typed value with its level and flags`() {
        val line =
            """{"type":"system","subtype":"informational","content":"Stop hook said no","level":"warning",""" +
                """"prevent_continuation":true,"tag":"x","tool_use_id":"toolu_1","uuid":"u","session_id":"s"}"""
        val value = assertInstanceOf(AgentEvent.SystemInformational::class.java, StreamJsonCodec.decode(line))

        assertAll(
            { assertEquals("Stop hook said no", value.content) },
            { assertEquals("warning", value.level) },
            { assertEquals(true, value.preventContinuation) },
            { assertEquals("x", value.tag) },
            { assertEquals("toolu_1", value.toolUseId) },
        )
    }

    @Test
    fun `type only - an informational line without its optional fields still decodes`() {
        val line =
            """{"type":"system","subtype":"informational","content":"hi","level":"info","uuid":"u","session_id":"s"}"""
        val value = assertInstanceOf(AgentEvent.SystemInformational::class.java, StreamJsonCodec.decode(line))

        assertAll(
            { assertNull(value.preventContinuation) },
            { assertNull(value.tag) },
            { assertNull(value.toolUseId) },
        )
    }

    @Test
    fun `a conversation_reset line becomes a typed reset naming the clear that made it`() {
        // 41: the second message sent was `/clear`; the reset names it and the conversation it starts.
        val clear =
            CaptureFixtures
                .readCapture("41-clear-reset.ndjson")
                .filterIsInstance<AgentEvent.CommandLifecycle>()
                .map { it.commandUuid }
                .distinct()[1]
        val reset = assertInstanceOf(AgentEvent.ConversationReset::class.java, captureLine("41-clear-reset", 18))

        assertAll(
            { assertEquals("clear", reset.trigger) },
            { assertEquals(clear, reset.userMessageUuid) },
            { assertEquals("c0817532-7496-4d9c-8870-b9c088a63253", reset.newConversationId) },
            { assertEquals("2026-11-14T12:26:36.305Z", reset.timestamp) },
            {
                assertEquals(
                    "a6635625-53e9-40b5-adfb-977a4e9163b2",
                    reset.sessionId,
                    "the line still carries the old id",
                )
            },
        )
    }

    @Test
    fun `a conversation_reset of an older CLI, without its optional fields, is still a reset`() {
        val line =
            """{"type":"conversation_reset","new_conversation_id":"n","uuid":"u","session_id":"s"}"""
        val reset = assertInstanceOf(AgentEvent.ConversationReset::class.java, StreamJsonCodec.decode(line))

        assertAll(
            { assertNull(reset.trigger) },
            { assertNull(reset.userMessageUuid) },
            { assertNull(reset.timestamp) },
        )
    }

    @Test
    fun `an init with no scratchpad_path is placed, with the path null`() {
        val inits = listOf("16-permission-suggestion-accept" to 4, "21-compact" to 4, "21-compact" to 20)
        inits.forEach { (scenario, line) ->
            val init = assertInstanceOf(AgentEvent.SystemInit::class.java, captureLine(scenario, line))
            assertNull(init.scratchpadPath, "$scenario line $line")
        }
    }

    @Test
    fun `commands_changed and compact_boundary lines become typed values`() {
        val changed =
            listOf(6, 7).map { captureLine("01-baseline-text", it) }
        val boundary = captureLine("21-compact", 21)

        assertAll(
            { changed.forEach { assertInstanceOf(AgentEvent.SystemCommandsChanged::class.java, it) } },
            {
                val value = assertInstanceOf(AgentEvent.SystemCompactBoundary::class.java, boundary)
                assertTrue("trigger" in value.compactMetadata.text && "pre_tokens" in value.compactMetadata.text)
                assertTrue(value.logicalParentUuid != null, "21 line 21 carries logical_parent_uuid")
            },
        )
    }

    @Test
    fun `the result of a local command is placed with its optional fields absent`() {
        val result = assertInstanceOf(AgentEvent.Result::class.java, captureLine("21-compact", 24))

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
    fun `a result names every message its turn took in, in order`() {
        // 31: the second message, sent while the first ran, was taken into the first's turn.
        val result = assertInstanceOf(AgentEvent.Result::class.java, captureLine("31-send-mid-turn", 52))
        val uuids = result.userMessageUuids.orEmpty()

        assertAll(
            { assertEquals(2, uuids.size) },
            { assertEquals(result.userMessageUuid, uuids.first()) },
        )
    }

    @Test
    fun `a result without the list has none, and one with stray entries keeps only its strings`() {
        val line = CaptureFixtures.nonBlankLines(CaptureFixtures.textOf("31-send-mid-turn.ndjson"))[51]
        val json = JsonParser.parseString(line).asJsonObject
        val without = json.deepCopy().apply { remove("user_message_uuids") }
        val stray = json.deepCopy().apply { add("user_message_uuids", JsonParser.parseString("""["a", 1, null]""")) }

        assertAll(
            { assertNull((StreamJsonCodec.decode(without.toString()) as AgentEvent.Result).userMessageUuids) },
            {
                assertEquals(
                    listOf("a"),
                    (StreamJsonCodec.decode(stray.toString()) as AgentEvent.Result).userMessageUuids,
                )
            },
        )
    }

    @Test
    fun `an error result without a result text says what went wrong with its errors`() {
        // sdk.d.ts SDKResultError has errors and no result. 32 was interrupted while a foreground Bash ran.
        val result = assertInstanceOf(AgentEvent.Result::class.java, captureLine("32-interrupt-foreground", 72))

        assertAll(
            { assertEquals("error_during_execution", result.subtype) },
            { assertTrue(result.isError) },
            { assertEquals("aborted_streaming", result.terminalReason) },
            { assertEquals(diagnostic, result.result) },
        )
    }

    @Test
    fun resultBeforeInitDecodes() {
        // 36: a CLI that refuses to start (the sandbox is required but bwrap is missing) writes this one result and
        // exits without answering initialize; it has no queued_turn_count, fast_mode_state or subagent_stats.
        val result = assertInstanceOf(AgentEvent.Result::class.java, captureLine("36-sandbox-unavailable", 1))

        assertAll(
            { assertTrue(result.isError) },
            { assertEquals(0, result.numTurns) },
            { assertTrue(result.result.startsWith("Sandbox required but unavailable:"), result.result) },
            { assertNull(result.queuedTurnCount) },
            { assertNull(result.fastModeState) },
            { assertNull(result.subagentStats) },
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
        val accepted = assertInstanceOf(AgentEvent.ControlResponse::class.java, captureLine("07-set-model-and-mode", 5))

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
