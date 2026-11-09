// JSON wire lines are written whole, so that what is measured can be read as sent.
@file:Suppress("MaxLineLength")

package dev.ukitomato.closta.providers.claude.mcp

import com.google.gson.JsonObject
import dev.ukitomato.closta.core.interfaces.Diagnostic
import dev.ukitomato.closta.core.interfaces.DiagnosticSeverity
import dev.ukitomato.closta.core.interfaces.Diagnostics
import dev.ukitomato.closta.core.interfaces.IdeBridge
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.providers.claude.launch.cliPathsFor
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** What `ide-context` hands the IDE and tells the CLI when the project is in WSL. */
class IdeContextServerPathsTest {
    private val ideFile = "//wsl.localhost/Ubuntu/home/u/proj/a.kt"
    private val found = Diagnostic(ideFile, 3, 5, DiagnosticSeverity.ERROR, "Unresolved reference: foo", "kotlin")
    private val wsl = cliPathsFor("//wsl.localhost/Ubuntu/home/u/proj", ideOnWindows = true)

    private class Fake(
        private val answer: List<Diagnostic>,
    ) : Diagnostics {
        val asked = mutableListOf<String?>()

        override suspend fun diagnostics(path: String?): IdeResult<List<Diagnostic>> {
            asked += path
            return IdeResult.Ok(answer)
        }
    }

    private fun call(
        server: SdkMcpServer,
        arguments: String,
    ): JsonObject =
        runBlocking {
            server.handle(
                json(
                    """{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"getDiagnostics","arguments":$arguments}}""",
                ),
            )!!
        }

    private fun uris(answer: JsonObject): List<String> {
        val text =
            answer
                .getAsJsonObject("result")
                .getAsJsonArray("content")[0]
                .asJsonObject
                .get("text")
                .asString
        return json("""{"x":$text}""").getAsJsonArray("x").map { it.asJsonObject.get("uri").asString }
    }

    @Test
    fun `a file URI and a Linux path reach the IDE as the UNC path, and the uri told back is the Linux one`() {
        val fake = Fake(listOf(found))
        val server = IdeContextServer(fake, wsl)
        val first = call(server, """{"uri":"file:///home/u/proj/a.kt"}""")
        val second = call(server, """{"uri":"/home/u/proj/a.kt"}""")
        assertEquals(listOf<String?>(ideFile, ideFile), fake.asked)
        assertEquals(listOf("file:///home/u/proj/a.kt"), uris(first))
        assertEquals(listOf("file:///home/u/proj/a.kt"), uris(second))
    }

    @Test
    fun `with no mouth given the argument and the uri are as before`() {
        val fake = Fake(listOf(Diagnostic("/work/A.kt", 3, 5, DiagnosticSeverity.ERROR, "m", null)))
        val server = IdeContextServer(fake)
        val answer = call(server, """{"uri":"file:///work/A.kt"}""")
        assertEquals(listOf<String?>("/work/A.kt"), fake.asked)
        assertEquals(listOf("file:///work/A.kt"), uris(answer))
    }

    @Test
    fun `an argument that is not a file path of the project is refused as before`() {
        val fake = Fake(emptyList())
        val server = IdeContextServer(fake, wsl)
        listOf("file://host/home/u/a.kt", "file:foo", "src/a.kt", "file:///home/u/a.kt?x=1").forEach {
            val answer = call(server, """{"uri":"$it"}""")
            assertEquals(true, answer.getAsJsonObject("result").get("isError").asBoolean, it)
        }
        assertEquals(emptyList<String?>(), fake.asked)
    }

    @Test
    fun `the servers made for a bridge use the mouth they are given`() {
        val fake = Fake(listOf(found))
        val bridge =
            object : IdeBridge {
                override fun projectBasePath(): String = "/work"

                override val diagnostics: Diagnostics = fake
            }
        val answer = call(ideContextServers(bridge, wsl).single(), """{"uri":"/home/u/proj/a.kt"}""")
        assertEquals(listOf<String?>(ideFile), fake.asked)
        assertEquals(listOf("file:///home/u/proj/a.kt"), uris(answer))
    }
}
