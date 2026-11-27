package dev.ukitomato.closta.providers.claude.host

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import dev.ukitomato.closta.core.interfaces.AnalysisWait
import dev.ukitomato.closta.core.interfaces.Diagnostic
import dev.ukitomato.closta.core.interfaces.DiagnosticSeverity
import dev.ukitomato.closta.core.interfaces.Diagnostics
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.core.interfaces.SaveResult
import dev.ukitomato.closta.core.interfaces.UnsavedDocuments
import dev.ukitomato.closta.core.models.HookPhase
import dev.ukitomato.closta.core.services.DiagnosticsReport
import dev.ukitomato.closta.core.services.FileToolHooks
import dev.ukitomato.closta.providers.claude.launch.CliPaths
import dev.ukitomato.closta.providers.claude.launch.NativeCliPaths
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.concurrent.CopyOnWriteArrayList

class ClaudeFileHooksTest {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @AfterEach
    fun stop() = scope.cancel()

    private fun input(
        event: String = "PreToolUse",
        tool: String,
        key: String = "file_path",
        path: String? = "/home/u/a.kt",
        extra: String = "",
    ): JsonObject {
        val toolInput = if (path == null) "{}" else """{"$key":"$path"}"""
        return JsonParser
            .parseString("""{"hook_event_name":"$event","tool_name":"$tool","tool_input":$toolInput$extra}""")
            .asJsonObject
    }

    private object WslLike : CliPaths by NativeCliPaths {
        override fun toIde(cliPath: String) = "\\\\wsl$\\Ubuntu" + cliPath.replace('/', '\\')
    }

    @Test
    fun `type only - the path comes from each of the four tools`() {
        val cases =
            listOf(
                "Edit" to "file_path",
                "Write" to "file_path",
                "Read" to "file_path",
                "NotebookEdit" to "notebook_path",
            )
        for ((tool, key) in cases) {
            val call = fileToolCall(input(tool = tool, key = key), "t1", NativeCliPaths)
            assertNotNull(call, tool)
            assertEquals("/home/u/a.kt", call!!.path)
            assertEquals(tool, call.toolName)
            assertEquals(HookPhase.BEFORE, call.phase)
            assertEquals("t1", call.toolUseId)
        }
    }

    @Test
    fun `type only - no path, no tool use id or another tool gives nothing`() {
        assertNull(fileToolCall(input(tool = "Edit", path = null), "t1", NativeCliPaths))
        assertNull(fileToolCall(input(tool = "Edit"), null, NativeCliPaths))
        assertNull(fileToolCall(input(tool = "Bash"), "t1", NativeCliPaths))
        assertNull(fileToolCall(input(tool = "NotebookEdit"), "t1", NativeCliPaths))
    }

    @Test
    fun `type only - the tool use id and the agent id may come from the input, and PostToolUse is AFTER`() {
        val call =
            fileToolCall(
                input(event = "PostToolUse", tool = "Write", extra = ",\"tool_use_id\":\"in1\",\"agent_id\":\"ag\""),
                null,
                NativeCliPaths,
            )!!
        assertEquals(HookPhase.AFTER, call.phase)
        assertEquals("in1", call.toolUseId)
        assertEquals("ag", call.agentId)
    }

    @Test
    fun `type only - the path is turned into the IDE's form`() {
        val call = fileToolCall(input(tool = "Edit"), "t1", WslLike)!!
        assertEquals("\\\\wsl$\\Ubuntu\\home\\u\\a.kt", call.path)
    }

    @Test
    fun `type only - the hook before a file tool saves that file and answers an empty object`() =
        runBlocking {
            val saved = CopyOnWriteArrayList<String>()
            val documents =
                object : UnsavedDocuments {
                    override suspend fun saveIfModified(path: String): SaveResult {
                        saved += path
                        return SaveResult.SAVED
                    }
                }
            val hooks = ClaudeFileHooks(FileToolHooks(scope, documents, { true }, {}), WslLike)
            val answer = hooks.answer("closta-before-file-tool", input(tool = "Read"), "t1")
            assertEquals(JsonObject(), answer)
            assertEquals(listOf("\\\\wsl$\\Ubuntu\\home\\u\\a.kt"), saved.toList())
        }

    @Test
    fun `type only - an input that cannot be read is answered with an empty object, another id with null`() =
        runBlocking {
            val hooks = ClaudeFileHooks(FileToolHooks(scope, null, { true }, {}), NativeCliPaths)
            assertEquals(JsonObject(), hooks.answer("closta-before-file-tool", JsonObject(), null))
            assertNull(hooks.answer("other", input(tool = "Edit"), "t1"))
        }

    @Test
    fun `type only - a stuck save is let go within the limit and an empty object is written`() =
        runBlocking {
            val stuck =
                object : UnsavedDocuments {
                    override suspend fun saveIfModified(path: String): SaveResult {
                        kotlinx.coroutines.awaitCancellation()
                    }
                }
            val hooks =
                ClaudeFileHooks(FileToolHooks(scope, stuck, { true }, {}, saveLimitMillis = 100), NativeCliPaths)
            val start = System.nanoTime()
            val answer = hooks.answer("closta-before-file-tool", input(tool = "Edit"), "t1")
            val tookMillis = (System.nanoTime() - start) / 1_000_000
            assertEquals(JsonObject(), answer)
            assertEquals(true, tookMillis in 95..150, "took $tookMillis ms, limit 100 ms plus 50 ms")
        }

