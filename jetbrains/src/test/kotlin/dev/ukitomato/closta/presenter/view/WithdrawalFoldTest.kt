package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The table of withdrawals of queued messages that the operations keep, by request id. */
class WithdrawalFoldTest {
    private fun HostState.with(input: PresenterInput) = next(input)

    private fun HostState.with(event: AgentEvent) = next(PresenterInput.Event(event))

    private fun HostState.ops() = transcript.operations

    private fun HostState.request(
        id: String,
        kind: ControlKind,
        value: String? = null,
    ) = with(PresenterInput.ControlRequested(id, kind, value))

    private fun HostState.cancel(n: Int) = request("c$n", ControlKind.CANCEL_QUEUED, "m$n")

    @Test
    fun `type only - the thirty-third withdrawal pushes out the oldest, and its answer changes nothing`() {
        val asked = (1..MAX_CANCELS + 1).fold(HostState()) { state, n -> state.cancel(n) }
        assertEquals(
            (2..MAX_CANCELS + 1).map { "c$it" },
            asked
                .ops()
                .cancelAsks.keys
                .toList(),
        )
        assertEquals(
            (2..MAX_CANCELS + 1).map { "m$it" },
            asked
                .ops()
                .cancels.keys
                .toList(),
        )
        val late = asked.with(Lines.controlOk("c1", """{"cancelled":true}"""))
        assertSame(asked.transcript, late.transcript, "an id that fell out of the table is an id nobody knows")
    }

    @Test
    fun `type only - each withdrawal answer binds to the message asked under its own id`() {
        val asked = HostState().cancel(1).cancel(2)
        val second = asked.with(Lines.controlOk("c2", """{"cancelled":true}"""))
        assertEquals(
            CancelPhase.CANCELLED,
            second
                .ops()
                .cancels
                .getValue("m2")
                .phase,
        )
        assertEquals(
            CancelPhase.WAITING,
            second
                .ops()
                .cancels
                .getValue("m1")
                .phase,
        )
        assertEquals(
            listOf("c1"),
            second
                .ops()
                .cancelAsks.keys
                .toList(),
        )
        assertSame(second.transcript, second.with(Lines.controlOk("c2", """{"cancelled":false}""")).transcript)
    }

    @Test
    fun `type only - a withdrawal that could not be written is not waited for`() {
        val failed = HostState().cancel(1).with(PresenterInput.ControlSendFailed("c1"))
        assertTrue(failed.ops().cancelAsks.isEmpty())
        assertEquals(AskCancel(CancelPhase.FAILED, REQUEST_NOT_SENT), failed.ops().cancels.getValue("m1"))
        assertSame(failed.transcript, failed.with(Lines.controlOk("c1", """{"cancelled":true}""")).transcript)
    }

    @Test
    fun `type only - a request id already asked is not recorded again for a withdrawal`() {
        val state = HostState().cancel(1).request("c1", ControlKind.CANCEL_QUEUED, "other")
        assertEquals(mapOf("c1" to "m1"), state.ops().cancelAsks)
    }

    @Test
    fun `type only - a new CLI empties the table of withdrawals and keeps the withdrawn`() {
        val state =
            HostState().cancel(1).cancel(2).with(Lines.controlOk("c1", """{"cancelled":true}"""))
        val launched = state.with(PresenterInput.Launched(null))
        assertTrue(launched.ops().cancelAsks.isEmpty())
        assertEquals(setOf("m1"), launched.ops().cancels.keys)
        assertSame(launched.transcript, launched.with(Lines.controlOk("c2", """{"cancelled":true}""")).transcript)
    }
}
