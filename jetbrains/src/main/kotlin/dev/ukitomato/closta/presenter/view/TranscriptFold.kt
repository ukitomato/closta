package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.ApprovalKind
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.TurnPhase
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead

/**
 * Folds one input into the [Transcript]. A pure function that never throws: an event it has no use for, or
 * whose `RawJson` it cannot read, returns the transcript unchanged — the same object, so nothing above it
 * looks changed either.
 *
 * [before] and [after] are core's state around the caller's fold of the same input (`fold` for an event,
 * `resolveApproval` for a decision); this fold never calls core. Where content goes sometimes depends on
 * what core decided — whether a `result` closed a user turn, whether a request is a question — and reading
 * core's decision rather than repeating its rule keeps the two from drifting apart.
 */
fun foldTranscript(
    transcript: Transcript,
    input: PresenterInput,
    before: ConversationState,
    after: ConversationState,
): Transcript =
    when (input) {
        is PresenterInput.Event -> foldEvent(transcript, input.event, before, after)
        is PresenterInput.UserSent -> foldSent(transcript, input)
        PresenterInput.StopRequested -> foldStop(transcript, after)
        is PresenterInput.Decided -> foldDecided(transcript, input, before)
        is PresenterInput.AnswerFailed -> foldAnswerFailed(transcript, input, before)
        is PresenterInput.FilesFound,
        is PresenterInput.SelectionCaptured,
        is PresenterInput.CodeApplied,
        is PresenterInput.TurnChangesFound,
        -> foldAnswered(transcript, input)
        is PresenterInput.ControlRequested,
        is PresenterInput.ControlSendFailed,
        is PresenterInput.EffortRefused,
        is PresenterInput.Launched,
        is PresenterInput.RewindRequested,
        is PresenterInput.RewindNotSent,
        is PresenterInput.ResumeRefused,
        is PresenterInput.AttachmentRefused,
        -> transcript.withOperations(foldOperation(transcript.operations, input))
        is PresenterInput.SessionsListed,
        is PresenterInput.Restored,
        is PresenterInput.HistoryRestored,
        PresenterInput.HistoryUnavailable,
        -> transcript.foldHistory(input, before, after, ::foldEvent)
    }

private const val STARTED = "started"

private fun foldEvent(
    transcript: Transcript,
    event: AgentEvent,
    before: ConversationState,
    after: ConversationState,
): Transcript =
    when (event) {
        is AgentEvent.CommandLifecycle -> foldLifecycle(transcript, event)
        is AgentEvent.Result ->
            foldResult(transcript, event, before, after)
                .let { it.withOperations(it.operations.resulted(event)) }
                .let(::stopTaken)
        is AgentEvent.StreamEvent -> foldStream(transcript, event)
        is AgentEvent.Assistant -> foldSignIn(foldAssistant(transcript, event), event)
        is AgentEvent.User -> foldUser(transcript, event)
        is AgentEvent.ControlRequest -> foldRequest(transcript, event, after)
        is AgentEvent.ControlResponse ->
            foldCommandsOfResponse(transcript.withOperations(transcript.operations.answered(event)), event)
        is AgentEvent.SystemCompactBoundary ->
            transcript.withOperations(transcript.operations.compacted(event))
        is AgentEvent.SystemStatus -> transcript.withOperations(transcript.operations.statusSaid(event))
        is AgentEvent.SystemInit -> foldCommandsOfInit(transcript, event)
        is AgentEvent.SystemBackgroundTasksChanged,
        is AgentEvent.SystemTaskProgress,
        is AgentEvent.SystemTaskStarted,
        -> foldBackground(transcript, event)
        // The rest carry no content: what they mean for the domain is core's to fold.
        else -> transcript
    }

