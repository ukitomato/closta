package dev.ukitomato.closta.providers.claude.host

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import dev.ukitomato.closta.core.models.FileToolCall
import dev.ukitomato.closta.core.models.HookPhase
import dev.ukitomato.closta.core.services.DiagnosticsReport
import dev.ukitomato.closta.core.services.FileToolHooks
import dev.ukitomato.closta.providers.claude.launch.CliPaths

private val PATH_KEYS =
    mapOf(
        "Edit" to "file_path",
        "Write" to "file_path",
        "Read" to "file_path",
        "NotebookEdit" to "notebook_path",
    )

/**
 * The file tool call a hook input describes, with its path in the IDE's form; null when the input names no file tool,
 * no path or no `tool_use_id` (taken from [toolUseId], else from the input).
 */
@Suppress("ReturnCount") // each missing part ends the read early
fun fileToolCall(
    input: JsonObject,
    toolUseId: String?,
    paths: CliPaths,
): FileToolCall? {
    val phase =
        when (input.text("hook_event_name")) {
            "PreToolUse" -> HookPhase.BEFORE
            "PostToolUse" -> HookPhase.AFTER
            else -> return null
        }
    val tool = input.text("tool_name") ?: return null
    val key = PATH_KEYS[tool] ?: return null
    val path = (input.get("tool_input") as? JsonObject)?.text(key)
    if (path.isNullOrEmpty()) return null
    val id = toolUseId ?: input.text("tool_use_id") ?: return null
    return FileToolCall(phase, tool, paths.toIde(path), id, input.text("agent_id"))
}

private fun JsonObject.text(key: String): String? = get(key)?.takeIf { it.isStringPrimitive() }?.asString

private fun JsonElement.isStringPrimitive() = isJsonPrimitive && asJsonPrimitive.isString

/**
 * Answers the hooks around a file tool. Before it, what is unsaved in that file is saved and the call goes on. After
 * an edit, the errors the edit added are given to Claude as context; with none, the answer is an empty object.
 */
class ClaudeFileHooks(
    private val hooks: FileToolHooks,
    private val paths: CliPaths,
) : HookAnswerer {
    private fun context(report: DiagnosticsReport): JsonObject =
        JsonObject().apply {
            add(
                "hookSpecificOutput",
                JsonObject().apply {
                    addProperty("hookEventName", "PostToolUse")
                    addProperty("additionalContext", diagnosticsContext(report, paths))
                },
            )
        }

    override suspend fun answer(
        callbackId: String,
        input: JsonObject,
        toolUseId: String?,
    ): JsonObject? {
        val call = fileToolCall(input, toolUseId, paths)
        return when (callbackId) {
            BEFORE_FILE_TOOL.callbackId -> JsonObject().also { call?.let { hooks.before(it) } }
            AFTER_EDIT.callbackId -> call?.let { hooks.after(it) }?.let(::context) ?: JsonObject()
            else -> null
        }
    }
}

private const val MAX_LINES = 20
private const val MAX_CHARS = 2_000
private const val MAX_MESSAGE_CHARS = 300
private const val MAX_PATH_CHARS = 300

private fun shortPath(path: String): String =
    if (path.length <=
        MAX_PATH_CHARS
    ) {
        path
    } else {
        "…" + path.takeLast(MAX_PATH_CHARS)
    }

private val BLOCK_MARK = Regex("</?ide-diagnostics>", RegexOption.IGNORE_CASE)
private val WHITESPACE = Regex("\\s+")

private fun defused(text: String): String = text.replace(BLOCK_MARK, "[ide-diagnostics]")

// A message is plain text: nothing is decoded or stripped, only the words that would close the block are defused.
private fun plain(message: String): String =
    message
        .replace(BLOCK_MARK, "[ide-diagnostics]")
        .replace(WHITESPACE, " ")
        .trim()
        .take(MAX_MESSAGE_CHARS)

/**
 * The text Claude is given about the errors [report] found, with the path in the CLI's form: at most 20 findings and
 * 2,000 characters, the last line saying how many were left out.
 */
fun diagnosticsContext(
    report: DiagnosticsReport,
    paths: CliPaths,
): String {
    val lines =
        report.added.map { found ->
            val source = found.source?.let { " (${plain(it)})" }.orEmpty()
            "  ${found.line}:${found.column} ${plain(found.message)}$source"
        }
    val total = lines.size
    val noun = if (total == 1) "1 new error" else "$total new errors"

    fun render(shown: Int): String =
        buildList {
            add("<ide-diagnostics>")
            add("The edit added $noun in ${shortPath(defused(paths.toCli(report.path)))}:")
            addAll(lines.take(shown))
            if (shown < total) add("  …and ${total - shown} more")
            add("</ide-diagnostics>")
        }.joinToString("\n")
    var shown = minOf(MAX_LINES, total)
    while (shown > 0 && render(shown).length > MAX_CHARS) shown--
    return render(shown)
}
