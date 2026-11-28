package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead

/** Where moving a running call to the background is. */
enum class BackgroundPhase {
    /** The call runs in front and can be moved. */
    OFFER,

    /** The request was sent and not answered. */
    WAITING,

    /** The CLI refused the request, or it could not be sent; [BackgroundOffer.detail] says why. */
    FAILED,
}

/** What a call's line says of moving it to the background; [detail] is the sentence of a [BackgroundPhase.FAILED]. */
data class BackgroundOffer(
    val phase: BackgroundPhase,
    val detail: String? = null,
) {
    // The sentence may be the CLI's own words: only the phase is written to a log.
    override fun toString(): String = "BackgroundOffer($phase)"
}

/** The most calls whose request is kept (the newest), and the most requests waiting for an answer. */
const val MAX_BACKGROUND_ASKS = 32

private fun <V> Map<String, V>.newest(): Map<String, V> =
    if (size <= MAX_BACKGROUND_ASKS) this else entries.drop(size - MAX_BACKGROUND_ASKS).associate { it.key to it.value }

/**
 * The move of the call [ControlRequested.value] (its tool use id) was asked under the request's id. A request for every
 * running call (no value) has no line to mark, so nothing is kept for it.
 */
internal fun OperationRecords.backgroundAsked(input: PresenterInput.ControlRequested): OperationRecords {
    val toolUseId = input.value ?: return this
    val waiting = BackgroundOffer(BackgroundPhase.WAITING)
    return copy(
        backgroundAsks = (backgroundAsks + (input.requestId to toolUseId)).newest(),
        backgrounding = ((backgrounding - toolUseId) + (toolUseId to waiting)).newest(),
    )
}

/** The request [id] could not be written: its line says so and offers the move again. */
internal fun OperationRecords.backgroundSendFailed(id: String): OperationRecords =
    backgroundSettled(id, BackgroundOffer(BackgroundPhase.FAILED, REQUEST_NOT_SENT))

/**
 * The answer to the request [id]: a success leaves the line waiting (the call's result, the background list or the
 * task's update is what ends it); a refusal fails it with the CLI's sentence.
 */
internal fun OperationRecords.backgroundAnswered(
    id: String,
    event: AgentEvent.ControlResponse,
): OperationRecords =
    when {
        event.subtype != "success" -> backgroundSettled(id, refused(event))
        notMoved(event) -> backgroundSettled(id, null, clear = true)
        else -> backgroundSettled(id, null)
    }

private fun refused(event: AgentEvent.ControlResponse) =
    BackgroundOffer(BackgroundPhase.FAILED, plainSentenceOf(event.error))

/**
 * Whether a success says the call was not moved (the CLI answers `false` for a call that does not run in front, or not
 * yet): the response is `false`, or an object whose `backgrounded` is `false`.
 */
private fun notMoved(event: AgentEvent.ControlResponse): Boolean {
    val body = (JsonRead.parse(event.response.text) as? JsonObject)?.get("response")
    return (body as? JsonBool)?.value == false ||
        ((body as? JsonObject)?.get("backgrounded") as? JsonBool)?.value == false
}

/**
 * The request [id] is over. [outcome] goes on its call's line (with [clear], the line is
 * cleared) unless a newer request for that call is still waiting (its answer is the one that counts) or the table
 * dropped the call (it is not written back).
 */
private fun OperationRecords.backgroundSettled(
    id: String,
    outcome: BackgroundOffer?,
    clear: Boolean = false,
): OperationRecords {
    val toolUseId = backgroundAsks[id] ?: return this
    val rest = backgroundAsks - id
    val settled = copy(backgroundAsks = rest)
    val current = toolUseId in backgrounding && toolUseId !in rest.values
    return when {
        !current -> settled
        clear -> settled.copy(backgrounding = backgrounding - toolUseId)
        outcome == null -> settled
        else -> settled.copy(backgrounding = backgrounding + (toolUseId to outcome))
    }
}

private const val BASH_TOOL = "Bash"

/**
 * What the lines of a transcript offer, read once per build of the rows. A call is offered while it runs in front: no
 * result yet, not being streamed, not asked to run in the background, and its task (found by
 * [BackgroundTasks.toolUseIds]) neither listed nor moved. Once asked, the line says how the request stands.
 */
internal class BackgroundOffers(
    transcript: Transcript,
    private val live: Boolean,
    /** The tool use ids of the calls waiting for an answer: they do not run yet, so there is nothing to move. */
    private val held: Set<String> = emptySet(),
) {
    private val asked = transcript.operations.backgrounding
    private val away: Set<String>
    private val openCalls: List<ToolCallRecord> = callsOfOpenTurn(transcript)
    private val openIds = openCalls.mapTo(HashSet()) { it.toolUseId }

    init {
        val background = transcript.background
        val tasks = background.live.mapTo(HashSet()) { it.taskId } + background.backgrounded
        away = tasks.mapNotNullTo(HashSet()) { background.toolUseIds[it] ?: background.progress[it]?.toolUseId }
    }

    /** Whether a call of the open turn runs in front and can be moved to the background. */
    fun any(): Boolean = live && openCalls.any { runsInFront(it) }

    fun of(part: PartRecord): BackgroundOffer? =
        if (live && part is ToolCallRecord && offerable(part)) {
            asked[part.toolUseId] ?: BackgroundOffer(BackgroundPhase.OFFER)
        } else {
            null
        }

    private fun offerable(call: ToolCallRecord): Boolean = call.toolUseId in openIds && runsInFront(call)

    private fun runsInFront(call: ToolCallRecord): Boolean =
        call.result == null &&
            !call.streaming &&
            (call.toolName == BASH_TOOL || call.toolName in AGENT_TOOLS) &&
            call.toolUseId !in away &&
            call.toolUseId !in held &&
            !runsInBackground(call)

    private fun runsInBackground(call: ToolCallRecord): Boolean =
        ((call.input as? JsonObject)?.get("run_in_background") as? JsonBool)?.value == true
}

/**
 * The calls of the turn that runs: those in the messages after the last user message. A call of an earlier turn, or
 * one restored from a saved record, may never get a result; the CLI that runs now did not start it.
 */
private fun callsOfOpenTurn(transcript: Transcript): List<ToolCallRecord> {
    val calls = ArrayList<ToolCallRecord>()
    for (key in transcript.messages.order.asReversed()) {
        val message = transcript.messages[key]
        if (message?.role == Role.USER) break
        message?.parts?.values()?.filterIsInstanceTo(calls)
    }
    return calls
}

/** Whether a call of the open turn runs in front and can be moved to the background (send all). */
fun canBackground(
    transcript: Transcript,
    conversation: ConversationState,
    live: Boolean,
): Boolean = backgroundOffersOf(transcript, conversation, live, enabled = true).any()

/** The offers of a build of the rows: nothing is offered unless the CLI is up and a turn runs. */
internal fun backgroundOffersOf(
    transcript: Transcript,
    conversation: ConversationState,
    live: Boolean,
    enabled: Boolean,
): BackgroundOffers =
    BackgroundOffers(
        transcript,
        live && enabled && threadIsRunning(conversation, transcript),
        conversation.pendingApprovals.mapNotNullTo(HashSet()) { it.toolUseId },
    )
