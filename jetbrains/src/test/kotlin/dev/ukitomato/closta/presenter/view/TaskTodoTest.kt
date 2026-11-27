package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import dev.ukitomato.closta.providers.claude.synthetic.StreamScript
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import com.google.gson.JsonObject as GsonObject

/** `TaskCreate` and `TaskUpdate` calls read as the to-do list they build, as `TodoWrite`'s does. */
class TaskTodoTest {
    private fun todos(transcript: Transcript) = ThreadRows().of(transcript).filterIsInstance<TodoRow>()

    private fun replay(inputs: List<PresenterInput>): Transcript =
        inputs.fold(HostState()) { state, input -> state.next(input) }.transcript

    private fun input(vararg pairs: Pair<String, String>) =
        GsonObject().apply { pairs.forEach { (key, value) -> addProperty(key, value) } }

    /** An update naming its task by a number rather than the string the type says. */
    private fun numbered(
        taskId: Int,
        vararg pairs: Pair<String, String>,
    ) = input(*pairs).apply { addProperty("taskId", taskId) }

    private fun create(subject: String) = TASK_CREATE to input("subject" to subject, "description" to subject)

    /** One turn of [calls], each in an assistant line of its own; a call with a non-null result is answered with it. */
    private fun turn(
        prompt: String,
        vararg calls: Triple<String, GsonObject, String?>,
    ): List<PresenterInput> {
        val command = "c-$prompt"
        val script =
            StreamScript().apply {
                lifecycle(command, "queued")
                lifecycle(command, "started")
                calls.forEachIndexed { index, (name, input, result) ->
                    val id = "t-$prompt-$index"
                    assistant("m-$prompt-$index", listOf(StreamScript.toolUse(id, name, input)))
                    if (result != null) toolResult(id, result)
                }
                result("done")
                lifecycle(command, "completed")
            }
        return listOf(PresenterInput.UserSent("u-$prompt", prompt, uuid = command)) +
            script.lines.map { PresenterInput.Event(StreamJsonCodec.decode(it)) }
    }

    @Test
    fun `capture 20's tasks make two lists, the second with the build in progress`() {
        val rows = ThreadRows().of(CaptureReplay.replay("20-todowrite").last().transcript)

        assertEquals(
            listOf(
                listOf(TodoItem("write tests", "pending"), TodoItem("run build", "pending")),
                listOf(TodoItem("write tests", "pending"), TodoItem("run build", "in_progress")),
            ),
            rows.filterIsInstance<TodoRow>().map { it.items },
        )
        assertTrue(rows.none { it is ToolRow && it.toolName in setOf(TASK_CREATE, TASK_UPDATE) }, rows.toString())
        assertTrue(rows.any { it is ToolRow && it.toolName == "ToolSearch" }, "other tools stay tool rows")
    }

    @Test
    fun `an update of a task not yet created adds nothing`() {
        val transcript =
            replay(
                turn(
                    "a",
                    create("write tests") answered "Task #1 created successfully: write tests",
                    (
                        TASK_UPDATE to
                            input(
                                "taskId" to "9",
                                "status" to "in_progress",
                            )
                    ) answered "Updated task #9 status",
                ),
            )

        assertEquals(listOf(listOf(TodoItem("write tests", "pending"))), todos(transcript).map { it.items })
    }

    @Test
    fun `a task updated to deleted leaves the list`() {
        val transcript =
            replay(
                turn(
                    "a",
                    create("write tests") answered "Task #1 created successfully: write tests",
                    (TASK_UPDATE to input("taskId" to "1", "status" to "deleted")) answered "Updated task #1 deleted",
                ),
            )

        assertEquals(listOf(emptyList<TodoItem>()), todos(transcript).map { it.items })
    }

    @Test
    fun `tasks not yet answered are numbered as they were created`() {
        val transcript =
            replay(
                turn(
                    "a",
                    create("write tests") answered null,
                    create("run build") answered null,
                    (TASK_UPDATE to numbered(2, "status" to "completed", "subject" to "run the build")) answered null,
                ),
            )

        assertEquals(
            listOf(listOf(TodoItem("write tests", "pending"), TodoItem("run the build", "completed"))),
            todos(transcript).map { it.items },
        )
    }

    @Test
    fun `a task not yet answered never shares its number with one the CLI numbered`() {
        val transcript =
            replay(
                turn(
                    "a",
                    create("write tests") answered null,
                    create("run build") answered "Task #1 created successfully: run build",
                    (TASK_UPDATE to input("taskId" to "1", "status" to "completed")) answered "Updated task #1 status",
                ),
            )

        assertEquals(
            listOf(listOf(TodoItem("write tests", "pending"), TodoItem("run build", "completed"))),
            todos(transcript).map { it.items },
        )
    }

    @Test
    fun `a list after a clear starts empty`() {
        val before =
            turn("before", create("before the clear") answered "Task #1 created successfully: before the clear")
        val after = turn("after", create("after the clear") answered "Task #1 created successfully: after the clear")
        val transcript = replay(before + CaptureReplay.inputs("41-clear-reset", uuids = true) + after)
        val rows = ThreadRows().of(transcript)
        val divider = rows.indexOfFirst { it is DividerRow && it.divider is Divider.Cleared }
        val lists = rows.filterIsInstance<TodoRow>()

        assertEquals(
            listOf(listOf(TodoItem("before the clear", "pending")), listOf(TodoItem("after the clear", "pending"))),
            lists.map { it.items },
        )
        assertTrue(rows.indexOf(lists.first()) < divider && rows.indexOf(lists.last()) > divider)
    }

    @Test
    fun `a run of task calls is one list, keyed by its last call and opening as its first`() {
        val transcript =
            replay(
                turn(
                    "a",
                    create("write tests") answered "Task #1 created successfully: write tests",
                    create("run build") answered "Task #2 created successfully: run build",
                ),
            )
        val reply =
            transcript.messages.values().single { message ->
                message.parts.values().any { it is ToolCallRecord }
            }
        val calls = reply.parts.order.filter { reply.parts[it] is ToolCallRecord }
        val list = todos(transcript).single()

        assertEquals(2, calls.size, "both calls in the turn's one reply")
        assertEquals("${reply.key}/${calls.last()}", list.key)
        assertEquals(reply.parts.order.first() == calls.first(), list.opens)
        assertTrue(list.opens, "the first call opens the reply")
    }

    @Test
    fun `the same transcript gives the same list objects`() {
        val transcript = CaptureReplay.replay("20-todowrite").last().transcript
        val rows = ThreadRows()
        val first = rows.of(transcript).filterIsInstance<TodoRow>()
        val second = rows.of(transcript).filterIsInstance<TodoRow>()

        assertEquals(2, first.size)
        first.zip(second).forEach { (was, now) -> assertSame(was, now) }
    }

    @Test
    fun `a list keeps its object while the thread grows after it`() {
        val steps = CaptureReplay.replay("20-todowrite")
        val both = listOf(TodoItem("write tests", "pending"), TodoItem("run build", "pending"))
        val rows = ThreadRows()
        val early =
            steps.firstNotNullOf { step ->
                rows
                    .of(step.transcript)
                    .filterIsInstance<TodoRow>()
                    .firstOrNull()
                    ?.takeIf { it.items == both }
            }
        val last = rows.of(steps.last().transcript).filterIsInstance<TodoRow>()

        assertEquals(2, last.size)
        assertSame(early, last.first())
    }

    private infix fun Pair<String, GsonObject>.answered(result: String?) = Triple(first, second, result)

    private companion object {
        const val TASK_CREATE = "TaskCreate"
        const val TASK_UPDATE = "TaskUpdate"
    }
}
