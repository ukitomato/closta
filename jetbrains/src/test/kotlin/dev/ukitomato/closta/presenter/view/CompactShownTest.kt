package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.tree.JsonText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Capture 21: `/compact` is shown as a divider in the thread, and as a status while it runs. */
class CompactShownTest {
    private val inputs = CaptureReplay.inputs("21-compact")

    private fun eventOf(input: PresenterInput) = (input as? PresenterInput.Event)?.event

    private fun isResultStatus(event: AgentEvent?) =
        event is AgentEvent.SystemStatus && event.status == null && event.compactResult != null

    private fun run(list: List<PresenterInput>): HostState =
        list.fold(HostState()) { state, input -> state.next(input) }

    private fun compacted(state: HostState) =
        ThreadRows().of(state.transcript).filterIsInstance<DividerRow>().map { it.divider }

    private fun failedStatus(input: PresenterInput): PresenterInput {
        val event = eventOf(input)
        return if (isResultStatus(event)) {
            PresenterInput.Event((event as AgentEvent.SystemStatus).copy(compactResult = "failed"))
        } else {
            input
        }
    }

    @Test
    fun `21 the thread has one divider with the trigger and both counts`() {
        assertEquals(
            listOf(Divider.Compacted("manual", 21819, 3447, failed = false)),
            compacted(run(inputs)),
        )
    }

    @Test
    fun `21 compacting is true after the compacting status and false after the one that ends it`() {
        var state = HostState()
        val seen = ArrayList<Pair<String?, Boolean>>()
        for (input in inputs) {
            state = state.next(input)
            val event = eventOf(input)
            if (event is AgentEvent.SystemStatus) {
                seen += event.status to composerState(state.conversation, state.transcript).compacting
            }
        }
        assertTrue(seen.single { it.first == "compacting" }.second)
        assertFalse(seen.last { it.first == null }.second)
    }

    @Test
    fun `type only - a failed result before the boundary makes the divider failed`() {
        assertEquals(
            listOf(Divider.Compacted("manual", 21819, 3447, failed = true)),
            compacted(run(inputs.map(::failedStatus))),
        )
    }

    @Test
    fun `type only - a failure with no boundary is shown at the result, once`() {
        val list = inputs.map(::failedStatus).filterNot { eventOf(it) is AgentEvent.SystemCompactBoundary }
        val state = run(list)

        assertEquals(listOf(Divider.Compacted("unknown", 0, null, failed = true)), compacted(state))
        assertEquals(null, state.transcript.compactFailure, "the result used it up")
    }

    @Test
    fun `type only - a conversation reset drops a failure waiting for its boundary`() {
        val failed =
            HostState().next(
                PresenterInput.Event(AgentEvent.SystemStatus("st", "s-1", compactResult = "failed")),
            )
        val reset = AgentEvent.ConversationReset("rs", "s-1", "s-2", timestamp = "2026-11-14T12:26:36.305Z")

        assertEquals("st", failed.transcript.compactFailure)
        assertEquals(null, failed.next(PresenterInput.Event(reset)).transcript.compactFailure)
    }

    @Test
    fun `the compact part is a part of its own type in the tree`() {
        val tree = CaptureReplay.replay("21-compact").last().tree
        assertTrue(JsonText.compact(tree).contains("\"type\":\"compacted\""))
    }
}
