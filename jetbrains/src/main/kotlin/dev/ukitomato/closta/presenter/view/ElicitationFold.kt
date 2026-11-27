package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.ElicitationAction
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString

/**
 * Records what an MCP server asks, once per `request_id`: the CLI may send the same request again (in the answer to
 * `initialize` and as a line of its own, or late after the host answered), and the first record stands, so a card that
 * was answered is not asked afresh. Whatever its `RawJson` holds, the request is recorded: core keeps it pending from
 * the typed fields, and one the screen does not show is one the user cannot answer while the CLI waits for it.
 */
internal fun foldElicitation(
    transcript: Transcript,
    event: AgentEvent.Elicitation,
): Transcript {
    if (event.requestId.isEmpty() || event.requestId in transcript.elicitations) return transcript
    val request = JsonRead.parse(event.request.text) as? JsonObject
    val isUrl = event.mode == "url"
    val title = request?.string("title")?.takeIf { it.isNotBlank() }
    val display = request?.string("display_name")?.takeIf { it.isNotBlank() }
    val record =
        ElicitationRecord(
            requestId = event.requestId,
            serverName = event.serverName,
            heading = title ?: display ?: event.serverName,
            message = request?.string("message").orEmpty(),
            description = request?.string("description"),
            url = request?.string("url"),
            elicitationId = event.elicitationId,
            // A mode this version does not know is read as a form; one whose schema cannot be read has no fields.
            fields = if (isUrl) null else request?.let { elicitationFields(it["requested_schema"], order(it)) },
            isUrl = isUrl,
            anchor = transcript.anchor(),
        )
    return transcript.copy(elicitations = transcript.elicitations.put(event.requestId, record))
}

private fun order(request: JsonObject): List<String>? =
    request.array("property_order")?.items?.mapNotNull { (it as? JsonString)?.value }

/**
 * The host's answer counts only for a request core held as pending before it, and that no answer has gone out for:
 * one the CLI already stopped waiting on stays as it ended. A link accepted goes on in the browser; any other answer
 * is sent.
 */
internal fun foldElicitationDecided(
    transcript: Transcript,
    input: PresenterInput.ElicitationDecided,
    before: ConversationState,
): Transcript {
    val record = transcript.elicitations[input.requestId]
    val held = before.pendingApprovals.any { it.requestId == input.requestId }
    if (record == null || record.stage != ElicitationStage.WAITING || !held) return transcript
    val inBrowser = record.isUrl && input.action == ElicitationAction.ACCEPT
    val sent =
        record.copy(
            stage = if (inBrowser) ElicitationStage.IN_BROWSER else ElicitationStage.SENT,
            sentAction = input.action,
            sentContent = input.content,
            failure = null,
        )
    return transcript.copy(elicitations = transcript.elicitations.put(record.requestId, sent))
}

/** An answer the host could not pass on is written on the request while it waits; one already answered stays. */
internal fun foldElicitationFailed(
    transcript: Transcript,
    input: PresenterInput.AnswerFailed,
    before: ConversationState,
): Transcript {
    val record = transcript.elicitations[input.approvalId]
    val held = before.pendingApprovals.any { it.requestId == input.approvalId }
    if (record == null || record.stage != ElicitationStage.WAITING || !held) return transcript
    return transcript.copy(
        elicitations = transcript.elicitations.put(record.requestId, record.copy(failure = input.message)),
    )
}

/** A request the CLI took back while core still held it ends as withdrawn. */
internal fun foldElicitationWithdrawn(
    transcript: Transcript,
    event: AgentEvent.ControlCancel,
    before: ConversationState,
): Transcript {
    val record = transcript.elicitations[event.requestId]
    val held = before.pendingApprovals.any { it.requestId == event.requestId }
    if (record == null || record.stage != ElicitationStage.WAITING || !held) return transcript
    return transcript.copy(
        elicitations = transcript.elicitations.put(record.requestId, record.copy(stage = ElicitationStage.WITHDRAWN)),
    )
}

/** The server says the user finished what the link asked: the request whose link they went to is complete. */
internal fun foldElicitationComplete(
    transcript: Transcript,
    event: AgentEvent.SystemElicitationComplete,
): Transcript {
    val record =
        transcript.elicitations.values().firstOrNull {
            it.stage == ElicitationStage.IN_BROWSER && it.elicitationId == event.elicitationId
        } ?: return transcript
    return transcript.copy(
        elicitations = transcript.elicitations.put(record.requestId, record.copy(stage = ElicitationStage.COMPLETED)),
    )
}

/** The process ended: each request still waiting was asked by it alone, so none can be answered after a restart. */
internal fun Transcript.withProcessEnded(): Transcript {
    val waiting = elicitations.values().filter { it.stage == ElicitationStage.WAITING && !it.ended }
    if (waiting.isEmpty()) return this
    return copy(
        elicitations =
            waiting.fold(
                elicitations,
            ) { all, record -> all.put(record.requestId, record.copy(ended = true)) },
    )
}
