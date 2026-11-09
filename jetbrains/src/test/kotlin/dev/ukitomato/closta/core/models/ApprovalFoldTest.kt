package dev.ukitomato.closta.core.models

import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/**
 * The fold turns a `control_request` into a pending approval and drops it when the correlated `result`
 * closes the turn. Anchored on capture 05 (one `can_use_tool`) and on the
 * ten approval-free captures, which must never enqueue anything.
 *
 * These are the hand-known values that anchor the golden's baseline for the approval fields, so the
 * golden test is not merely agreeing with itself.
 */
class ApprovalFoldTest {
    @Test
    fun `capture 05 enqueues one approval, then clears it when the turn closes`() {
        val events = CaptureFixtures.readCapture("05-permission-can-use-tool.ndjson")

        val atRequest = foldThrough(events) { it is AgentEvent.ControlRequest }
        assertEquals(1, atRequest.pendingApprovals.size, "05: one approval pending after the control_request")
        val pending = atRequest.pendingApprovals.single()
        assertAll(
            { assertEquals("fd37592b-7c5a-4653-bb77-f4b22769cdd5", pending.requestId, "keyed by request_id") },
            { assertEquals(ApprovalKind.APPROVAL, pending.kind, "Write is a plain tool, not AskUserQuestion") },
            { assertEquals("toolu_01FooZHpFpzmDvsr82dzYb33", pending.toolUseId, "tool_use_id rides along") },
            { assertNull(pending.agentId, "a main-conversation approval has no agent_id") },
        )

        val end = events.fold(ConversationState(), ::fold)
        assertTrue(
            end.pendingApprovals.isEmpty(),
            "05: the correlated result closes the turn and discards the pending approval",
        )
    }

    @Test
    fun `a spontaneous self-resume result does not discard a pending approval`() {
        // The core safety property of the approval queue: a `result` with user_message_uuid == null closes no
        // turn (a background completion that resumed the conversation on its own), and the CLI is still
        // blocking on the pending request. Discarding it here would answer nothing and hang the CLI on
        // that request_id forever. Synthetic input: one pending approval,
        // then a successful self-resume — the approval must survive.
        val withPending =
            listOf(
                controlRequest(requestId = "r-frozen", toolName = "Write", toolUseId = "toolu_frozen"),
            ).fold(ConversationState(), ::fold)
        assertEquals(1, withPending.pendingApprovals.size, "precondition: one approval is pending")

        val resumed = fold(withPending, spontaneousSuccessResult())

        assertEquals(
            listOf("r-frozen"),
            resumed.pendingApprovals.map { it.requestId },
            "a self-resume (user_message_uuid==null, success) must NOT discard the pending approval",
        )
        assertEquals(1, resumed.spontaneousResumeCount, "the self-resume is still counted")
    }

    @Test
    fun `a control request that is not can_use_tool never reaches the approval queue`() {
        val lines =
            listOf(
                """{"type":"control_request","request_id":"m1",""" +
                    """"request":{"subtype":"mcp_message","server_name":"s","message":{}}}""",
                """{"type":"control_request","request_id":"m2","request":{"tool_name":"Write"}}""",
                """{"type":"control_request","request_id":"m3",""" +
                    """"request":{"subtype":"can_use_tool","tool_name":"Write"}}""",
            )

        val end = lines.map(CaptureFixtures::parse).fold(ConversationState(), ::fold)

        assertEquals(listOf("m3"), end.pendingApprovals.map { it.requestId }, "only can_use_tool is an approval")
    }

    @TestFactory
    fun `the ten approval-free captures never enqueue an approval`(): List<DynamicTest> =
        approvalFreeScenarios().map { scenario ->
            DynamicTest.dynamicTest(scenario) {
                val end = CaptureFixtures.readCapture("$scenario.ndjson").fold(ConversationState(), ::fold)
                assertTrue(
                    end.pendingApprovals.isEmpty(),
                    "$scenario: no stdout control_request, so the approval queue stays empty",
                )
            }
        }

    private companion object {
        /** The ten captures with no approval prompt: everything except 05 and 12-15. */
        val APPROVAL_FREE = setOf("01", "02", "03", "04", "06", "07", "08", "09", "10", "11")

        fun approvalFreeScenarios(): List<String> =
            CaptureFixtures
                .manifest()
                .scenarios
                .map { it.scenario }
                .filter { it.substringBefore('-') in APPROVAL_FREE }
                .sorted()

        /** Folds events in order, stopping right after the first event that satisfies [stop]. */
        fun foldThrough(
            events: List<AgentEvent>,
            stop: (AgentEvent) -> Boolean,
        ): ConversationState {
            var state = ConversationState()
            for (event in events) {
                state = fold(state, event)
                if (stop(event)) break
            }
            return state
        }

        fun controlRequest(
            requestId: String,
            toolName: String?,
            toolUseId: String?,
        ): AgentEvent.ControlRequest =
            AgentEvent.ControlRequest(
                requestId = requestId,
                request = RawJson("""{"subtype":"can_use_tool"}"""),
                toolName = toolName,
                toolUseId = toolUseId,
            )

        /** A successful `result` that closes no turn: `user_message_uuid` is null (a self-resume). */
        fun spontaneousSuccessResult(): AgentEvent.Result =
            AgentEvent.Result(
                uuid = "u",
                sessionId = "s",
                subtype = "success",
                result = "ok",
                isError = false,
                stopReason = "stop",
                terminalReason = "end_turn",
                numTurns = 1,
                resultIndex = 0,
                queuedTurnCount = 0,
                totalCostUsd = 0.0,
                durationMs = 1,
                durationApiMs = 1,
                ttftMs = 1,
                ttftStreamMs = 1,
                timeToRequestMs = 1,
                firstContentFrameMs = 1,
                fastModeState = "off",
                usage = RawJson("{}"),
                modelUsage = RawJson("{}"),
                permissionDenials = RawJson("[]"),
                subagentStats = RawJson("{}"),
                userMessageUuid = null,
            )
    }
}
