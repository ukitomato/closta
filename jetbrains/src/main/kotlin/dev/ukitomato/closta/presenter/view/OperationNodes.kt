package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString

// How the tree spells what the operations console shows: the models, the switches, the context and the
// compactions.

/** The models the CLI offers, in its order. */
internal fun modelsNode(models: List<ModelRecord>): JsonArray =
    JsonArray(
        models.map { model ->
            val node =
                JsonObject
                    .Builder()
                    .put("value", JsonString(model.value))
                    .put("displayName", JsonString(model.displayName))
                    .put("description", JsonString(model.description))
            model.resolvedModel?.let { node.put("resolvedModel", JsonString(it)) }
            model.supportsEffort?.let { node.put("supportsEffort", JsonBool.of(it)) }
            model.supportedEffortLevels?.let { levels ->
                node.put("supportedEffortLevels", JsonArray(levels.map(::JsonString)))
            }
            node.build()
        },
    )

/** The switches, the newest first (the records keep the order they came in). */
internal fun switchesNode(switches: List<SwitchRecord>): JsonArray =
    JsonArray(
        switches.asReversed().map { record ->
            val node =
                JsonObject
                    .Builder()
                    .put("seq", JsonNumber.of(record.seq.toLong()))
                    .put("kind", JsonString(record.kind.wire))
                    .put("value", JsonString(record.value))
                    .put("outcome", JsonString(record.outcome.wire))
            record.detail?.let { node.put("detail", JsonString(it)) }
            node.build()
        },
    )

/** The last context usage the CLI answered. */
internal fun contextNode(context: ContextRecord): JsonObject {
    val node =
        JsonObject
            .Builder()
            .put("totalTokens", JsonNumber.of(context.totalTokens))
            .put("maxTokens", JsonNumber.of(context.maxTokens))
            .put("percentage", JsonNumber(percentText(context.percentage)))
    context.autoCompactThreshold?.let { node.put("autoCompactThreshold", JsonNumber.of(it)) }
    return node.build()
}

// A whole percentage prints as the integer the CLI sent; the double's own text would add ".0".
private fun percentText(percentage: Double): String =
    if (percentage == Math.floor(percentage) &&
        percentage < MAX_EXACT
    ) {
        percentage.toLong().toString()
    } else {
        percentage.toString()
    }

private const val MAX_EXACT = 1e15

/** The compactions, the newest first. */
internal fun compactionsNode(compactions: List<CompactionRecord>): JsonArray =
    JsonArray(
        compactions.asReversed().map { record ->
            JsonObject.of(
                "seq" to JsonNumber.of(record.seq.toLong()),
                "trigger" to JsonString(record.trigger),
                "preTokens" to JsonNumber.of(record.preTokens),
                "postTokens" to JsonNumber.of(record.postTokens),
            )
        },
    )
