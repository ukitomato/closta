package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ConversationState

/** What the detail pane shows for a session. */
sealed interface SessionDetail {
    /** The first waiting card, and how many more wait behind it. */
    data class Waiting(
        val card: ThreadCard,
        val more: Int,
    ) : SessionDetail

    /**
     * The tool it runs now and only the head of its last reply: once the head is filled, more streamed text leaves
     * this equal, so the pane is not drawn again for every token.
     */
    data class Running(
        val tool: ToolLine?,
        val replyHead: String?,
    ) : SessionDetail

    /** [askKey] is the last user message (for TurnChanges.review); [changes] what its turn changed, if found. */
    data class Finished(
        val lastReply: String?,
        val askKey: String?,
        val changes: TurnChangesRecord?,
    ) : SessionDetail

    /** Nothing asked yet. */
    data object Fresh : SessionDetail
}

fun sessionDetail(
    conversation: ConversationState,
    transcript: Transcript,
): SessionDetail {
    val waiting = waitingApprovals(conversation, transcript)
    val askKey = transcript.messages.order.lastOrNull { transcript.messages[it]?.role == Role.USER }
    return when {
        waiting.isNotEmpty() -> SessionDetail.Waiting(cardOf(waiting.first()), waiting.size - 1)
        threadIsRunning(
            conversation,
            transcript,
        ) -> SessionDetail.Running(runningTool(transcript), replyHead(lastReplyText(transcript)))
        askKey == null -> SessionDetail.Fresh
        else -> SessionDetail.Finished(lastReplyText(transcript), askKey, transcript.turnChanges[askKey])
    }
}

private fun runningTool(transcript: Transcript): ToolLine? =
    lastAssistant(transcript)
        ?.parts
        ?.values()
        ?.filterIsInstance<ToolCallRecord>()
        ?.lastOrNull { it.result == null }
        ?.let(::toolLine)

/** How many lines of the last reply a running session shows. */
private const val REPLY_HEAD_LINES = 3

/** The first REPLY_HEAD_LINES non-blank lines of [reply], with an ellipsis when more follow; null when none. */
fun replyHead(reply: String?): String? {
    val lines = reply?.lines()?.filter { it.isNotBlank() }.orEmpty()
    if (lines.isEmpty()) return null
    val head = lines.take(REPLY_HEAD_LINES).joinToString("\n")
    return if (lines.size > REPLY_HEAD_LINES) "$head…" else head
}

/** The text (not reasoning) of the last assistant message, trimmed; null when none. */
fun lastReplyText(transcript: Transcript): String? =
    lastAssistant(transcript)
        ?.parts
        ?.values()
        ?.filterIsInstance<TextRecord>()
        ?.filter { !it.reasoning }
        ?.joinToString("\n\n") { it.text }
        ?.trim()
        ?.takeIf { it.isNotEmpty() }

private fun lastAssistant(transcript: Transcript): MessageRecord? =
    transcript.messages.order
        .lastOrNull { transcript.messages[it]?.role == Role.ASSISTANT }
        ?.let { transcript.messages[it] }
