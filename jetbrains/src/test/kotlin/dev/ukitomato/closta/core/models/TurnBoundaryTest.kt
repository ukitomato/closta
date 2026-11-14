package dev.ukitomato.closta.core.models

import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * A turn closes only on a `result` correlated by `user_message_uuid`; a `result` with a null or
 * unmatched uuid is a spontaneous resume and closes nothing.
 *
 * This is asserted on the two captures that actually contain self-resumes — 10 (`result`×2, uuids
 * set/null) and 11 (`result`×3, set/set/null) — so the count of closed turns and the count
 * of spontaneous resumes both carry positive evidence, not just the absence of a wrongly-closed turn.
 */
class TurnBoundaryTest {
    @Test
    fun `capture 10 closes the user-started turn and treats the null result as a resume`() {
        val state = foldCapture("10-background-task.ndjson")

        assertAll(
            { assertEquals(1, state.turns.size, "one turn opened") },
            { assertEquals(0, openTurns(state), "no turn left open") },
            { assertEquals(1, closedTurns(state), "the user-started turn is closed") },
            { assertEquals(1, state.spontaneousResumeCount, "the null-uuid result closed nothing") },
        )
    }

    @Test
    fun `capture 11 closes both user-started turns and treats the later result as a resume`() {
        val state = foldCapture("11-background-followup.ndjson")

        assertAll(
            { assertEquals(2, state.turns.size, "two turns opened") },
            { assertEquals(0, openTurns(state), "no turn left open") },
            { assertEquals(2, closedTurns(state), "both user-started turns are closed") },
            { assertEquals(1, state.spontaneousResumeCount, "the self-resume result closed nothing") },
        )
    }

    @Test
    fun `capture 31 closes the message the CLI took into the running turn with that turn`() {
        // The second message's lifecycle completes before the one result, which
        // carries the first message's uuid.
        val state = foldCapture("31-send-mid-turn.ndjson")

        assertAll(
            { assertEquals(2, state.turns.size, "both messages opened a turn") },
            { assertEquals(0, openTurns(state), "no turn left open") },
            { assertEquals(0, state.spontaneousResumeCount, "the one result is the first message's") },
        )
    }

    @Test
    fun `messages the CLI ran as one turn all close with its result`() {
        // Recorded with 2.1.319: b and c were sent while a ran. The CLI ran them as one turn, whose result names
        // c and lists both; b's lifecycle completes only after that result.
        val events =
            listOf<AgentEvent>(
                AgentEvent.CommandLifecycle("u1", "s", "cmd-a", "queued"),
                AgentEvent.CommandLifecycle("u2", "s", "cmd-a", "started"),
                AgentEvent.CommandLifecycle("u3", "s", "cmd-b", "queued"),
                AgentEvent.CommandLifecycle("u4", "s", "cmd-c", "queued"),
                resultFor(userMessageUuid = "cmd-a", isError = false, reason = "a", listOf("cmd-a")),
                AgentEvent.CommandLifecycle("u5", "s", "cmd-a", "completed"),
                AgentEvent.CommandLifecycle("u6", "s", "cmd-b", "started"),
                AgentEvent.CommandLifecycle("u7", "s", "cmd-c", "started"),
                resultFor(userMessageUuid = "cmd-c", isError = false, reason = "bc", listOf("cmd-b", "cmd-c")),
                AgentEvent.CommandLifecycle("u8", "s", "cmd-b", "completed"),
                AgentEvent.CommandLifecycle("u9", "s", "cmd-c", "completed"),
            )
        val state = events.fold(ConversationState(), ::fold)

        assertAll(
            { assertEquals(3, state.turns.size, "each message opened a turn") },
            { assertEquals(0, openTurns(state), "no turn left open") },
            { assertEquals(0, state.spontaneousResumeCount, "both results answered messages") },
        )
    }

    @Test
    fun `a result whose list names only closed turns closes nothing and is a resume`() {
        val events =
            listOf<AgentEvent>(
                AgentEvent.CommandLifecycle("u1", "s", "cmd-a", "started"),
                resultFor(userMessageUuid = "cmd-a", isError = false, reason = "a", listOf("cmd-a")),
                AgentEvent.CommandLifecycle("u2", "s", "cmd-b", "started"),
                resultFor(userMessageUuid = "cmd-a", isError = false, reason = "again", listOf("cmd-a", "cmd-x")),
            )
        val state = events.fold(ConversationState(), ::fold)

        assertAll(
            { assertEquals(TurnPhase.OPEN, state.turns.last().phase, "b is not named, so it stays open") },
            { assertEquals(1, state.spontaneousResumeCount) },
        )
    }

    @Test
    fun `a completed lifecycle alone closes nothing, so its own later result still correlates`() {
        val events =
            listOf<AgentEvent>(
                AgentEvent.CommandLifecycle("u1", "s", "cmd-a", "started"),
                AgentEvent.CommandLifecycle("u2", "s", "cmd-a", "completed"),
            )
        val completed = events.fold(ConversationState(), ::fold)
        val answered = fold(completed, resultFor(userMessageUuid = "cmd-a", isError = false, reason = "done"))

        assertAll(
            { assertEquals(TurnPhase.OPEN, completed.turns.single().phase, "completed is not a terminator") },
            { assertEquals(TurnPhase.CLOSED, answered.turns.single().phase, "its result closes it") },
            { assertEquals(0, answered.spontaneousResumeCount, "and is not taken for a resume") },
        )
    }

