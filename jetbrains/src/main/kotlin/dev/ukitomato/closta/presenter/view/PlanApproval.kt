package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText

/**
 * An `ExitPlanMode`: the plan the CLI asks the user to approve.
 * [plan] is the input's `plan` (capture 29), null when it carries none.
 */
data class PlanCard(
    override val requestId: String,
    val plan: String?,
    override val answered: ApprovalOutcome?,
    val failure: String?,
    /** Where the first choice goes once the plan is approved. */
    val go: PlanGo,
) : ThreadCard {
    // The plan is what Claude wrote for the user: never in a log.
    override fun toString(): String = "PlanCard($requestId, ${answered ?: "open"})"
}

/** The mode the first choice approves into, as Claude Code offers it. */
enum class PlanGo(
    val mode: String,
) {
    AUTO("auto"),
    ACCEPT_EDITS("acceptEdits"),
    BYPASS("bypassPermissions"),
}

/** Bypass once it was entered, Accept Edits once Auto was refused, Auto otherwise. */
fun planGoOf(operations: OperationRecords): PlanGo =
    when {
        operations.bypassEntered -> PlanGo.BYPASS
        operations.autoRejected -> PlanGo.ACCEPT_EDITS
        else -> PlanGo.AUTO
    }

/** The three answers to a plan. */
enum class PlanChoice {
    /** "Approve, and go": allow, then the card's [PlanGo] mode. */
    GO,

    /** "Approve, confirm edits": allow; the CLI goes back to Default by itself on an allow (capture 29). */
    ASK_EDITS,

    /** "Keep planning": deny, with the user's sentence. */
    KEEP_PLANNING,
}

/** What answering a plan sends: the decision and its payload, and the mode to switch to once it is sent. */
data class PlanAnswer(
    val decision: ApprovalDecision,
    val payload: String,
    val modeAfter: String?,
    /** What goes with the allow: for GO a `setMode` of the card's mode for the session (sdk.d.ts PermissionUpdate). */
    val passedOn: PassedOn = PassedOn(),
) {
    // The payload is the plan or the user's sentence: never in a log.
    override fun toString(): String = "PlanAnswer($decision, ${modeAfter ?: "no switch"})"
}

internal const val PLAN_TOOL = "ExitPlanMode"

private fun modeForSession(mode: String): String =
    JsonText.compact(
        JsonArray(
            listOf(
                JsonObject.of(
                    "type" to JsonString("setMode"),
                    "mode" to JsonString(mode),
                    "destination" to JsonString("session"),
                ),
            ),
        ),
    )

internal fun planCardOf(
    approval: ApprovalRecord,
    go: PlanGo,
): PlanCard =
    PlanCard(
        approval.requestId,
        (approval.input as? JsonObject)?.string("plan")?.takeIf { it.isNotBlank() },
        approval.outcome,
        approval.failure,
        go,
    )

/** The answer to [card] for [choice]; [comment] goes with a no, trimmed. */
fun planAnswer(
    card: PlanCard,
    approval: ApprovalRecord,
    choice: PlanChoice,
    comment: String,
): PlanAnswer =
    when (choice) {
        // The CLI goes back to default by itself on the allow (capture 29), so the allow carries the mode to keep; the
        // switch after it is only a backstop, should the CLI apply its own reset last.
        PlanChoice.GO ->
            PlanAnswer(
                ApprovalDecision.Allow(card.requestId),
                allowPayload(approval),
                card.go.mode,
                PassedOn(
                    updatedPermissions = modeForSession(card.go.mode),
                    input = approval.input as? JsonObject,
                ),
            )
        PlanChoice.ASK_EDITS -> PlanAnswer(ApprovalDecision.Allow(card.requestId), allowPayload(approval), null)
        PlanChoice.KEEP_PLANNING -> PlanAnswer(ApprovalDecision.Deny(card.requestId), comment.trim(), null)
    }
