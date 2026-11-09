// JSON wire lines are written whole, so that what is measured can be read as sent.
@file:Suppress("MaxLineLength")

package dev.ukitomato.closta.providers.claude.mcp

import com.google.gson.JsonObject
import dev.ukitomato.closta.core.interfaces.Diagnostic
import dev.ukitomato.closta.core.interfaces.DiagnosticSeverity
import dev.ukitomato.closta.core.interfaces.Diagnostics
import dev.ukitomato.closta.core.interfaces.IdeBridge
import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.core.interfaces.IdeResult
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** What `ide-context` answers, and the name it is served under. */
class IdeContextServerTest {
    private class FakeDiagnostics(
        private val answer: (String?) -> IdeResult<List<Diagnostic>>,
    ) : Diagnostics {
        val asked = mutableListOf<String?>()

        override suspend fun diagnostics(path: String?): IdeResult<List<Diagnostic>> {
            asked += path
            return answer(path)
        }
    }

    private val one = Diagnostic("/work/A.kt", 3, 5, DiagnosticSeverity.ERROR, "Unresolved reference: foo", "kotlin")

    private fun ask(
        server: IdeContextServer,
        body: String,
    ): JsonObject? = runBlocking { server.handle(json("""{"jsonrpc":"2.0",$body}""")) }

    private fun server(answer: (String?) -> IdeResult<List<Diagnostic>> = { IdeResult.Ok(listOf(one)) }) =
        FakeDiagnostics(answer).let { it to IdeContextServer(it) }

    @Test
    fun `initialize answers with tools capability and the server's own name`() {
        val result =
            ask(
                server().second,
                """"id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}""",
            )!!
        assertEquals("2.0", result.get("jsonrpc").asString)
        assertEquals(1, result.get("id").asInt)
        val body = result.getAsJsonObject("result")
        assertEquals("2025-06-18", body.get("protocolVersion").asString)
        assertTrue(body.getAsJsonObject("capabilities").has("tools"))
        assertEquals("ide-context", body.getAsJsonObject("serverInfo").get("name").asString)
    }

