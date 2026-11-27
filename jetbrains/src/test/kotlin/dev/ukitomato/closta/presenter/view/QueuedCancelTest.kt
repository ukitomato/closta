package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.TurnBoundaryTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** What the row of a message sent during a turn says of withdrawing it, from the CLI's queue to its start. */
class QueuedCancelTest {
    private val steps = CaptureReplay.replay("31-send-mid-turn", uuids = true)

    private fun cancelOf(
        step: CaptureReplay.Step,
        key: String,
    ): AskCancel? =
        ThreadRows()
            .of(step.transcript, step.conversation)
            .filterIsInstance<AskRow>()
            .firstOrNull { it.key == key }
            ?.cancel

    private fun indexOf(
        state: String,
        nth: Int,
    ): Int {
        val seen = HashSet<String>()
        var found = 0
        steps.forEachIndexed { index, step ->
            val event = (step.input as? PresenterInput.Event)?.event as? AgentEvent.CommandLifecycle
            val first = event != null && event.state == state && seen.add(event.commandUuid)
            if (first && ++found == nth) return index
        }
        error("no $nth-th $state")
    }

    @Test
    fun `31 the message sent during the turn is offered from its queued until its started`() {
        val queued = indexOf("queued", 2)
        assertEquals(AskCancel(CancelPhase.OFFER), cancelOf(steps[queued], "send-2"))
        assertNull(cancelOf(steps[queued - 1], "send-2"), "before queued nothing is offered")
        val started = indexOf("started", 2)
        assertNull(cancelOf(steps[started], "send-2"), "the CLI took it in")
        assertNull(cancelOf(steps.last(), "send-2"))
    }

    @Test
    fun `31 the message sent while nothing ran is never offered`() {
        val queued = indexOf("queued", 1)
        steps.forEach { assertNull(cancelOf(it, "send-1")) }
        assertEquals(setOf("send-2"), steps[indexOf("queued", 2)].transcript.sentWhileRunning)
        assertTrue(steps[queued].transcript.sentWhileRunning.isEmpty())
    }

    @Test
    fun `31 a cancelled lifecycle after the result changes nothing for the rows`() {
        val last = steps.last()
        assertTrue(
            last.transcript.operations.cancels
                .isEmpty(),
        )
    }

    private fun HostState.event(event: AgentEvent) = next(PresenterInput.Event(event))

    private fun cancelled(command: String) = AgentEvent.CommandLifecycle("lc", "s-1", command, "cancelled")

    private fun HostState.cancelOf(key: String) =
        ThreadRows()
            .of(transcript, conversation)
            .filterIsInstance<AskRow>()
            .single { it.key == key }
            .cancel

    /** A runs; B was sent during it and the CLI queued it; A's result came, B waits. */
    private fun queuedB(): HostState =
        HostState()
            .next(PresenterInput.UserSent("ka", "one", uuid = "a"))
            .event(Lines.queued("a"))
            .event(Lines.started("a"))
            .next(PresenterInput.UserSent("kb", "two", uuid = "b"))
            .event(Lines.queued("b"))
            .event(TurnBoundaryTest.resultFor("a", isError = false, reason = "ok", listOf("a")))

    private fun HostState.ask(id: String) = next(PresenterInput.ControlRequested(id, ControlKind.CANCEL_QUEUED, "b"))

    @Test
    fun `type only - a cancelled answer marks the row and the turn stops running`() {
        val queued = queuedB()
        assertEquals(AskCancel(CancelPhase.OFFER), queued.cancelOf("kb"))
        assertTrue(threadIsRunning(queued.conversation, queued.transcript))
        val waiting = queued.ask("r1")
        assertEquals(AskCancel(CancelPhase.WAITING), waiting.cancelOf("kb"))
        val done = waiting.event(Lines.controlOk("r1", """{"cancelled":true}"""))
        assertEquals(AskCancel(CancelPhase.CANCELLED), done.cancelOf("kb"))
        assertFalse(threadIsRunning(done.conversation, done.transcript))
        assertTrue("b" in done.transcript.routing.stopped)
    }

    @Test
    fun `type only - cancelled false says it was too late`() {
        val late = queuedB().ask("r1").event(Lines.controlOk("r1", """{"cancelled":false}"""))
        assertEquals(AskCancel(CancelPhase.TOO_LATE), late.cancelOf("kb"))
        assertTrue(threadIsRunning(late.conversation, late.transcript))
    }

