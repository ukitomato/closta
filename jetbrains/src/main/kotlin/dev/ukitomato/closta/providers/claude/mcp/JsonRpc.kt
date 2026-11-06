package dev.ukitomato.closta.providers.claude.mcp

import com.google.gson.JsonElement
import com.google.gson.JsonObject

/** Builders for the JSON-RPC 2.0 messages an [SdkMcpServer] answers with. */
internal object JsonRpc {
    const val METHOD_NOT_FOUND = -32601
    const val INVALID_PARAMS = -32602
    const val INTERNAL_ERROR = -32603

    /** `{"jsonrpc":"2.0","id":<id>,"result":<result>}`. A missing [id] is written as 0, as the SDK does. */
    fun result(
        id: JsonElement?,
        result: JsonObject,
    ): JsonObject =
        envelope(id).apply {
            add("result", result)
        }

    /** `{"jsonrpc":"2.0","id":<id>,"error":{"code":<code>,"message":<message>}}`. */
    fun error(
        id: JsonElement?,
        code: Int,
        message: String,
    ): JsonObject =
        envelope(id).apply {
            add(
                "error",
                JsonObject().apply {
                    addProperty("code", code)
                    addProperty("message", message)
                },
            )
        }

    /** What the SDK returns for a notification: an empty result under id 0 (`mcp_message` wants some answer). */
    fun acknowledgement(): JsonObject = result(null, JsonObject())

    private fun envelope(id: JsonElement?): JsonObject =
        JsonObject().apply {
            addProperty("jsonrpc", "2.0")
            if (id == null || id.isJsonNull) addProperty("id", 0) else add("id", id)
        }
}
