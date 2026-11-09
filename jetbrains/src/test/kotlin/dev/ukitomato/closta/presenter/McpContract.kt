package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue

/**
 * The part of [TreeContract] that checks what a thread says of its MCP servers: the list and whether the last
 * ask could not be read, as `isMcpServer` and the thread's own checks in the webview's TypeScript check them. Its
 * own object, as [HistoryContract] is, so that [TreeContract] stays within what detekt lets a class be.
 */
internal object McpContract {
    private val serverKeys = setOf("name", "status", "source", "builtIn", "tools", "error")
    private val statuses = setOf("connected", "failed", "needs-auth", "pending", "disabled", "unknown")

    /** The first of the thread's MCP fields that the webview's tree checks refuse, as the field's place. */
    fun fault(
        thread: JsonObject,
        at: String,
    ): String? =
        field(thread, "mcpServers", at) { it is JsonArray && it.items.all(::isServer) }
            ?: field(thread, "mcpServersUnreadable", at) { it is JsonBool }

    private fun field(
        thread: JsonObject,
        key: String,
        at: String,
        valid: (JsonValue?) -> Boolean,
    ): String? = if (thread.containsKey(key) && !valid(thread[key])) "$at.$key" else null

    private fun isServer(value: JsonValue?): Boolean =
        value is JsonObject &&
            (value["name"] as? JsonString)?.value?.isNotEmpty() == true &&
            (value["status"] as? JsonString)?.value in statuses &&
            value["source"] is JsonString &&
            value["builtIn"] is JsonBool &&
            (value["tools"] as? JsonArray)?.items?.all { it is JsonString } == true &&
            (!value.containsKey("error") || value["error"] is JsonString)

    /** The first key of a server that the protocol's table does not name. */
    fun strictFault(
        thread: JsonObject,
        at: String,
    ): TreeContract.Issue? =
        (thread["mcpServers"] as? JsonArray)?.items?.withIndex()?.firstNotNullOfOrNull { (index, item) ->
            (item as? JsonObject)?.keys?.firstOrNull { it !in serverKeys }?.let {
                TreeContract.Issue("unknown-key", "$at.mcpServers[$index].$it")
            }
        }
}