    @Test
    fun `type only - an error answer shows the CLI's words and offers the withdrawal again`() {
        val failed = queuedB().ask("r1").event(Lines.controlError("r1", "No such message"))
        assertEquals(AskCancel(CancelPhase.FAILED, "No such message"), failed.cancelOf("kb"))
    }

    @Test
    fun `type only - a started before the answer is too late, and the answer does not undo it`() {
        val started = queuedB().ask("r1").event(Lines.started("b"))
        assertEquals(AskCancel(CancelPhase.TOO_LATE), started.cancelOf("kb"))
        val answered = started.event(Lines.controlOk("r1", """{"cancelled":false}"""))
        assertEquals(AskCancel(CancelPhase.TOO_LATE), answered.cancelOf("kb"))
    }

    @Test
    fun `type only - a cancelled lifecycle after too late is a withdrawn message`() {
        val late = queuedB().ask("r1").event(Lines.controlOk("r1", """{"cancelled":false}"""))
        val closed = late.event(cancelled("b"))
        assertEquals(AskCancel(CancelPhase.CANCELLED), closed.cancelOf("kb"))
        assertFalse(threadIsRunning(closed.conversation, closed.transcript))
    }

    @Test
    fun `type only - a cancelled lifecycle names a message nobody asked about and still marks the row`() {
        val closed = queuedB().event(cancelled("b"))
        assertEquals(AskCancel(CancelPhase.CANCELLED), closed.cancelOf("kb"))
    }

    @Test
    fun `type only - a request that could not be written fails the row with the fixed sentence`() {
        val failed = queuedB().ask("r1").next(PresenterInput.ControlSendFailed("r1"))
        assertEquals(AskCancel(CancelPhase.FAILED, REQUEST_NOT_SENT), failed.cancelOf("kb"))
    }

    @Test
    fun `type only - nothing is offered once the CLI no longer runs`() {
        val queued = queuedB()
        val rows = ThreadRows().of(queued.transcript, queued.conversation, live = false)
        assertNull(rows.filterIsInstance<AskRow>().single { it.key == "kb" }.cancel)
    }

    @Test
    fun `type only - a success that says nothing leaves the row withdrawing`() {
        val silent = queuedB().ask("r1").event(Lines.controlOk("r1"))
        assertEquals(AskCancel(CancelPhase.WAITING), silent.cancelOf("kb"))
    }

    @Test
    fun `type only - a cancel request says its kind and id and never the uuid`() {
        val text = PresenterInput.ControlRequested("r1", ControlKind.CANCEL_QUEUED, "secret-uuid").toString()
        assertFalse(text.contains("secret-uuid"))
        assertEquals("AskCancel(FAILED)", AskCancel(CancelPhase.FAILED, "words").toString())
    }

    @Test
    fun `type only - a message the old CLI queued is not offered again after the process ends or a new CLI starts`() {
        val ended = queuedB().next(PresenterInput.ProcessEnded)
        assertNull(ended.cancelOf("kb"))
        val relaunched = ended.next(PresenterInput.Launched(null))
        assertNull(relaunched.cancelOf("kb"), "the new CLI never had the message")
        assertTrue(relaunched.transcript.sentWhileRunning.isEmpty())
        val direct = queuedB().next(PresenterInput.Launched(null))
        assertNull(direct.cancelOf("kb"))
    }

    @Test
    fun `type only - a withdrawn message stays withdrawn after more sends and more withdrawals than the tables keep`() {
        var state = queuedB().ask("r1").event(Lines.controlOk("r1", """{"cancelled":true}"""))
        repeat(MAX_CANCELS + 8) { n ->
            state = state.next(PresenterInput.UserSent("k$n", "x", uuid = "u$n"))
            state = state.next(PresenterInput.ControlRequested("q$n", ControlKind.CANCEL_QUEUED, "u$n"))
        }
        assertFalse("b" in state.transcript.operations.cancels)
        assertEquals(AskCancel(CancelPhase.CANCELLED), state.cancelOf("kb"))
        assertFalse("kb" in liveAsks(state.transcript))
        assertEquals(RewindRefusal.CANCELLED, askActions(state.transcript, false, "kb").refusal)
    }
}
