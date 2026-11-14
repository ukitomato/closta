package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent

/**
 * The lines about the session itself rather than its content: an init brings the commands the CLI has, a reset
 * divides the thread. Any other line leaves the transcript as it is.
 */
internal fun foldSessionLine(
    transcript: Transcript,
    event: AgentEvent,
): Transcript =
    when (event) {
        is AgentEvent.SystemInit -> foldCommandsOfInit(transcript, event)
        is AgentEvent.ConversationReset -> foldReset(transcript, event)
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
    val routing = transcript.routing
    val held = (routing.currentTurn ?: routing.openResume)?.takeIf { it in transcript.messages }
    val messageKey = held ?: transcript.messages.claim(Keys.ofCliId(event.uuid))
    val message = transcript.messages[messageKey] ?: MessageRecord(messageKey, Role.ASSISTANT, MessageSource.Nested)
    val partKey = message.parts.claim(CLEARED_PART)
    val cleared = message.copy(parts = message.parts.put(partKey, ClearedRecord(partKey, event.timestamp)))
    val messages = transcript.messages.put(messageKey, cleared)
    return transcript.copy(messages = messages, clearedAt = messages.order.indexOf(messageKey))
}

private const val CLEARED_PART = "cleared"
