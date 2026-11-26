package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * `get_usage`: capture 43 holds one answer, with the five-hour window alone and many names that are no window. The
 * answers without windows, or with a window of no share, no capture holds: those bodies are made by hand.
 */
class UsageReadingsTest {
    private fun HostState.ops() = transcript.operations

    private fun HostState.asked(id: String) = next(PresenterInput.ControlRequested(id, ControlKind.USAGE))

    private fun HostState.answered(
        id: String,
        body: String,
    ) = next(PresenterInput.Event(Lines.controlOk(id, body)))

    private fun body(text: String) = JsonRead.parse(text) as JsonObject

    private fun withLimits(limits: String) =
        """{"session":{"total_cost_usd":1.5},"rate_limits_available":true,"rate_limits":$limits}"""

    @Test
    fun `43 the answer reads as the session's cost and the five-hour window`() {
        val state = CaptureReplay.inputs("43-usage-and-rules").fold(HostState()) { host, input -> host.next(input) }
        val usage = state.ops().usage!!

        assertAll(
            { assertEquals(0.04959, usage.sessionCostUsd, 1e-9) },
            { assertTrue(usage.rateLimitsAvailable) },
            { assertEquals(listOf(UsageWindow("five_hour", 25, "2026-11-14T15:20:00.983604+00:00")), usage.windows) },
            { assertTrue(state.ops().usageWaiting.isEmpty()) },
        )
    }

    @Test
    fun `type only - no limits, or a window that is null, leaves the windows out and keeps the cost`() {
        val none = usageOf(body(withLimits("null")))!!
        val nullWindow =
            usageOf(
                body(withLimits("""{"five_hour":null,"seven_day":{"utilization":3,"resets_at":null}}""")),
            )!!
        val unavailable =
            usageOf(
                body(
                    """{"session":{"total_cost_usd":1.5},"rate_limits_available":false,""" +
                        """"rate_limits":{"five_hour":{"utilization":3,"resets_at":null}}}""",
                ),
            )!!

        assertAll(
            { assertEquals(UsageRecord(1.5, true, emptyList()), none) },
            { assertEquals(listOf(UsageWindow("seven_day", 3, null)), nullWindow.windows) },
            { assertEquals(1.5, unavailable.sessionCostUsd) },
            { assertFalse(unavailable.rateLimitsAvailable) },
            { assertEquals(emptyList<UsageWindow>(), unavailable.windows) },
        )
    }

    @Test
    fun `type only - a window with no share has none, and a share with a fraction is rounded`() {
        val read =
            usageOf(
                body(
                    withLimits(
                        """{"five_hour":{"utilization":null,"resets_at":"x"},""" +
                            """"seven_day_opus":{"utilization":10.6,"resets_at":null}}""",
                    ),
                ),
            )!!

        assertEquals(listOf(UsageWindow("five_hour", null, "x"), UsageWindow("seven_day_opus", 11, null)), read.windows)
    }

    @Test
    fun `type only - extra usage, limits, spend and names the plugin does not know are no windows`() {
        val read =
            usageOf(
                body(
                    withLimits(
                        """{"extra_usage":{"utilization":10.95975,"resets_at":null},""" +
                            """"tangelo":{"utilization":5,"resets_at":null},"limits":[{"percent":25}],""" +
                            """"spend":{"percent":11},"model_scoped":[{"utilization":0}],""" +
                            """"seven_day_oauth_apps":{"utilization":7,"resets_at":null},""" +
                            """"seven_day_sonnet":{"utilization":2,"resets_at":null},""" +
                            """"five_hour":{"utilization":1,"resets_at":null}}""",
                    ),
                ),
            )!!

        assertEquals(listOf(UsageWindow("five_hour", 1, null), UsageWindow("seven_day_sonnet", 2, null)), read.windows)
    }

    @Test
    fun `type only - an answer without the session's cost is not read, and the last one stays`() {
        val first = HostState().asked("u1").answered("u1", withLimits("null"))
        val odd = first.asked("u2").answered("u2", """{"rate_limits_available":true,"rate_limits":null}""")
        val failed = odd.asked("u3").next(PresenterInput.Event(Lines.controlError("u3", "boom")))

        assertAll(
            { assertNull(usageOf(body("""{"session":{}}"""))) },
            { assertNull(usageOf(body("""{"session":{"total_cost_usd":"1"}}"""))) },
            { assertSame(first.ops().usage, odd.ops().usage) },
            { assertTrue(odd.ops().usageWaiting.isEmpty()) },
            { assertSame(first.ops().usage, failed.ops().usage) },
            { assertTrue(failed.ops().usageWaiting.isEmpty()) },
        )
    }

    @Test
    fun `a usage request that could not be written is not waited for, and the composer says what waits`() {
        val asked = HostState().asked("u1")
        val unsent = asked.next(PresenterInput.ControlSendFailed("u1"))
        val composer = { state: HostState -> composerState(state.conversation, state.transcript) }

        assertAll(
            { assertEquals(listOf("u1"), asked.ops().usageWaiting) },
            { assertTrue(composer(asked).usageWaiting) },
            { assertTrue(unsent.ops().usageWaiting.isEmpty()) },
            { assertFalse(composer(unsent).usageWaiting) },
            { assertNull(composer(unsent).usage) },
            { assertTrue(unsent.ops().switches.isEmpty(), "a usage request is no switch") },
        )
    }

    @Test
    fun `usage requests wait in their own column, the newest kept`() {
        var state = HostState().next(PresenterInput.ControlRequested("c0", ControlKind.CONTEXT))
        for (n in 1..MAX_WAITING + 2) state = state.asked("u$n")

        assertAll(
            { assertEquals(listOf("c0"), state.ops().waiting) },
            { assertEquals((3..MAX_WAITING + 2).map { "u$it" }, state.ops().usageWaiting) },
            { assertSame(state.ops(), state.asked("u3").ops(), "the same id twice is one wait") },
        )
    }
}