/** The user's words exist only here: the CLI does not echo them on stdout. */
private fun foldSent(
    transcript: Transcript,
    sent: PresenterInput.UserSent,
): Transcript {
    val key = transcript.messages.claim(sent.messageId)
    // The files go ahead of the words, as they do to the CLI; their keys are a letter and a number, the words'
    // is 0.
    val files =
        sent.attachments.foldIndexed(
            Keyed.empty<PartRecord>(),
        ) { index, parts, file -> parts.put("$key:a$index", file) }
    val parts = files.put("$key:0", TextRecord(reasoning = false, text = sent.text))
    val message = MessageRecord(key, Role.USER, MessageSource.Sent, parts)
    val routing = transcript.routing
    return transcript.copy(
        messages = transcript.messages.put(key, message),
        routing = routing.copy(sends = routing.sends + 1),
        userUuids = sent.uuid?.let { transcript.userUuids.plusEntry(key, it) } ?: transcript.userUuids,
    )
}

/**
 * A turn gets its assistant message at `started`, not at `queued`: a queued command waits behind the one
 * running, and the content that arrives meanwhile belongs to that one.
 */
private fun foldLifecycle(
    transcript: Transcript,
    event: AgentEvent.CommandLifecycle,
): Transcript {
    val routing = transcript.routing
    val uuid = event.commandUuid
    if (event.state != STARTED || uuid in routing.turns) return transcript
    val key = transcript.messages.claim(Keys.ofCliId(uuid))
    return transcript.copy(
        messages = transcript.messages.put(key, MessageRecord(key, Role.ASSISTANT, MessageSource.Turn(uuid))),
        routing = routing.copy(turns = routing.turns.plusEntry(uuid, key), currentTurn = key),
    )
}

/**
 * Core counts every `result` that closed no user turn as a spontaneous resume, so an unchanged count says this
 * one closed a turn; the turn's content stops going to its message. Any other `result` ends the spontaneous
 * resume that is open, and its outcome is kept on the message, because core has no turn to keep it on.
 */
private fun foldResult(
    transcript: Transcript,
    event: AgentEvent.Result,
    before: ConversationState,
    after: ConversationState,
): Transcript {
    val routing = transcript.routing
    val open = routing.openResume
    return when {
        after.spontaneousResumeCount == before.spontaneousResumeCount -> {
            val turnKey = event.userMessageUuid?.let(routing.turns::get)
            // The result may close more turns than the one it names (messages run together or taken in); the turn
            // receiving content is one of them when it started last.
            val closedNow =
                after.turns
                    .filter { it.phase == TurnPhase.CLOSED }
                    .mapNotNullTo(HashSet()) { routing.turns[it.commandUuid] }
            val ended = routing.currentTurn != null && routing.currentTurn in closedNow
            val closed = if (turnKey == null) transcript else transcript.withTurnEnd(turnKey, event.durationMs)
            if (ended) closed.withRouting(routing.copy(currentTurn = null)) else closed
        }
        open == null -> transcript
        else ->
            transcript.copy(
                messages =
                    transcript.messages.update(open) {
                        it.copy(source = MessageSource.Resume(ResumeEnd(event.isError, event.result)))
                    },
                routing = routing.copy(openResume = null),
            )
    }
}

/**
 * Records what the request asks, whatever its `RawJson` holds: core keeps it pending from the typed fields
 * alone, and an approval the tree does not show is one the user cannot answer while the CLI waits for it.
 * A `request_id` that is empty is not recorded — the webview cannot answer it (the protocol requires a
 * non-empty `approvalId`). A repeated `request_id` replaces the record, as the request is asked afresh.
 *
 * Whether it is a question is core's kind for the request; when core holds no entry for it, the record keeps
 * what it had. The anchor is the assistant message the request belongs to, so a part made for it stays there.
 */
