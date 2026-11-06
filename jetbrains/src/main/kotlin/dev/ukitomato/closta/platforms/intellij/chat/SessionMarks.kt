package dev.ukitomato.closta.platforms.intellij.chat

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.JsonPrimitive

/**
 * Session ids kept in one value of the application's settings (the archived ones, the ones that ran when their project
 * closed): a JSON array of strings. A value that is not one reads as no ids. Free of `com.intellij`.
 */
object SessionMarks {
    fun encode(ids: Set<String>): String = JsonArray().apply { ids.sorted().forEach { add(it) } }.toString()

    fun decode(text: String?): Set<String> =
        arrayOf(text)
            ?.mapNotNull { (it as? JsonPrimitive)?.takeIf(JsonPrimitive::isString)?.asString }
            ?.filter { it.isNotBlank() }
            ?.toSet()
            .orEmpty()

    private fun arrayOf(text: String?): JsonArray? =
        if (text.isNullOrBlank()) {
            null
        } else {
            try {
                JsonParser.parseString(text) as? JsonArray
            } catch (
                @Suppress("TooGenericExceptionCaught") _: RuntimeException,
            ) {
                null
            }
        }
}

/** What a was-running mark keeps besides the id: where the session ran (null: the project's folder), its title. */
data class WasRunningMark(
    val workingDirectory: String? = null,
    val title: String? = null,
)

/**
 * The marks of the sessions that ran when their project closed (or a worktree session stopped from the screen), in one
 * value of the application's settings: a JSON array whose item is the id (a session of the project's folder with no
 * title: the old form, still read) or an object `{"id", "dir", "title"}`. Free of `com.intellij`.
 */
object WasRunningMarks {
    fun encode(marks: Map<String, WasRunningMark>): String =
        JsonArray()
            .apply {
                marks.toSortedMap().forEach { (id, mark) ->
                    if (mark == WasRunningMark()) {
                        add(id)
                    } else {
                        add(
                            JsonObject().apply {
                                addProperty("id", id)
                                mark.workingDirectory?.let { addProperty("dir", it) }
                                mark.title?.let { addProperty("title", it) }
                            },
                        )
                    }
                }
            }.toString()

    fun decode(text: String?): Map<String, WasRunningMark> {
        val items =
            try {
                if (text.isNullOrBlank()) null else JsonParser.parseString(text) as? JsonArray
            } catch (
                @Suppress("TooGenericExceptionCaught") _: RuntimeException,
            ) {
                null
            }
        return items
            ?.mapNotNull(::markOf)
            ?.toMap()
            .orEmpty()
    }

    private fun markOf(item: JsonElement): Pair<String, WasRunningMark>? {
        val fields = item as? JsonObject
        val id = if (fields == null) (item as? JsonPrimitive)?.takeIf { it.isString }?.asString else fields.text("id")
        return id?.takeIf { it.isNotBlank() }?.let { it to WasRunningMark(fields?.text("dir"), fields?.text("title")) }
    }

    private fun JsonObject.text(key: String): String? = (get(key) as? JsonPrimitive)?.takeIf { it.isString }?.asString
}
