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

private const val UNKNOWN_TRIGGER = "unknown"

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

/**
 * The tokens of a `result`: `modelUsage` is the session's total so far for each model, so the figures are summed over
 * the models and replace the last ones, never added to them. A `result` that names no model says nothing of the total.
 */
internal fun OperationRecords.resulted(event: AgentEvent.Result): OperationRecords {
    val usage = (JsonRead.parse(event.modelUsage.text) as? JsonObject)?.entries?.map { it.value }.orEmpty()
    val models = usage.filterIsInstance<JsonObject>()
    if (models.isEmpty()) return this
    val totals =
        TokenTotals(
            input = models.sumOf { it.count("inputTokens") ?: 0L },
            output = models.sumOf { it.count("outputTokens") ?: 0L },
            cacheRead = models.sumOf { it.count("cacheReadInputTokens") ?: 0L },
            cacheCreation = models.sumOf { it.count("cacheCreationInputTokens") ?: 0L },
        )
    return if (totals == tokens) this else copy(tokens = totals)
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
