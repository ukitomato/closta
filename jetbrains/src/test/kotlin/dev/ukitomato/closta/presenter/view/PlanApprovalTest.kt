package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PlanApprovalTest {
    private fun planApproval(): ApprovalRecord =
        CaptureReplay
            .replay("29-exit-plan-mode")
            .last()
            .transcript.approvals
            .values()
            .first { it.toolName == "ExitPlanMode" }

    @Test
    fun planCardFromCapture() {
        val approval = planApproval()
        val card = cardOf(approval, PlanGo.ACCEPT_EDITS) as PlanCard
        assertEquals(approval.requestId, card.requestId)
        assertTrue(!card.plan.isNullOrBlank())
        assertEquals((approval.input as JsonObject).string("plan"), card.plan)
    }

    @Test
    fun theEditAfterThePlanIsAPermission() {
        val edit =
            CaptureReplay
                .replay("29-exit-plan-mode")
                .last()
                .transcript.approvals
                .values()
                .first { it.toolName == "Edit" }
        assertTrue(cardOf(edit, PlanGo.AUTO) is PermissionCard)
    }

    @Test
    fun aPlanWithoutItsTextStillAsks() {
        val approval =
            ApprovalRecord(
                requestId = "r1",
                toolUseId = "t1",
                toolName = "ExitPlanMode",
                agentId = null,
                input = JsonObject.of("planFilePath" to JsonString("/home/user/.claude/plans/p.md")),
                ask = false,
                anchor = null,
            )
        val card = cardOf(approval, PlanGo.ACCEPT_EDITS) as PlanCard
        assertNull(card.plan)
    }

    @Test
    fun planAnswerPayloads() {
        val approval = planApproval()
        val card = cardOf(approval, PlanGo.ACCEPT_EDITS) as PlanCard
        val auto = planAnswer(card, approval, PlanChoice.GO, "")
        assertEquals(ApprovalDecision.Allow(card.requestId), auto.decision)
        assertEquals(allowPayload(approval), auto.payload)
        assertEquals("acceptEdits", auto.modeAfter)
        val ask = planAnswer(card, approval, PlanChoice.ASK_EDITS, "")
        assertEquals(ApprovalDecision.Allow(card.requestId), ask.decision)
        assertEquals(allowPayload(approval), ask.payload)
        assertNull(ask.modeAfter)
        val keep = planAnswer(card, approval, PlanChoice.KEEP_PLANNING, "")
        assertEquals(ApprovalDecision.Deny(card.requestId), keep.decision)
        assertNull(keep.modeAfter)
    }

    @Test
    fun keepPlanningCarriesTheComment() {
        val approval = planApproval()
        val card = cardOf(approval, PlanGo.ACCEPT_EDITS) as PlanCard
        val keep = planAnswer(card, approval, PlanChoice.KEEP_PLANNING, "  テストの手順も入れて \n")
        assertEquals("テストの手順も入れて", keep.payload)
    }

    @Test
    fun goKeepsItsModeThroughTheAllow() {
        // The CLI goes back to default by itself on the allow (capture 29, line 156); the allow carries the mode, as
        // sdk.d.ts' PermissionUpdate { type: 'setMode', mode, destination } has it.
        val approval = planApproval()
        val card = cardOf(approval, PlanGo.ACCEPT_EDITS) as PlanCard
        val auto = planAnswer(card, approval, PlanChoice.GO, "")
        val updates = JsonRead.parse(auto.passedOn.updatedPermissions!!) as JsonArray
        assertEquals(
            listOf(
                JsonObject.of(
                    "type" to JsonString("setMode"),
                    "mode" to JsonString("acceptEdits"),
                    "destination" to JsonString("session"),
                ),
            ),
            updates.items,
        )
        assertEquals(approval.input, auto.passedOn.input)
        val ask = planAnswer(card, approval, PlanChoice.ASK_EDITS, "")
        assertNull(ask.passedOn.updatedPermissions)
        assertNull(ask.modeAfter)
    }

    @Test
    fun goIsBypassOnceBypassWasEntered() {
        assertEquals(PlanGo.BYPASS, planGoOf(OperationRecords(bypassEntered = true, autoRejected = true)))
    }

    @Test
    fun goIsAcceptEditsAfterAutoRejected() {
        assertEquals(PlanGo.ACCEPT_EDITS, planGoOf(OperationRecords(autoRejected = true)))
    }

    @Test
    fun goIsAutoByDefault() {
        assertEquals(PlanGo.AUTO, planGoOf(OperationRecords()))
    }

    @Test
    fun goAnswerCarriesTheMode() {
        val approval = planApproval()
        val card = cardOf(approval, PlanGo.AUTO) as PlanCard
        val made = planAnswer(card.copy(go = PlanGo.AUTO), approval, PlanChoice.GO, "")
        assertEquals("auto", made.modeAfter)
        assertEquals(
            """[{"type":"setMode","mode":"auto","destination":"session"}]""",
            made.passedOn.updatedPermissions,
        )
        val bypass = planAnswer(card.copy(go = PlanGo.BYPASS), approval, PlanChoice.GO, "")
        assertEquals("bypassPermissions", bypass.modeAfter)
    }

    @Test
    fun cardFollowsGoChange() {
        val transcript = CaptureReplay.replay("29-exit-plan-mode").last().transcript
        val rows = ThreadRows()

        fun goOf(rows: List<ThreadRow>) =
            rows
                .filterIsInstance<CardRow>()
                .map { it.card }
                .filterIsInstance<PlanCard>()
                .single()
                .go
        assertEquals(PlanGo.AUTO, goOf(rows.of(transcript)))
        val refused = transcript.copy(operations = transcript.operations.copy(autoRejected = true))
        assertEquals(PlanGo.ACCEPT_EDITS, goOf(rows.of(refused)))
    }
}
