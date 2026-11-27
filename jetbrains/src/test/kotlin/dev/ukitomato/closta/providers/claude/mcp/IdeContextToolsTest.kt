// JSON wire lines are written whole, so that what is measured can be read as sent.
@file:Suppress("MaxLineLength")

package dev.ukitomato.closta.providers.claude.mcp

import com.google.gson.JsonObject
import dev.ukitomato.closta.core.interfaces.Diagnostic
import dev.ukitomato.closta.core.interfaces.Diagnostics
import dev.ukitomato.closta.core.interfaces.EditorOpening
import dev.ukitomato.closta.core.interfaces.EditorSelections
import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.core.interfaces.OpenEditor
import dev.ukitomato.closta.core.interfaces.OpenEditors
import dev.ukitomato.closta.core.interfaces.SaveResult
import dev.ukitomato.closta.core.interfaces.SelectedText
import dev.ukitomato.closta.core.interfaces.UnsavedDocuments
import dev.ukitomato.closta.providers.claude.launch.CliPaths
import dev.ukitomato.closta.providers.claude.launch.NativeCliPaths
import dev.ukitomato.closta.providers.claude.launch.cliPathsFor
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The tools of `ide-context` other than `getDiagnostics`. Their shapes are the server's own: no recording exists. */
class IdeContextToolsTest {
    private class Editors(
        private val answer: IdeResult<List<OpenEditor>>,
    ) : OpenEditors {
        override suspend fun list(): IdeResult<List<OpenEditor>> = answer
    }

    private class Selections(
        private val answer: IdeResult<SelectedText?>,
    ) : EditorSelections {
        override suspend fun current(): IdeResult<SelectedText?> = answer
    }

    private class Documents(
        private val modified: Map<String, Boolean> = emptyMap(),
        private val saved: SaveResult = SaveResult.SAVED,
    ) : UnsavedDocuments {
        val asked = mutableListOf<String>()

        override suspend fun saveIfModified(path: String): SaveResult {
            asked += "save $path"
            return saved
        }

        override suspend fun isModified(path: String): Boolean? {
            asked += "check $path"
            return modified[path]
        }
    }

    private class Opening(
        private val answer: IdeResult<Unit> = IdeResult.Ok(Unit),
    ) : EditorOpening {
        val opened = mutableListOf<Pair<String, Int?>>()

        override suspend fun open(
            path: String,
            line: Int?,
        ): IdeResult<Unit> {
            opened += path to line
            return answer
        }
    }

    private fun call(
        ide: FakeIde,
        tool: String,
        arguments: String = "{}",
        paths: CliPaths = NativeCliPaths,
    ): JsonObject =
        runBlocking {
            IdeContextServer(ide, paths)
                .handle(
                    json(
                        """{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"$tool","arguments":$arguments}}""",
                    ),
                )!!
        }

    private fun resultOf(answer: JsonObject): JsonObject = answer.getAsJsonObject("result")

    private fun textOf(answer: JsonObject): String =
        resultOf(answer)
            .getAsJsonArray("content")[0]
            .asJsonObject
            .get("text")
            .asString

    private fun bodyOf(answer: JsonObject): JsonObject {
        assertFalse(resultOf(answer).get("isError").asBoolean, textOf(answer))
        return json(textOf(answer))
    }

    private fun assertRefused(answer: JsonObject) =
        assertTrue(resultOf(answer).get("isError").asBoolean, answer.toString())

    private fun toolNames(ide: FakeIde): List<String> =
        runBlocking { IdeContextServer(ide).handle(json("""{"jsonrpc":"2.0","id":1,"method":"tools/list"}""")) }!!
            .getAsJsonObject("result")
            .getAsJsonArray("tools")
            .map { it.asJsonObject.get("name").asString }

    private val allSeams =
        FakeIde(
            diagnostics =
                object : Diagnostics {
                    override suspend fun diagnostics(path: String?): IdeResult<List<Diagnostic>> =
                        IdeResult.Ok(emptyList())
                },
            editorSelections = Selections(IdeResult.Ok(null)),
            unsavedDocuments = Documents(),
            openEditors = Editors(IdeResult.Ok(emptyList())),
            editorOpening = Opening(),
        )

    @Test
    fun `type only - tools list names only the tools whose seams exist`() {
        assertEquals(
            listOf(
                "getDiagnostics",
                "getOpenEditors",
                "getCurrentSelection",
                "checkDocumentDirty",
                "saveDocument",
                "openFile",
            ),
            toolNames(allSeams),
        )
        assertEquals(listOf("getOpenEditors"), toolNames(FakeIde(openEditors = Editors(IdeResult.Ok(emptyList())))))
        assertEquals(listOf("checkDocumentDirty", "saveDocument"), toolNames(FakeIde(unsavedDocuments = Documents())))
        assertEquals(listOf("openFile"), toolNames(FakeIde(editorOpening = Opening())))
        assertEquals(
            listOf("getCurrentSelection"),
            toolNames(FakeIde(editorSelections = Selections(IdeResult.Ok(null)))),
        )
    }

