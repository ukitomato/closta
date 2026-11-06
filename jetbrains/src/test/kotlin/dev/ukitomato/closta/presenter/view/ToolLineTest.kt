package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ToolLineTest {
    private val ok = ToolResult(JsonString("done"), false)

    private fun call(
        name: String,
        vararg input: Pair<String, String>,
        result: ToolResult? = ok,
    ) = ToolCallRecord(
        toolUseId = "t1",
        toolName = name,
        input = JsonObject.of(*input.map { (k, v) -> k to JsonString(v) }.toTypedArray()),
        result = result,
    )

    @Test
    fun `edit shows the file name and line counts`() {
        val line =
            toolLine(
                call(
                    "Edit",
                    "file_path" to "/a/b/AuthService.kt",
                    "old_string" to "1\n2\n3",
                    "new_string" to (1..12).joinToString("\n"),
                ),
            )
        assertEquals(ToolLine(ToolLineState.OK, "Edit(AuthService.kt)", 12, 3), line)
    }

    @Test
    fun `write counts its content as added`() {
        val line = toolLine(call("Write", "file_path" to "/x/New.kt", "content" to "a\nb\nc\nd\ne"))
        assertEquals(ToolLine(ToolLineState.OK, "Write(New.kt)", 5, null), line)
    }

    @Test
    fun `bash shows the first line of the command`() {
        assertEquals("Bash(git status)", toolLine(call("Bash", "command" to "git status\necho x")).label)
    }

    @Test
    fun `a long summary is cut at 60 chars`() {
        val label = toolLine(call("Bash", "command" to "x".repeat(80))).label
        assertEquals("Bash(" + "x".repeat(60) + "…)", label)
    }

    @Test
    fun `no result is running and an error result is error`() {
        assertEquals(ToolLineState.RUNNING, toolLine(call("Read", "file_path" to "/a", result = null)).state)
        assertEquals(
            ToolLineState.ERROR,
            toolLine(call("Read", "file_path" to "/a", result = ToolResult(null, true))).state,
        )
    }

    @Test
    fun `an unknown tool is its name only`() {
        assertEquals("mcp__x__y", toolLine(call("mcp__x__y", "q" to "v")).label)
    }
}
