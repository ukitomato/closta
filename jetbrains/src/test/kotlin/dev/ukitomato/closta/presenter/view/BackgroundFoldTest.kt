package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The table of requests to move a running call to the background that the operations keep, by request id. */
class BackgroundFoldTest {
    private fun HostState.with(input: PresenterInput) = next(input)

    private fun HostState.with(event: AgentEvent) = next(PresenterInput.Event(event))

    private fun HostState.ops() = transcript.operations

    private fun HostState.request(
        id: String,
        kind: ControlKind,
        value: String? = null,
    ) = with(PresenterInput.ControlRequested(id, kind, value))

    private fun HostState.background(n: Int) = request("g$n", ControlKind.BACKGROUND, "tool-$n")

    @Test
    fun `type only - the thirty-third request to background pushes out the oldest, and its answer changes nothing`() {
        val asked = (1..MAX_BACKGROUND_ASKS + 1).fold(HostState()) { state, n -> state.background(n) }
        assertEquals(
            (2..MAX_BACKGROUND_ASKS + 1).map { "g$it" },
            asked
                .ops()
                .backgroundAsks.keys
                .toList(),
        )
        assertEquals(
            (2..MAX_BACKGROUND_ASKS + 1).map { "tool-$it" },
            asked
                .ops()
                .backgrounding.keys
                .toList(),
        )
        assertSame(asked.transcript, asked.with(Lines.controlError("g1", "late")).transcript)
    }

    @Test
    fun `type only - each background answer binds to the call asked under its own id`() {
        val asked = HostState().background(1).background(2)
        val second = asked.with(Lines.controlError("g2", "No such task"))
        assertEquals(
            BackgroundOffer(BackgroundPhase.FAILED, "No such task"),
            second.ops().backgrounding.getValue("tool-2"),
        )
        assertEquals(BackgroundOffer(BackgroundPhase.WAITING), second.ops().backgrounding.getValue("tool-1"))
        assertEquals(
            listOf("g1"),
            second
                .ops()
                .backgroundAsks.keys
                .toList(),
        )
        assertSame(second.transcript, second.with(Lines.controlError("g2", "again")).transcript)
    }

    @Test
    fun `type only - an old refusal does not overwrite a newer request for the same call`() {
        val state =
            HostState()
                .request("g1", ControlKind.BACKGROUND, "tool-1")
                .request("g2", ControlKind.BACKGROUND, "tool-1")
                .with(Lines.controlError("g1", "old"))
        assertEquals(BackgroundOffer(BackgroundPhase.WAITING), state.ops().backgrounding.getValue("tool-1"))
    }

    @Test
    fun `type only - a request to background that could not be written fails, and its answer changes nothing`() {
        val failed = HostState().background(1).with(PresenterInput.ControlSendFailed("g1"))
        assertTrue(failed.ops().backgroundAsks.isEmpty())
        assertEquals(
            BackgroundOffer(BackgroundPhase.FAILED, REQUEST_NOT_SENT),
            failed.ops().backgrounding.getValue("tool-1"),
        )
        assertSame(failed.transcript, failed.with(Lines.controlOk("g1")).transcript)
    }

    @Test
    fun `type only - a request id already asked is not recorded again for backgrounding`() {
        val state = HostState().background(1).request("g1", ControlKind.BACKGROUND, "other")
        assertEquals(mapOf("g1" to "tool-1"), state.ops().backgroundAsks)
    }

    @Test
    fun `type only - a new CLI empties the tables of backgrounding`() {
        val state = HostState().background(1).background(2).with(Lines.controlError("g1", "no"))
        val launched = state.with(PresenterInput.Launched(null))
        assertTrue(launched.ops().backgroundAsks.isEmpty())
        assertTrue(launched.ops().backgrounding.isEmpty())
        assertSame(launched.transcript, launched.with(Lines.controlOk("g2")).transcript)
    }
}
