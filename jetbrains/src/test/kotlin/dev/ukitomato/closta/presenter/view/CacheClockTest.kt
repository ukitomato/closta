package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * The prompt cache's clock: a `result` says how long the cache it wrote lives (an hour when any model wrote to the
 * one-hour cache, else five minutes), and the host says when it saw that `result`. Capture 43 writes the hour cache;
 * capture 41's `/clear` answers with a `result` that names no model, after which there is no clock.
 */
class CacheClockTest {
    private fun HostState.ops() = transcript.operations

    private fun HostState.with(event: AgentEvent) = next(PresenterInput.Event(event))

    private fun HostState.seenAt(epochMs: Long) = next(PresenterInput.ResultSeenAt(epochMs))

    private fun usage(
        read: Long,
        created: Long,
        hour: Long,
    ) = """{"m":{"inputTokens":3,"outputTokens":4,"cacheReadInputTokens":$read,"cacheCreationInputTokens":$created,""" +
        """"cacheCreationEphemeral5mInputTokens":${created - hour},"cacheCreationEphemeral1hInputTokens":$hour}}"""

    private val after43 =
        CaptureReplay.inputs("43-usage-and-rules").fold(HostState()) { host, input -> host.next(input) }

    @Test
    fun `43 the hour cache is kept from the time the result was seen`() {
        val state = after43.seenAt(1_000)

        assertEquals(CacheRecord(1_000, 3_600_000), state.ops().cache)
    }

    @Test
    fun `43 the clock is warm until the hour is over, then expired with the context's tokens`() {
        val state = after43.seenAt(1_000)
        val record = state.ops().cache
        val tokens = state.ops().context?.totalTokens

        assertAll(
            { assertEquals(21_820L, tokens) },
            { assertEquals(CacheClock.Warm(1_000), cacheClock(record, tokens, false, 1_000 + 3_599_000)) },
            { assertEquals(CacheClock.Expired(21_820), cacheClock(record, tokens, false, 1_000 + 3_600_000)) },
            { assertNull(cacheClock(record, tokens, true, 1_000 + 3_599_000), "no clock while a turn runs") },
            { assertNull(cacheClock(null, tokens, false, 1_000)) },
        )
    }

    @Test
    fun `the composer passes the cache on`() {
        val state = after43.seenAt(1_000)

        assertEquals(CacheRecord(1_000, 3_600_000), composerState(state.conversation, state.transcript).cache)
    }

    @Test
    fun `a result with no cache tokens leaves no clock, and one of five minutes only lives five minutes`() {
        val none = HostState().with(Lines.result(null, modelUsage = usage(0, 0, 0))).seenAt(1_000)
        val fiveMinutes = HostState().with(Lines.result(null, modelUsage = usage(10, 20, 0))).seenAt(1_000)

        assertAll(
            { assertNull(none.ops().cache) },
            { assertEquals(300_000L, fiveMinutes.ops().cacheTtlMs) },
            { assertEquals(CacheRecord(1_000, 300_000), fiveMinutes.ops().cache) },
        )
    }

    @Test
    fun `a result that names no model ends the clock but keeps the tokens`() {
        val warm = HostState().with(Lines.result(null, modelUsage = usage(10, 20, 20))).seenAt(1_000)
        val bare = warm.with(Lines.result(null))

        assertAll(
            { assertEquals(3_600_000L, warm.ops().cacheTtlMs) },
            { assertNull(bare.ops().cacheTtlMs) },
            { assertNotNull(bare.ops().tokens) },
            { assertNull(bare.seenAt(2_000).ops().cache) },
        )
    }

    @Test
    fun `41 after the clear's result there is no clock, and the next turn's result brings it back`() {
        var state = HostState()
        val caches = ArrayList<Pair<AgentEvent.Result, CacheRecord?>>()
        var seen = 0L
        for (input in CaptureReplay.inputs("41-clear-reset", uuids = true)) {
            state = state.next(input)
            val result = (input as? PresenterInput.Event)?.event as? AgentEvent.Result ?: continue
            seen += 1_000
            state = state.seenAt(seen)
            caches += result to state.ops().cache
        }
        val clear =
            caches.single {
                it.first.modelUsage.text
                    .replace(" ", "") == "{}"
            }

        assertAll(
            { assertEquals(3, caches.size) },
            { assertEquals(caches[1], clear, "the clear's result is the second") },
            { assertEquals(CacheRecord(1_000, 3_600_000), caches[0].second) },
            { assertNull(clear.second) },
            { assertEquals(CacheRecord(3_000, 3_600_000), caches[2].second) },
        )
    }
}
