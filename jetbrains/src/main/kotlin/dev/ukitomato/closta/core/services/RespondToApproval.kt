package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.interfaces.Clock
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.resolveApproval
import java.time.Duration
import java.time.Instant

/**
 * Use case: return the host's decision about a pending approval to the agent, and drop the pending from
 * the conversation.
 *
 * The approval mouth is a *single* one — the [ApprovalDecision] (`Allow`/`Deny`/`Answered`/
 * `AfkTimeout`), not four methods. Allow, deny, a chosen option, a free-text answer and AFK all arrive as one
 * of its variants; the raw answer body, when there is one, rides through as [payload] and core never
 * reads it.
 *
 * It holds no state and writes no transition of its own: it sends through [AgentSession], reads the
 * current time only via [Clock] (core never reads a clock directly), and moves
 * the state solely by calling the pure fold-family `resolveApproval`.
 * [requestedAt] is when the pending was raised/presented; the caller tracks it (a `PendingApproval`
 * carries no timestamp), and the elapsed figure lets the no-answer/answered/afk cases be replayed
 * under a virtual clock.
 *
 * If the send throws, the exception reaches the caller unchanged and the state is not advanced — the
 * pending approval stays in the queue, so the caller still holds the state it had and can answer
 * again. A failed send is not recorded in [ConversationState] (an IO outcome from outside the fold
 * would break "only the fold moves the state").
 */
class RespondToApproval(
    private val session: AgentSession,
    private val clock: Clock,
) {
    suspend operator fun invoke(
        state: ConversationState,
        decision: ApprovalDecision,
        requestedAt: Instant,
        payload: String? = null,
        updatedPermissions: String? = null,
    ): ConversationState {
        session.respondToApproval(decision, payload, updatedPermissions)
        // coerceAtLeast(0): a backward clock or a wrong requestedAt must not yield a negative elapsed,
        // which resolveApproval's doc gives meaning to (0 = no-answer). Guard the boundary up front.
        val elapsedMs = Duration.between(requestedAt, clock.now()).toMillis().coerceAtLeast(0)
        return resolveApproval(state, decision, elapsedMs)
    }
}
