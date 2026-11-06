package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonValue

// A location is the path of keys to a message record: a top-level message key, then a tool-call key and a
// nested message key for each level of sub-agent. Updates copy the records along the path and nothing else;
// a change that leaves a record as it was returns the same objects all the way up.

/** The message at [location], or null when the path does not lead to one. */
internal fun Keyed<MessageRecord>.messageAt(
    location: List<String>,
    index: Int = 0,
): MessageRecord? {
    val message = location.getOrNull(index)?.let { this[it] }
    val callKey = location.getOrNull(index + 1)
    return if (message == null || callKey == null) {
        message
    } else {
        (message.parts[callKey] as? ToolCallRecord)?.messages?.messageAt(location, index + 2)
    }
}

/**
 * The finished input of the tool call [toolUseId], wherever the call is (a sub-agent's too): the `call` the
 * projection reads a question from when the request's own input has none. Null when the call is not there or has no
 * input yet.
 */
internal fun Transcript.callInput(toolUseId: String): JsonValue? {
    val key = Keys.ofCliId(toolUseId)
    val location = routing.tools[key] ?: return null
    return (messages.messageAt(location)?.parts?.get(key) as? ToolCallRecord)?.input
}

/** Replaces the message at [location] with [change] of it; a path that leads nowhere changes nothing. */
internal fun Keyed<MessageRecord>.updateMessageAt(
    location: List<String>,
    change: (MessageRecord) -> MessageRecord,
): Keyed<MessageRecord> = updateFrom(location, 0, change)

private fun Keyed<MessageRecord>.updateFrom(
    location: List<String>,
    index: Int,
    change: (MessageRecord) -> MessageRecord,
): Keyed<MessageRecord> {
    val key = location.getOrNull(index) ?: return this
    val callKey = location.getOrNull(index + 1)
    return update(key) { message ->
        if (callKey == null) {
            change(message)
        } else {
            val parts =
                message.parts.update(callKey) { part ->
                    if (part !is ToolCallRecord) return@update part
                    val nested = part.messages.updateFrom(location, index + 2, change)
                    if (nested === part.messages) part else part.copy(messages = nested)
                }
            if (parts === message.parts) message else message.copy(parts = parts)
        }
    }
}

internal fun Transcript.withMessages(messages: Keyed<MessageRecord>): Transcript =
    if (messages === this.messages) this else copy(messages = messages)

internal fun Transcript.withRouting(routing: Routing): Transcript {
    val same = routing == this.routing
    return if (same) this else copy(routing = routing)
}

/** Replaces the part [key] of the message at [location] with [change] of it. */
internal fun Transcript.updatePart(
    location: List<String>,
    key: String,
    change: (PartRecord) -> PartRecord,
): Transcript =
    withMessages(
        messages.updateMessageAt(location) { message ->
            val parts = message.parts.update(key, change)
            if (parts === message.parts) message else message.copy(parts = parts)
        },
    )

/** Adds [record] as part [key] of the message at [location], unless the message already has that part. */
internal fun Transcript.addPart(
    location: List<String>,
    key: String,
    record: PartRecord,
): Transcript {
    val message = messages.messageAt(location)
    if (message == null || key in message.parts) return this
    val added = withMessages(messages.updateMessageAt(location) { it.copy(parts = it.parts.put(key, record)) })
    return if (record is ToolCallRecord) {
        added.withRouting(added.routing.copy(tools = added.routing.tools.plusEntry(key, location)))
    } else {
        added
    }
}
