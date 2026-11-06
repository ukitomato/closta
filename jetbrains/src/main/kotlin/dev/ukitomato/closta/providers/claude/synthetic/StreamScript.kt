package dev.ukitomato.closta.providers.claude.synthetic

import com.google.gson.JsonArray
import com.google.gson.JsonObject

/**
 * Writes stream-json lines in the shapes the CLI prints (captures 01 and 17), for the spike's replays and its
 * benchmark. Each call appends lines; [lines] gives them all.
 */
@Suppress("TooManyFunctions") // one function per kind of line the CLI prints
class StreamScript(
    private val sessionId: String = "spike-replay",
) {
    private val out = mutableListOf<JsonObject>()
    private var uuid = 0

    val lines: List<String> get() = out.map(JsonObject::toString)

    private fun line(
        type: String,
        build: JsonObject.() -> Unit,
    ) {
        out +=
            JsonObject().apply {
                addProperty("type", type)
                build()
                addProperty("session_id", sessionId)
                addProperty("uuid", "spike-${uuid++}")
            }
    }

    fun lifecycle(
        command: String,
        state: String,
    ) = line("command_lifecycle") {
        addProperty("command_uuid", command)
        addProperty("state", state)
    }

    fun init() =
        line("system") {
            addProperty("subtype", "init")
            addProperty("cwd", "/spike")
            add("tools", JsonArray())
            add("mcp_servers", JsonArray())
            addProperty("model", "claude-synthetic")
            addProperty("permissionMode", "default")
            add("slash_commands", JsonArray())
            addProperty("apiKeySource", "none")
            addProperty("claude_code_version", "spike")
            addProperty("output_style", "default")
            addProperty("view_mode", "default")
            addProperty("messaging_socket_path", "")
            addProperty("fast_mode_state", "off")
            listOf(
                "terminal_slash_commands",
                "agents",
                "skills",
                "plugins",
                "capabilities",
            ).forEach { add(it, JsonArray()) }
            add("memory_paths", JsonObject())
            listOf(
                "analytics_disabled",
                "product_feedback_disabled",
                "per_turn_effort_active",
            ).forEach { addProperty(it, false) }
        }

    /** A finished `assistant` line holding [blocks]; [parent] puts it in that tool call's sub-agent. */
    fun assistant(
        messageId: String,
        blocks: List<JsonObject>,
        parent: String? = null,
    ) = line("assistant") {
        addProperty("timestamp", TIMESTAMP)
        addProperty("request_id", "req_$messageId")
        add("message", message(messageId, JsonArray().apply { blocks.forEach(::add) }))
        if (parent == null) add("parent_tool_use_id", null) else addProperty("parent_tool_use_id", parent)
    }

    /** A `user` line with the result of [toolId]. */
    fun toolResult(
        toolId: String,
        content: String,
        parent: String? = null,
        isError: Boolean = false,
    ) = line("user") {
        addProperty("timestamp", TIMESTAMP)
        add(
            "message",
            JsonObject().apply {
                addProperty("role", "user")
                add(
                    "content",
                    JsonArray().apply {
                        add(
                            JsonObject().apply {
                                addProperty("tool_use_id", toolId)
                                addProperty("type", "tool_result")
                                addProperty("content", content)
                                if (isError) addProperty("is_error", true)
                            },
                        )
                    },
                )
            },
        )
        if (parent == null) add("parent_tool_use_id", null) else addProperty("parent_tool_use_id", parent)
    }

    /** A tool call streamed in pieces of its input, then its finished snapshot. */
    fun streamTool(
        messageId: String,
        toolId: String,
        name: String,
        input: JsonObject,
        chunk: Int = INPUT_CHUNK,
    ) {
        start(messageId)
        stream(
            event("content_block_start") {
                addProperty("index", 0)
                add("content_block", toolUse(toolId, name, JsonObject()))
            },
        )
        input.toString().chunked(chunk).forEach { piece ->
            stream(delta("input_json_delta", "partial_json", piece))
        }
        assistant(messageId, listOf(toolUse(toolId, name, input)))
        stream(event("content_block_stop") { addProperty("index", 0) })
        end("tool_use")
    }

    /** A text block streamed in pieces of [chunk] characters, then its finished snapshot. */
    fun streamText(
        messageId: String,
        text: String,
        chunk: Int,
    ) {
        start(messageId)
        stream(
            event("content_block_start") {
                addProperty("index", 0)
                add("content_block", text(""))
            },
        )
        text.chunked(chunk).forEach { piece -> stream(delta("text_delta", "text", piece)) }
        assistant(messageId, listOf(text(text)))
        stream(event("content_block_stop") { addProperty("index", 0) })
        end("end_turn")
    }

    fun result(text: String) =
        line("result") {
            addProperty("subtype", "success")
            addProperty("is_error", false)
            addProperty("duration_ms", 0)
            addProperty("duration_api_ms", 0)
            addProperty("num_turns", 1)
            addProperty("result", text)
            addProperty("stop_reason", "end_turn")
            addProperty("total_cost_usd", 0)
            addProperty("result_index", 0)
            addProperty("queued_turn_count", 0)
            addProperty("fast_mode_state", "off")
            add("usage", JsonObject())
            add("modelUsage", JsonObject())
            add("permission_denials", JsonArray())
            add("subagent_stats", JsonObject())
        }

    private fun start(messageId: String) =
        stream(
            event("message_start") {
                add("message", message(messageId, JsonArray()))
            },
        )

    private fun end(reason: String) {
        stream(event("message_delta") { add("delta", JsonObject().apply { addProperty("stop_reason", reason) }) })
        stream(event("message_stop"))
    }

    private fun stream(event: JsonObject) =
        line("stream_event") {
            add("event", event)
            add("parent_tool_use_id", null)
        }

    private fun delta(
        type: String,
        key: String,
        value: String,
    ) = event("content_block_delta") {
        addProperty("index", 0)
        add(
            "delta",
            JsonObject().apply {
                addProperty("type", type)
                addProperty(key, value)
            },
        )
    }

    private fun event(
        type: String,
        build: JsonObject.() -> Unit = {},
    ) = JsonObject().apply {
        addProperty("type", type)
        build()
    }

    private fun message(
        id: String,
        content: JsonArray,
    ) = JsonObject().apply {
        addProperty("model", "claude-synthetic")
        addProperty("id", id)
        addProperty("type", "message")
        addProperty("role", "assistant")
        add("content", content)
        add("stop_reason", null)
    }

    companion object {
        private const val TIMESTAMP = "2026-11-03T00:00:00.000Z"
        private const val INPUT_CHUNK = 12

        fun text(text: String): JsonObject =
            JsonObject().apply {
                addProperty("type", "text")
                addProperty("text", text)
            }

        fun toolUse(
            id: String,
            name: String,
            input: JsonObject,
        ): JsonObject =
            JsonObject().apply {
                addProperty("type", "tool_use")
                addProperty("id", id)
                addProperty("name", name)
                add("input", input)
            }
    }
}