    @Test
    fun `type only - a tool whose seam is missing is an unknown tool`() {
        val answer =
            call(FakeIde(openEditors = Editors(IdeResult.Ok(emptyList()))), "openFile", """{"uri":"/work/A.kt"}""")
        assertEquals(-32602, answer.getAsJsonObject("error").get("code").asInt)
    }

    @Test
    fun `a server is made without diagnostics when another seam exists`() {
        assertTrue(ideContextServers(FakeIde()).isEmpty())
        listOf(
            FakeIde(openEditors = Editors(IdeResult.Ok(emptyList()))),
            FakeIde(editorSelections = Selections(IdeResult.Ok(null))),
            FakeIde(unsavedDocuments = Documents()),
            FakeIde(editorOpening = Opening()),
        ).forEach { assertEquals(listOf("ide-context"), ideContextServers(it).map(SdkMcpServer::name)) }
    }

    @Test
    fun `type only - readOnlyHint is on the three tools that only read`() {
        val tools =
            runBlocking {
                IdeContextServer(
                    allSeams,
                ).handle(json("""{"jsonrpc":"2.0","id":1,"method":"tools/list"}"""))
            }!!
                .getAsJsonObject("result")
                .getAsJsonArray("tools")
                .map { it.asJsonObject }
        val hinted =
            tools
                .filter { it.getAsJsonObject("annotations")?.get("readOnlyHint")?.asBoolean == true }
                .map { it.get("name").asString }
        assertEquals(listOf("getOpenEditors", "getCurrentSelection", "checkDocumentDirty"), hinted)
        tools.forEach { assertTrue(it.get("description").asString.isNotBlank()) }
        tools.forEach { assertEquals("object", it.getAsJsonObject("inputSchema").get("type").asString) }
    }

    @Test
    fun `type only - getOpenEditors lists the tabs in order with their flags`() {
        val ide =
            FakeIde(
                openEditors =
                    Editors(
                        IdeResult.Ok(
                            listOf(
                                OpenEditor("/work/A.kt", active = false, modified = true),
                                OpenEditor("/work/B.kt", true, false),
                            ),
                        ),
                    ),
            )
        val editors = bodyOf(call(ide, "getOpenEditors")).getAsJsonArray("editors")
        assertEquals(listOf("/work/A.kt", "/work/B.kt"), editors.map { it.asJsonObject.get("path").asString })
        assertEquals(listOf(false, true), editors.map { it.asJsonObject.get("active").asBoolean })
        assertEquals(listOf(true, false), editors.map { it.asJsonObject.get("modified").asBoolean })
    }

    @Test
    fun `type only - getOpenEditors gives at most 100 and says so`() {
        val many = (1..150).map { OpenEditor("/work/F$it.kt", active = it == 1, modified = false) }
        val body = bodyOf(call(FakeIde(openEditors = Editors(IdeResult.Ok(many))), "getOpenEditors"))
        assertEquals(100, body.getAsJsonArray("editors").size())
        assertEquals(
            "/work/F100.kt",
            body
                .getAsJsonArray("editors")[99]
                .asJsonObject
                .get("path")
                .asString,
        )
        assertTrue(body.get("truncated").asBoolean)
        val few = bodyOf(call(FakeIde(openEditors = Editors(IdeResult.Ok(many.take(100)))), "getOpenEditors"))
        assertFalse(few.has("truncated"))
    }

    @Test
    fun `type only - the tools without a uri refuse unknown arguments, and a host failure is our sentence`() {
        val secret = "SECRET-MARK-77 /home/me/.ssh/id_rsa"
        val ide =
            FakeIde(
                openEditors = Editors(IdeResult.Failed(IdeFailureKind.FAILED, secret)),
                editorSelections = Selections(IdeResult.Failed(IdeFailureKind.UNAVAILABLE, secret)),
            )
        listOf("getOpenEditors", "getCurrentSelection").forEach { tool ->
            assertRefused(call(ide, tool, """{"extra":1}"""))
            assertRefused(call(ide, tool, "\"nope\""))
            val failed = call(ide, tool)
            assertRefused(failed)
            assertFalse(failed.toString().contains("SECRET-MARK"))
            assertTrue(textOf(failed).startsWith("$tool failed: "), textOf(failed))
        }
    }