private fun foldRequest(
    transcript: Transcript,
    event: AgentEvent.ControlRequest,
    after: ConversationState,
): Transcript {
    if (event.requestId.isEmpty()) return transcript
    val existing = transcript.approvals[event.requestId]
    val held = after.pendingApprovals.firstOrNull { it.requestId == event.requestId }
    val routing = transcript.routing
    val messages = transcript.messages
    val lastAssistant = messages.order.lastOrNull { messages[it]?.role == Role.ASSISTANT }
    val request = JsonRead.parse(event.request.text) as? JsonObject
    val record =
        ApprovalRecord(
            requestId = event.requestId,
            toolUseId = event.toolUseId,
            toolName = event.toolName,
            agentId = event.agentId,
            input = request?.get("input"),
            unreadable = if (request == null) event.request.text else null,
            ask = held?.let { it.kind == ApprovalKind.ASK } ?: existing?.ask ?: false,
            anchor = routing.currentTurn ?: routing.openResume ?: lastAssistant,
            suggestions = suggestionsOf(request),
        )
    val same = existing == record
    return if (same) transcript else transcript.copy(approvals = transcript.approvals.put(event.requestId, record))
}

/**
 * An answer counts only for a request core held as pending before it (core's `resolveApproval` ignores any
 * other): one the CLI already stopped waiting on stays as it ended.
 */
private fun foldDecided(
    transcript: Transcript,
    input: PresenterInput.Decided,
    before: ConversationState,
): Transcript {
    val decision = input.decision
    val record = transcript.approvals[decision.requestId]
    val held = before.pendingApprovals.any { it.requestId == decision.requestId }
    if (record == null || !held) return transcript
    val outcome = outcomeOf(record.ask, decision)
    // What the host passed on is only a fact of an answer the CLI took as an allow; a denial carries neither. An answer
    // clears the failure of an earlier try, and keeps its count.
    val allowed = outcome == ApprovalOutcome.APPROVED
    val settled =
        record.copy(
            outcome = outcome,
            acceptedSuggestions = if (allowed) input.passedOn.acceptedSuggestions else emptyList(),
            updatedInput = if (allowed && decision is ApprovalDecision.Allow) rewrittenInput(record, input) else null,
            failure = null,
        )
    return if (record == settled) {
        transcript
    } else {
        transcript.copy(approvals = transcript.approvals.put(record.requestId, settled))
    }
}

/** The input the host sent, when it is not the request's own. */
private fun rewrittenInput(
    record: ApprovalRecord,
    input: PresenterInput.Decided,
): JsonObject? = input.passedOn.input?.takeIf { it != record.input }

/**
 * An answer the host could not pass on is recorded on the approval it was for, while the approval is still open
 * (core holds it as pending before this input, as for [foldDecided]): one already settled, or cancelled by the CLI,
 * stays as it ended, and one the transcript does not know is nothing to write on.
 */
private fun foldAnswerFailed(
    transcript: Transcript,
    input: PresenterInput.AnswerFailed,
    before: ConversationState,
): Transcript {
    val record = transcript.approvals[input.approvalId]
    val held = before.pendingApprovals.any { it.requestId == input.approvalId }
    if (record == null || record.outcome != null || !held) return transcript
    val failed = record.copy(failure = input.message, failures = record.failures + 1)
    return transcript.copy(approvals = transcript.approvals.put(record.requestId, failed))
}

/**
 * The meaning of the host's answer. An `Allow` without answers leaves a question unanswered,
 * however long the host held it: the CLI settles it as "did not answer" at once, and only `updatedInput.answers`
 * (Answered) or `afkTimeoutMs` (AfkTimeout) say otherwise.
 */
internal fun outcomeOf(
    ask: Boolean,
    decision: ApprovalDecision,
): ApprovalOutcome =
    when (decision) {
        is ApprovalDecision.Answered -> ApprovalOutcome.APPROVED
        is ApprovalDecision.Deny -> ApprovalOutcome.DENIED
        is ApprovalDecision.AfkTimeout -> ApprovalOutcome.EXPIRED
        is ApprovalDecision.Allow -> if (ask) ApprovalOutcome.CANCELLED else ApprovalOutcome.APPROVED
    }
