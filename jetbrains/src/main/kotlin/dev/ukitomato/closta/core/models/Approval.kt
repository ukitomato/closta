package dev.ukitomato.closta.core.models

/**
 * One unanswered host-input request the CLI is blocking on — the approval part of
 * [ConversationState].
 *
 * The CLI blocks forever on an unanswered `request_id`, so "how many approvals are
 * outstanding, and where each came from" needs a single source of truth that the fold owns rather
 * than the presenter recounting raw events. Only the *domain* of a pending request lives here:
 * its correlation ids and its kind. The request's *content* — the tool input, the question text, the
 * options, the `permission_suggestions` — stays in the event's `RawJson` and is the presenter's to
 * project, never core's.
 *
 * [requestId] is the primary key and is present on every `control_request`, so an approval
 * can always be held and later resolved by it alone. [toolUseId] and [agentId] are *optional*
 * attribution attributes: a `tool_use_id` of null still keeps the approval by [requestId],
 * and [agentId] is null for a main-conversation approval and carries
 * the spawning subagent's `task_id` for a subagent one.
 *
 * There is deliberately no terminal state (approved/denied/answers/afkTimeout) and no
 * assistant-ui `resolution`: a resolved request is *removed* from [ConversationState.pendingApprovals]
 * rather than kept, so the invariant "the approval queue is empty at the end" measures presence alone
 * alone. The presenter projects the terminal look onto the tool-call
 * part.
 */
data class PendingApproval(
    val requestId: String,
    val kind: ApprovalKind,
    val toolUseId: String? = null,
    val agentId: String? = null,
)

/**
 * What kind of host input a [PendingApproval] is waiting for.
 *
 * Approval and question are held in *one* list rather than two, and told apart by this kind, because
 * assistant-ui represents both through a single tool-call `approval` seam and only varies the
 * `display` (`decision`/`select`/`text`) (assistant-ui's `message.d.ts:166, 229-252`).
 * The kind is decided from the typed [AgentEvent.ControlRequest.toolName]: `AskUserQuestion` is [ASK],
 * everything else — including a null tool name — is [APPROVAL]. The fold never opens the
 * `request` `RawJson` to decide this.
 */
enum class ApprovalKind {
    /** A plain tool awaiting allow/deny. */
    APPROVAL,

    /** An `AskUserQuestion` awaiting an answer. */
    ASK,
}

/**
 * The host's out-of-band decision about a pending request, fed into [resolveApproval].
 *
 * The host's reply travels on stdin, not on the CLI's stdout, so it is not an [AgentEvent] and cannot
 * be folded. This type carries only the *outcome kind*; the reply's payload —
 * the chosen answers, the `afkTimeoutMs` value — is `RawJson`/stdin territory and core never holds it.
 * Every variant removes the [requestId]'s pending in the same way, because core keeps
 * no terminal state; the variant is what a downstream presenter reads to render the outcome.
 */
sealed interface ApprovalDecision {
    val requestId: String

    /**
     * The host returned a `control_response` for the request. For an [ApprovalKind.ASK] answered with
     * neither `answers` nor `afkTimeoutMs` this is the "no-answer" path: the CLI concludes the question
     * went unanswered the moment it receives the reply, however long the host held it
     * (captures 13 and 15). See
     * [resolveApproval].
     */
    data class Allow(
        override val requestId: String,
    ) : ApprovalDecision

    /** The host denied the tool. */
    data class Deny(
        override val requestId: String,
    ) : ApprovalDecision

    /** The host injected answers for an `AskUserQuestion` (capture 14). */
    data class Answered(
        override val requestId: String,
    ) : ApprovalDecision

    /** The host let the request expire on an AFK timeout (capture 15). */
    data class AfkTimeout(
        override val requestId: String,
    ) : ApprovalDecision
}