    @Test
    fun `type only - getCurrentSelection makes a project-relative path absolute and leaves an absolute one`() {
        val relative = SelectedText("src/A.kt", 3, 5, "fun a()")
        assertEquals(
            "/work/src/A.kt",
            bodyOf(
                call(FakeIde(editorSelections = Selections(IdeResult.Ok(relative))), "getCurrentSelection"),
            ).get("path").asString,
        )
        val outside = SelectedText("/etc/hosts", 1, 1, "x")
        val body = bodyOf(call(FakeIde(editorSelections = Selections(IdeResult.Ok(outside))), "getCurrentSelection"))
        assertEquals("/etc/hosts", body.get("path").asString)
        assertEquals(1, body.get("startLine").asInt)
        assertEquals(1, body.get("endLine").asInt)
        assertEquals("x", body.get("text").asString)
        assertFalse(body.has("truncated"))
    }

    @Test
    fun `type only - getCurrentSelection with nothing selected is selection null`() {
        val body = bodyOf(call(FakeIde(editorSelections = Selections(IdeResult.Ok(null))), "getCurrentSelection"))
        assertTrue(body.has("selection"))
        assertTrue(body.get("selection").isJsonNull)
    }

    @Test
    fun `type only - getCurrentSelection cuts the text at 64 KiB without splitting a character`() {
        val limit = 64 * 1024
        val ide = { text: String ->
            FakeIde(editorSelections = Selections(IdeResult.Ok(SelectedText("A.kt", 1, 9, text))))
        }
        val plain = bodyOf(call(ide("a".repeat(limit + 10)), "getCurrentSelection"))
        assertEquals(
            limit,
            plain
                .get("text")
                .asString
                .toByteArray()
                .size,
        )
        assertTrue(plain.get("truncated").asBoolean)
        // 3-byte characters: 65536 is not a multiple of 3, so the cut backs off to a boundary.
        val wide = bodyOf(call(ide("あ".repeat(30_000)), "getCurrentSelection"))
        val kept = wide.get("text").asString
        assertEquals(limit / 3, kept.length)
        assertTrue(kept.all { it == 'あ' })
        assertTrue(wide.get("truncated").asBoolean)
        val exact = bodyOf(call(ide("a".repeat(limit)), "getCurrentSelection"))
        assertEquals(limit, exact.get("text").asString.length)
        assertFalse(exact.has("truncated"))
    }

    @Test
    fun `type only - checkDocumentDirty tells open and modified, and a file that is not open is not an error`() {
        val ide = FakeIde(unsavedDocuments = Documents(mapOf("/work/A.kt" to true, "/work/B.kt" to false)))

        fun check(uri: String) = bodyOf(call(ide, "checkDocumentDirty", """{"uri":"$uri"}"""))
        val dirty = check("file:///work/A.kt")
        assertEquals("/work/A.kt", dirty.get("path").asString)
        assertTrue(dirty.get("open").asBoolean)
        assertTrue(dirty.get("modified").asBoolean)
        val clean = check("/work/B.kt")
        assertTrue(clean.get("open").asBoolean)
        assertFalse(clean.get("modified").asBoolean)
        val closed = check("/work/C.kt")
        assertFalse(closed.get("open").asBoolean)
        assertFalse(closed.get("modified").asBoolean)
    }

    @Test
    fun `type only - checkDocumentDirty answers for a file outside the project too`() {
        val ide = FakeIde(unsavedDocuments = Documents(mapOf("/other/A.kt" to true)))
        assertTrue(bodyOf(call(ide, "checkDocumentDirty", """{"uri":"/other/A.kt"}""")).get("modified").asBoolean)
    }

    @Test
    fun `type only - the tools with a uri refuse a missing, bad or unknown argument and do not call the seam`() {
        val docs = Documents()
        val opening = Opening()
        val ide = FakeIde(unsavedDocuments = docs, editorOpening = opening)
        listOf("checkDocumentDirty", "saveDocument", "openFile").forEach { tool ->
            listOf(
                "{}",
                """{"uri":5}""",
                """{"uri":"relative/A.kt"}""",
                """{"uri":"/work/A.kt","extra":1}""",
                "\"nope\"",
                "null",
            ).forEach {
                assertRefused(call(ide, tool, it))
            }
        }
        assertTrue(docs.asked.isEmpty())
        assertTrue(opening.opened.isEmpty())
    }

    @Test
    fun `type only - saveDocument reports each result`() {
        val expected =
            mapOf(
                SaveResult.SAVED to "saved",
                SaveResult.NOT_MODIFIED to "not_modified",
                SaveResult.NOT_OPEN to "not_open",
                SaveResult.FAILED to "failed",
            )
        expected.forEach { (result, word) ->
            val docs = Documents(saved = result)
            val body = bodyOf(call(FakeIde(unsavedDocuments = docs), "saveDocument", """{"uri":"file:///work/A.kt"}"""))
            assertEquals(word, body.get("result").asString)
            assertEquals("/work/A.kt", body.get("path").asString)
            assertEquals(listOf("save /work/A.kt"), docs.asked)
        }
    }

