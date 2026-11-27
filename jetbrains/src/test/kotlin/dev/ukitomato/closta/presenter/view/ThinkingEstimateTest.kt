package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test

/** Capture 20: the CLI's thinking-token estimate is shown on the thinking block that is streaming. */
class ThinkingEstimateTest {
    private val inputs = CaptureReplay.inputs("20-todowrite", uuids = true)

    private fun uuidOf(input: PresenterInput): String? =
        when (val event = (input as? PresenterInput.Event)?.event) {
            is AgentEvent.StreamEvent -> event.uuid
            is AgentEvent.SystemThinkingTokens -> event.uuid
            else -> null
        }

    private fun after(uuid: String): HostState {
        val upTo = inputs.indexOfFirst { uuidOf(it) == uuid }
        check(upTo >= 0) { "no line with uuid $uuid" }
        return inputs.take(upTo + 1).fold(HostState()) { state, input -> state.next(input) }
    }

    private fun thinking(state: HostState) = ThreadRows().of(state.transcript).filterIsInstance<ThinkingRow>()

    @Test
    fun `a streaming thinking block shows the latest estimate`() {
        assertEquals(136L, thinking(after("dc197bf8-41a1-4bd6-a612-aaad078ef83d")).last().estimate)
    }

    @Test
    fun `a block that stopped shows no estimate`() {
        val row = thinking(after("95aeacc0-d9ba-48d4-a546-3d4af4c3f629")).last()
        assertEquals(false, row.streaming)
        assertNull(row.estimate)
    }

    @Test
    fun `a new thinking block starts without the earlier estimate and takes the count from 50 again`() {
        val started = thinking(after("19ede645-fed3-4d79-a75e-764122a39cfe"))
        assertEquals(true, started.last().streaming)
        assertNull(started.last().estimate)
        val next =
            inputs
                .dropWhile { uuidOf(it) != "19ede645-fed3-4d79-a75e-764122a39cfe" }
                .first { (it as? PresenterInput.Event)?.event is AgentEvent.SystemThinkingTokens }
        assertEquals(50L, thinking(after(uuidOf(next)!!)).last().estimate)
    }

    @Test
    fun `an estimate with no streaming block, or the same estimate again, changes nothing`() {
        val before = after("95aeacc0-d9ba-48d4-a546-3d4af4c3f629")
        val event = AgentEvent.SystemThinkingTokens("u", "s", 77, 10)
        assertSame(before.transcript, before.next(PresenterInput.Event(event)).transcript)

        val streaming = after("dc197bf8-41a1-4bd6-a612-aaad078ef83d")
        val again = AgentEvent.SystemThinkingTokens("u2", "s", 136, 0)
        assertSame(streaming.transcript, streaming.next(PresenterInput.Event(again)).transcript)
    }
}
