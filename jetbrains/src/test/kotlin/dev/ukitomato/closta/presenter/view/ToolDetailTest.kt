package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ToolDetailTest {
    private fun call(
        name: String,
        vararg input: Pair<String, String>,
        result: ToolResult? = ToolResult(JsonString("ok"), false),
    ) = ToolCallRecord(
        toolUseId = "t1",
        toolName = name,
        input = JsonObject.of(*input.map { (k, v) -> k to JsonString(v) }.toTypedArray()),
        result = result,
    )

    @Test
    fun bashShowsItsCommandAndItsOutput() {
        val detail = toolDetail(call("Bash", "command" to "ls\npwd", result = ToolResult(JsonString("a\nb"), false)))
        assertEquals("ls\npwd", detail.input)
        assertEquals("a\nb", detail.output)
        assertFalse(detail.outputCut)
    }

    @Test
    fun aFailedCallShowsWhyAsItsOutput() {
        val detail = toolDetail(call("Bash", "command" to "x", result = ToolResult(JsonString("not found"), true)))
        assertEquals("not found", detail.output)
    }

    @Test
    fun textBlocksAreJoined() {
        val blocks =
            JsonArray(
                listOf(
                    JsonObject.of("type" to JsonString("text"), "text" to JsonString("one")),
                    JsonObject.of("type" to JsonString("text"), "text" to JsonString("two")),
                ),
            )
        assertEquals("one\ntwo", toolDetail(call("Agent", result = ToolResult(blocks, false))).output)
    }

    @Test
    fun noResultIsNoOutput() {
        assertNull(toolDetail(call("Bash", "command" to "x", result = null)).output)
    }

    @Test
    fun anotherToolShowsItsInputAsJson() {
        val input = toolDetail(call("WebFetch", "url" to "https://x")).input
        assertTrue(input.contains("\"url\"") && input.contains("https://x"), input)
    }

    @Test
    fun theOutputKeepsItsLast8KiB() {
        val long = "a".repeat(100) + "b".repeat(TOOL_OUTPUT_MAX)
        val detail = toolDetail(call("Bash", "command" to "x", result = ToolResult(JsonString(long), false)))
        assertEquals("b".repeat(TOOL_OUTPUT_MAX), detail.output)
        assertTrue(detail.outputCut)
        assertEquals(8 * 1024, TOOL_OUTPUT_MAX)
    }

    @Test
    fun theTargetIsTheFileOrThePattern() {
        assertEquals("/a/A.kt", toolDetail(call("Read", "file_path" to "/a/A.kt")).target)
        assertEquals("login", toolDetail(call("Grep", "pattern" to "login")).target)
        assertEquals("/a", toolDetail(call("LS", "path" to "/a")).target)
    }

    @Test
    fun exploredCountsFilesNotCalls() {
        fun row(
            key: String,
            name: String,
            vararg input: Pair<String, String>,
        ): ToolRow {
            val made = call(name, *input)
            return ToolRow(key, toolLine(made), "t-$key", name, 0, false, toolDetail(made))
        }
        val explored =
            ExploredRow(
                "k1",
                listOf(
                    row("k1", "Read", "file_path" to "/a/A.kt"),
                    row("k2", "Read", "file_path" to "/a/A.kt"),
                    row("k3", "Grep", "pattern" to "login"),
                ),
                0,
                false,
            )
        assertEquals(2, explored.files)
    }
}
