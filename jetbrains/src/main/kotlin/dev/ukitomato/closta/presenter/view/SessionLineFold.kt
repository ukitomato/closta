package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent

/**
 * The lines about the session itself rather than its content: an init brings the commands the CLI has, a reset
 * divides the thread, a refusal marks the call it refused and an informational line adds a note. Any other line leaves
 * the transcript as it is.
 */
internal fun foldSessionLine(
    transcript: Transcript,
    event: AgentEvent,
): Transcript =
    when (event) {
        is AgentEvent.SystemInit -> foldCommandsOfInit(transcript, event)
        is AgentEvent.ConversationReset -> foldReset(transcript, event)
        is AgentEvent.SystemPermissionDenied ->
            transcript.markDenied(
                Keys.ofCliId(event.toolUseId),
                Denial(event.decisionReasonType, event.decisionReason),
            )
        is AgentEvent.SystemInformational -> foldInformational(transcript, event)
        else -> transcript
    }

/**
 * A reset divides the thread in the message receiving content (the `/clear`'s own turn), or in one of its own when none
 * is, whatever its trigger says: the CLI asks its consumers to reset on every one. What came before stays.
 */
private fun foldReset(
    transcript: Transcript,
    event: AgentEvent.ConversationReset,
): Transcript {
    val (placed, messageKey) =
        transcript.withPart(event.uuid, CLEARED_PART) { key -> ClearedRecord(key, event.timestamp) }
    return placed.copy(clearedAt = placed.messages.order.indexOf(messageKey))
}

/**
 * A line of level `info` is for the CLI's transcript mode and is not shown; any level this version does not know is
 * shown as a notice. It goes in the message receiving content, or in one of its own when none is.
 */
private fun foldInformational(
    transcript: Transcript,
    event: AgentEvent.SystemInformational,
): Transcript {
    if (event.level == INFO_LEVEL) return transcript
    return transcript
        .withPart(event.uuid, NOTICE_PART) { key ->
            InformationalRecord(key, event.level, event.content, event.preventContinuation == true)
        }.first
}

/** Puts a part made by [make] in the message receiving content, or in one of its own named for [uuid]; and its key. */
private fun Transcript.withPart(
    uuid: String,
    name: String,
    make: (String) -> PartRecord,
): Pair<Transcript, String> {
    val held = (routing.currentTurn ?: routing.openResume)?.takeIf { it in messages }
    val messageKey = held ?: messages.claim(Keys.ofCliId(uuid))
    val message = messages[messageKey] ?: MessageRecord(messageKey, Role.ASSISTANT, MessageSource.Nested)
    val partKey = message.parts.claim(name)
    val placed = message.copy(parts = message.parts.put(partKey, make(partKey)))
    return copy(messages = messages.put(messageKey, placed)) to messageKey
}

private const val CLEARED_PART = "cleared"
private const val NOTICE_PART = "notice"
private const val INFO_LEVEL = "info"
