package dev.ukitomato.closta.core.models

import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Subagent tasks are held by `task_id` with the parent linked by id (`tool_use_id` of the spawning
 * `Agent`), and completion is decided by the *typed* `task_notification.status` — never by opening the
 * `RawJson` patch on `task_updated`. Asserted on capture 08 (one
 * subagent) and 09 (two parallel subagents).
 */
class TaskLifecycleTest {
    @Test
    fun `capture 08 keeps one subagent with a parent link, resolved complete by the notification`() {
        val state = foldCapture("08-subagent-task.ndjson")

        assertEquals(1, state.tasks.size, "08: one subagent task")
        val task = state.tasks.single()
        assertAll(
            { assertEquals("Explore", task.subagentType) },
            { assertNotNull(task.parentToolUseId, "the parent Agent's tool_use_id is held by id") },
            { assertTrue(task.parentToolUseId!!.startsWith("toolu_"), "parent link is a tool_use_id, not an index") },
            { assertEquals(1, task.spawnDepth) },
            { assertEquals(TaskStatus.COMPLETE, task.status, "completion comes from task_notification.status") },
        )
    }

    @Test
    fun `capture 09 keeps two subagents, each parent-linked and completed`() {
        val state = foldCapture("09-parallel-subagents.ndjson")

        assertEquals(2, state.tasks.size, "09: two parallel subagent tasks")
        assertAll(
            {
                assertEquals(
                    2,
                    state.tasks
                        .map { it.taskId }
                        .toSet()
                        .size,
                    "distinct task ids",
                )
            },
            {
                assertTrue(
                    state.tasks.all { it.parentToolUseId?.startsWith("toolu_") == true },
                    "each linked by tool_use_id",
                )
            },
            {
                assertTrue(
                    state.tasks.all { it.status == TaskStatus.COMPLETE },
                    "both resolved complete by notification",
                )
            },
        )
    }

    @Test
    fun `a task_started that arrives after completion does not demote the task back to running`() {
        // background_tasks_changed is non-monotonic: a completed task_id can reappear.
        // Completion (task_notification.status) is authoritative and must survive a late task_started.
        val events =
            listOf(
                taskStarted("tX", "toolu_x"),
                taskCompleted("tX", "toolu_x"),
                taskStarted("tX", "toolu_x"),
            )

        val state = events.fold(ConversationState(), ::fold)

        assertEquals(1, state.tasks.size, "still one task")
        assertEquals(
            TaskStatus.COMPLETE,
            state.tasks.single().status,
            "a late task_started must not demote a completed task to running",
        )
    }

    private companion object {
        fun foldCapture(file: String): ConversationState =
            CaptureFixtures.readCapture(file).fold(ConversationState(), ::fold)

        fun taskStarted(
            taskId: String,
            toolUseId: String,
        ): AgentEvent.SystemTaskStarted =
            AgentEvent.SystemTaskStarted(
                uuid = "u",
                sessionId = "s",
                taskId = taskId,
                toolUseId = toolUseId,
                description = "d",
                taskType = "general",
                isBackgrounded = true,
                subagentType = "general-purpose",
                spawnDepth = 1,
            )

        fun taskCompleted(
            taskId: String,
            toolUseId: String,
        ): AgentEvent.SystemTaskNotification =
            AgentEvent.SystemTaskNotification(
                uuid = "u",
                sessionId = "s",
                taskId = taskId,
                toolUseId = toolUseId,
                status = "completed",
                outputFile = "out",
                summary = "done",
            )
    }
}
