package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import dev.ukitomato.closta.providers.claude.synthetic.StreamScript
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import com.google.gson.JsonArray as GsonArray
import com.google.gson.JsonObject as GsonObject

class ThreadRowsTest {
    /** One turn as the CLI frames it: queued and started, [script]'s lines, the result, completed. */
    private fun fold(
        prompt: String,
        script: StreamScript,
        from: SessionView = SessionView(),
    ): SessionView {
        val command = "c-$prompt"
        val open =
            StreamScript().apply {
                lifecycle(command, "queued")
                lifecycle(command, "started")
            }
        val close =
            StreamScript().apply {
                result("done")
                lifecycle(command, "completed")
            }
        return (open.lines + script.lines + close.lines).fold(
            from.sent(PresenterInput.UserSent("u-$prompt", prompt, uuid = command)),
        ) { view, line -> view.event(PresenterInput.Event(StreamJsonCodec.decode(line))) }
    }

    private fun input(vararg pairs: Pair<String, String>) =
        GsonObject().apply { pairs.forEach { (key, value) -> addProperty(key, value) } }

    /** Each tool call in a message of its own, answered before the next, as the CLI sends them. */
    private fun tools(vararg calls: Pair<String, GsonObject>): StreamScript =
        StreamScript().apply {
            calls.forEachIndexed { index, (name, input) ->
                assistant("m$index", listOf(StreamScript.toolUse("t$index", name, input)))
                toolResult("t$index", "ok")
            }
        }

    @Test
    fun userMessageIsOneAskRowWithItsAttachments() {
        val transcript = CaptureReplay.replay("23-attachments").last().transcript
        val asks = ThreadRows().of(transcript).filterIsInstance<AskRow>()
        val sent =
            transcript.messages
                .values()
                .filter { it.role == Role.USER }
                .map { message -> message.parts.values().filterIsInstance<AttachmentRecord>() }
        assertEquals(sent.size, asks.size)
        assertEquals(sent, asks.map { it.attachments })
        assertTrue(asks.any { it.attachments.isNotEmpty() })
    }

    @Test
    fun readOnlyToolsInARowFoldIntoOneExploredRow() {
        val view =
            fold(
                "look",
                tools(
                    "Read" to input("file_path" to "/a/A.kt"),
                    "Grep" to input("pattern" to "login"),
                    "Read" to input("file_path" to "/a/B.kt"),
                ),
            )
        val rows = ThreadRows().of(view.transcript)
        val explored = rows.filterIsInstance<ExploredRow>()
        assertEquals(1, explored.size)
        assertEquals(3, explored.single().lines.size)
        assertTrue(rows.none { it is ToolRow })
    }

    @Test
    fun aSingleReadStaysAToolRow() {
        val rows = ThreadRows().of(fold("look", tools("Read" to input("file_path" to "/a/A.kt"))).transcript)
        assertTrue(rows.none { it is ExploredRow })
        assertEquals("Read", rows.filterIsInstance<ToolRow>().single().toolName)
    }

    @Test
    fun todoWriteIsATodoRow() {
        val todos =
            GsonObject().apply {
                add(
                    "todos",
                    GsonArray().apply {
                        add(input("content" to "方針を決める", "status" to "completed", "activeForm" to "決めている"))
                        add(input("content" to "テストを足す", "status" to "in_progress", "activeForm" to "足している"))
                    },
                )
            }
        val rows = ThreadRows().of(fold("plan", tools("TodoWrite" to todos)).transcript)
        val todo = rows.filterIsInstance<TodoRow>().single()
        assertEquals(
            listOf(TodoItem("方針を決める", "completed"), TodoItem("テストを足す", "in_progress")),
            todo.items,
        )
        assertTrue(rows.none { it is ToolRow })
    }

    @Test
    fun subagentMessagesAreNotRows() {
        val transcript = CaptureReplay.replay("08-subagent-task").last().transcript
        val rows = ThreadRows().of(transcript)
        assertTrue(rows.filterIsInstance<ToolRow>().all { it.depth == 0 })
        assertTrue(rows.filterIsInstance<ExploredRow>().all { it.depth == 0 })
        assertEquals(1, rows.filterIsInstance<ToolRow>().count { it.toolName == "Agent" || it.toolName == "Task" })
    }

    @Test
    fun unchangedMessagesKeepTheirRowObjects() {
        val first =
            fold(
                "one",
                StreamScript().apply { assistant("a1", listOf(StreamScript.text("最初の返事"))) },
            )
        val second =
            fold(
                "two",
                StreamScript().apply { streamText("a2", "二つ目の返事", 4) },
                first,
            )
        val rows = ThreadRows()
        val before = rows.of(second.transcript)
        val grown = fold("three", StreamScript().apply { streamText("a3", "三つ目", 4) }, second)
        val after = rows.of(grown.transcript)
        before.forEachIndexed { index, row -> assertSame(row, after[index]) }
        assertTrue(after.size > before.size)
    }
}
