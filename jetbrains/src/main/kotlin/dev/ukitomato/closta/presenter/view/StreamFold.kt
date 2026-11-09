package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead

/**
 * A `stream_event` frame: the main conversation's content as it is generated. A frame that claims a
 * sub-agent is left alone — a sub-agent's content is taken from its assistant lines, and the frame would be
 * routed into the main conversation's message.
 */
internal fun foldStream(
    transcript: Transcript,
    event: AgentEvent.StreamEvent,
): Transcript {
    val frame = if (event.parentToolUseId == null) JsonRead.parse(event.event.text) as? JsonObject else null
    return when (frame?.string("type")) {
        "message_start" -> startMessage(transcript, frame)
        "content_block_start" ->
            withBlock(
                transcript,
                frame,
            ) { route, index -> startBlock(transcript, route, index, frame) }
        "content_block_delta" ->
            withBlock(
                transcript,
                frame,
            ) { route, index -> appendDelta(transcript, route, index, frame) }
        "content_block_stop" -> withBlock(transcript, frame) { route, index -> stopBlock(transcript, route, index) }
        "message_stop" -> transcript.withRouting(transcript.routing.copy(streaming = null))
        else -> transcript
    }
}

private fun startMessage(
    transcript: Transcript,
    frame: JsonObject,
): Transcript {
    val id = frame.obj("message")?.string("id") ?: return transcript
    val routed = routeTopLevel(transcript, id)
    return routed.withRouting(routed.routing.copy(streaming = id))
}

/** Folds a block frame of the message that is streaming, when there is one and the frame names its index. */
private fun withBlock(
    transcript: Transcript,
    frame: JsonObject,
    fold: (Pair<String, AnthropicRoute>, Int) -> Transcript,
): Transcript {
    val id = transcript.routing.streaming
    val route = id?.let { transcript.routing.anthropic[it] }
    val index = frame.index("index")
    return if (id == null || route == null || index == null) transcript else fold(id to route, index)
}

private fun startBlock(
    transcript: Transcript,
    route: Pair<String, AnthropicRoute>,
    index: Int,
    frame: JsonObject,
): Transcript {
    val (id, anthropic) = route
    val block = frame.obj("content_block")
    if (block == null || index in anthropic.streamed) return transcript
    val (key, record) = partOf(id, index, block, streaming = true)
    val streamed = anthropic.copy(streamed = anthropic.streamed.plusEntry(index, key))
    val known = key in transcript.routing.tools
    val withPart = if (known) transcript else transcript.addPart(anthropic.location, key, record)
    return withPart.withRouting(withPart.routing.copy(anthropic = withPart.routing.anthropic.plusEntry(id, streamed)))
}

private fun appendDelta(
    transcript: Transcript,
    route: Pair<String, AnthropicRoute>,
    index: Int,
    frame: JsonObject,
): Transcript {
    val anthropic = route.second
    val key = anthropic.streamed[index]
    val delta = frame.obj("delta")
    if (key == null || delta == null) return transcript
    val location = transcript.routing.tools[key] ?: anthropic.location
    return when (delta.string("type")) {
        "text_delta" -> appendText(transcript, location, key, reasoning = false, delta.string(TEXT))
        "thinking_delta" -> appendText(transcript, location, key, reasoning = true, delta.string(THINKING))
        "input_json_delta" -> appendArgs(transcript, location, key, delta.string("partial_json"))
        // signature_delta and whatever comes later show nothing.
        else -> transcript
    }
}

private fun appendText(
    transcript: Transcript,
    location: List<String>,
    key: String,
    reasoning: Boolean,
    more: String?,
): Transcript =
    if (more.isNullOrEmpty()) {
        transcript
    } else {
        transcript.updatePart(location, key) { part ->
            when {
                part !is TextRecord || !part.streaming || part.reasoning != reasoning -> part
                else -> part.copy(text = part.text + more)
            }
        }
    }

// A delta lands only while its block streams: a part made from a snapshot that came before the block's start
// already holds the whole block, and appending would write it twice.
private fun appendArgs(
    transcript: Transcript,
    location: List<String>,
    key: String,
    more: String?,
): Transcript =
    if (more.isNullOrEmpty()) {
        transcript
    } else {
        transcript.updatePart(location, key) { part ->
            if (part is ToolCallRecord && part.streaming) part.copy(argsText = part.argsText + more) else part
        }
    }

private fun stopBlock(
    transcript: Transcript,
    route: Pair<String, AnthropicRoute>,
    index: Int,
): Transcript {
    val anthropic = route.second
    val key = anthropic.streamed[index] ?: return transcript
    return transcript.updatePart(transcript.routing.tools[key] ?: anthropic.location, key) { part ->
        when {
            part is TextRecord && part.streaming -> part.copy(streaming = false)
            part is ToolCallRecord && part.streaming -> part.copy(streaming = false)
            else -> part
        }
    }
}
