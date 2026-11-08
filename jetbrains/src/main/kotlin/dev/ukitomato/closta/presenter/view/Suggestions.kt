package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText

// Reading the `permission_suggestions` of a control request (the CLI's content, so a wrong type reads as absent).

/**
 * The `permission_suggestions` of a request, each with the id of its place in the list. An entry that is not an
 * object, or has no `type`, is left out and the others keep their places.
 */
internal fun suggestionsOf(request: JsonObject?): List<SuggestionRecord> =
    request
        ?.array("permission_suggestions")
        ?.items
        .orEmpty()
        .mapIndexedNotNull { index, item ->
            val fields = item as? JsonObject
            fields?.string("type")?.let { type ->
                SuggestionRecord(
                    suggestionId(index),
                    type,
                    detailOf(type, fields),
                    fields.string("destination"),
                    JsonText.compact(fields),
                )
            }
        }

/** The id of the suggestion at [position] (from 0) in a request's list. */
internal fun suggestionId(position: Int): String = "s${position + 1}"

private fun detailOf(
    type: String,
    suggestion: JsonObject,
): String =
    when (type) {
        "setMode" -> suggestion.string("mode").orEmpty()
        "addRules", "replaceRules", "removeRules" ->
            suggestion
                .array("rules")
                ?.items
                .orEmpty()
                .filterIsInstance<JsonObject>()
                .joinToString("\n") { rule ->
                    val tool = rule.string("toolName").orEmpty()
                    rule.string("ruleContent")?.let { "$tool($it)" } ?: tool
                }
        "addDirectories", "removeDirectories" ->
            suggestion
                .array("directories")
                ?.items
                .orEmpty()
                .filterIsInstance<JsonString>()
                .joinToString("\n") { it.value }
        else -> ""
    }
