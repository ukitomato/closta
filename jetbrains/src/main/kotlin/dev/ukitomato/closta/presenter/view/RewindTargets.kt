package dev.ukitomato.closta.presenter.view

/**
 * What can be done from an ask or a turn's end: rewind the conversation, rewind the files and then the conversation,
 * or fork. Each carries the uuid of the user line a copy of the saved record leaves out from (`SessionOpening.Fork`'s
 * `rewindBefore`); null leaves nothing out of a fork and keeps nothing of a rewind.
 */
sealed interface AskAction

/** Opens a copy without the ask and what came after; [rewindBefore] null keeps nothing (a new conversation). */
data class RewindConversation(
    val rewindBefore: String?,
) : AskAction

/** Puts the files back as they were before the ask [messageId] first, then rewinds as [RewindConversation] does. */
data class RewindFilesThenConversation(
    val messageId: String,
    val rewindBefore: String?,
) : AskAction

/** Opens a copy up to and with the ask's exchange: [rewindBefore] is the next ask's uuid, null for the last ask. */
data class ForkFrom(
    val rewindBefore: String?,
) : AskAction

/** The actions an ask or a turn's end offers; when none is offered, [refusal] says why. */
data class AskActions(
    val rewind: RewindConversation?,
    val rewindFiles: RewindFilesThenConversation?,
    val fork: ForkFrom?,
    val refusal: RewindRefusal?,
)

/** Why an ask or a turn's end offers nothing; the screen puts it into words. */
enum class RewindRefusal {
    /** The thread is running. */
    RUNNING,

    /** The CLI has no record of the ask. */
    UNKNOWN,

    /** Nothing came after the turn. */
    NOTHING_AFTER,

    /** The ask came before the conversation was cleared: the CLI's conversation now has no record of it. */
    BEFORE_CLEAR,
}

private fun refused(why: RewindRefusal) = AskActions(null, null, null, why)

/** What the ask [askKey] offers. [running] is whether the thread is running (`threadIsRunning`). */
fun askActions(
    transcript: Transcript,
    running: Boolean,
    askKey: String,
): AskActions {
    val asks = liveAsks(transcript)
    val at = asks.indexOf(askKey)
    return when {
        running -> refused(RewindRefusal.RUNNING)
        at < 0 && askKey in sentAsks(transcript) -> refused(RewindRefusal.BEFORE_CLEAR)
        at < 0 -> refused(RewindRefusal.UNKNOWN)
        else -> {
            // The record's first user line has no parent to cut at: rewinding to it keeps nothing. After a clear the
            // record starts afresh, whatever was put back of the one before.
            val keepsNothing = at == 0 && (transcript.clearedAt != null || transcript.restored?.partly != true)
            val before = if (keepsNothing) null else transcript.userUuids.getValue(askKey)
            val next = asks.getOrNull(at + 1)?.let(transcript.userUuids::getValue)
            AskActions(
                rewind = RewindConversation(before),
                rewindFiles = RewindFilesThenConversation(askKey, before),
                fork = ForkFrom(next),
                refusal = null,
            )
        }
    }
}

/** What the end of the turn that answered [askKey] offers: rewinding to right after it (no fork). */
fun turnEndActions(
    transcript: Transcript,
    running: Boolean,
    askKey: String,
): AskActions {
    val asks = liveAsks(transcript)
    val at = asks.indexOf(askKey)
    val next = asks.getOrNull(at + 1)
    return when {
        running -> refused(RewindRefusal.RUNNING)
        at < 0 && askKey in sentAsks(transcript) -> refused(RewindRefusal.BEFORE_CLEAR)
        at < 0 -> refused(RewindRefusal.UNKNOWN)
        next == null -> refused(RewindRefusal.NOTHING_AFTER)
        else -> askActions(transcript, false, next).copy(fork = null)
    }
}

/** The keys of the thread's user messages the CLI knows by a uuid, in order. */
internal fun sentAsks(transcript: Transcript): List<String> =
    transcript.messages.order.filter { key ->
        key in transcript.userUuids && transcript.messages[key]?.role == Role.USER
    }

/** [sentAsks] after the last clear: the asks of the conversation the CLI has now. */
internal fun liveAsks(transcript: Transcript): List<String> {
    val cleared = transcript.clearedAt ?: return sentAsks(transcript)
    val after =
        transcript.messages.order
            .drop(cleared + 1)
            .toHashSet()
    return sentAsks(transcript).filter { it in after }
}
