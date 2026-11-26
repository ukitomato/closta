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

/** The `result` seen at [epochMs] starts the clock of the cache it had; one with none stops it. */
internal fun OperationRecords.cacheSeenAt(epochMs: Long): OperationRecords {
    val next = cacheTtlMs?.let { CacheRecord(epochMs, it) }
    return if (next == cache) this else copy(cache = next)
}
