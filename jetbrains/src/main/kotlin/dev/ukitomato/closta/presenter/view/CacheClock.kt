package dev.ukitomato.closta.presenter.view

/** Whether the prompt cache likely still holds: warm for [Warm.remainingMs] more, or expired. */
sealed interface CacheClock {
    data class Warm(
        val remainingMs: Long,
    ) : CacheClock

    /** The cache likely went; the next message writes about [tokens] again (null when the context is not known). */
    data class Expired(
        val tokens: Long?,
    ) : CacheClock
}

/** The cache at [nowMs]; null with no cache, or while a turn runs (the turn keeps it warm). */
fun cacheClock(
    record: CacheRecord?,
    contextTokens: Long?,
    running: Boolean,
    nowMs: Long,
): CacheClock? {
    if (record == null || running) return null
    val elapsed = nowMs - record.lastAtMs
    return if (elapsed < record.ttlMs) CacheClock.Warm(record.ttlMs - elapsed) else CacheClock.Expired(contextTokens)
}

/** The whole minutes left of [remainingMs], rounded up: a cache with 30 seconds left has one minute. */
fun minutesLeft(remainingMs: Long): Long = (remainingMs + MS_PER_MINUTE - 1) / MS_PER_MINUTE

/** How long until [minutesLeft] of [remainingMs] goes down by one. */
fun untilNextMinute(remainingMs: Long): Long = (remainingMs - 1).mod(MS_PER_MINUTE) + 1

const val MS_PER_MINUTE = 60_000L