    @Test
    fun `initialize answers an asked version it does not know with its own default`() {
        fun versionFor(asked: String): String =
            ask(server().second, """"id":1,"method":"initialize","params":{"protocolVersion":"$asked"}""")!!
                .getAsJsonObject("result")
                .get("protocolVersion")
                .asString
        assertEquals("2024-11-05", versionFor("2099-01-01"))
        assertEquals("2024-11-05", versionFor(""))
        assertEquals("2025-03-26", versionFor("2025-03-26"))
        assertEquals(
            "2024-11-05",
            ask(server().second, """"id":1,"method":"initialize"""")!!
                .getAsJsonObject("result")
                .get("protocolVersion")
                .asString,
        )
    }

    @Test
    fun `a notification gets no answer from the server`() {
        assertNull(ask(server().second, """"method":"notifications/initialized""""))
    }

    @Test
    fun `tools list has getDiagnostics with an input schema`() {
        val tools =
            ask(
                server().second,
                """"id":2,"method":"tools/list"""",
            )!!.getAsJsonObject("result").getAsJsonArray("tools")
        assertEquals(1, tools.size())
        val tool = tools[0].asJsonObject
        assertEquals("getDiagnostics", tool.get("name").asString)
        val schema = tool.getAsJsonObject("inputSchema")
        assertEquals("object", schema.get("type").asString)
        val description = tool.get("description").asString
        assertTrue(description.contains("open in the IDE"), description)
        assertTrue(description.contains("1-based"), description)
        assertEquals(
            "string",
            schema
                .getAsJsonObject("properties")
                .getAsJsonObject("uri")
                .get("type")
                .asString,
        )
    }

    @Test
    fun `a call without a uri asks for every open file and returns text content`() {
        val (fake, server) = server()
        val result = ask(server, """"id":3,"method":"tools/call","params":{"name":"getDiagnostics","arguments":{}}""")!!
        assertEquals(listOf<String?>(null), fake.asked)
        val call = result.getAsJsonObject("result")
        assertFalse(call.get("isError").asBoolean)
        val content = call.getAsJsonArray("content")[0].asJsonObject
        assertEquals("text", content.get("type").asString)
        val files = json("""{"x":${content.get("text").asString}}""").getAsJsonArray("x")
        val entry = files[0].asJsonObject.getAsJsonArray("diagnostics")[0].asJsonObject
        assertEquals("Error", entry.get("severity").asString)
        assertEquals("Unresolved reference: foo", entry.get("message").asString)
        assertEquals(
            3,
            entry
                .getAsJsonObject("range")
                .getAsJsonObject("start")
                .get("line")
                .asInt,
        )
    }

    @Test
    fun `a file URI and an absolute path both name the file`() {
        val (fake, server) = server()
        ask(
            server,
            """"id":4,"method":"tools/call","params":{"name":"getDiagnostics","arguments":{"uri":"file:///work/A.kt"}}""",
        )
        ask(
            server,
            """"id":5,"method":"tools/call","params":{"name":"getDiagnostics","arguments":{"uri":"/work/B.kt"}}""",
        )
        assertEquals(listOf<String?>("/work/A.kt", "/work/B.kt"), fake.asked)
    }

    @Test
    fun `broken arguments are an isError result and the seam is not called`() {
        val (fake, server) = server()
        listOf(
            """"arguments":{"uri":5}""",
            """"arguments":{"uri":"relative/A.kt"}""",
            """"arguments":"nope"""",
            """"arguments":{"uri":"file://bad host/x y"}""",
        ).forEach { arguments ->
            val call =
                ask(
                    server,
                    """"id":6,"method":"tools/call","params":{"name":"getDiagnostics",$arguments}""",
                )!!.getAsJsonObject("result")
            assertTrue(call.get("isError").asBoolean, arguments)
        }
        assertTrue(fake.asked.isEmpty())
    }

    @Test
    fun `a refusal from the host is an isError result whose text is ours, not the host's`() {
        val secret = "SECRET-MARK-8841 /home/me/.aws/credentials contents"
        val (_, server) = server { IdeResult.Failed(IdeFailureKind.FAILED, secret) }
        val call = ask(server, """"id":7,"method":"tools/call","params":{"name":"getDiagnostics"}""")!!
        assertTrue(call.getAsJsonObject("result").get("isError").asBoolean)
        assertFalse(call.toString().contains("SECRET-MARK"))
    }

    @Test
    fun `a file that is not open is an isError result that says to open it`() {
        val (_, server) =
            server { IdeResult.Failed(IdeFailureKind.UNAVAILABLE, "the file is not open in the IDE, so open it") }
        val call =
            ask(
                server,
                """"id":7,"method":"tools/call","params":{"name":"getDiagnostics","arguments":{"uri":"/work/A.kt"}}""",
            )!!.getAsJsonObject("result")
        assertTrue(call.get("isError").asBoolean)
        val text =
            call
                .getAsJsonArray("content")[0]
                .asJsonObject
                .get("text")
                .asString
        assertTrue(text.contains("open in the IDE"), text)
    }

    @Test
    fun `ping answers an empty result, an unknown method is method not found, an unknown tool is invalid params`() {
        val server = server().second
        assertEquals(0, ask(server, """"id":8,"method":"ping"""")!!.getAsJsonObject("result").size())
        assertEquals(
            -32601,
            ask(server, """"id":9,"method":"resources/list"""")!!.getAsJsonObject("error").get("code").asInt,
        )
        assertEquals(
            -32602,
            ask(
                server,
                """"id":10,"method":"tools/call","params":{"name":"other"}""",
            )!!.getAsJsonObject("error").get("code").asInt,
        )
    }

    @Test
    fun `no diagnostics seam means no servers, and with one the server is not named ide`() {
        val bare =
            object : IdeBridge {
                override fun projectBasePath(): String? = null
            }
        assertTrue(ideContextServers(bare).isEmpty())
        val withDiagnostics =
            object : IdeBridge {
                override fun projectBasePath(): String? = null

                override val diagnostics: Diagnostics = FakeDiagnostics { IdeResult.Ok(emptyList()) }
            }
        val servers = ideContextServers(withDiagnostics)
        assertEquals(1, servers.size)
        assertNotEquals("ide", servers.single().name)
        assertEquals("ide-context", servers.single().name)
    }
}
