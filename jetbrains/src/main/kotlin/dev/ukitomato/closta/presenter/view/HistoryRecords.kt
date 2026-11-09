package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString

// What the history of sessions shows, kept next to the transcript: the project's saved sessions, and the earlier
// conversation of a resumed session that was put back from its record.

/** One saved session as the tree lists it: the title is the user's own words, shown and never logged. */
data class SavedSessionRecord(
    val id: String,
    val title: String,
    val updatedAtMs: Long,
    val current: Boolean,
) {
    override fun toString(): String = "SavedSessionRecord($id, ${title.length} chars, current=$current)"
}

/**
 * What was put back when the session was resumed: the key of the last message of it ([until], so every message up to
 * and including it is the earlier conversation, read only), how many messages that is, and whether the record held
 * more than was put back ([partly]).
 */
data class RestoredRecord(
    val until: String,
    val count: Int,
    val partly: Boolean,
)

/**
 * What the projection reads of the history in a [Transcript], as one value so that a context compares it in one step:
 * the
 * list the host last gave, whether the last listing could not be read, what was put back, and whether the record could
 * not be read.
 */
internal data class HistoryFacts(
    val savedSessions: List<SavedSessionRecord>?,
    val savedSessionsUnreadable: Boolean,
    val restored: RestoredRecord?,
    val unavailable: Boolean,
) {
    companion object {
        fun of(transcript: Transcript) =
            HistoryFacts(
                transcript.savedSessions,
                transcript.savedSessionsUnreadable,
                transcript.restored,
                transcript.historyUnavailable,
            )
    }
}

/** The sentence of a resume the host refused because a turn was running: the same as an effort switch's. */
const val RESUME_REFUSED_TURN = EFFORT_REFUSED_TURN

/** The sentence of a resume the host refused because another tab of the tool window has that session. */
const val RESUME_REFUSED_ELSEWHERE = "It is open in another tab"

/** The host did not open the saved session [PresenterInput.ResumeRefused.sessionId]: a record that is over at once. */
internal fun OperationRecords.refuseResume(input: PresenterInput.ResumeRefused): OperationRecords =
    if (switches.any { it.id == input.requestId }) {
        this
    } else {
        withSwitch(
            SwitchRecord(
                input.requestId,
                seq + 1,
                SwitchKind.RESUME,
                input.sessionId,
                SwitchOutcome.REJECTED,
                when (input.reason) {
                    ResumeRefusal.TURN -> RESUME_REFUSED_TURN
                    ResumeRefusal.ELSEWHERE -> RESUME_REFUSED_ELSEWHERE
                },
            ),
        )
    }

/** What the thread says of a record that could not be read: its first notice, ahead of the CLI's. */
const val HISTORY_UNAVAILABLE_TEXT =
    "The earlier conversation of this session could not be read, so it is not shown. The session goes on without it."

/**
 * The inputs of the history of sessions: the list, the earlier conversation put back, and what became of it.
 * [fallback] folds a line of the record that is not the user's words, as the same line from stdout is folded.
 */
internal fun Transcript.foldHistory(
    input: PresenterInput,
    before: ConversationState,
    after: ConversationState,
    fallback: (Transcript, AgentEvent, ConversationState, ConversationState) -> Transcript,
): Transcript =
    when (input) {
        is PresenterInput.SessionsListed -> listed(input)
        is PresenterInput.Restored -> foldRestoredEvent(this, input.event, before, after, fallback)
        is PresenterInput.HistoryRestored -> restoredWith(input)
        PresenterInput.HistoryUnavailable -> unavailable()
        else -> this
    }

/** The host's list of the saved sessions: the new list, or (unreadable) the one before it marked as not current. */
internal fun Transcript.listed(input: PresenterInput.SessionsListed): Transcript =
    if (input.unreadable) {
        if (savedSessionsUnreadable) this else copy(savedSessionsUnreadable = true)
    } else {
        val records =
            input.sessions.map { SavedSessionRecord(it.id, it.title, it.updatedAtMs, it.id == input.currentId) }
        if (savedSessions == records && !savedSessionsUnreadable) {
            this
        } else {
            copy(savedSessions = records, savedSessionsUnreadable = false)
        }
    }

/**
 * A line of the record put back. A user's words (a string, or a list of text blocks with no tool result among them)
 * are a user message — the only place they are known — and end the assistant message before them, so that what the
 * assistant said after them is a message of its own. Any other line folds as its twin from stdout.
 */
internal fun foldRestoredEvent(
    transcript: Transcript,
    event: AgentEvent,
    before: ConversationState,
    after: ConversationState,
    fallback: (Transcript, AgentEvent, ConversationState, ConversationState) -> Transcript,
): Transcript {
    val user = (event as? AgentEvent.User)?.takeIf { it.parentToolUseId == null }
    val words = user?.let(::wordsOf)
    return if (user == null || words.isNullOrEmpty()) {
        fallback(transcript, event, before, after)
    } else {
        transcript.userSaid(user.uuid, words)
    }
}

/**
 * The sentences a user line holds, when it holds the user's words and no result of a tool: a string, or a list of text
 * blocks. Blank ones are not words.
 */
private fun wordsOf(user: AgentEvent.User): List<String>? {
    val content = (JsonRead.parse(user.message.text) as? JsonObject)?.get("content")
    return when (content) {
        is JsonString -> listOf(content.value).filter(String::isNotBlank)
        is JsonArray -> {
            val blocks = content.items.filterIsInstance<JsonObject>()
            if (blocks.any { it.string("type") == "tool_result" }) {
                null
            } else {
                blocks.filter { it.string("type") == TEXT }.mapNotNull { it.string(TEXT) }.filter(String::isNotBlank)
            }
        }
        else -> null
    }
}

private fun Transcript.userSaid(
    uuid: String,
    words: List<String>,
): Transcript {
    val ended = endResume()
    val key = ended.messages.claim(Keys.ofCliId(uuid))
    var parts = Keyed.empty<PartRecord>()
    words.forEachIndexed { index, text -> parts = parts.put("$key:$index", TextRecord(reasoning = false, text = text)) }
    return ended.copy(
        messages = ended.messages.put(key, MessageRecord(key, Role.USER, MessageSource.Sent, parts)),
        // The record's own uuid is the one the CLI knows the message by.
        userUuids = ended.userUuids + (key to uuid),
    )
}

/** The assistant message that is open without a turn, ended as a `result` would have: not running, not failed. */
private fun Transcript.endResume(): Transcript {
    val open = routing.openResume ?: return this
    return copy(
        messages =
            messages.update(
                open,
            ) { it.copy(source = MessageSource.Resume(ResumeEnd(isError = false, result = ""))) },
        routing = routing.copy(openResume = null),
    )
}

/** Everything the record gave is back: nothing it said is still running, and where it ends is kept. */
internal fun Transcript.restoredWith(input: PresenterInput.HistoryRestored): Transcript {
    val ended = endResume()
    val until = ended.messages.order.lastOrNull() ?: return ended
    return ended.copy(restored = RestoredRecord(until, ended.messages.size, partly = input.dropped > 0))
}

internal fun Transcript.unavailable(): Transcript = if (historyUnavailable) this else copy(historyUnavailable = true)

/** The saved sessions, newest first as the host listed them. */
internal fun savedSessionsNode(sessions: List<SavedSessionRecord>): JsonArray =
    JsonArray(
        sessions.map { record ->
            JsonObject.of(
                "id" to JsonString(record.id),
                "title" to JsonString(record.title),
                "updatedAt" to JsonNumber.of(record.updatedAtMs),
                "current" to JsonBool.of(record.current),
            )
        },
    )
