package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject

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
    return copy(
        backgroundAsks = (backgroundAsks + (input.requestId to toolUseId)).newest(),
        backgrounding =
            (
                (backgrounding - toolUseId) + (
                    toolUseId to
                        BackgroundOffer(
                            BackgroundPhase.WAITING,
                        )
                )
            ).newest(),
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
    backgroundSettled(
        id,
        if (event.subtype ==
            "success"
        ) {
            null
        } else {
            BackgroundOffer(BackgroundPhase.FAILED, plainSentenceOf(event.error))
        },
    )

/**
 * The request [id] is over. [outcome] goes on its call's line unless a newer request for that call is still waiting
 * (its answer is the one that counts) or the table dropped the call (it is not written back).
 */
private fun OperationRecords.backgroundSettled(
    id: String,
    outcome: BackgroundOffer?,
): OperationRecords {
    val toolUseId = backgroundAsks[id] ?: return this
    val rest = backgroundAsks - id
    val settled = copy(backgroundAsks = rest)
    val current = toolUseId in backgrounding && toolUseId !in rest.values
    return if (outcome == null ||
        !current
    ) {
        settled
    } else {
        settled.copy(backgrounding = backgrounding + (toolUseId to outcome))
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
) {
    private val asked = transcript.operations.backgrounding
    private val away: Set<String>

    init {
        val background = transcript.background
        val tasks = background.live.mapTo(HashSet()) { it.taskId } + background.backgrounded
        away = tasks.mapNotNullTo(HashSet()) { background.toolUseIds[it] ?: background.progress[it]?.toolUseId }
    }

    fun of(part: PartRecord): BackgroundOffer? =
        if (live && part is ToolCallRecord && runsInFront(part)) {
            asked[part.toolUseId] ?: BackgroundOffer(BackgroundPhase.OFFER)
        } else {
            null
        }

    private fun runsInFront(call: ToolCallRecord): Boolean =
        call.result == null &&
            !call.streaming &&
            (call.toolName == BASH_TOOL || call.toolName in AGENT_TOOLS) &&
            call.toolUseId !in away &&
            !runsInBackground(call)

    private fun runsInBackground(call: ToolCallRecord): Boolean =
        ((call.input as? JsonObject)?.get("run_in_background") as? JsonBool)?.value == true
}

/** How many of the newest messages are looked at for a running call: a call in front is part of the turn that runs. */
private const val RECENT_MESSAGES = 16

/** Whether a call among the newest messages runs in front and can be moved to the background. */
internal fun hasBackgroundOffer(transcript: Transcript): Boolean {
    val offers = BackgroundOffers(transcript, live = true)
    return transcript.messages.order
        .asReversed()
        .asSequence()
        .take(RECENT_MESSAGES)
        .mapNotNull { transcript.messages[it] }
        .any { message -> message.role != Role.USER && message.parts.values().any { offers.of(it) != null } }
}

/** The offers of a build of the rows: nothing is offered unless the CLI is up and a turn runs. */
internal fun backgroundOffersOf(
    transcript: Transcript,
    conversation: ConversationState,
    live: Boolean,
    enabled: Boolean,
): BackgroundOffers = BackgroundOffers(transcript, live && enabled && threadIsRunning(conversation, transcript))
