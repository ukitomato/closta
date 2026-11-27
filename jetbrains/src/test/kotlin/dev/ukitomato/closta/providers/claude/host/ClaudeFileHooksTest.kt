package dev.ukitomato.closta.providers.claude.host

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import dev.ukitomato.closta.core.interfaces.SaveResult
import dev.ukitomato.closta.core.interfaces.UnsavedDocuments
import dev.ukitomato.closta.core.models.HookPhase
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
            assertEquals(true, tookMillis < 1_000, "took $tookMillis ms")
        }
}
