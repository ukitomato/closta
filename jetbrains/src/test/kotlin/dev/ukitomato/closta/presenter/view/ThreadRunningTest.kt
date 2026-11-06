package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ApprovalKind
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.PendingApproval
import dev.ukitomato.closta.core.models.Turn
import dev.ukitomato.closta.core.models.TurnPhase
import dev.ukitomato.closta.presenter.at
import dev.ukitomato.closta.presenter.tree.JsonBool
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/**
 * The one rule for a running thread: the tree's `isRunning` and the bridge's "in a turn" are this function, so
 * each of its four reasons is measured here by itself, and the tree is checked against it at every step of every
 * capture.
 */
class ThreadRunningTest {
    private fun running(
        conversation: ConversationState = ConversationState(),
        routing: Routing = Routing(),
    ) = threadIsRunning(conversation, Transcript(routing = routing))

    @Test
    fun `a thread with nothing in it is at rest`() {
        assertFalse(running())
    }

    @Test
    fun `an open turn runs, a closed one does not`() {
        assertTrue(running(ConversationState(turns = listOf(Turn("c1", TurnPhase.OPEN)))))
        assertFalse(running(ConversationState(turns = listOf(Turn("c1", TurnPhase.CLOSED)))))
    }

    @Test
    fun `a resume the CLI opened on its own runs`() {
        assertTrue(running(routing = Routing(openResume = "m1")))
    }

    @Test
    fun `an approval waited on runs, but one with no id is not shown and does not`() {
        val kind = ApprovalKind.entries.first()
        assertTrue(running(ConversationState(pendingApprovals = listOf(PendingApproval("r1", kind)))))
        assertFalse(running(ConversationState(pendingApprovals = listOf(PendingApproval("", kind)))))
    }

    @Test
    fun `a send core has opened no turn for yet runs, and stops once the turn is there`() {
        assertTrue(running(routing = Routing(sends = 1)))
        assertFalse(running(ConversationState(turns = listOf(Turn("c1", TurnPhase.CLOSED))), Routing(sends = 1)))
    }

    @Test
    fun `a turn the API refused with a 400 ends, and so does the next one it refuses`() {
        // Seen on Windows: after the 400 the composer kept its stop button although the CLI had ended the turn.
        val steps = CaptureReplay.replay("30-deny-empty-message")
        val results =
            steps.withIndex().filter { (_, step) ->
                (step.input as? PresenterInput.Event)?.event is
                    dev.ukitomato.closta.core.models.AgentEvent.Result
            }
        assertEquals(2, results.size)
        for ((index, step) in results) {
            assertFalse(threadIsRunning(step.conversation, step.transcript), "after the result at #$index")
        }
        val last = steps.last()
        assertFalse(threadIsRunning(last.conversation, last.transcript), "at the end")
    }

    @Test
    fun `a message the CLI took into the running turn ends with that turn`() {
        // Seen on Windows: the CLI took a message sent mid-turn into the running turn, no result came for it, and
        // the composer kept its stop button for the rest of the conversation.
        val steps = CaptureReplay.replay("31-send-mid-turn")
        val result =
            steps.indexOfFirst { step ->
                (step.input as? PresenterInput.Event)?.event is dev.ukitomato.closta.core.models.AgentEvent.Result
            }
        val secondSend = steps.indexOfLast { it.input is PresenterInput.UserSent }
        assertTrue(secondSend in 0 until result, "the second message goes while the first turn runs")
        for (index in secondSend until result) {
            assertTrue(threadIsRunning(steps[index].conversation, steps[index].transcript), "running at #$index")
        }
        for (index in result until steps.size) {
            assertFalse(threadIsRunning(steps[index].conversation, steps[index].transcript), "at rest at #$index")
        }
    }

    @TestFactory
    fun `the tree's isRunning is this rule at every step of every capture`(): List<DynamicTest> =
        CaptureReplay.scenarios().map { scenario ->
            DynamicTest.dynamicTest(scenario) {
                for ((index, step) in CaptureReplay.replay(scenario).withIndex()) {
                    val thread = step.tree.at("threads", "byId", CaptureReplay.THREAD)
                    assertEquals(
                        JsonBool.of(threadIsRunning(step.conversation, step.transcript)),
                        thread["isRunning"],
                        "$scenario #$index",
                    )
                }
            }
        }
}
