package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString

// Reading the CLI's content: a member of the wrong type reads as absent, so an odd line changes nothing.

internal fun JsonObject.string(key: String): String? = (this[key] as? JsonString)?.value

internal fun JsonObject.obj(key: String): JsonObject? = this[key] as? JsonObject

internal fun JsonObject.array(key: String): JsonArray? = this[key] as? JsonArray

/** A small non-negative integer member, such as a block index; anything else reads as absent. */
internal fun JsonObject.index(key: String): Int? = (this[key] as? JsonNumber)?.text?.toIntOrNull()?.takeIf { it >= 0 }
