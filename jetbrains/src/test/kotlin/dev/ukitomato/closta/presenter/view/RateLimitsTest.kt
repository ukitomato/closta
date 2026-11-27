package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.RawJson
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * `rate_limit_event`: capture 41 carries one that is allowed; a warning and a refusal no capture carries, so those
 * lines are made by hand.
 */
class RateLimitsTest {
    private fun HostState.feed(vararg events: AgentEvent): HostState =
        events.fold(this) { state, event -> state.next(PresenterInput.Event(event)) }

    private fun HostState.shown() = composerState(conversation, transcript).rateLimit

    private fun limit(info: String) = AgentEvent.RateLimitEvent("u", "s-1", RawJson(info))

    private fun warning(utilization: String) =
        limit(
            """{"status":"allowed_warning","resetsAt":1794669600,"rateLimitType":"five_hour",""" +
                """"unifiedWindows":{"five_hour":{"utilization":$utilization,"resetsAt":1794669700,""" +
                """"status":"allowed_warning"}}}""",
        )

    private val rejected =
        limit("""{"status":"rejected","resetsAt":1794669600,"rateLimitType":"five_hour","overageStatus":"allowed"}""")

    @Test
    fun `the allowed line of capture 41 is recorded and not shown`() {
        val inputs = CaptureReplay.inputs("41-clear-reset")
        val at = inputs.indexOfFirst { (it as? PresenterInput.Event)?.event is AgentEvent.RateLimitEvent }
        val state = inputs.take(at + 1).fold(HostState()) { host, input -> host.next(input) }
        val record = state.transcript.operations.rateLimit!!

        assertAll(
            { assertEquals(LimitStatus.ALLOWED, record.status) },
            { assertEquals("five_hour", record.window) },
            { assertEquals(24, record.utilizationPercent) },
            { assertEquals(1794669600L, record.resetsAtEpochSec) },
            { assertFalse(record.usingOverage) },
            { assertNull(state.shown()) },
        )
    }

    @Test
    fun `type only - a warning shows its window's share and reset`() {
        val record = HostState().feed(warning("0.85")).shown()

        assertAll(
            { assertEquals(LimitStatus.WARNING, record?.status) },
            { assertEquals(85, record?.utilizationPercent) },
            { assertEquals(1794669700L, record?.resetsAtEpochSec, "the window's own reset goes first") },
            { assertEquals(false, record?.usingOverage, "only a refusal goes on extra usage") },
        )
    }

    @Test
    fun `type only - a dismissed warning stays hidden for the same window, and a refusal shows again`() {
        val warned = HostState().feed(warning("0.85"))
        val seq = warned.shown()!!.seq
        val dismissed = warned.next(PresenterInput.RateLimitDismissed(seq))
        val again = dismissed.feed(warning("0.86"))
        val refused = again.feed(rejected)

        assertAll(
            { assertNull(dismissed.shown()) },
            { assertNull(again.shown(), "the same status and window keep the dismissal") },
            {
                assertEquals(
                    seq,
                    again.transcript.operations.rateLimit
                        ?.seq,
                )
            },
            {
                assertEquals(
                    86,
                    again.transcript.operations.rateLimit
                        ?.utilizationPercent,
                )
            },
            { assertEquals(LimitStatus.REJECTED, refused.shown()?.status) },
            { assertEquals(seq + 1, refused.shown()?.seq) },
            { assertTrue(refused.shown()!!.usingOverage, "refused with extra usage allowed") },
        )
    }

    @Test
    fun `type only - a top-level utilization is read as a share up to 1 and a percentage above`() {
        fun top(utilization: String) =
            HostState()
                .feed(limit("""{"status":"allowed_warning","rateLimitType":"seven_day","utilization":$utilization}"""))
                .shown()

        assertAll(
            { assertEquals(85, top("85")?.utilizationPercent) },
            { assertEquals(85, top("0.85")?.utilizationPercent) },
            { assertEquals("seven_day", top("0.85")?.window) },
        )
    }

    @Test
    fun `type only - a warning with no utilization at all is shown without a share`() {
        val record =
            HostState()
                .feed(limit("""{"status":"allowed_warning","resetsAt":1794669600,"rateLimitType":"five_hour"}"""))
                .shown()

        assertAll(
            { assertEquals(LimitStatus.WARNING, record?.status) },
            { assertNull(record?.utilizationPercent) },
            { assertEquals(1794669600L, record?.resetsAtEpochSec) },
        )
    }

    @Test
    fun `type only - an unknown status is allowed, and an unreadable line changes nothing`() {
        val before = HostState().feed(warning("0.85"))

        assertAll(
            {
                assertEquals(
                    LimitStatus.ALLOWED,
                    HostState().feed(limit("""{"status":"future"}""")).operations()?.status,
                )
            },
            { assertSame(before.transcript, before.feed(limit("nope")).transcript) },
            { assertSame(before.transcript, before.feed(limit("[]")).transcript) },
        )
    }

    private fun HostState.operations() = transcript.operations.rateLimit
}
