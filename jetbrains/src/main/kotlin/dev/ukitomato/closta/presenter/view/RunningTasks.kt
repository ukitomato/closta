package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead

// The running list above the composer (spec 2026-11-03-running-tasks.md): what runs in the background, read from the
// CLI's own lists. The fold keeps the last list whole (the CLI replaces it every time) and the last progress of each.

/** One entry of `background_tasks_changed`'s `tasks[]`. */
data class BackgroundTaskRecord(
    val taskId: String,
    val taskType: String,
    val description: String,
    val subagentType: String?,
    val parentTaskId: String?,
    val ambient: Boolean,
)

/** The last `task_progress` of a task: its last tool and the time it had run then. */
data class TaskProgressRecord(
    val lastToolName: String,
    val durationMs: Long?,
    val toolUseId: String?,
)

data class BackgroundTasks(
    val live: List<BackgroundTaskRecord> = emptyList(),
    val progress: Map<String, TaskProgressRecord> = emptyMap(),
    /** The `tool_use_id` of the call that started each task, from `task_started`. */
    val toolUseIds: Map<String, String> = emptyMap(),
)

/** A row of the running list. [kind] is `agent`, `shell`, or the CLI's own `task_type` for anything else. */
data class RunningTask(
    val taskId: String,
    val title: String,
    val kind: String,
    val detail: String?,
    val depth: Int,
    val elapsedMs: Long?,
    val toolUseId: String?,
)

/** The tools that start a subagent. */
val AGENT_TOOLS: Set<String> = setOf("Agent", "Task")

private val KINDS = mapOf("local_agent" to "agent", "local_bash" to "shell")

internal fun foldBackground(
    transcript: Transcript,
    event: AgentEvent,
): Transcript {
    val now = transcript.background
    val next =
        when (event) {
            is AgentEvent.SystemBackgroundTasksChanged -> tasksOf(event.tasks.text)?.let { now.copy(live = it) }
            is AgentEvent.SystemTaskProgress -> {
                val usage = JsonRead.parse(event.usage.text) as? JsonObject
                val ms = (usage?.get("duration_ms") as? JsonNumber)?.text?.toLongOrNull()
                val record = TaskProgressRecord(event.lastToolName, ms, event.toolUseId)
                now.copy(progress = now.progress.plusEntry(event.taskId, record))
            }
            is AgentEvent.SystemTaskStarted ->
                now.copy(
                    toolUseIds = now.toolUseIds.plusEntry(event.taskId, event.toolUseId),
                )
            else -> null
        }
    return if (next == null) transcript else transcript.copy(background = next)
}

private fun tasksOf(text: String): List<BackgroundTaskRecord>? {
    val items = (JsonRead.parse(text) as? JsonArray)?.items ?: return null
    return items.mapNotNull { item ->
        val task = item as? JsonObject ?: return@mapNotNull null
        val id = task.string("task_id") ?: return@mapNotNull null
        BackgroundTaskRecord(
            taskId = id,
            taskType = task.string("task_type").orEmpty(),
            description = task.string("description").orEmpty(),
            subagentType = task.string("subagent_type"),
            parentTaskId = task.string("parent_task_id"),
            ambient = (task["ambient"] as? JsonBool)?.value == true,
        )
    }
}

/**
 * What runs now, parents first and each child right under its parent, one step further in. Ambient tasks (watchers,
 * not activity) are left out; a parent the list does not hold is no parent.
 */
fun runningTasks(transcript: Transcript): List<RunningTask> {
    val background = transcript.background
    val shown = background.live.filterNot { it.ambient }
    val ids = shown.mapTo(HashSet()) { it.taskId }
    val children = shown.filter { it.parentTaskId in ids }.groupBy { it.parentTaskId }
    val out = ArrayList<RunningTask>(shown.size)
    val placed = HashSet<String>()

    fun place(
        task: BackgroundTaskRecord,
        depth: Int,
    ) {
        if (!placed.add(task.taskId)) return
        val progress = background.progress[task.taskId]
        out +=
            RunningTask(
                taskId = task.taskId,
                title = task.description,
                kind = KINDS[task.taskType] ?: task.taskType,
                detail = progress?.lastToolName,
                depth = depth,
                elapsedMs = progress?.durationMs,
                toolUseId = background.toolUseIds[task.taskId] ?: progress?.toolUseId,
            )
        children[task.taskId].orEmpty().forEach { place(it, depth + 1) }
    }
    shown.filter { it.parentTaskId !in ids }.forEach { place(it, 0) }
    // A loop of parents (which the CLI should never send) still shows each task once.
    shown.forEach { place(it, 0) }
    return out
}

/** The rows of the subagent the call [toolUseId] started: its own messages, by the same rules as the main thread. */
fun agentRows(
    transcript: Transcript,
    toolUseId: String,
): List<ThreadRow> = agentTranscript(transcript, toolUseId)?.let { ThreadRows().of(it) }.orEmpty()

/** The subagent's own conversation, for a tab that keeps its own [ThreadRows] (so unchanged rows stay the same). */
fun agentTranscript(
    transcript: Transcript,
    toolUseId: String,
): Transcript? = findCall(transcript.messages, toolUseId)?.let { Transcript(messages = it.messages) }

private fun findCall(
    messages: Keyed<MessageRecord>,
    toolUseId: String,
): ToolCallRecord? =
    messages
        .values()
        .asSequence()
        .flatMap { it.parts.values() }
        .filterIsInstance<ToolCallRecord>()
        .firstNotNullOfOrNull {
            if (it.toolUseId == toolUseId) it else findCall(it.messages, toolUseId)
        }
