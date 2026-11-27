package dev.ukitomato.closta.core.models

/** How many answered or withdrawn elicitation ids [ConversationState.settledElicitations] keeps. */
internal const val SETTLED_ELICITATIONS_KEPT = 256

/** What the host does with an MCP server's request for input (`response.action` of the reply). */
enum class ElicitationAction(
    val wire: String,
) {
    ACCEPT("accept"),
    DECLINE("decline"),
    CANCEL("cancel"),
}

/**
 * The host's answer to a pending elicitation, fed into [resolveElicitation]. The form's values travel on stdin and
 * core never holds them, as with [ApprovalDecision].
 */
data class ElicitationDecision(
    val requestId: String,
    val action: ElicitationAction,
)

/**
 * Takes the elicitation out of the pending requests and remembers its id: the CLI may send the same `request_id` again
 * after the host answered, and that late line must not raise the card a second time. A request that is not pending
 * changes nothing.
 */
fun resolveElicitation(
    state: ConversationState,
    decision: ElicitationDecision,
): ConversationState = state.withoutPending { it.requestId == decision.requestId }

/**
 * An `elicitation` enqueues a [PendingApproval] of kind [ApprovalKind.ELICITATION], once per `request_id`: one that is
 * already pending, or that was answered or withdrawn lately, is not enqueued again.
 */
internal fun foldElicitation(
    state: ConversationState,
    event: AgentEvent.Elicitation,
): ConversationState {
    val known = state.pendingApprovals.any { it.requestId == event.requestId }
    if (known || event.requestId in state.settledElicitations) return state
    val pending = PendingApproval(requestId = event.requestId, kind = ApprovalKind.ELICITATION)
    return state.copy(pendingApprovals = state.pendingApprovals + pending)
}

/**
 * Drops the pending requests [drops] picks, and remembers the ids of the elicitations among them so that a late repeat
 * is not taken for a new request.
 */
internal fun ConversationState.withoutPending(drops: (PendingApproval) -> Boolean): ConversationState {
    val (dropped, kept) = pendingApprovals.partition(drops)
    if (dropped.isEmpty()) return this
    val settled =
        dropped.filter { it.kind == ApprovalKind.ELICITATION }.map { it.requestId }.filterNot(
            settledElicitations::contains,
        )
    return copy(
        pendingApprovals = kept,
        settledElicitations = (settledElicitations + settled).takeLast(SETTLED_ELICITATIONS_KEPT),
    )
}
