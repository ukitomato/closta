package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue

/**
 * The part of [TreeContract] that checks what a thread says for the composer: the slash commands, the last file
 * search and the last selection answer, as `isSlashCommand`, `isFileSearch` and `isSelectionAnswer` in
 * the webview's TypeScript check them. Its own object so that [TreeContract], a copy that keeps the TypeScript's
 * shape, stays within what detekt lets a class be.
 */
internal object ComposerContract {
    val commandKeys = setOf("name", "description", "argumentHint")
    val fileSearchKeys = setOf("commandId", "match", "paths", "truncated", "failure")
    val selectionKeys = setOf("commandId", "path", "startLine", "endLine", "none", "failure")
    val appliedKeys = setOf("commandId", "path", "startLine", "endLine", "undoable", "failure")

    fun isSlashCommands(value: JsonValue?): Boolean =
        value is JsonArray &&
            value.items.all { item ->
                item is JsonObject &&
                    nonEmpty(item["name"]) &&
                    item["description"] is JsonString &&
                    (!item.containsKey("argumentHint") || item["argumentHint"] is JsonString)
            }

    fun isFileSearch(value: JsonValue?): Boolean =
        value is JsonObject &&
            nonEmpty(value["commandId"]) &&
            value["match"] is JsonString &&
            (value["paths"] as? JsonArray)?.items?.all { it is JsonString } == true &&
            value["truncated"] is JsonBool &&
            (!value.containsKey("failure") || value["failure"] is JsonString)

    // A place, none or a failure: exactly one of the three.
    fun isSelectionAnswer(value: JsonValue?): Boolean {
        if (value !is JsonObject || !nonEmpty(value["commandId"])) return false
        val place = listOf("path", "startLine", "endLine").any(value::containsKey)
        val kinds = listOf(place, value.containsKey("none"), value.containsKey("failure")).count { it }
        return kinds == 1 &&
            when {
                place -> nonEmpty(value["path"]) && isLine(value["startLine"]) && isLine(value["endLine"])
                value.containsKey("none") -> value["none"] == JsonBool.TRUE
                else -> value["failure"] is JsonString
            }
    }

    // The lines written or a failure: exactly one of the two.
    fun isApplyAnswer(value: JsonValue?): Boolean {
        if (value !is JsonObject || !nonEmpty(value["commandId"])) return false
        val written = listOf("path", "startLine", "endLine", "undoable").any(value::containsKey)
        return written != value.containsKey("failure") &&
            if (written) {
                nonEmpty(value["path"]) &&
                    isLine(value["startLine"]) &&
                    isLine(value["endLine"]) &&
                    value["undoable"] is JsonBool
            } else {
                value["failure"] is JsonString
            }
    }

    /** The first key of the thread's slash commands, file search or selection that the protocol does not name. */
    fun strictFault(
        thread: JsonObject,
        at: String,
    ): TreeContract.Issue? =
        (thread["commands"] as? JsonArray)?.items?.withIndex()?.firstNotNullOfOrNull { (index, item) ->
            (item as? JsonObject)?.let { extra(it, commandKeys, "$at.commands[$index]") }
        }
            ?: (thread["fileSearch"] as? JsonObject)?.let { extra(it, fileSearchKeys, "$at.fileSearch") }
            ?: (thread["selection"] as? JsonObject)?.let { extra(it, selectionKeys, "$at.selection") }
            ?: (thread["applied"] as? JsonObject)?.let { extra(it, appliedKeys, "$at.applied") }

    private fun extra(
        node: JsonObject,
        allowed: Set<String>,
        at: String,
    ): TreeContract.Issue? =
        node.keys.firstOrNull { it !in allowed }?.let { TreeContract.Issue("unknown-key", "$at.$it") }

    private fun isLine(value: JsonValue?): Boolean =
        value is JsonNumber && TreeContract.isSafeCount(value) && TreeContract.number(value) >= 1.0

    private fun nonEmpty(value: JsonValue?): Boolean = value is JsonString && value.value.isNotEmpty()
}
