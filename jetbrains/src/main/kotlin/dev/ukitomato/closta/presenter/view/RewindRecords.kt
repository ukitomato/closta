package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString

// The last rewind of the files: what the webview asked, and how the CLI answered. Only the last one is kept, as
// the webview opens one panel; it lives in [OperationRecords] so that a change of it updates the tree as the others do.

/** How a rewind ended. [PENDING] is asked and not answered. */
enum class RewindOutcome(
    val wire: String,
) {
    PENDING("pending"),
    DONE("done"),
    REFUSED("refused"),
    FAILED("failed"),
}

/**
 * The last `rewind-files` command. [requestId] is the host's mark on the CLI request (null for one the host refused
 * itself, which has no answer to wait for); [commandId] is the webview's own mark. [sendsAt] is how many user messages
 * had been sent when a dry run was asked, and [turnsAt] how many turns there had been ([turnsSoFar]): a real rewind
 * after another message or turn is not the one that was checked.
 * [files] are the paths a dry run said would change (at most [MAX_REWIND_FILES]) and [filesTotal] how many there were.
 */
data class RewindRecord(
    val requestId: String?,
    val commandId: String,
    val messageId: String,
    val dryRun: Boolean,
    val sendsAt: Int,
    val turnsAt: Int,
    val outcome: RewindOutcome = RewindOutcome.PENDING,
    val files: List<String> = emptyList(),
    val filesTotal: Int = 0,
    val insertions: Long = 0,
    val deletions: Long = 0,
    val detail: String? = null,
) {
    // The paths are the user's files: never in a log.
    override fun toString(): String = "RewindRecord($commandId, dryRun=$dryRun, $outcome, ${files.size} files)"
}

/** The most paths kept of a dry run; the rest are only counted. */
const val MAX_REWIND_FILES = 200

/** What a success whose body cannot be read says. */
const val REWIND_UNREADABLE = "The answer of the CLI could not be read."

/** What a failed write says. */
const val REWIND_SEND_FAILED = "The request could not be sent to the session."

/** The host's own record of a rewind: asked and written ([PresenterInput.RewindRequested]), or refused. */
internal fun OperationRecords.foldRewindAsk(input: PresenterInput): OperationRecords =
    when (input) {
        is PresenterInput.RewindRequested -> rewindRequested(input)
        is PresenterInput.RewindNotSent -> rewindNotSent(input)
        else -> this
    }

private fun OperationRecords.rewindRequested(input: PresenterInput.RewindRequested): OperationRecords =
    copy(
        rewind =
            RewindRecord(
                requestId = input.requestId,
                commandId = input.commandId,
                messageId = input.messageId,
                dryRun = input.dryRun,
                sendsAt = input.sendsAt,
                turnsAt = input.turnsAt,
            ),
    )

/** The host did not send the rewind: it is a record that is over at once. */
private fun OperationRecords.rewindNotSent(input: PresenterInput.RewindNotSent): OperationRecords =
    copy(
        rewind =
            RewindRecord(
                requestId = null,
                commandId = input.commandId,
                messageId = input.messageId,
                dryRun = input.dryRun,
                sendsAt = 0,
                turnsAt = 0,
                outcome = RewindOutcome.FAILED,
                detail = input.reason,
            ),
    )

/** The request [requestId] could not be written. Returns null when it is not the pending rewind. */
internal fun OperationRecords.rewindSendFailed(requestId: String): OperationRecords? {
    val record = rewind
    if (record == null || record.requestId != requestId || record.outcome != RewindOutcome.PENDING) return null
    return copy(rewind = record.copy(outcome = RewindOutcome.FAILED, detail = REWIND_SEND_FAILED))
}

/** The CLI's answer to the pending rewind [event] is for; null when it is for no pending rewind. */
internal fun OperationRecords.rewindAnswered(event: AgentEvent.ControlResponse): OperationRecords? {
    val record = rewind?.takeIf { it.outcome == RewindOutcome.PENDING && it.requestId == event.requestId }
    val answered = record?.let { if (event.subtype == "success") it.answeredBy(event) else it.errored(event.error) }
    return answered?.let { copy(rewind = it) }
}

private fun RewindRecord.errored(error: String?) = copy(outcome = RewindOutcome.FAILED, detail = plainSentenceOf(error))

// A success: the CLI says whether it can. `canRewind` false is its refusal, with the reason in the answer's `error`.
// A body that cannot be read (no response, or no canRewind that is true or false) is not its no, and is failed.
private fun RewindRecord.answeredBy(event: AgentEvent.ControlResponse): RewindRecord {
    val body = (JsonRead.parse(event.response.text) as? JsonObject)?.obj("response")
    return when ((body?.get("canRewind") as? JsonBool)?.value) {
        null -> copy(outcome = RewindOutcome.FAILED, detail = REWIND_UNREADABLE)
        false -> copy(outcome = RewindOutcome.REFUSED, detail = plainSentenceOf(body?.string("error") ?: event.error))
        true -> done(body)
    }
}

private fun RewindRecord.done(body: JsonObject?): RewindRecord {
    val changed = (body?.get("filesChanged") as? JsonArray)?.items?.mapNotNull { (it as? JsonString)?.value }.orEmpty()
    return copy(
        outcome = RewindOutcome.DONE,
        files = changed.take(MAX_REWIND_FILES),
        filesTotal = changed.size,
        insertions = body?.count("insertions") ?: 0,
        deletions = body?.count("deletions") ?: 0,
    )
}

/** The tree's `rewind` of a thread. The host's marks (the request id, its place in the sends and turns) stay out. */
internal fun rewindNode(record: RewindRecord): JsonObject {
    val node =
        JsonObject
            .Builder()
            .put("commandId", JsonString(record.commandId))
            .put("messageId", JsonString(record.messageId))
            .put("dryRun", JsonBool.of(record.dryRun))
            .put("outcome", JsonString(record.outcome.wire))
            .put("files", JsonArray(record.files.map(::JsonString)))
            .put("filesTotal", JsonNumber.of(record.filesTotal.toLong()))
            .put("insertions", JsonNumber.of(record.insertions))
            .put("deletions", JsonNumber.of(record.deletions))
    record.detail?.let { node.put("detail", JsonString(it)) }
    return node.build()
}
