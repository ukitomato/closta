package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** `system/api_retry`, which no capture carries: the lines are made by hand. */
class ApiRetryTest {
    private fun HostState.feed(vararg events: AgentEvent): HostState =
        events.fold(this) { state, event -> state.next(PresenterInput.Event(event)) }

    private fun HostState.retry() = composerState(conversation, transcript).retry

    private val retrying =
        AgentEvent.SystemApiRetry("u", "s-1", 2, 10, 2500, 529, "overloaded")

    private val openTurn =
        HostState()
            .next(PresenterInput.UserSent("send-1", "hi"))
            .feed(Lines.queued("c1"), Lines.started("c1"))

    @Test
    fun `type only - a retry in an open turn is shown with its attempt, delay and status`() {
        assertEquals(RetryRecord(2, 10, 2500, 529), openTurn.feed(retrying).retry())
    }

    @Test
    fun `type only - the next stream event ends it`() {
        assertNull(openTurn.feed(retrying, Lines.messageStart("m")).retry())
    }

    @Test
    fun `type only - a result ends it`() {
        assertNull(openTurn.feed(retrying, Lines.result("c1")).retry())
    }

    @Test
    fun `type only - a retry with no turn open is not shown`() {
        assertNull(HostState().feed(retrying).retry())
    }

    @Test
    fun `type only - a stream event with nothing to end returns the same records`() {
        val before = openTurn.transcript.operations
        assertEquals(true, before === openTurn.feed(Lines.messageStart("m")).transcript.operations)
    }
}
