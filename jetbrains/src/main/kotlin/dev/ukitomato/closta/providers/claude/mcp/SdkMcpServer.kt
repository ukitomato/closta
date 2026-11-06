package dev.ukitomato.closta.providers.claude.mcp

import com.google.gson.JsonObject

/**
 * An in-process MCP server of the SDK kind: the host declares its [name] in `initialize` and the CLI sends it
 * JSON-RPC over the same stdio as `mcp_message` requests (`@anthropic-ai/claude-agent-sdk`'s `sdk.d.ts`).
 *
 * One message in, at most one message out. It reports its own refusals as JSON-RPC errors or `isError` results; an
 * exception that still escapes is turned into a JSON-RPC error by the wrapper, never left to stop the reader.
 */
interface SdkMcpServer {
    /** The name the CLI addresses it by (`server_name`). Not `ide`, which the CLI treats specially. */
    val name: String

    /** Answers one JSON-RPC [message]; returns null for a notification, which has nothing to answer. */
    suspend fun handle(message: JsonObject): JsonObject?
}
