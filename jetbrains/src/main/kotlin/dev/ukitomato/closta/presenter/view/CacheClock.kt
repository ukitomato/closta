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

/**
 * The `result` seen at [epochMs]: one that read or wrote the cache starts its clock again from then, one that did not
 * leaves it as it was, and one that named no model (`/clear`'s) stops it.
 */
internal fun OperationRecords.cacheSeenAt(epochMs: Long): OperationRecords {
    val ttl = cacheTtlMs
    val next =
        when {
            ttl == null -> null
            cacheTouched -> CacheRecord(epochMs, ttl)
            else -> cache
        }
    return if (next == cache) this else copy(cache = next)
}
