package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue

/**
 * The part of [TreeContract] that checks what a thread says for the operations console: the models, the
 * switches, the context usage, the compactions, whether it is compacting and the effort, as `isModelOption`,
 * `isSwitchRecord`, `isContextUsage` and `isCompaction` in the webview's TypeScript check them. Its own object, as
 * [ComposerContract] is, so that [TreeContract], a copy that keeps the TypeScript's shape, stays within what detekt
 * lets a class be.
 */
internal object OperationsContract {
    val tokenKeys = setOf("inputTokens", "outputTokens", "cacheReadInputTokens", "cacheCreationInputTokens")
    private val modelKeys =
        setOf("value", "resolvedModel", "displayName", "description", "supportsEffort", "supportedEffortLevels")
    private val switchKeys = setOf("seq", "kind", "value", "outcome", "detail")
    private val contextKeys = setOf("totalTokens", "maxTokens", "percentage", "autoCompactThreshold")
    private val compactionKeys = setOf("seq", "trigger", "preTokens", "postTokens")
    private val rewindKeys =
        setOf(
            "commandId",
            "messageId",
            "dryRun",
            "outcome",
            "files",
            "filesTotal",
            "insertions",
            "deletions",
            "detail",
        )
    private val rewindOutcomes = setOf("pending", "done", "refused", "failed")
    private val switchKinds =
        setOf("model", "mode", "effort", "resume", "attachment", "mcp-enable", "mcp-disable", "mcp-reconnect")
    private val switchOutcomes = setOf("pending", "applied", "rejected", "failed")

    /** The first of the thread's operations fields that the webview's tree checks refuse, as the field's place. */
    fun fault(
        thread: JsonObject,
        at: String,
    ): String? =
        field(thread, "rewind", at, ::isRewindAnswer)
            ?: field(thread, "models", at) { list(it, ::isModelOption) }
            ?: field(thread, "switches", at) { list(it, ::isSwitchRecord) }
            ?: field(thread, "context", at, ::isContextUsage)
            ?: field(thread, "compactions", at) { list(it, ::isCompaction) }
            ?: field(thread, "compacting", at) { it is JsonBool }
            ?: field(thread, "effort", at) { it is JsonString && it.value.isNotEmpty() }
            ?: field(thread, "startPermissionMode", at) { it is JsonString && it.value.isNotEmpty() }
            ?: field(thread, "appliedModel", at) { it is JsonString && it.value.isNotEmpty() }

    private fun field(
        thread: JsonObject,
        key: String,
        at: String,
        valid: (JsonValue?) -> Boolean,
    ): String? = if (thread.containsKey(key) && !valid(thread[key])) "$at.$key" else null

    private fun list(
        value: JsonValue?,
        item: (JsonValue?) -> Boolean,
    ): Boolean = value is JsonArray && value.items.all(item)

    private fun isModelOption(value: JsonValue?): Boolean =
        value is JsonObject &&
            nonEmpty(value["value"]) &&
            value["displayName"] is JsonString &&
            value["description"] is JsonString &&
            (!value.containsKey("resolvedModel") || value["resolvedModel"] is JsonString) &&
            (!value.containsKey("supportsEffort") || value["supportsEffort"] is JsonBool) &&
            (!value.containsKey("supportedEffortLevels") || list(value["supportedEffortLevels"]) { it is JsonString })

    private fun isSwitchRecord(value: JsonValue?): Boolean =
        value is JsonObject &&
            isPositive(value["seq"]) &&
            (value["kind"] as? JsonString)?.value in switchKinds &&
            value["value"] is JsonString &&
            (value["outcome"] as? JsonString)?.value in switchOutcomes &&
            (!value.containsKey("detail") || value["detail"] is JsonString)

    private fun isContextUsage(value: JsonValue?): Boolean =
        value is JsonObject &&
            TreeContract.isSafeCount(value["totalTokens"]) &&
            TreeContract.isSafeCount(value["maxTokens"]) &&
            value["percentage"].let {
                it is JsonNumber &&
                    TreeContract.number(it).let { n ->
                        n.isFinite() && n >= 0
                    }
            } &&
            (!value.containsKey("autoCompactThreshold") || TreeContract.isSafeCount(value["autoCompactThreshold"]))

    // The answer to the last rewind-files: `isRewindAnswer` in the original.
    private fun isRewindAnswer(value: JsonValue?): Boolean =
        value is JsonObject &&
            nonEmpty(value["commandId"]) &&
            nonEmpty(value["messageId"]) &&
            value["dryRun"] is JsonBool &&
            (value["outcome"] as? JsonString)?.value in rewindOutcomes &&
            list(value["files"]) { it is JsonString } &&
            TreeContract.isSafeCount(value["filesTotal"]) &&
            TreeContract.isSafeCount(value["insertions"]) &&
            TreeContract.isSafeCount(value["deletions"]) &&
            (!value.containsKey("detail") || value["detail"] is JsonString)

    private fun isCompaction(value: JsonValue?): Boolean =
        value is JsonObject &&
            isPositive(value["seq"]) &&
            value["trigger"] is JsonString &&
            TreeContract.isSafeCount(value["preTokens"]) &&
            TreeContract.isSafeCount(value["postTokens"])

    /** The first key of the thread's models, switches, context or compactions that the protocol does not name. */
    fun strictFault(
        thread: JsonObject,
        at: String,
    ): TreeContract.Issue? =
        (thread["rewind"] as? JsonObject)?.let { extra(it, rewindKeys, "$at.rewind") }
            ?: items(thread, "models", modelKeys, at)
            ?: items(thread, "switches", switchKeys, at)
            ?: (thread["context"] as? JsonObject)?.let { extra(it, contextKeys, "$at.context") }
            ?: items(thread, "compactions", compactionKeys, at)

    private fun items(
        thread: JsonObject,
        key: String,
        allowed: Set<String>,
        at: String,
    ): TreeContract.Issue? =
        (thread[key] as? JsonArray)?.items?.withIndex()?.firstNotNullOfOrNull { (index, item) ->
            (item as? JsonObject)?.let { extra(it, allowed, "$at.$key[$index]") }
        }

    private fun extra(
        node: JsonObject,
        allowed: Set<String>,
        at: String,
    ): TreeContract.Issue? =
        node.keys.firstOrNull { it !in allowed }?.let { TreeContract.Issue("unknown-key", "$at.$it") }

    private fun isPositive(value: JsonValue?): Boolean =
        TreeContract.isSafeCount(value) && TreeContract.number(value) >= 1.0

    private fun nonEmpty(value: JsonValue?): Boolean = value is JsonString && value.value.isNotEmpty()
}
