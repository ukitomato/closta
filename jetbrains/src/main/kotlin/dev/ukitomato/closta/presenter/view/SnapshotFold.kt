package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue

private const val TOOL_RESULT = "tool_result"

/** An `assistant` line: the next finished blocks of an Anthropic message, the main conversation's or a sub-agent's. */
internal fun foldAssistant(
    transcript: Transcript,
    event: AgentEvent.Assistant,
): Transcript {
    val message = JsonRead.parse(event.message.text) as? JsonObject
    val id = message?.string("id")
    val content = message?.array("content")
    if (id == null || content == null) return transcript
    val parent = event.parentToolUseId
    val routed = if (parent == null) routeTopLevel(transcript, id) else routeNested(transcript, id, parent)
    return routed?.let { snapshotBlocks(it, id, content) } ?: transcript
}

private fun snapshotBlocks(
    transcript: Transcript,
    id: String,
    content: JsonArray,
): Transcript {
    val route = transcript.routing.anthropic[id] ?: return transcript
    var next = transcript
    content.items.forEachIndexed { offset, block ->
        if (block is JsonObject) next = snapshotBlock(next, id, route.blocks + offset, block, route.location)
    }
    val counted = route.copy(blocks = route.blocks + content.items.size)
    return next.withRouting(next.routing.copy(anthropic = next.routing.anthropic.plusEntry(id, counted)))
}

/**
 * A finished block. Its text is the authority — normally what streamed, verbatim — and a part that never
 * streamed is made here, already finished. A tool call gets its whole input; its `argsText` keeps what
 * streamed, and is the input's JSON only when nothing did.
 */
private fun snapshotBlock(
    transcript: Transcript,
    id: String,
    index: Int,
    block: JsonObject,
    location: List<String>,
): Transcript {
    val (key, made) = partOf(id, index, block, streaming = false)
    val at = transcript.routing.tools[key] ?: location
    val existing =
        transcript.messages
            .messageAt(at)
            ?.parts
            ?.get(key) ?: return transcript.addPart(at, key, made)
    return transcript.updatePart(at, key) {
        when {
            existing is TextRecord && made is TextRecord && existing.reasoning == made.reasoning ->
                if (existing.text == made.text) existing else existing.copy(text = made.text)
            existing is ToolCallRecord && made is ToolCallRecord -> {
                val finished = existing.copy(input = made.input, argsText = existing.argsText.ifEmpty { made.argsText })
                if (finished == existing) existing else finished
            }
            else -> existing
        }
    }
}

/**
 * A `user` line carries the results of tool calls, wherever those calls are. Its text is shown only for a
 * sub-agent — that is the prompt the sub-agent was given; the user's own words came from the host.
 */
internal fun foldUser(
    transcript: Transcript,
    event: AgentEvent.User,
): Transcript {
    val content = (JsonRead.parse(event.message.text) as? JsonObject)?.get("content")
    val parent = event.parentToolUseId
    return when (content) {
        is JsonString ->
            parent?.let { nestedPrompt(transcript, it, event.uuid, listOf(0 to content.value)) }
                ?: transcript
        is JsonArray -> {
            var next = transcript
            val texts = mutableListOf<Pair<Int, String>>()
            // Read only for a sub-agent's call: another tool's carries its whole output, not worth a second parse.
            val duration by lazy { event.toolUseResult?.let { toolResultDuration(JsonRead.parse(it.text)) } }
            content.items.forEachIndexed { index, item ->
                val block = item as? JsonObject
                when (block?.string("type")) {
                    TOOL_RESULT -> next = toolResult(next, block) { duration }
                    TEXT -> block.string(TEXT)?.let { texts += index to it }
                }
            }
            if (parent == null || texts.isEmpty()) next else nestedPrompt(next, parent, event.uuid, texts)
        }
        else -> transcript
    }
}

/** How long a sub-agent ran, from the `tool_use_result` (`AgentOutput.totalDurationMs`); null for another shape. */
internal fun toolResultDuration(toolUseResult: JsonValue?): Long? =
    ((toolUseResult as? JsonObject)?.get("totalDurationMs") as? JsonNumber)?.text?.toLongOrNull()

private fun toolResult(
    transcript: Transcript,
    block: JsonObject,
    durationMs: () -> Long?,
): Transcript {
    val key = block.string("tool_use_id")?.let(Keys::ofCliId)
    val location = key?.let { transcript.routing.tools[it] }
    if (key == null || location == null) return transcript
    return transcript.updatePart(location, key) { part ->
        if (part !is ToolCallRecord) return@updatePart part
        val took = if (part.toolName in AGENT_TOOLS) durationMs() else null
        val result = ToolResult(block["content"], (block["is_error"] as? JsonBool)?.value, took)
        if (part.result != result) part.copy(result = result) else part
    }
}

/** The prompt a sub-agent was given, as a user message under the call that started it. */
private fun nestedPrompt(
    transcript: Transcript,
    parent: String,
    uuid: String,
    texts: List<Pair<Int, String>>,
): Transcript {
    val parentKey = Keys.ofCliId(parent)
    val location = transcript.routing.tools[parentKey] ?: return transcript
    return transcript.updatePart(location, parentKey) { part ->
        if (part !is ToolCallRecord) return@updatePart part
        // Its key is claimed like any other message's, so a line that repeats a uuid adds rather than replaces.
        val key = part.messages.claim(Keys.ofCliId(uuid))
        var parts = Keyed.empty<PartRecord>()
        texts.forEach { (index, text) -> parts = parts.put("$key:$index", TextRecord(reasoning = false, text = text)) }
        part.copy(messages = part.messages.put(key, MessageRecord(key, Role.USER, MessageSource.Nested, parts)))
    }
}