    private fun errors(
        count: Int,
        message: (Int) -> String = { "Unresolved reference 'r$it'." },
        source: String? = "kotlin",
    ) = (1..count).map { Diagnostic("/home/u/a.kt", it, 5, DiagnosticSeverity.ERROR, message(it), source) }

    @Test
    fun `type only - the context has the shape Claude is told about`() {
        val text =
            diagnosticsContext(
                DiagnosticsReport(
                    "/home/u/a.kt",
                    listOf(
                        Diagnostic(
                            "/home/u/a.kt",
                            12,
                            5,
                            DiagnosticSeverity.ERROR,
                            "Unresolved reference 'bar'.",
                            "kotlin",
                        ),
                        Diagnostic("/home/u/a.kt", 40, 1, DiagnosticSeverity.ERROR, "Expecting '}'.", null),
                    ),
                ),
                NativeCliPaths,
            )
        assertEquals(
            "<ide-diagnostics>\nThe edit added 2 new errors in /home/u/a.kt:\n" +
                "  12:5 Unresolved reference 'bar'. (kotlin)\n  40:1 Expecting '}'.\n</ide-diagnostics>",
            text,
        )
    }

    @Test
    fun `type only - one error reads 1 new error and the path is in the CLI's form`() {
        val text = diagnosticsContext(DiagnosticsReport("\\\\wsl$\\Ubuntu\\home\\u\\a.kt", errors(1)), WslLikeBack)
        assertTrue(text.contains("The edit added 1 new error in /home/u/a.kt:"), text)
    }

    private object WslLikeBack : CliPaths by NativeCliPaths {
        override fun toCli(idePath: String) = idePath.removePrefix("\\\\wsl$\\Ubuntu").replace('\\', '/')
    }

    @Test
    fun `type only - twenty-one errors give twenty lines and the count of the rest`() {
        val lines = diagnosticsContext(DiagnosticsReport("/home/u/a.kt", errors(21)), NativeCliPaths).lines()
        assertTrue(lines[1].contains("21 new errors"))
        assertEquals(20, lines.count { it.matches(Regex("""  \d+:5 .*""")) })
        assertEquals("  …and 1 more", lines[lines.size - 2])
    }

    @Test
    fun `type only - the text never passes two thousand characters, the last line saying how many are left`() {
        val long = "x".repeat(300)
        val text = diagnosticsContext(DiagnosticsReport("/home/u/a.kt", errors(20, { "$long$it" })), NativeCliPaths)
        assertTrue(text.length <= 2_000, "${text.length} characters")
        assertTrue(Regex("""  …and \d+ more\n</ide-diagnostics>""").containsMatchIn(text), text)
    }

    @Test
    fun `type only - HTML marks are taken out of a message`() {
        val text =
            diagnosticsContext(
                DiagnosticsReport("/home/u/a.kt", errors(1, { "Type <b>Int</b> &lt;T&gt; &amp; <i>more</i>" })),
                NativeCliPaths,
            )
        assertTrue(text.contains("  1:5 Type Int <T> & more (kotlin)"), text)
    }

    private fun hooksWith(report: Boolean): ClaudeFileHooks {
        val diagnostics =
            object : Diagnostics {
                var calls = 0

                override suspend fun diagnostics(path: String?) =
                    IdeResult.Ok(if (calls++ == 0) emptyList() else errors(1))
            }
        val analysis =
            object : AnalysisWait {
                override fun canAnalyse(path: String) = true

                override suspend fun refreshAndAwait(
                    path: String,
                    limitMillis: Long,
                ) = true
            }
        return ClaudeFileHooks(
            FileToolHooks(scope, null, { false }, {}, 100, diagnostics, analysis, { report }),
            NativeCliPaths,
        )
    }

    @Test
    fun `type only - the hook after an edit answers with the context, or an empty object when there is none`() =
        runBlocking {
            val hooks = hooksWith(report = true)
            hooks.answer("closta-before-file-tool", input(tool = "Edit"), "t1")
            val answer = hooks.answer("closta-after-edit", input(event = "PostToolUse", tool = "Edit"), "t1")!!
            val output = answer.getAsJsonObject("hookSpecificOutput")
            assertEquals("PostToolUse", output.get("hookEventName").asString)
            assertTrue(output.get("additionalContext").asString.contains("The edit added 1 new error in /home/u/a.kt:"))
            assertEquals(
                JsonObject(),
                hooks.answer("closta-after-edit", input(event = "PostToolUse", tool = "Edit"), "other"),
            )
            assertEquals(JsonObject(), hooks.answer("closta-after-edit", JsonObject(), null))
        }

    @Test
    fun `type only - a blocked read of the copy still answers an empty object within the limit`() =
        runBlocking {
            val stuck =
                object : Diagnostics {
                    override suspend fun diagnostics(path: String?): IdeResult<List<Diagnostic>> {
                        kotlinx.coroutines.awaitCancellation()
                    }
                }
            val analysis =
                object : AnalysisWait {
                    override fun canAnalyse(path: String) = true

                    override suspend fun refreshAndAwait(
                        path: String,
                        limitMillis: Long,
                    ) = true
                }
            val hooks =
                ClaudeFileHooks(
                    FileToolHooks(scope, null, { false }, {}, 100, stuck, analysis, { true }),
                    NativeCliPaths,
                )
            val start = System.nanoTime()
            val answer = hooks.answer("closta-before-file-tool", input(tool = "Edit"), "t1")
            val tookMillis = (System.nanoTime() - start) / 1_000_000
            assertEquals(JsonObject(), answer)
            assertTrue(tookMillis in 95..150, "took $tookMillis ms, limit 100 ms plus 50 ms")
        }
}
