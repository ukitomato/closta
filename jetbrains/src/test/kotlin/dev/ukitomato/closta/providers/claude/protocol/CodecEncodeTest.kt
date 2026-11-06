package dev.ukitomato.closta.providers.claude.protocol

import com.google.gson.JsonParser
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The write direction against the measured shapes, and
 * its purity. stdin is not captured by the CLI, so those measurements are the source of truth here.
 *
 * Comparisons are semantic (parse then compare), because the CLI's parser does not depend on key
 * order or whitespace — but the array-vs-object distinction the CLI *does* enforce is checked
 * explicitly, since that is a difference of meaning rather than of formatting.
 */
class CodecEncodeTest {
    private fun json(text: String) = JsonParser.parseString(text)

    @Test
    fun `a user message is marked as typed by a person`() {
        val line = json(StdinEncoder.userMessage(sessionId = "S", uuid = "U", content = "hello")).asJsonObject
        assertEquals("human", line.getAsJsonObject("origin")["kind"].asString)
    }

    @Test
    fun `initialize declares that each task can be stopped on its own`() {
        val request = json(StdinEncoder.initialize("R")).asJsonObject.getAsJsonObject("request")
        assertEquals(true, request["perTaskStopAffordance"].asBoolean)
    }

    @Test
    fun `a user message matches the recorded shape`() {
        val line = StdinEncoder.userMessage(sessionId = "S", uuid = "U", content = "hello")

        val expected =
            """{"type":"user","message":{"role":"user","content":"hello"},""" +
                """"session_id":"S","parent_tool_use_id":null,"uuid":"U","origin":{"kind":"human"}}"""
        assertEquals(json(expected), json(line))
    }

    @Test
    fun `initialize sends arrays, not objects, for the mcp-server fields`() {
        val line = StdinEncoder.initialize(requestId = "R")

        val request = json(line).asJsonObject.getAsJsonObject("request")
        assertAll(
            {
                val expected =
                    """{"type":"control_request","request_id":"R","request":{"subtype":"initialize",""" +
                        """"hooks":{},"sdkMcpServers":[],"webSearchIsolationExemptMcpServers":[],""" +
                        """"perTaskStopAffordance":true}}"""
                assertEquals(json(expected), json(line))
            },
            // The CLI rejects `{}` here: "sdkMcpServers ... must be arrays of strings".
            { assertTrue(request.get("sdkMcpServers").isJsonArray, "sdkMcpServers must be an array") },
            {
                assertTrue(
                    request.get("webSearchIsolationExemptMcpServers").isJsonArray,
                    "webSearchIsolationExemptMcpServers must be an array",
                )
            },
            { assertTrue(request.get("hooks").isJsonObject, "hooks is an object") },
        )
    }

    @Test
    fun `initialize without the argument is byte-identical to the line written before it existed`() {
        val expected =
            """{"type":"control_request","request_id":"R","request":{"subtype":"initialize",""" +
                """"hooks":{},"sdkMcpServers":[],"webSearchIsolationExemptMcpServers":[],""" +
                """"perTaskStopAffordance":true}}"""
        assertEquals(expected, StdinEncoder.initialize("R"))
        assertEquals(expected, StdinEncoder.initialize("R", emptyList()))
    }

    @Test
    fun `initialize with server names lists them in sdkMcpServers`() {
        val line = StdinEncoder.initialize("R", listOf("ide-context", "other"))
        val expected =
            """{"type":"control_request","request_id":"R","request":{"subtype":"initialize",""" +
                """"hooks":{},"sdkMcpServers":["ide-context","other"],"webSearchIsolationExemptMcpServers":[],""" +
                """"perTaskStopAffordance":true}}"""
        assertEquals(expected, line)
    }

    @Test
    fun `an mcp answer is a success control_response carrying the JSON-RPC answer as mcp_response`() {
        val line = StdinEncoder.mcpResponse("Q", """{"jsonrpc":"2.0","id":3,"result":{"tools":[]}}""")
        val expected =
            """{"type":"control_response","response":{"subtype":"success","request_id":"Q",""" +
                """"response":{"mcp_response":{"jsonrpc":"2.0","id":3,"result":{"tools":[]}}}}}"""
        assertEquals(expected, line)
    }

    @Test
    fun `interrupt has both a control_request form and a top-level cancel form`() {
        assertAll(
            {
                assertEquals(
                    json("""{"type":"control_request","request_id":"R","request":{"subtype":"interrupt"}}"""),
                    json(StdinEncoder.interrupt("R")),
                )
            },
            {
                assertEquals(
                    json("""{"type":"control_cancel_request","request_id":"R"}"""),
                    json(StdinEncoder.cancelRequest("R")),
                )
            },
        )
    }

    @Test
    fun `stop_task is a control_request with the task id, in the shape of the SDK's SDKControlStopTaskRequest`() {
        assertEquals(
            json(
                """{"type":"control_request","request_id":"R",""" +
                    """"request":{"subtype":"stop_task","task_id":"bc4b0ae63"}}""",
            ),
            json(StdinEncoder.stopTask("R", "bc4b0ae63")),
        )
    }

    @Test
    fun `set_model and set_permission_mode carry their value`() {
        assertAll(
            {
                assertEquals(
                    json(
                        """{"type":"control_request","request_id":"R",""" +
                            """"request":{"subtype":"set_model","model":"opus"}}""",
                    ),
                    json(StdinEncoder.setModel("R", "opus")),
                )
            },
            {
                assertEquals(
                    json(
                        """{"type":"control_request","request_id":"R",""" +
                            """"request":{"subtype":"set_permission_mode","mode":"acceptEdits"}}""",
                    ),
                    json(StdinEncoder.setPermissionMode("R", "acceptEdits")),
                )
            },
        )
    }

