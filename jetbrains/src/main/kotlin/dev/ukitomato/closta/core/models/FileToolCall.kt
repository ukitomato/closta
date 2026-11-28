package dev.ukitomato.closta.core.models

/** Whether a file tool's hook runs before the tool or after it. */
enum class HookPhase { BEFORE, AFTER }

/**
 * A call of a tool that reads or edits one file, as a hook sees it: the [toolName], the file's [path] as the IDE writes
 * it, the [toolUseId] of the call, and the [agentId] of the sub-agent that made it (null for the main agent).
 */
data class FileToolCall(
    val phase: HookPhase,
    val toolName: String,
    val path: String,
    val toolUseId: String,
    val agentId: String?,
)
