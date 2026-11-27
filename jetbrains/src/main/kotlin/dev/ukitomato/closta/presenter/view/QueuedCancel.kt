package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead

// Withdrawing a message the user sent while a turn ran, before the CLI starts it: what the row of that message offers
// and says, from the host's own records (the request, the CLI's answer) and core's turns.

/** Where the withdrawal of a message is. */
enum class CancelPhase {
    /** The message waits in the CLI's queue: it can be withdrawn. */
    OFFER,

    /** The withdrawal was sent and not answered. */
    WAITING,

    /** The message will not run. */
    CANCELLED,

    /** The CLI had taken the message in already. */
    TOO_LATE,

    /** The CLI refused the withdrawal, or it could not be sent; [AskCancel.detail] says why. */
    FAILED,
}

/** What the row of a message says of its withdrawal; [detail] is the sentence of a [CancelPhase.FAILED]. */
data class AskCancel(
    val phase: CancelPhase,
    val detail: String? = null,
) {
    // The sentence may be the CLI's own words: only the phase is written to a log.
    override fun toString(): String = "AskCancel($phase)"
}

/** The most messages whose withdrawal is kept (the newest), and the most requests waiting for an answer. */
const val MAX_CANCELS = 32

/** The sentence of a request that could not be written to the CLI. */
const val REQUEST_NOT_SENT = "The request could not be sent."

private fun <V> Map<String, V>.newest(): Map<String, V> =
    if (size <= MAX_CANCELS) this else entries.drop(size - MAX_CANCELS).associate { it.key to it.value }

/** The withdrawal of the message [ControlRequested.value] (its uuid) was asked under the request's id. */
internal fun OperationRecords.cancelAsked(input: PresenterInput.ControlRequested): OperationRecords {
    val uuid = input.value ?: return this
    return copy(
        cancelAsks = (cancelAsks + (input.requestId to uuid)).newest(),
        cancels = ((cancels - uuid) + (uuid to AskCancel(CancelPhase.WAITING))).newest(),
    )
}

/** The withdrawal [id] could not be written: its message can be withdrawn again, and the row says it was not sent. */
internal fun OperationRecords.cancelSendFailed(id: String): OperationRecords {
    val uuid = cancelAsks[id] ?: return this
    return copy(cancelAsks = cancelAsks - id).cancelSettled(uuid, AskCancel(CancelPhase.FAILED, REQUEST_NOT_SENT))
}

/**
 * The answer to the withdrawal [id]: `cancelled: true` is withdrawn, `false` is too late, a refusal is failed with the
 * CLI's sentence. A success that says neither leaves the row waiting for the CLI's lifecycle line.
 */
internal fun OperationRecords.cancelAnswered(
    id: String,
    event: AgentEvent.ControlResponse,
): OperationRecords {
    val uuid = cancelAsks[id] ?: return this
    val settled = copy(cancelAsks = cancelAsks - id)
    val outcome =
        when {
            event.subtype != "success" -> AskCancel(CancelPhase.FAILED, plainSentenceOf(event.error))
            else ->
                when (cancelledOf(event)) {
                    true -> AskCancel(CancelPhase.CANCELLED)
                    false -> AskCancel(CancelPhase.TOO_LATE)
                    null -> null
                }
        }
    return if (outcome == null) settled else settled.cancelSettled(uuid, outcome)
}

/** A withdrawal the table dropped (it kept the newest) is not written back. */
private fun OperationRecords.cancelSettled(
    uuid: String,
    cancel: AskCancel,
): OperationRecords = if (uuid in cancels) copy(cancels = cancels + (uuid to cancel)) else this

/** Whether the answer says the message was withdrawn; null when it does not say. */
private fun cancelledOf(event: AgentEvent.ControlResponse): Boolean? {
    val body = (JsonRead.parse(event.response.text) as? JsonObject)?.obj("response")
    return (body?.get("cancelled") as? JsonBool)?.value
}

/** The uuid of the message this answer withdrew, or null when it is not a success that says `cancelled: true`. */
internal fun Transcript.withdrawnBy(event: AgentEvent.ControlResponse): String? {
    val uuid = event.requestId?.let { operations.cancelAsks[it] } ?: return null
    return uuid.takeIf { event.subtype == "success" && cancelledOf(event) == true }
}

/**
 * The message [uuid] is withdrawn: its key goes into [Transcript.withdrawn], which the tables' limit does not push
 * out (it holds only keys of the transcript's own messages), and its record says so.
 */
internal fun Transcript.withWithdrawn(uuid: String): Transcript {
    val key = userUuids.entries.firstOrNull { it.value == uuid }?.key
    val marked = copy(operations = operations.cancelMarked(uuid))
    return if (key == null || key in withdrawn) marked else marked.copy(withdrawn = withdrawn + key)
}

private fun OperationRecords.cancelMarked(uuid: String): OperationRecords =
    copy(cancels = ((cancels - uuid) + (uuid to AskCancel(CancelPhase.CANCELLED))).newest())
