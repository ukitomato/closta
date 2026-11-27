package dev.ukitomato.closta.core.models

import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** A `cancelled` lifecycle closes the open turn it names; one that follows the turn's `result` changes nothing. */
class LifecycleCancelledTest {
    @Test
    fun `a cancelled lifecycle after the result changes nothing`() {
        listOf("30-deny-empty-message.ndjson", "32-interrupt-foreground.ndjson").forEach { file ->
            val events = CaptureFixtures.readCapture(file)
            val cancelledAt =
                events.indices.filter {
                    val event = events[it]
                    event is AgentEvent.CommandLifecycle && event.state == "cancelled"
                }
            assertTrue(cancelledAt.isNotEmpty(), "$file holds a cancelled lifecycle")
            cancelledAt.forEach { index ->
                val before = events.take(index).fold(ConversationState(), ::fold)
                val after = fold(before, events[index])
                assertEquals(before, after, "$file: the cancelled at event $index changed the state")
            }
        }
    }

    @Test
    fun `a cancelled lifecycle after the result keeps the reason the result set`() {
        val state =
            listOf<AgentEvent>(
                AgentEvent.CommandLifecycle("u1", "s", "cmd-a", "started"),
                result("cmd-a", isError = true, reason = "boom"),
                AgentEvent.CommandLifecycle("u2", "s", "cmd-a", "cancelled"),
            ).fold(ConversationState(), ::fold)

        assertAll(
            { assertEquals(TurnPhase.CLOSED, state.turns.single().phase) },
            { assertEquals("boom", state.turns.single().incompleteReason) },
        )
    }

    @Test
    fun `type only - a cancelled lifecycle closes the open turn it names`() {
        val state =
            listOf<AgentEvent>(
                AgentEvent.CommandLifecycle("u1", "s", "cmd-a", "started"),
                AgentEvent.CommandLifecycle("u2", "s", "cmd-b", "queued"),
                AgentEvent.CommandLifecycle("u3", "s", "cmd-b", "cancelled"),
            ).fold(ConversationState(), ::fold)

        assertAll(
            { assertEquals(TurnPhase.OPEN, state.turns[0].phase, "the turn that was not named stays open") },
            { assertEquals(TurnPhase.CLOSED, state.turns[1].phase, "the named turn closes") },
            { assertEquals("cancelled", state.turns[1].incompleteReason) },
        )
    }

    @Test
    fun `a cancelled lifecycle for an unknown uuid changes nothing`() {
        val before =
            listOf<AgentEvent>(AgentEvent.CommandLifecycle("u1", "s", "cmd-a", "started"))
                .fold(ConversationState(), ::fold)

        assertEquals(before, fold(before, AgentEvent.CommandLifecycle("u2", "s", "cmd-x", "cancelled")))
    }

    private fun result(
        userMessageUuid: String,
        isError: Boolean,
        reason: String,
    ): AgentEvent.Result = TurnBoundaryTest.resultFor(userMessageUuid, isError, reason)
}
