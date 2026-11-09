package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText
import dev.ukitomato.closta.presenter.tree.JsonValue

enum class ToolLineState { RUNNING, OK, ERROR }

/** One tool call as one line of the conversation (`● Edit(AuthService.kt) +12 −3`). */
data class ToolLine(
    val state: ToolLineState,
    val label: String,
    val added: Int? = null,
    val removed: Int? = null,
)

private const val SUMMARY_MAX = 60

private val BY_FILE = setOf("Edit", "Write", "Read", "NotebookEdit")

/** The line for [call], read from its finished input; while the input is still streaming there is only its name. */
fun toolLine(call: ToolCallRecord): ToolLine {
    val input = call.input as? JsonObject
    val summary = summaryOf(call.toolName, input)
    val label = if (summary == null) call.toolName else "${call.toolName}($summary)"
    val state = stateOf(call)
    return when (call.toolName) {
        "Edit" -> ToolLine(state, label, input.lineCount("new_string"), input.lineCount("old_string"))
        "Write" -> ToolLine(state, label, input.lineCount("content"), null)
        else -> ToolLine(state, label)
    }
}

private fun stateOf(call: ToolCallRecord): ToolLineState {
    val result = call.result
    return when {
        result == null -> ToolLineState.RUNNING
        result.isError == true -> ToolLineState.ERROR
        else -> ToolLineState.OK
    }
}

private fun JsonObject?.text(key: String) = (this?.get(key) as? JsonString)?.value

private fun JsonObject?.lineCount(key: String) = text(key)?.lines()?.size

private fun summaryOf(
    tool: String,
    input: JsonObject?,
): String? {
    val summary =
        when (tool) {
            in BY_FILE -> input.text("file_path")?.substringAfterLast('/')?.substringAfterLast('\\')
            "Bash" -> input.text("command")?.lineSequence()?.first()
            "Grep", "Glob" -> input.text("pattern")
            else -> null
        }
    return summary?.let { if (it.length > SUMMARY_MAX) it.take(SUMMARY_MAX) + "…" else it }
}

/**
 * What an opened tool line shows: its input (a command as it is, any other input as JSON), its output (the result's
 * text; why it failed, when it failed), and what it read ([target]), by which "Explored" counts files.
 */
data class ToolDetail(
    val input: String,
    /** Null until the result came. Only its last [TOOL_OUTPUT_MAX] characters are kept. */
    val output: String?,
    val outputCut: Boolean = false,
    val target: String? = null,
)

/** How much of a tool's output a line keeps, from the end: 8 KiB, as much as the running list shows of a shell. */
const val TOOL_OUTPUT_MAX = 8 * 1024

/** The detail of [call] from its finished input and its result. */
fun toolDetail(call: ToolCallRecord): ToolDetail {
    val input = call.input as? JsonObject
    val shownInput =
        when {
            call.toolName == "Bash" -> input.text("command").orEmpty()
            input == null || input.size == 0 -> ""
            else -> JsonText.pretty(input)
        }
    val output = call.result?.let { result -> result.content?.let(::resultText).orEmpty() }
    val cut = output != null && output.length > TOOL_OUTPUT_MAX
    return ToolDetail(shownInput, if (cut) output.takeLast(TOOL_OUTPUT_MAX) else output, cut, targetOf(call, input))
}

private fun resultText(content: JsonValue): String =
    when (content) {
        is JsonString -> content.value
        is JsonArray ->
            content.items.joinToString("\n") { item ->
                ((item as? JsonObject)?.get("text") as? JsonString)?.value ?: JsonText.compact(item)
            }
        else -> JsonText.compact(content)
    }

private fun targetOf(
    call: ToolCallRecord,
    input: JsonObject?,
): String? =
    when (call.toolName) {
        in BY_FILE -> input.text("file_path")
        "LS" -> input.text("path")
        "Grep", "Glob" -> input.text("pattern")
        else -> null
    }

/**
 * A sub-agent's call as its one-line card shows it: what it was asked to do, how many tools it has called, and how
 * long it ran once it is done ([durationMs]).
 */
data class AgentSummary(
    val description: String?,
    val tools: Int,
    val durationMs: Long? = null,
)

/** The summary of [call] when it started a sub-agent; null for any other tool. */
fun agentSummary(call: ToolCallRecord): AgentSummary? {
    if (call.toolName !in AGENT_TOOLS) return null
    val tools = call.messages.values().sumOf { message -> message.parts.values().count { it is ToolCallRecord } }
    val description = (call.input as? JsonObject).text("description")?.takeIf { it.isNotBlank() }
    return AgentSummary(description, tools, call.result?.durationMs)
}
