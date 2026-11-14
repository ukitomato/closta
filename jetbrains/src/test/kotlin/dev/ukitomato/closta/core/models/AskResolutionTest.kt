package dev.ukitomato.closta.core.models

import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * `AskUserQuestion` holds resolve through the host's out-of-band decision and the elapsed time, replayed
 * under a virtual clock so no real clock is read. The three
 * captured outcomes are exercised with distinct decisions and distinct elapsed times, and each is shown
 * to remove *its* request while leaving the others untouched (not three copies of one
 * assertion):
 *  - 13: immediate `Allow` at `elapsedMs == 0` — the no-answer path (the host replied before the 0.03 s
 *    window).
 *  - 14: `Answered` after 5000 ms — answers injected (`updatedInput.answers`).
 *  - 15: `AfkTimeout` after 5000 ms — AFK expiry (`updatedInput.afkTimeoutMs`).
 */
class AskResolutionTest {
    /** A virtual clock: elapsed time is computed from it, never from a real one. */
    private class VirtualClock(
        var nowMs: Long,
    ) {
        fun advance(ms: Long) {
            nowMs += ms
        }
    }

    @Test
    fun `13 immediate Allow at elapsed 0 resolves the question as no-answer and removes it`() {
        val held = heldAsk("13-ask-timeout.ndjson", REQUEST_13)
        val clock = VirtualClock(nowMs = 0)
        val arrivalMs = clock.nowMs

        // The host answers immediately — no wait — so elapsed is exactly 0: the no-answer path.
        val elapsedMs = clock.nowMs - arrivalMs
        val resolved = resolveApproval(held, ApprovalDecision.Allow(REQUEST_13), elapsedMs)

        assertEquals(0L, elapsedMs, "13: the host replied immediately, so elapsed is 0 (no-answer)")
        assertTrue(resolved.pendingApprovals.isEmpty(), "13: the no-answer question is removed from pending")
    }

    @Test
    fun `14 Answered after 5000ms resolves the question as answered and removes it`() {
        val held = heldAsk("14-ask-answers-updatedinput.ndjson", REQUEST_14)
        val clock = VirtualClock(nowMs = 1_000)
        val arrivalMs = clock.nowMs
        clock.advance(5_000)

        val elapsedMs = clock.nowMs - arrivalMs
        val resolved = resolveApproval(held, ApprovalDecision.Answered(REQUEST_14), elapsedMs)

        assertEquals(5_000L, elapsedMs, "14: the host injected answers after 5000 ms")
        assertTrue(resolved.pendingApprovals.isEmpty(), "14: the answered question is removed from pending")
    }

    @Test
    fun `15 AfkTimeout after 5000ms resolves the question as AFK and removes it`() {
        val held = heldAsk("15-ask-afktimeout-updatedinput.ndjson", REQUEST_15)
        val clock = VirtualClock(nowMs = 42)
        val arrivalMs = clock.nowMs
        clock.advance(5_000)

        val elapsedMs = clock.nowMs - arrivalMs
        val resolved = resolveApproval(held, ApprovalDecision.AfkTimeout(REQUEST_15), elapsedMs)

        assertEquals(5_000L, elapsedMs, "15: the request expired on an AFK timeout after 5000 ms")
        assertTrue(resolved.pendingApprovals.isEmpty(), "15: the AFK-expired question is removed from pending")
    }

    @Test
    fun `resolving one held question leaves another held question untouched`() {
        val two =
            listOf(
                askRequest(REQUEST_14),
                askRequest(REQUEST_15),
            ).fold(ConversationState(), ::fold)

        val resolved = resolveApproval(two, ApprovalDecision.Answered(REQUEST_14), elapsedMs = 5_000)

        assertEquals(
            listOf(REQUEST_15),
            resolved.pendingApprovals.map { it.requestId },
            "resolving 14 must not disturb the still-pending 15",
        )
    }

    private companion object {
        const val REQUEST_13 = "5962feff-e85f-4069-9fa9-b739950fe315"
        const val REQUEST_14 = "dcc77c8e-b43a-4b63-a706-a7803648f4e8"
        const val REQUEST_15 = "4727dff7-6776-48d0-8992-b1886a7b5566"

        /** Folds the capture up to its `control_request`, asserting the question is held as an ASK. */
        fun heldAsk(
            file: String,
            requestId: String,
        ): ConversationState {
            var state = ConversationState()
            for (event in CaptureFixtures.readCapture(file)) {
                state = fold(state, event)
                if (event is AgentEvent.ControlRequest) break
            }
            val pending = state.pendingApprovals.single()
            assertEquals(requestId, pending.requestId, "$file: the held request id")
            assertEquals(ApprovalKind.ASK, pending.kind, "$file: AskUserQuestion is held as an ASK")
            return state
        }

        fun askRequest(requestId: String): AgentEvent.ControlRequest =
            AgentEvent.ControlRequest(
                requestId = requestId,
                request = RawJson("""{"subtype":"can_use_tool"}"""),
                toolName = "AskUserQuestion",
                toolUseId = "toolu_$requestId",
            )
    }
}
