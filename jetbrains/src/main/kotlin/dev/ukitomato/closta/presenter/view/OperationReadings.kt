package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue

// What the operations console reads out of the CLI's lines: a compaction, whether the CLI is compacting, the
// tokens of a result, and the models of the `initialize` response. The records they fill are in OperationRecords.kt.

/** [operations] in place of the transcript's own; the same transcript when they are the same. */
internal fun Transcript.withOperations(operations: OperationRecords): Transcript =
    if (operations == this.operations) this else copy(operations = operations)

/** The compaction `system/compact_boundary` reports; a boundary that does not say how many tokens changes nothing. */
internal fun OperationRecords.compacted(event: AgentEvent.SystemCompactBoundary): OperationRecords {
    val metadata = JsonRead.parse(event.compactMetadata.text) as? JsonObject
    val before = metadata?.count("pre_tokens")
    val after = metadata?.count("post_tokens")
    if (before == null || after == null) return this
    val record = CompactionRecord(seq + 1, metadata.string("trigger") ?: UNKNOWN_TRIGGER, before, after)
    return copy(seq = record.seq, compactions = (compactions + record).takeLast(MAX_COMPACTIONS))
}

internal const val UNKNOWN_TRIGGER = "unknown"

/**
 * Whether the CLI says it is compacting: from `system/status`, whose status is `compacting` only while it does. A
 * status that only reports the permission mode (no status, a mode: what a mode switch is answered with, capture 07)
 * says nothing of compacting, so a switch made meanwhile does not end it early.
 */
internal fun OperationRecords.statusSaid(event: AgentEvent.SystemStatus): OperationRecords {
    if (event.status == null && event.permissionMode != null) return this
    return (event.status == COMPACTING).let { if (it == compacting) this else copy(compacting = it) }
}

private const val COMPACTING = "compacting"

/** The retry `system/api_retry` reports, shown until the reply goes on. */
internal fun OperationRecords.retried(event: AgentEvent.SystemApiRetry): OperationRecords =
    copy(retry = RetryRecord(event.attempt, event.maxRetries, event.retryDelayMs, event.errorStatus))

/** The retry is over: a frame or a `result` means the request went through or the turn ended. */
internal fun OperationRecords.retryEnded(): OperationRecords = if (retry == null) this else copy(retry = null)

/**
 * The tokens of a `result`: `modelUsage` is the session's total so far for each model, so the figures are summed over
 * the models and replace the last ones, never added to them. A `result` that names no model says nothing of the total,
 * and leaves no cache to count (the `result` of `/clear` names none). The rest is the cache, read from [cacheTurn].
 */
internal fun OperationRecords.resulted(event: AgentEvent.Result): OperationRecords {
    val usage = (JsonRead.parse(event.modelUsage.text) as? JsonObject)?.entries?.map { it.value }.orEmpty()
    val models = usage.filterIsInstance<JsonObject>()
    if (models.isEmpty()) {
        return if (cacheTtlMs == null && !cacheTouched) this else copy(cacheTtlMs = null, cacheTouched = false)
    }
    val totals =
        TokenTotals(
            input = models.sumOf { it.count("inputTokens") ?: 0L },
            output = models.sumOf { it.count("outputTokens") ?: 0L },
            cacheRead = models.sumOf { it.count("cacheReadInputTokens") ?: 0L },
            cacheCreation = models.sumOf { it.count("cacheCreationInputTokens") ?: 0L },
        )
    val next = if (totals == tokens) this else copy(tokens = totals)
    return next.cacheTurn(JsonRead.parse(event.usage.text) as? JsonObject)
}

/**
 * The cache in the turn's own `usage` (`modelUsage` is the session's running total, so it cannot say what this turn
 * did). A turn that neither read nor wrote it (a local command, a compaction, a refusal before any request) leaves
 * the clock as it was. One that wrote to the one-hour cache makes it an hour, one that wrote only the five-minute cache
 * five minutes, and one that only read it keeps the time it had (five minutes when none is known).
 */
private fun OperationRecords.cacheTurn(usage: JsonObject?): OperationRecords {
    val read = usage?.count("cache_read_input_tokens") ?: 0L
    val created = usage?.count("cache_creation_input_tokens") ?: 0L
    if (read + created == 0L) return if (cacheTouched) copy(cacheTouched = false) else this
    val split = usage?.get("cache_creation") as? JsonObject
    val ttl =
        when {
            (split?.count("ephemeral_1h_input_tokens") ?: 0L) > 0L -> HOUR_CACHE_MS
            created > 0L -> FIVE_MINUTE_CACHE_MS
            else -> cacheTtlMs ?: FIVE_MINUTE_CACHE_MS
        }
    return if (cacheTouched && ttl == cacheTtlMs) this else copy(cacheTtlMs = ttl, cacheTouched = true)
}

private const val HOUR_CACHE_MS = 3_600_000L
private const val FIVE_MINUTE_CACHE_MS = 300_000L

/**
 * The signals that come with a turn's frames, each to its own fold: `system/api_retry` starts a retry, and a stream
 * frame goes on with the reply and so ends it; `system/thinking_tokens` gives the estimate of the thinking that
 * streams; a `rate_limit_event` says how near the plan's limit the session is.
 */
internal fun foldTurnSignals(
    transcript: Transcript,
    event: AgentEvent,
): Transcript =
    when (event) {
        is AgentEvent.SystemApiRetry -> transcript.withOperations(transcript.operations.retried(event))
        is AgentEvent.SystemThinkingTokens -> foldThinkingTokens(transcript, event)
        is AgentEvent.RateLimitEvent -> transcript.withOperations(transcript.operations.rateLimited(event))
        is AgentEvent.StreamEvent -> foldStream(transcript, event).let { it.withOperations(it.operations.retryEnded()) }
        else -> transcript
    }

/** The models of an `initialize` response (`response.response.models`), or null when it has none. */
internal fun modelsOfResponse(response: JsonValue?): List<ModelRecord>? {
    val models = (response as? JsonObject)?.obj("response")?.array("models")?.items ?: return null
    return models.mapNotNull { item ->
        val fields = item as? JsonObject
        val value = fields?.string("value")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
        ModelRecord(
            value = value,
            resolvedModel = fields.string("resolvedModel")?.takeIf { it.isNotEmpty() },
            displayName = fields.string("displayName")?.takeIf { it.isNotEmpty() } ?: value,
            description = fields.string("description").orEmpty(),
            supportsEffort = (fields["supportsEffort"] as? JsonBool)?.value,
            supportedEffortLevels =
                fields.array("supportedEffortLevels")?.items?.mapNotNull {
                    (it as? JsonString)?.value?.takeIf(String::isNotEmpty)
                },
        )
    }
}
