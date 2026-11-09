package dev.ukitomato.closta.presenter.view

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Stop ends the turn on screen: the turns open when stop was
 * pressed stop running at the next `result`, whatever turn that `result` names.
 */
class StopTest {
    private fun HostState.feed(vararg inputs: PresenterInput): HostState =
        inputs.fold(this) { state, input -> state.next(input) }

    private fun HostState.running() = threadIsRunning(conversation, transcript)

    private fun HostState.composer() = composerState(conversation, transcript)

    private val runningTurn =
        HostState().feed(
            PresenterInput.UserSent("send-1", "list the files"),
            PresenterInput.Event(Lines.queued("c1")),
            PresenterInput.Event(Lines.started("c1")),
        )

    @Test
    fun `a turn open when stop was pressed ends at the next result, even one that names no turn`() {
        val stopping = runningTurn.feed(PresenterInput.StopRequested)
        assertTrue(stopping.running(), "still running until the CLI says something")
        assertTrue(stopping.composer().stopping)

        val ended = stopping.feed(PresenterInput.Event(Lines.result(command = null, isError = true)))
        assertFalse(ended.running())
        assertFalse(ended.composer().stopping)
        assertEquals(setOf("c1"), ended.transcript.routing.stopped)
        assertEquals(emptySet<String>(), ended.transcript.routing.stopping)
    }

    @Test
    fun `a result that names the turn ends it as before`() {
        val ended = runningTurn.feed(PresenterInput.StopRequested, PresenterInput.Event(Lines.result("c1")))
        assertFalse(ended.running())
    }

    @Test
    fun `a send core has no turn for yet still runs after the stop`() {
        val sentMore = runningTurn.feed(PresenterInput.UserSent("send-2", "and the tests"))
        val ended = sentMore.feed(PresenterInput.StopRequested, PresenterInput.Event(Lines.result(command = null)))
        assertTrue(ended.running(), "the second message was given to the CLI and has no turn yet")
    }

    @Test
    fun `a turn started after the stop is not stopped by it`() {
        val stopping = runningTurn.feed(PresenterInput.StopRequested)
        val next =
            stopping.feed(
                PresenterInput.Event(Lines.result("c1")),
                PresenterInput.UserSent("send-2", "again"),
                PresenterInput.Event(Lines.queued("c2")),
                PresenterInput.Event(Lines.started("c2")),
            )
        assertTrue(next.running())
        assertFalse(next.composer().stopping)
    }

    @Test
    fun `a result with nothing stopping leaves the routing as it was`() {
        val before = runningTurn.transcript.routing
        val after = runningTurn.feed(PresenterInput.Event(Lines.result("c1"))).transcript.routing
        assertEquals(emptySet<String>(), after.stopped)
        assertEquals(before.stopping, after.stopping)
    }

    @Test
    fun `stop with nothing running changes nothing`() {
        val idle = HostState()
        assertSame(idle.transcript, idle.next(PresenterInput.StopRequested).transcript)
        assertFalse(idle.next(PresenterInput.StopRequested).composer().stopping)
    }
}