    @Test
    fun `a taken-in message closes with the failing turn and carries its reason`() {
        val events =
            listOf<AgentEvent>(
                AgentEvent.CommandLifecycle("u1", "s", "cmd-a", "started"),
                AgentEvent.CommandLifecycle("u2", "s", "cmd-b", "queued"),
                AgentEvent.CommandLifecycle("u3", "s", "cmd-b", "completed"),
                resultFor(userMessageUuid = "cmd-a", isError = true, reason = "boom"),
            )
        val turns = events.fold(ConversationState(), ::fold).turns

        assertAll(
            { assertEquals(listOf(TurnPhase.CLOSED, TurnPhase.CLOSED), turns.map { it.phase }) },
            { assertEquals(listOf("boom", "boom"), turns.map { it.incompleteReason }) },
        )
    }

    @Test
    fun `a failing result carries its reason onto the per-turn incompleteReason it closes`() {
        // No recorded capture has result.is_error==true (all 18 are false), so the per-turn failure
        // path is exercised synthetically, correlated by command_uuid.
        val events =
            listOf<AgentEvent>(
                AgentEvent.CommandLifecycle("u1", "s", "cmd-err", "started"),
                resultFor(userMessageUuid = "cmd-err", isError = true, reason = "boom"),
            )

        val state = events.fold(ConversationState(), ::fold)
        val turn = state.turns.single()

        assertAll(
            { assertEquals(TurnPhase.CLOSED, turn.phase, "the correlated result closes the turn") },
            { assertEquals("boom", turn.incompleteReason, "a failing turn carries its reason") },
        )
    }

    @Test
    fun `a succeeding result leaves the per-turn incompleteReason null`() {
        val events =
            listOf<AgentEvent>(
                AgentEvent.CommandLifecycle("u1", "s", "cmd-ok", "started"),
                resultFor(userMessageUuid = "cmd-ok", isError = false, reason = "done"),
            )

        val turn = events.fold(ConversationState(), ::fold).turns.single()

        assertEquals(TurnPhase.CLOSED, turn.phase, "the turn closes")
        assertNull(turn.incompleteReason, "a succeeding turn has no reason")
    }

    @Test
    fun `a failing turn is recorded twice - per-turn reason and a conversation-level error notice`() {
        // The intended dual record: a turn that fails is written both
        // per-turn (Turn.incompleteReason → status.incomplete{reason}) and at the conversation level
        // (Notice(NoticeKind.ERROR) → metadata.custom); the two carry different roles. This asserts the
        // conversation-level half — the notice path — and its symmetry (no failure ⇒ no ERROR notice).
        val failing =
            listOf<AgentEvent>(
                AgentEvent.CommandLifecycle("u1", "s", "cmd-err", "started"),
                resultFor(userMessageUuid = "cmd-err", isError = true, reason = "boom"),
            ).fold(ConversationState(), ::fold)
        val succeeding =
            listOf<AgentEvent>(
                AgentEvent.CommandLifecycle("u1", "s", "cmd-ok", "started"),
                resultFor(userMessageUuid = "cmd-ok", isError = false, reason = "done"),
            ).fold(ConversationState(), ::fold)

        val errorNotices = failing.notices.filter { it.kind == NoticeKind.ERROR }
        assertAll(
            { assertEquals(1, errorNotices.size, "a failing result adds one conversation-level ERROR notice") },
            { assertEquals("boom", errorNotices.single().message, "the ERROR notice carries the result text") },
            {
                assertTrue(
                    succeeding.notices.none { it.kind == NoticeKind.ERROR },
                    "a succeeding result adds no ERROR notice (symmetry)",
                )
            },
        )
    }

    @Test
    fun `normal captures leave every closed turn's incompleteReason null`() {
        // The null side, on real data: all recorded results are is_error==false.
        listOf("10-background-task.ndjson", "11-background-followup.ndjson").forEach { file ->
            val state = foldCapture(file)
            assertTrue(
                state.turns.all { it.incompleteReason == null },
                "$file: no recorded turn failed, so every incompleteReason is null",
            )
        }
    }

    internal companion object {
        fun foldCapture(file: String): ConversationState =
            CaptureFixtures.readCapture(file).fold(ConversationState(), ::fold)

        fun openTurns(state: ConversationState) = state.turns.count { it.phase == TurnPhase.OPEN }

        fun closedTurns(state: ConversationState) = state.turns.count { it.phase == TurnPhase.CLOSED }

        fun resultFor(
            userMessageUuid: String?,
            isError: Boolean,
            reason: String,
            userMessageUuids: List<String>? = null,
        ): AgentEvent.Result =
            AgentEvent.Result(
                uuid = "u",
                sessionId = "s",
                subtype = if (isError) "error" else "success",
                result = reason,
                isError = isError,
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
                userMessageUuid = userMessageUuid,
                userMessageUuids = userMessageUuids,
            )
    }
}
