package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.ElicitationAction

/**
 * What an MCP server asks of the user: a form to fill in, or a link to go to. [urlHost] is the host of [url], and [url]
 * is set only when it can be opened ([openableUrl]). [fields] is null for a link and for a form Closta cannot fill in.
 * [sentAction] and [sentContent] are what was answered; [failure] is the sentence for an answer that could not be
 * passed on. [answerable] is whether the buttons work: the request waits and its process is alive.
 */
data class ElicitationCard(
    override val requestId: String,
    val heading: String,
    val message: String,
    val description: String?,
    val urlHost: String?,
    val url: String?,
    val fields: List<ElicitationField>?,
    val isUrl: Boolean,
    val stage: ElicitationStage,
    val sentAction: ElicitationAction?,
    val sentContent: String?,
    val failure: String?,
    val answerable: Boolean,
    override val answered: ApprovalOutcome?,
) : ThreadCard {
    // The message, the link and what was sent come from a server or the user: a log line never carries them.
    override fun toString(): String = "ElicitationCard($requestId, $stage, ${sentAction?.wire})"
}

/**
 * The card for [record]. [pending] is whether core still holds the request as pending. A request that waits and is
 * pending can be answered; one that waits and is not (a `result` took it away), or whose process ended, was cancelled.
 */
fun elicitationCardOf(
    record: ElicitationRecord,
    pending: Boolean,
): ElicitationCard {
    val open = pending && !record.ended
    val answered =
        when (record.stage) {
            ElicitationStage.WAITING -> if (open) null else ApprovalOutcome.CANCELLED
            ElicitationStage.SENT ->
                when (record.sentAction) {
                    ElicitationAction.ACCEPT -> ApprovalOutcome.APPROVED
                    ElicitationAction.DECLINE -> ApprovalOutcome.DENIED
                    ElicitationAction.CANCEL, null -> ApprovalOutcome.CANCELLED
                }
            ElicitationStage.IN_BROWSER, ElicitationStage.COMPLETED -> null
            ElicitationStage.WITHDRAWN -> ApprovalOutcome.WITHDRAWN
        }
    val url = openableUrl(record.url)
    return ElicitationCard(
        requestId = record.requestId,
        heading = record.heading,
        message = record.message,
        description = record.description,
        urlHost = urlHostOf(url),
        url = url,
        fields = record.fields,
        isUrl = record.isUrl,
        stage = record.stage,
        sentAction = record.sentAction,
        sentContent = record.sentContent,
        failure = record.failure,
        answerable = record.stage == ElicitationStage.WAITING && open,
        answered = answered,
    )
}

/**
 * Whether the card waits for the user. An elicitation waits while it can be answered: a link followed in the browser or
 * finished has no outcome and waits for nothing. Any other card waits until it has an outcome.
 */
val ThreadCard.waits: Boolean get() = if (this is ElicitationCard) answerable else answered == null

/**
 * Whether the card has to be built again to show [next], where [shown] is on the screen: only when the request, its
 * stage, its answer, its failure or whether it can be answered changed. Anything else (the words, say) leaves the
 * fields as the user is typing in them.
 */
fun rebuildsElicitationCard(
    shown: ElicitationCard,
    next: ElicitationCard,
): Boolean =
    shown.requestId != next.requestId ||
        shown.stage != next.stage ||
        shown.sentAction != next.sentAction ||
        shown.failure != next.failure ||
        shown.answerable != next.answerable

/** The requests for input that wait, in arrival order: those core holds as pending and the transcript recorded. */
internal fun waitingElicitations(
    conversation: ConversationState,
    transcript: Transcript,
): List<ElicitationRecord> =
    conversation.pendingApprovals
        .filter { it.requestId.isNotEmpty() }
        .mapNotNull { transcript.elicitations[it.requestId] }
        .filterNot { it.ended }
