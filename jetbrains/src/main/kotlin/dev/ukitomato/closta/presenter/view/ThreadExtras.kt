package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.Notice
import dev.ukitomato.closta.core.models.NoticeKind
import dev.ukitomato.closta.core.models.SessionInfo
import dev.ukitomato.closta.core.models.Task
import dev.ukitomato.closta.core.models.TaskStatus
import dev.ukitomato.closta.core.models.Usage
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString

// What a thread says besides its messages, and how the tree spells it (thread, session, usage, notice, task).

/**
 * What a thread says besides its messages, from core's state: each is null while there is nothing to say (no session
 * yet, no notice, no task), and the thread then has no such key.
 */
internal data class ThreadExtras(
    val session: JsonObject?,
    val usage: JsonObject?,
    val notices: JsonObject?,
    val tasks: JsonObject?,
    val commands: JsonArray? = null,
    val fileSearch: JsonObject? = null,
    val selection: JsonObject? = null,
    val applied: JsonObject? = null,
    val models: JsonArray? = null,
    val startPermissionMode: String? = null,
    val switches: JsonArray? = null,
    val context: JsonObject? = null,
    val rewind: JsonObject? = null,
    val compactions: JsonArray? = null,
    val compacting: Boolean = false,
    val effort: String? = null,
    val appliedModel: String? = null,
    val savedSessions: JsonArray? = null,
    val savedSessionsUnreadable: Boolean = false,
    val restoredUntil: String? = null,
    val restoredCount: Int? = null,
    val restoredPartly: Boolean = false,
    val mcpServers: JsonArray? = null,
    val mcpServersUnreadable: Boolean = false,
)

@Suppress("CyclomaticComplexMethod") // one optional key for each thing a thread can say
internal fun threadNode(
    id: String,
    isRunning: Boolean,
    messages: JsonObject,
    extras: ThreadExtras,
): JsonObject {
    val node =
        JsonObject
            .Builder()
            .put(
                "id",
                JsonString(id),
            ).put("isRunning", JsonBool.of(isRunning))
            .put("messages", messages)
    extras.session?.let { node.put("session", it) }
    extras.usage?.let { node.put("usage", it) }
    extras.notices?.let { node.put("notices", it) }
    extras.tasks?.let { node.put("tasks", it) }
    extras.commands?.let { node.put("commands", it) }
    extras.fileSearch?.let { node.put("fileSearch", it) }
    extras.selection?.let { node.put("selection", it) }
    extras.applied?.let { node.put("applied", it) }
    extras.models?.let { node.put("models", it) }
    extras.startPermissionMode?.let { node.put("startPermissionMode", JsonString(it)) }
    extras.switches?.let { node.put("switches", it) }
    extras.context?.let { node.put("context", it) }
    extras.compactions?.let { node.put("compactions", it) }
    // Always there, true or false: a key that goes away is an op that sets the whole thread again (the differ has
    // none that removes a key), and compacting comes and goes.
    node.put("compacting", JsonBool.of(extras.compacting))
    extras.effort?.let { node.put("effort", JsonString(it)) }
    putHistory(node, extras)
    putMcp(node, extras)
    // The last rewind of the files, after every key that was there before it.
    extras.rewind?.let { node.put("rewind", it) }
    // The model the CLI says it uses, after the rewind.
    extras.appliedModel?.let { node.put("appliedModel", JsonString(it)) }
    return node.build()
}

// Each is there only once it is true or known. The list comes once and is replaced; the three that say what was
// put
// back come once, when the session is resumed, and stay.
private fun putHistory(
    node: JsonObject.Builder,
    extras: ThreadExtras,
) {
    extras.savedSessions?.let { node.put("savedSessions", it) }
    if (extras.savedSessionsUnreadable) node.put("savedSessionsUnreadable", JsonBool.TRUE)
    extras.restoredUntil?.let { node.put("restoredUntil", JsonString(it)) }
    extras.restoredCount?.let { node.put("restoredCount", JsonNumber.of(it.toLong())) }
    if (extras.restoredPartly) node.put("restoredPartly", JsonBool.TRUE)
}

internal fun sessionNode(session: SessionInfo): JsonObject =
    JsonObject.of(
        "model" to JsonString(session.model),
        "permissionMode" to JsonString(session.permissionMode),
        "cwd" to JsonString(session.cwd),
        "version" to JsonString(session.version),
    )

/**
 * The session's running total in USD, as the number's own text; a figure that is not finite reads as 0. With [tokens]
 * the node also says how many tokens the session has used, a running total as the cost is.
 */