    @Test
    fun `get_context_usage asks for the summary unless told otherwise`() {
        assertAll(
            {
                assertEquals(
                    json(
                        """{"type":"control_request","request_id":"R",""" +
                            """"request":{"subtype":"get_context_usage","detail":"summary"}}""",
                    ),
                    json(StdinEncoder.getContextUsage("R")),
                )
            },
            {
                assertEquals(
                    json(
                        """{"type":"control_request","request_id":"R",""" +
                            """"request":{"subtype":"get_context_usage","detail":"full"}}""",
                    ),
                    json(StdinEncoder.getContextUsage("R", "full")),
                )
            },
        )
    }

    @Test
    fun `rewind_files is the line the recorder sent in capture 25, apart from its request id`() {
        val lines = CaptureFixtures.nonBlankLines(CaptureFixtures.textOf("25-rewind-files.stdin.jsonl"))
        val rewinds =
            lines.filter {
                JsonParser
                    .parseString(it)
                    .asJsonObject["request"]
                    ?.asJsonObject
                    ?.get("subtype")
                    ?.asString ==
                    "rewind_files"
            }
        assertEquals(2, rewinds.size, "the capture holds a dry run and the real one")
        val uuid = "b6c26772-59e5-4ff6-b970-284be2777826"
        for ((captured, dryRun) in rewinds.zip(listOf(true, false))) {
            val id = JsonParser.parseString(captured).asJsonObject["request_id"].asString
            assertEquals(captured, StdinEncoder.rewindFiles(id, uuid, dryRun), "byte for byte, in the recorded order")
        }
    }

    @Test
    fun `a control response is keyed to the top-level request id and carries the payload verbatim`() {
        val allow = StdinEncoder.allow(requestId = "req_1", updatedInput = """{"file_path":"note.txt"}""")
        val deny = StdinEncoder.deny(requestId = "req_1", message = "not allowed")
        val cancelled = StdinEncoder.cancelled(requestId = "req_1")

        assertAll(
            {
                val expected =
                    """{"type":"control_response","response":{"subtype":"success","request_id":"req_1",""" +
                        """"response":{"behavior":"allow","updatedInput":{"file_path":"note.txt"}}}}"""
                assertEquals(json(expected), json(allow))
            },
            {
                val expected =
                    """{"type":"control_response","response":{"subtype":"success","request_id":"req_1",""" +
                        """"response":{"behavior":"deny","message":"not allowed"}}}"""
                assertEquals(json(expected), json(deny))
            },
            {
                val expected =
                    """{"type":"control_response","response":{"subtype":"success","request_id":"req_1",""" +
                        """"response":{"behavior":"cancelled"}}}"""
                assertEquals(json(expected), json(cancelled))
            },
        )
    }

    @Test
    fun `a deny without a reason carries the CLI's own rejection, never an empty message`() {
        // An empty message becomes an empty error tool_result, which the API refuses with a 400 for the rest of the
        // conversation (seen on Windows when a question was skipped).
        val rejection =
            "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file " +
                "edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to " +
                "tell you how to proceed."
        for (blank in listOf("", "  ", "\n")) {
            val expected =
                """{"type":"control_response","response":{"subtype":"success","request_id":"req_1",""" +
                    """"response":{"behavior":"deny","message":${com.google.gson.JsonPrimitive(rejection)}}}}"""
            assertEquals(json(expected), json(StdinEncoder.deny(requestId = "req_1", message = blank)))
        }
    }

    @Test
    fun `an opaque updatedInput payload is embedded whole, not flattened`() {
        val payload = """{"file_path":"a.txt","content":"multi\nline","nested":{"k":[1,2,3]}}"""

        val allow = StdinEncoder.allow(requestId = "R", updatedInput = payload)

        val embedded =
            json(allow)
                .asJsonObject
                .getAsJsonObject("response")
                .getAsJsonObject("response")
                .get("updatedInput")
        assertEquals(json(payload), embedded)
    }

    @Test
    fun `an allow with updatedPermissions has the shape recorder answered capture 16 with`() {
        val suggestions = """[{"type":"setMode","mode":"acceptEdits","destination":"session"}]"""
        val input = """{"file_path":"/tmp/x/note.txt","content":"hello-rewritten-by-host"}"""

        val line = StdinEncoder.allow("req_16", input, suggestions)

        val expected =
            """{"type":"control_response","response":{"subtype":"success","request_id":"req_16","response":""" +
                """{"behavior":"allow","updatedInput":$input,"updatedPermissions":$suggestions}}}"""
        assertEquals(json(expected), json(line))
    }

    @Test
    fun `an allow without updatedPermissions is byte for byte what it was before the parameter`() {
        val expected =
            """{"type":"control_response","response":{"subtype":"success","request_id":"req_1",""" +
                """"response":{"behavior":"allow","updatedInput":{"file_path":"note.txt"}}}}"""

        assertAll(
            { assertEquals(expected, StdinEncoder.allow("req_1", """{"file_path":"note.txt"}""")) },
            { assertEquals(expected, StdinEncoder.allow("req_1", """{"file_path":"note.txt"}""", null)) },
        )
    }

    @Test
    fun `the same arguments produce the same line, byte for byte`() {
        // Purity: no clock, no random, no IO — repeated calls are identical.
        assertAll(
            { assertEquals(StdinEncoder.userMessage("S", "U", "hi"), StdinEncoder.userMessage("S", "U", "hi")) },
            { assertEquals(StdinEncoder.initialize("R"), StdinEncoder.initialize("R")) },
            {
                assertEquals(
                    StdinEncoder.allow("R", """{"a":1}"""),
                    StdinEncoder.allow("R", """{"a":1}"""),
                )
            },
        )
    }
}
