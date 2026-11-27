package dev.ukitomato.closta.providers.claude.host

import com.google.gson.JsonElement
import com.google.gson.JsonObject
import dev.ukitomato.closta.core.models.FileToolCall
import dev.ukitomato.closta.core.models.HookPhase
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

/** Answers the hook that runs before a file tool: saves what is unsaved there, and lets the call go on. */
class ClaudeFileHooks(
    private val hooks: FileToolHooks,
    private val paths: CliPaths,
) : HookAnswerer {
    override suspend fun answer(
        callbackId: String,
        input: JsonObject,
        toolUseId: String?,
    ): JsonObject? {
        if (callbackId != BEFORE_FILE_TOOL.callbackId) return null
        fileToolCall(input, toolUseId, paths)?.let { hooks.before(it) }
        return JsonObject()
    }
}
