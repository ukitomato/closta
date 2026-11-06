package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue

/**
 * The part of [TreeContract] that checks what a thread says of the history of sessions: the saved sessions,
 * whether
 * the last listing could not be read, and what was put back of the earlier conversation, as `isSavedSession` and the
 * thread's own checks in the webview's TypeScript check them. Its own object, as [OperationsContract] is, so that
 * [TreeContract] stays within what detekt lets a class be.
 */
internal object HistoryContract {
    private val savedKeys = setOf("id", "title", "updatedAt", "current")

    /** The first of the thread's history fields that the webview's tree checks refuse, as the field's place. */
    fun fault(
        thread: JsonObject,
        at: String,
    ): String? =
        field(thread, "savedSessions", at) { it is JsonArray && it.items.all(::isSavedSession) }
            ?: field(thread, "savedSessionsUnreadable", at) { it is JsonBool }
            ?: field(thread, "restoredUntil", at) { it is JsonString && it.value.isNotEmpty() }
            ?: field(thread, "restoredCount", at, TreeContract::isSafeCount)
            ?: field(thread, "restoredPartly", at) { it is JsonBool }

    private fun field(
        thread: JsonObject,
        key: String,
        at: String,
        valid: (JsonValue?) -> Boolean,
    ): String? = if (thread.containsKey(key) && !valid(thread[key])) "$at.$key" else null

    private fun isSavedSession(value: JsonValue?): Boolean =
        value is JsonObject &&
            (value["id"] as? JsonString)?.value?.isNotEmpty() == true &&
            value["title"] is JsonString &&
            TreeContract.isSafeCount(value["updatedAt"]) &&
            value["current"] is JsonBool

    /** The first key of a saved session that the protocol's table does not name. */
    fun strictFault(
        thread: JsonObject,
        at: String,
    ): TreeContract.Issue? =
        (thread["savedSessions"] as? JsonArray)?.items?.withIndex()?.firstNotNullOfOrNull { (index, item) ->
            (item as? JsonObject)?.keys?.firstOrNull { it !in savedKeys }?.let {
                TreeContract.Issue("unknown-key", "$at.savedSessions[$index].$it")
            }
        }
}
