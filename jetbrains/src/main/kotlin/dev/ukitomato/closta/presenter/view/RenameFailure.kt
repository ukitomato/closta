package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent

/** A rename the CLI refused: the request's mark and the CLI's sentence. */
data class RenameFailure(
    val requestId: String,
    val sentence: String,
)

/**
 * A rename is asked: the name waits under the request's id, and the CLI's answer carries nothing but that id. At most
 * [MAX_WAITING] wait (the newest); an answer for one pushed out is an answer for an id nobody knows.
 */
internal fun OperationRecords.renameAsked(input: PresenterInput.ControlRequested): OperationRecords =
    copy(renameAsks = (renameAsks + (input.requestId to input.value.orEmpty())).asNewest())

private fun Map<String, String>.asNewest(): Map<String, String> =
    if (size <= MAX_WAITING) this else entries.drop(size - MAX_WAITING).associate { it.key to it.value }

/** The answer to the rename [id]: it stops waiting, and a refusal is kept with the CLI's sentence. */
internal fun OperationRecords.renameAnswered(
    id: String,
    event: AgentEvent.ControlResponse,
): OperationRecords {
    val settled = copy(renameAsks = renameAsks - id)
    return if (event.subtype == "success") {
        settled
    } else {
        settled.copy(renameFailure = RenameFailure(id, plainSentenceOf(event.error)))
    }
}

/** The CLI took the rename [event] answers: the name asked under its id is now the session's. Anything else is not. */
internal fun Transcript.renameTaken(event: AgentEvent.ControlResponse): Transcript {
    val title = event.requestId?.let { operations.renameAsks[it] }
    return if (title == null || event.subtype != "success") this else copy(customTitle = title)
}

/** The refusal to tell the user of: [now] when it is not the one already [told] (by its request id), else null. */
fun freshRenameFailure(
    told: String?,
    now: RenameFailure?,
): RenameFailure? = now?.takeIf { it.requestId != told }
