package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalKind
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.PendingApproval
import dev.ukitomato.closta.core.models.Turn
import dev.ukitomato.closta.core.models.TurnBoundaryTest
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

    @Test
    fun `messages the CLI ran as one turn stop running when that turn ends`() {
        // Seen with 2.1.319: two messages sent while a turn ran were run as one turn, and the composer kept its stop
        // button after it ended (the result names the last message; the other one's lifecycle completes after it).
        fun sent(uuid: String) = PresenterInput.UserSent("send-$uuid", uuid, emptyList(), uuid = uuid)

        fun life(
            uuid: String,
            state: String,
        ) = PresenterInput.Event(AgentEvent.CommandLifecycle("l-$uuid-$state", "s", uuid, state))

        fun result(
            last: String,
            all: List<String>,
        ) = PresenterInput.Event(TurnBoundaryTest.resultFor(last, isError = false, reason = "ok", all))
        val inputs =
            listOf(
                sent("a"),
                life("a", "queued"),
                life("a", "started"),
                sent("b"),
                life("b", "queued"),
                sent("c"),
                life("c", "queued"),
                result("a", listOf("a")),
                life("a", "completed"),
                life("b", "started"),
                life("c", "started"),
                result("c", listOf("b", "c")),
                life("b", "completed"),
                life("c", "completed"),
            )
        val states = inputs.runningFold(HostState()) { state, input -> state.next(input) }.drop(1)
        val ended = inputs.lastIndexOf(result("c", listOf("b", "c")))

        assertTrue(threadIsRunning(states[ended - 1].conversation, states[ended - 1].transcript), "running before")
        for (index in ended until states.size) {
            assertFalse(threadIsRunning(states[index].conversation, states[index].transcript), "at rest at #$index")
        }
    }

    @Test
    fun `no content goes to a turn its result closed`() {
        // 31: the message taken in started last, so it was the turn receiving content, but the result names the
        // first. Once core closes both, what the CLI says on its own later must open a resume of its own.
        val last = CaptureReplay.replay("31-send-mid-turn", uuids = true).last()

        assertEquals(null, last.transcript.routing.currentTurn)
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
