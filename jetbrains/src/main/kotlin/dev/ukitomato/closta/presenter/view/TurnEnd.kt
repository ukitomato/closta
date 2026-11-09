package dev.ukitomato.closta.presenter.view

/**
 * A file a turn changed, as the host found it against the Local History label it put down when the turn was sent.
 * Never what is in it.
 */
data class ChangedFile(
    val path: String,
    val added: Int,
    val removed: Int,
    /** Whether the turn made it: its first change in the turn was its creation (never read from Local History). */
    val created: Boolean,
    val deleted: Boolean,
    /** Whether "Revert All" can put it back: Local History has its content at the label, or the turn made it. */
    val revertable: Boolean = true,
    /** Whether [added] and [removed] were counted (not for a binary or a big file). */
    val counted: Boolean = true,
) {
    // The path is the user's: never in a log.
    override fun toString(): String = "ChangedFile(+$added -$removed, created=$created, deleted=$deleted)"
}

/** What the host found a turn changed, in its order. */
data class TurnChangesRecord(
    val files: List<ChangedFile>,
    /** Whether more files changed than the host looked at. */
    val more: Boolean = false,
)

/** How a turn ended: the `result` that closed it. [askKey] is the user message it answered; [durationMs] its time. */
data class TurnEndRecord(
    val askKey: String?,
    val durationMs: Long?,
)

/**
 * The key of the user message a turn answers: the one sent with the turn's `command_uuid`, else the last user message
 * ahead of the turn's own message.
 */
internal fun askKeyOf(
    transcript: Transcript,
    turnKey: String,
): String? {
    val turn = transcript.messages[turnKey]?.source as? MessageSource.Turn
    if (turn != null) {
        transcript.userUuids.entries
            .firstOrNull { it.value == turn.commandUuid }
            ?.let { return it.key }
    }
    val order = transcript.messages.order
    val at = order.indexOf(turnKey)
    return (at - 1 downTo 0).map(order::get).firstOrNull { transcript.messages[it]?.role == Role.USER }
}

/** The host found what [PresenterInput.TurnChangesFound.askKey]'s turn changed; a later finding replaces it. */
internal fun foldTurnChanges(
    transcript: Transcript,
    input: PresenterInput.TurnChangesFound,
): Transcript {
    val record = TurnChangesRecord(input.files, input.more)
    if (transcript.turnChanges[input.askKey] == record) return transcript
    return transcript.copy(turnChanges = transcript.turnChanges.plusEntry(input.askKey, record))
}

/** [turnKey]'s turn was closed by a `result` that took [durationMs]. */
internal fun Transcript.withTurnEnd(
    turnKey: String,
    durationMs: Long?,
): Transcript = copy(turnEnds = turnEnds.plusEntry(turnKey, TurnEndRecord(askKeyOf(this, turnKey), durationMs)))
