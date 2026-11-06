package dev.ukitomato.closta.providers.claude.protocol

import com.google.gson.JsonParser
import dev.ukitomato.closta.core.models.AgentEvent
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * The RawJson boundary: a nested provider payload is carried through as text, not opened.
 * The decoder reads the typed scalars a kind needs and leaves the rest — an Anthropic message, an SSE
 * frame, a control payload — as a [dev.ukitomato.closta.core.models.RawJson] the core
 * never has to understand.
 */
class CodecRawJsonTest {
    @Test
    fun `an assistant message is carried through as text rather than modelled`() {
        val message = """{"role":"assistant","content":[{"type":"text","text":"hi"}],"model":"claude"}"""
        val line =
            """{"type":"assistant","uuid":"u","session_id":"s","timestamp":"t","request_id":"r",""" +
                """"message":$message}"""

        val event = assertInstanceOf(AgentEvent.Assistant::class.java, StreamJsonCodec.decode(line))
        assertEquals(JsonParser.parseString(message), JsonParser.parseString(event.message.text))
    }

    @Test
    fun `a stream event frame is carried through and an explicit null is an absent value`() {
        val frame = """{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"x"}}"""
        val line =
            """{"type":"stream_event","event":$frame,"session_id":"s","parent_tool_use_id":null,""" +
                """"uuid":"u","ttft_ms":812}"""

        val event = assertInstanceOf(AgentEvent.StreamEvent::class.java, StreamJsonCodec.decode(line))
        assertAll(
            { assertEquals(JsonParser.parseString(frame), JsonParser.parseString(event.event.text)) },
            { assertNull(event.parentToolUseId, "an explicit JSON null is an absent value") },
            { assertEquals(812L, event.ttftMs) },
        )
    }

    @Test
    fun `a control request keeps its payload raw while lifting the typed scalars out of it`() {
        val request =
            """{"subtype":"can_use_tool","tool_name":"Write","tool_use_id":"toolu_1","agent_id":"a1",""" +
                """"input":{"file_path":"note.txt","content":"hi"}}"""
        val line = """{"type":"control_request","request_id":"req_1","request":$request}"""

        val event = assertInstanceOf(AgentEvent.ControlRequest::class.java, StreamJsonCodec.decode(line))
        assertAll(
            { assertEquals("req_1", event.requestId) },
            // The whole request stays raw — `input` and everything else is not opened.
            { assertEquals(JsonParser.parseString(request), JsonParser.parseString(event.request.text)) },
            // The attribution/kind scalars are read from inside `request`, without modelling the rest.
            { assertEquals("a1", event.agentId) },
            { assertEquals("Write", event.toolName) },
            { assertEquals("toolu_1", event.toolUseId) },
        )
    }

    @Test
    fun `attribution scalars are null when the request omits them`() {
        val line =
            """{"type":"control_request","request_id":"req_2",""" +
                """"request":{"subtype":"can_use_tool"}}"""

        val event = assertInstanceOf(AgentEvent.ControlRequest::class.java, StreamJsonCodec.decode(line))
        assertAll(
            { assertNull(event.agentId) },
            { assertNull(event.toolUseId) },
            { assertNull(event.toolName, "can_use_tool present but tool_name omitted") },
        )
    }
}