internal fun usageNode(
    usage: Usage,
    tokens: TokenTotals? = null,
): JsonObject {
    val cost = usage.sessionCostUsd.takeIf { it.isFinite() } ?: 0.0
    val node = JsonObject.Builder().put("costUsd", JsonNumber(cost.toString()))
    tokens?.let {
        node
            .put("inputTokens", JsonNumber.of(it.input))
            .put("outputTokens", JsonNumber.of(it.output))
            .put("cacheReadInputTokens", JsonNumber.of(it.cacheRead))
            .put("cacheCreationInputTokens", JsonNumber.of(it.cacheCreation))
    }
    return node.build()
}

/** The notices in the order they came, each keyed `notice-N` by its place in that order (N from 1). */
internal fun noticesNode(notices: List<Notice>): JsonObject {
    val keys = notices.indices.map { "notice-${it + 1}" }
    val byId = JsonObject.Builder()
    notices.forEachIndexed { index, notice ->
        val node =
            JsonObject
                .Builder()
                .put("id", JsonString(keys[index]))
                .put("kind", JsonString(if (notice.kind == NoticeKind.CONTROL_ERROR) "control-error" else "error"))
                // A control error's sentence is the CLI's own and may name a server by its URL: it is made as an MCP
                // sentence is, whatever the request was.
                .put(
                    "text",
                    JsonString(
                        if (notice.kind ==
                            NoticeKind.CONTROL_ERROR
                        ) {
                            mcpSentence(notice.message)
                        } else {
                            notice.message
                        },
                    ),
                )
        notice.requestId?.let { node.put("requestId", JsonString(it)) }
        byId.put(keys[index], node.build())
    }
    return collectionNode(JsonArray(keys.map(::JsonString)), byId.build())
}

/**
 * The tasks in the order they came, each keyed as the CLI's id is ([Keys.ofCliId]); `toolCallId` is the key of the
 * tool call part that started it (the same function), so it names that part.
 */
internal fun tasksNode(tasks: List<Task>): JsonObject {
    val keys = ArrayList<String>()
    val byId = JsonObject.Builder()
    for (task in tasks) {
        val key = claimKey(keys::contains, Keys.ofCliId(task.taskId))
        keys += key
        val node = JsonObject.Builder().put("id", JsonString(key))
        task.parentToolUseId?.let { node.put("toolCallId", JsonString(Keys.ofCliId(it))) }
        task.subagentType?.let { node.put("agentType", JsonString(it)) }
        node.put("background", JsonBool.of(task.isBackgrounded))
        node.put("status", JsonString(taskStatusWire(task.status)))
        if (task.status == TaskStatus.INCOMPLETE) task.incompleteReason?.let { node.put("reason", JsonString(it)) }
        byId.put(key, node.build())
    }
    return collectionNode(JsonArray(keys.map(::JsonString)), byId.build())
}

private fun taskStatusWire(status: TaskStatus): String =
    when (status) {
        TaskStatus.RUNNING -> "running"
        TaskStatus.COMPLETE -> "complete"
        TaskStatus.INCOMPLETE -> "incomplete"
    }

/** The slash commands, in the CLI's order: the name, the sentence (empty when only names are known) and the hint. */
internal fun commandsNode(commands: List<SlashCommandRecord>): JsonArray =
    JsonArray(
        commands.map { command ->
            val node =
                JsonObject
                    .Builder()
                    .put("name", JsonString(command.name))
                    .put("description", JsonString(command.description))
            command.argumentHint?.let { node.put("argumentHint", JsonString(it)) }
            node.build()
        },
    )

/** The last answer to the webview's file query; [FileSearchRecord.commandId] is the webview's own command id. */
internal fun fileSearchNode(search: FileSearchRecord): JsonObject {
    val node =
        JsonObject
            .Builder()
            .put("commandId", JsonString(search.commandId))
            .put("match", JsonString(search.match))
            .put("paths", JsonArray(search.paths.map(::JsonString)))
            .put("truncated", JsonBool.of(search.truncated))
    search.failure?.let { node.put("failure", JsonString(it)) }
    return node.build()
}

/** The last answer to the webview's request for the selection: a place, none, or a failure (never the text). */
internal fun selectionNode(record: SelectionRecord): JsonObject {
    val node = JsonObject.Builder().put("commandId", JsonString(record.commandId))
    when (val answer = record.answer) {
        is SelectionAnswer.Selected ->
            node
                .put("path", JsonString(answer.path))
                .put("startLine", JsonNumber(answer.startLine.toString()))
                .put("endLine", JsonNumber(answer.endLine.toString()))
        SelectionAnswer.NoSelection -> node.put("none", JsonBool.TRUE)
        is SelectionAnswer.Failed -> node.put("failure", JsonString(answer.failure))
    }
    return node.build()
}
