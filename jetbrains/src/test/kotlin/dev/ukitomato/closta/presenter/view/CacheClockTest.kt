package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * The prompt cache's clock: a turn's own `usage` says whether it read or wrote the cache and for how long (an hour
 * when it wrote the one-hour cache), and the host says when it saw that `result`. Capture 43 writes the hour cache;
 * capture 42's `/context` touches none; capture 41's `/clear` answers with a `result` that names no model, after which
 * there is no clock.
 */
class CacheClockTest {
    private fun HostState.ops() = transcript.operations

    private fun HostState.with(event: AgentEvent) = next(PresenterInput.Event(event))

    private fun HostState.seenAt(epochMs: Long) = next(PresenterInput.ResultSeenAt(epochMs))

    // A turn's own `usage`, with the session's `modelUsage` naming one model (its figures do not matter here).
    private fun turn(
        read: Long,
        hour: Long,
        fiveMinutes: Long,
    ) = Lines.result(
        null,
        modelUsage = """{"m":{"inputTokens":3,"cacheReadInputTokens":99,"cacheCreationInputTokens":99}}""",
        usage =
            """{"cache_read_input_tokens":$read,"cache_creation_input_tokens":${hour + fiveMinutes},""" +
                """"cache_creation":{"ephemeral_1h_input_tokens":$hour,"ephemeral_5m_input_tokens":$fiveMinutes}}""",
    )

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
    fun `42 a local command's result touches no cache and leaves the clock where the real turn put it`() {
        var state = HostState()
        var results = 0
        for (input in CaptureReplay.inputs("42-local-commands")) {
            state = state.next(input)
            if ((input as? PresenterInput.Event)?.event is AgentEvent.Result) state = state.seenAt(++results * 1_000L)
        }

        assertAll(
            { assertEquals(2, results) },
            { assertEquals(CacheRecord(1_000, 3_600_000), state.ops().cache) },
        )
    }

    @Test
    fun `type only - a turn with no cache tokens leaves no clock where there was none`() {
        val none = HostState().with(turn(0, 0, 0)).seenAt(1_000)

        assertNull(none.ops().cache)
    }

    @Test
    fun `type only - a turn that wrote only the five-minute cache makes it five minutes`() {
        val hour = HostState().with(turn(0, 20, 0)).seenAt(1_000)
        val fiveMinutes = hour.with(turn(10, 0, 20)).seenAt(2_000)

        assertEquals(CacheRecord(2_000, 300_000), fiveMinutes.ops().cache)
    }

    @Test
    fun `type only - a turn that only read the cache restarts the clock and keeps its time`() {
        val hour = HostState().with(turn(0, 20, 0)).seenAt(1_000)
        val read = hour.with(turn(10, 0, 0)).seenAt(2_000)
        val readFirst = HostState().with(turn(10, 0, 0)).seenAt(2_000)

        assertAll(
            { assertEquals(CacheRecord(2_000, 3_600_000), read.ops().cache) },
            { assertEquals(CacheRecord(2_000, 300_000), readFirst.ops().cache, "five minutes when none is known") },
        )
    }

    @Test
    fun `a result that names no model ends the clock but keeps the tokens`() {
        val warm = HostState().with(turn(10, 20, 0)).seenAt(1_000)
        val bare = warm.with(Lines.result(null))

        assertAll(
            { assertEquals(CacheRecord(1_000, 3_600_000), warm.ops().cache) },
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
