package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.TurnPhase

/** What the host did that the operations console shows: a request it sent or could not, a refusal, a launch. */
internal fun foldOperation(
    operations: OperationRecords,
    input: PresenterInput,
): OperationRecords =
    when (input) {
        is PresenterInput.ControlRequested -> operations.control(input)
        is PresenterInput.ControlSendFailed -> operations.sendFailed(input.requestId)
        is PresenterInput.EffortRefused -> operations.refuseEffort(input)
        is PresenterInput.Launched -> operations.launched(input)
        is PresenterInput.SandboxRefused -> operations.refuseSandbox(input)
        is PresenterInput.SandboxNotStarted -> operations.sandboxNotStarted(input)
        is PresenterInput.RewindRequested,
        is PresenterInput.RewindNotSent,
        -> operations.foldRewindAsk(input)
        is PresenterInput.ResumeRefused -> operations.refuseResume(input)
        is PresenterInput.AttachmentRefused -> operations.refuseAttachment(input)
        is PresenterInput.RateLimitDismissed -> operations.dismissRateLimit(input.seq)
        else -> operations
    }

/** Keeps the turns open now, which the next `result` ends; with none open, the transcript is the same object. */
internal fun foldStop(
    transcript: Transcript,
    conversation: ConversationState,
): Transcript {
    val routing = transcript.routing
    val open =
        conversation.turns
            .filter { it.phase == TurnPhase.OPEN && it.commandUuid !in routing.stopped }
            .mapTo(HashSet()) { it.commandUuid }
    return if (open.isEmpty()) {
        transcript
    } else {
        transcript.copy(
            routing = routing.copy(stopping = routing.stopping + open),
        )
    }
}

/** A `result` after a stop: the turns open at the stop are over, whatever turn the `result` named. */
internal fun stopTaken(transcript: Transcript): Transcript {
    val routing = transcript.routing
    if (routing.stopping.isEmpty()) return transcript
    return transcript.copy(routing = routing.copy(stopped = routing.stopped + routing.stopping, stopping = emptySet()))
}

/** The CLI's answer to a request of the host's: the operations it settles, the name it gave, the commands it lists. */
internal fun foldResponse(
    transcript: Transcript,
    event: AgentEvent.ControlResponse,
): Transcript {
    val named = transcript.renameTaken(event)
    val withdrawn = transcript.withdrawnBy(event)
    val answered = foldCommandsOfResponse(named.withOperations(named.operations.answered(event)), event)
    // A withdrawn message does not run: core holds its turn open until the CLI says so, and it is not running.
    val routing = answered.routing
    return if (withdrawn ==
        null
    ) {
        answered
    } else {
        answered.copy(routing = routing.copy(stopped = routing.stopped + withdrawn))
    }
}
