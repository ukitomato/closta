package dev.ukitomato.closta.core.models

/**
 * Resolves one pending request from the host's out-of-band decision — the second input source of the
 * approval protocol, alongside the `AgentEvent` stream that [fold] consumes.
 *
 * This is a *pure* function and reads no clock: the elapsed time of the pending request is passed in as
 * [elapsedMs] rather than measured here, which is what lets the AFK/answer/no-answer cases be replayed
 * under a virtual clock. It removes the pending whose
 * `request_id` equals [decision]'s and returns a fresh state; every [ApprovalDecision] variant removes
 * it the same way, because core keeps no terminal state — the variant is what a downstream
 * presenter reads to render the outcome, and this function must not write an outcome field onto
 * [ConversationState].
 *
 * [elapsedMs]'s role is (i) the discipline above — forcing the caller to supply elapsed time
 * rather than have core read a clock — and (ii) letting a caller replay a scenario under a virtual clock.
 * It does not change the outcome of an [ApprovalDecision.Allow]: an `AskUserQuestion` allowed with
 * neither `answers` nor `afkTimeoutMs` is concluded as unanswered the moment the CLI receives it,
 * whatever time has elapsed (measured: 0.034 s
 * after the allow, with the question held for 0 s or 5 s alike; captures 13 and 15). Since core
 * stores no outcome, that classification is not written here.
 *
 * A [decision] whose `request_id` matches nothing pending leaves the state untouched — resolving an
 * already-resolved or unknown request is a no-op, never an error.
 */
fun resolveApproval(
    state: ConversationState,
    decision: ApprovalDecision,
    @Suppress("UNUSED_PARAMETER") elapsedMs: Long,
): ConversationState {
    val remaining = state.pendingApprovals.filterNot { it.requestId == decision.requestId }
    return if (remaining.size == state.pendingApprovals.size) {
        state
    } else {
        state.copy(pendingApprovals = remaining)
    }
}
