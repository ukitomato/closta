package dev.ukitomato.closta.core.models

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * An [AgentEvent.UnknownKind] or [AgentEvent.BrokenLine] must fold without throwing and without
 * disturbing the state built so far. A fold that threw would stop the reader, and
 * a stopped stdout reader deadlocks the CLI behind a full pipe. A
 * `result` whose `user_message_uuid` matches no open turn is the same case — it closes nothing.
 */
class FoldRobustnessTest {
    @Test
    fun `unknown and broken lines leave an established state untouched`() {
        val before =
            ConversationState(
                session = SessionInfo("s", "model", "default", "/repo", "2.1.282"),
                turns = listOf(Turn("cmd-1", TurnPhase.OPEN)),
                usage = Usage(sessionCostUsd = 0.25),
            )

        val after =
            listOf(
                AgentEvent.UnknownKind("some_future_kind", RawJson("""{"type":"some_future_kind"}""")),
                AgentEvent.BrokenLine("not json at all", "malformed JSON"),
            ).fold(before, ::fold)

        assertEquals(before, after, "unknown/broken lines must not change the state")
    }

    @Test
    fun `a result matching no open turn closes nothing and only replaces cost`() {
        val before = ConversationState(turns = listOf(Turn("cmd-1", TurnPhase.OPEN)))

        val after = fold(before, resultFor(userMessageUuid = "cmd-unknown", cost = 0.42))

        assertEquals(TurnPhase.OPEN, after.turns.single().phase, "the open turn stays open")
        assertEquals(1, after.spontaneousResumeCount, "an unmatched result is counted as a resume")
        assertEquals(0.42, after.usage.sessionCostUsd, "cost is still replaced")
    }

    private companion object {
        fun resultFor(
            userMessageUuid: String?,
            cost: Double,
        ): AgentEvent.Result =
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
                totalCostUsd = cost,
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
                userMessageUuid = userMessageUuid,
            )
    }
}
