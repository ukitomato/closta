package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class RunningTasksTest {
    private fun fold(vararg lines: String): Transcript =
        lines
            .fold(SessionView()) { view, line -> view.event(PresenterInput.Event(StreamJsonCodec.decode(line))) }
            .transcript

    private fun changed(vararg tasks: String) =
        """{"type":"system","subtype":"background_tasks_changed","tasks":[${tasks.joinToString(",")}],""" +
            """"uuid":"u","session_id":"s"}"""

    private fun task(
        id: String,
        type: String = "local_agent",
        parent: String? = null,
        ambient: Boolean? = null,
    ) = buildString {
        append("""{"task_id":"$id","task_type":"$type","description":"d-$id"""")
        if (parent != null) append(""","parent_task_id":"$parent"""")
        if (ambient != null) append(""","ambient":$ambient""")
        append("}")
    }

    private fun progress(
        id: String,
        tool: String,
        ms: Long,
    ) = """{"type":"system","subtype":"task_progress","task_id":"$id","tool_use_id":"toolu_$id",""" +
        """"description":"Running","subagent_type":"general-purpose",""" +
        """"usage":{"total_tokens":1,"tool_uses":1,"duration_ms":$ms},"last_tool_name":"$tool",""" +
        """"uuid":"u","session_id":"s"}"""

    @Test
    fun ambientTasksAreHidden() {
        val tasks = runningTasks(fold(changed(task("a"), task("w", ambient = true))))
        assertEquals(listOf("a"), tasks.map { it.taskId })
    }

    @Test
    fun childTasksAreIndented() {
        val transcript =
            fold(
                changed(
                    task("a"),
                    task("b"),
                    task("sh", type = "local_bash", parent = "a"),
                    task("x", parent = "gone"),
                ),
            )
        val tasks = runningTasks(transcript)
        assertEquals(listOf("a" to 0, "sh" to 1, "b" to 0, "x" to 0), tasks.map { it.taskId to it.depth })
        assertEquals("shell", tasks[1].kind)
        assertEquals("agent", tasks[0].kind)
    }

    @Test
    fun finishedTasksLeave() {
        val transcript = fold(changed(task("a"), task("b")), changed(task("b")))
        assertEquals(listOf("b"), runningTasks(transcript).map { it.taskId })
        assertTrue(runningTasks(fold(changed(task("a")), changed())).isEmpty())
    }

    @Test
    fun progressGivesTheLastToolAndTheTimeSoFar() {
        val transcript = fold(changed(task("a")), progress("a", "Read", 1_000), progress("a", "Bash", 2_500))
        val only = runningTasks(transcript).single()
        assertEquals("Bash", only.detail)
        assertEquals(2_500L, only.elapsedMs)
        assertEquals("toolu_a", only.toolUseId)
        assertEquals("d-a", only.title)
    }

    @Test
    fun capture10ListsTheBackgroundAgentWhileItRuns() {
        val views = CaptureReplay.replay("10-background-task")
        val seen = views.map { runningTasks(it.transcript) }.filter { it.isNotEmpty() }
        assertTrue(seen.isNotEmpty())
        assertEquals("agent", seen.first().first().kind)
        assertTrue(runningTasks(views.last().transcript).isEmpty())
    }

    @Test
    fun agentRowsAreTheSubagentsMessages() {
        val transcript = CaptureReplay.replay("12-subagent-permission").last().transcript
        val agent = ThreadRows().of(transcript).filterIsInstance<ToolRow>().first { it.toolName in AGENT_TOOLS }
        val rows = agentRows(transcript, agent.toolUseId)
        assertTrue(rows.isNotEmpty())
        assertTrue(rows.none { it is AskRow && it.key == agent.key })
        assertTrue(agentRows(transcript, "no-such-call").isEmpty())
    }
}