    @Test
    fun `type only - saveDocument and openFile refuse a file outside the project with a fixed sentence`() {
        val docs = Documents()
        val opening = Opening()
        val ide = FakeIde(unsavedDocuments = docs, editorOpening = opening)
        val outside = listOf("/etc/hosts", "/work/../etc/hosts", "/workshop/A.kt")
        outside.forEach {
            val save = call(ide, "saveDocument", """{"uri":"$it"}""")
            assertRefused(save)
            assertEquals("the file is not in the project", textOf(save))
            val open = call(ide, "openFile", """{"uri":"$it"}""")
            assertRefused(open)
            assertEquals("the file is not in the project", textOf(open))
        }
        assertTrue(docs.asked.isEmpty())
        assertTrue(opening.opened.isEmpty())
        assertRefused(call(FakeIde(base = null, unsavedDocuments = docs), "saveDocument", """{"uri":"/work/A.kt"}"""))
    }

    @Test
    fun `type only - openFile opens the file at a line, or at none`() {
        val opening = Opening()
        val ide = FakeIde(editorOpening = opening)
        val first = bodyOf(call(ide, "openFile", """{"uri":"file:///work/src/A.kt","line":12}"""))
        assertEquals("/work/src/A.kt", first.get("path").asString)
        assertTrue(first.get("opened").asBoolean)
        bodyOf(call(ide, "openFile", """{"uri":"/work/B.kt"}"""))
        bodyOf(call(ide, "openFile", """{"uri":"/work/C.kt","line":null}"""))
        assertEquals(listOf("/work/src/A.kt" to 12, "/work/B.kt" to null, "/work/C.kt" to null), opening.opened)
    }

    @Test
    fun `type only - openFile refuses a line that is not a positive whole number`() {
        val opening = Opening()
        val ide = FakeIde(editorOpening = opening)
        listOf("0", "-3", "1.5", "\"7\"", "true").forEach {
            assertRefused(call(ide, "openFile", """{"uri":"/work/A.kt","line":$it}"""))
        }
        assertTrue(opening.opened.isEmpty())
    }

    @Test
    fun `type only - openFile that the host refuses is an isError result in our words`() {
        val ide = FakeIde(editorOpening = Opening(IdeResult.Failed(IdeFailureKind.NOT_FOUND, "SECRET-MARK-5 /home/me")))
        val answer = call(ide, "openFile", """{"uri":"/work/A.kt"}""")
        assertRefused(answer)
        assertEquals("openFile failed: the file was not found", textOf(answer))
    }

    @Test
    fun `an OpenEditor does not print its path`() {
        assertFalse(OpenEditor("/home/secret/A.kt", active = true, modified = false).toString().contains("secret"))
    }

    @Test
    fun `type only - a WSL project gets Linux paths back and the IDE gets UNC paths`() {
        val wsl = cliPathsFor("//wsl.localhost/Ubuntu/home/u/proj", ideOnWindows = true)
        val unc = "//wsl.localhost/Ubuntu/home/u/proj/a.kt"
        val docs = Documents(mapOf(unc to true))
        val opening = Opening()
        val ide =
            FakeIde(
                base = "//wsl.localhost/Ubuntu/home/u/proj",
                openEditors = Editors(IdeResult.Ok(listOf(OpenEditor(unc, active = true, modified = true)))),
                editorSelections = Selections(IdeResult.Ok(SelectedText("a.kt", 1, 2, "t"))),
                unsavedDocuments = docs,
                editorOpening = opening,
            )
        val editors = bodyOf(call(ide, "getOpenEditors", paths = wsl)).getAsJsonArray("editors")
        assertEquals("/home/u/proj/a.kt", editors[0].asJsonObject.get("path").asString)
        assertEquals("/home/u/proj/a.kt", bodyOf(call(ide, "getCurrentSelection", paths = wsl)).get("path").asString)
        val dirty = bodyOf(call(ide, "checkDocumentDirty", """{"uri":"file:///home/u/proj/a.kt"}""", wsl))
        assertEquals("/home/u/proj/a.kt", dirty.get("path").asString)
        assertTrue(dirty.get("modified").asBoolean)
        bodyOf(call(ide, "saveDocument", """{"uri":"/home/u/proj/a.kt"}""", wsl))
        val body = bodyOf(call(ide, "openFile", """{"uri":"/home/u/proj/a.kt","line":3}""", wsl))
        assertEquals("/home/u/proj/a.kt", body.get("path").asString)
        assertEquals(listOf("check $unc", "save $unc"), docs.asked)
        assertEquals(listOf(unc to 3), opening.opened)
        assertRefused(call(ide, "openFile", """{"uri":"/home/u/other/a.kt"}""", wsl))
        assertEquals(1, opening.opened.size)
    }
}
