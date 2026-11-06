package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonText

// The content of a turn arrives twice for the main conversation — streamed as raw SSE frames in stream_event
// lines, and as one assistant line per finished block — and once for a sub-agent, which never streams
// (in the captures, no stream_event carries parent_tool_use_id). Both kinds of line write the same parts: a
// streamed block's part is keyed by its index, and the k-th block the assistant lines carry for a message is
// the block with index k, so the snapshot finds the part the stream made.

internal const val TEXT = "text"
internal const val THINKING = "thinking"
private const val TOOL_USE = "tool_use"

/**
 * Routes the Anthropic message [id] of the main conversation, once: to the turn receiving content, else to the
 * open spontaneous resume, else to a new resume keyed by this message — after a background task the CLI
 * speaks on its own (captures 10 and 11).
 */
internal fun routeTopLevel(
    transcript: Transcript,
    id: String,
): Transcript {
    val routing = transcript.routing
    val target = routing.currentTurn ?: routing.openResume
    return when {
        id in routing.anthropic -> transcript
        target != null ->
            transcript.withRouting(
                routing.copy(
                    anthropic =
                        routing.anthropic.plusEntry(id, AnthropicRoute(listOf(target))),
                ),
            )
        else -> {
            val key = transcript.messages.claim(Keys.ofCliId(id))
            transcript.copy(
                messages = transcript.messages.put(key, MessageRecord(key, Role.ASSISTANT, MessageSource.Resume())),
                routing =
                    routing.copy(
                        openResume = key,
                        anthropic =
                            routing.anthropic.plusEntry(id, AnthropicRoute(listOf(key))),
                    ),
            )
        }
    }
}

/**
 * Routes a sub-agent's Anthropic message [id] under the tool call that started the sub-agent ([parent] is
 * that call's `tool_use_id`). Null when no such call is known: the call's own block always arrives first in
 * the captures, and content for a call that does not exist has nowhere to go in the tree.
 */
internal fun routeNested(
    transcript: Transcript,
    id: String,
    parent: String,
): Transcript? {
    if (id in transcript.routing.anthropic) return transcript
    val parentKey = Keys.ofCliId(parent)
    val location = transcript.routing.tools[parentKey]
    val call =
        location?.let {
            transcript.messages
                .messageAt(it)
                ?.parts
                ?.get(parentKey)
        } as? ToolCallRecord
    return if (location == null || call == null) null else nest(transcript, id, location.plusItem(parentKey), call)
}

// [under] is the location of the message holding the call, followed by the call's key.
private fun nest(
    transcript: Transcript,
    id: String,
    under: List<String>,
    call: ToolCallRecord,
): Transcript {
    val key = call.messages.claim(Keys.ofCliId(id))
    val nested = MessageRecord(key, Role.ASSISTANT, MessageSource.Nested)
    val withMessage =
        transcript.updatePart(under.dropLast(1), under.last()) { part ->
            if (part is ToolCallRecord) part.copy(messages = part.messages.put(key, nested)) else part
        }
    val route = AnthropicRoute(under.plusItem(key))
    return withMessage.withRouting(
        withMessage.routing.copy(anthropic = withMessage.routing.anthropic.plusEntry(id, route)),
    )
}

/** The part a block makes, and its key: the tool call's own id, else the block's place in its message. */
internal fun partOf(
    id: String,
    index: Int,
    block: JsonObject,
    streaming: Boolean,
): Pair<String, PartRecord> {
    val type = block.string("type")
    val toolUseId = block.string("id")
    return when {
        type == TEXT ->
            "$id:$index" to
                TextRecord(reasoning = false, text = block.string(TEXT).orEmpty(), streaming = streaming)
        type == THINKING ->
            "$id:$index" to
                TextRecord(reasoning = true, text = block.string(THINKING).orEmpty(), streaming = streaming)
        type == TOOL_USE && toolUseId != null -> {
            // The streamed start carries an empty placeholder input; only the snapshot's input is the input.
            val input = if (streaming) null else block["input"]
            val record =
                ToolCallRecord(
                    toolUseId = toolUseId,
                    toolName = block.string("name").orEmpty(),
                    argsText = input?.let(JsonText::compact).orEmpty(),
                    input = input,
                    streaming = streaming,
                )
            Keys.ofCliId(toolUseId) to record
        }
        else -> "$id:$index" to OtherRecord(type.orEmpty())
    }
}
