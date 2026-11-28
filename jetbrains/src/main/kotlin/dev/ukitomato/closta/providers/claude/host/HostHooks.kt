package dev.ukitomato.closta.providers.claude.host

import com.google.gson.JsonObject
import dev.ukitomato.closta.core.services.DiagnosticsReport
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

/** One hook the host registers in `initialize`: [callbackId] is what the CLI sends back in a `hook_callback`. */
data class HookDeclaration(
    val event: String,
    val matcher: String,
    val callbackId: String,
    val timeoutSeconds: Int,
)

private const val HOOK_TIMEOUT_SECONDS = 10

val BEFORE_FILE_TOOL =
    HookDeclaration("PreToolUse", "Edit|Write|NotebookEdit|Read", "closta-before-file-tool", HOOK_TIMEOUT_SECONDS)
val AFTER_EDIT =
    HookDeclaration("PostToolUse", "Edit|Write|NotebookEdit", "closta-after-edit", HOOK_TIMEOUT_SECONDS)

/** Answers a `hook_callback`: the JSON the CLI is given, or null when [callbackId] is not one this host registered. */
fun interface HookAnswerer {
    suspend fun answer(
        callbackId: String,
        input: JsonObject,
        toolUseId: String?,
    ): JsonObject?
}

/**
 * What a session's host brings to the CLI beyond MCP servers: the hooks to [declarations] in `initialize`, the
 * [answerer] for their callbacks, [turnEnded] called when a turn's `result` has been folded, and the [reports] the
 * hooks produced, each with the id of the tool call it belongs to.
 */
data class HostHooks(
    val declarations: List<HookDeclaration> = emptyList(),
    val answerer: HookAnswerer? = null,
    val turnEnded: () -> Unit = {},
    val reports: Flow<Pair<String, DiagnosticsReport>> = emptyFlow(),
)
