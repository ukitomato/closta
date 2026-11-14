package dev.ukitomato.closta.providers.claude.protocol

import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParseException
import com.google.gson.Strictness
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.AgentEventKind
import dev.ukitomato.closta.core.models.RawJson

/**
 * The production reader: one stream-json line off the CLI's stdout becomes one [AgentEvent].
 *
 * This is the single decoder. The test-side stand-in it replaced held the same builder table, and
 * two of them would have meant a protocol change could be followed by one and not the other with
 * nothing to say which was right. Reading captures off the classpath is a test concern and stays in
 * the test loader; this object only turns a String into a value and holds no IO.
 *
 * [decode] never throws: a line the reader cannot place still comes back as a value, because a reader
 * that throws stops reading and a stdout reader that stops deadlocks the CLI behind a full pipe.
 * A line whose `type` is not one of the nineteen, or of a known kind but missing a field the declared
 * shape needs, becomes [AgentEvent.UnknownKind] — in both cases the protocol has moved. A line that
 * is not a JSON object at all becomes [AgentEvent.BrokenLine] — damaged bytes rather than a new
 * version, a different thing to go and look at. A line nested deeper than [MAX_DEPTH] is also a
 * [AgentEvent.BrokenLine]: the depth is counted before parsing, because both parsing and writing the
 * tree back out recurse and a pathological line would otherwise throw `StackOverflowError`.
 *
 * JSON is parsed strictly ([Strictness.STRICT]). A lenient reader accepts unquoted literals, which
 * would silently turn a damaged line into a plausible value and hide exactly the case this catches.
 */
object StreamJsonCodec {
    private const val SYSTEM = "system"
    private const val CONTROL_REQUEST = "control_request"
    private const val CAN_USE_TOOL = "can_use_tool"

    /**
     * The deepest nesting a line may have (objects and arrays together; the top-level object counts
     * as 1). Recorded captures reach 9. 200 sits well above that and below the default nesting limit
     * (255) of the Gson the IDE bundles, so whichever Gson is loaded behaves the same.
     */
    const val MAX_DEPTH = 200

    private val strict: Gson = GsonBuilder().setStrictness(Strictness.STRICT).create()

    /**
     * Converts one line. Never throws. Blank input, non-object JSON and malformed JSON all become
     * [AgentEvent.BrokenLine]; an unplaceable object becomes [AgentEvent.UnknownKind].
     */
    fun decode(line: String): AgentEvent {
        val outcome =
            if (exceedsDepth(line)) Outcome(null, "nesting deeper than $MAX_DEPTH levels") else parseJson(line)
        val json = outcome.json ?: return AgentEvent.BrokenLine(line, outcome.reason)
        return place(json)
    }

    /**
     * Whether [line] nests deeper than [MAX_DEPTH]. One pass over the characters, no recursion;
     * brackets inside string literals (and escaped quotes) are not counted. Unbalanced input is not
     * judged here — the parser reports it.
     */
    private fun exceedsDepth(line: String): Boolean {
        val scan = DepthScan()
        return line.any(scan::stepExceeds)
    }

    /** The state of one pass over a line's characters; see [exceedsDepth]. */
    private class DepthScan {
        private var depth = 0
        private var inString = false
        private var escaped = false

        /** Consumes [c]; true once the nesting has gone past [MAX_DEPTH]. */
        fun stepExceeds(c: Char): Boolean {
            if (inString) {
                stepInString(c)
                return false
            }
            when (c) {
                '"' -> inString = true
                '{', '[' -> depth++
                '}', ']' -> if (depth > 0) depth--
            }
            return depth > MAX_DEPTH
        }

        private fun stepInString(c: Char) {
            when {
                escaped -> escaped = false
                c == '\\' -> escaped = true
                c == '"' -> inString = false
            }
        }
    }

    /**
     * The wire type of a line: `type`, with `/<subtype>` appended for `system` lines. A `system`
     * line without a subtype would collapse eight kinds into one bucket, so the subtype is part of
     * the identity rather than a field inside it.
     */
    private fun wireTypeOf(json: JsonObject): String {
        val type = primitiveText(json, "type").orEmpty()
        val subtype = primitiveText(json, "subtype")
        return if (type == SYSTEM && subtype != null) "$type/$subtype" else type
    }

    /** Places an already-parsed line, or counts it as unknown when nothing here matches its shape. */
    private fun place(json: JsonObject): AgentEvent {
        val wireType = wireTypeOf(json)
        if (wireType == CONTROL_REQUEST) {
            // Only can_use_tool is an approval. Anything else would become a pending approval nobody
            // can answer, so it is counted as unknown under `control_request/<subtype>` instead.
            val subtype = (json.get("request") as? JsonObject)?.let { primitiveText(it, "subtype") }
            if (subtype != CAN_USE_TOOL) {
                val unplaced = if (subtype == null) CONTROL_REQUEST else "$CONTROL_REQUEST/$subtype"
                return AgentEvent.UnknownKind(unplaced, RawJson(json.toString()))
            }
        }
        val build = AgentEventKind.ofWireType(wireType)?.let(BUILDERS::get)
        val unknown = AgentEvent.UnknownKind(wireType, RawJson(json.toString()))
        return try {
            build?.invoke(Fields(json)) ?: unknown
        } catch (ignoredShapeDrift: IllegalArgumentException) {
            // The kind is known but the shape is not the recorded one. The name of the absent field
            // is dropped rather than carried: UnknownKind keeps the whole line, which shows what is
            // missing and is the same thing a version bump would make us look at.
            unknown
        }
    }

    private fun primitiveText(
        json: JsonObject,
        name: String,
    ): String? = json.get(name)?.takeIf { it.isJsonPrimitive }?.asString

    private fun parseJson(line: String): Outcome =
        try {
            when (val element: JsonElement? = strict.fromJson(line, JsonElement::class.java)) {
                null -> Outcome(null, "blank or empty line")
                is JsonObject -> Outcome(element, "")
                else -> Outcome(null, "top-level JSON value is not an object")
            }
        } catch (malformed: JsonParseException) {
            // Covers both JsonSyntaxException (bad token / unquoted literal under STRICT) and
            // JsonIOException (trailing content after the value); both extend JsonParseException.
            Outcome(null, malformed.message ?: "malformed JSON")
        }

    private class Outcome(
        val json: JsonObject?,
        val reason: String,
    )

    /**
     * Typed access to one line's fields.
     *
     * A field is read as non-null only where every recorded line of that kind carries it; everything
     * else is optional, including fields the official types declare as required
     * (`system/status.status` is null on 5 of 34 recorded lines). Asking for an absent required field
     * throws, and [place] turns that into [AgentEvent.UnknownKind] — a known kind in an unrecorded
     * shape is a version having moved, the same news as a new kind.
     */
    @Suppress("TooManyFunctions") // one typed accessor per field shape — splitting would scatter the vocabulary
    private class Fields(
        private val json: JsonObject,
    ) {
        fun text(name: String): String = textOrNull(name) ?: missing(name)

        fun textOrNull(name: String): String? = primitive(name)?.asString

        fun whole(name: String): Long = wholeOrNull(name) ?: missing(name)

        fun wholeOrNull(name: String): Long? = primitive(name)?.asLong

        fun count(name: String): Int = countOrNull(name) ?: missing(name)

        fun countOrNull(name: String): Int? = primitive(name)?.asInt

        fun money(name: String): Double = primitive(name)?.asDouble ?: missing(name)

        fun flag(name: String): Boolean = flagOrNull(name) ?: missing(name)

        fun flagOrNull(name: String): Boolean? = primitive(name)?.asBoolean

        /** The strings of an array, leaving out any entry that is not one; null when the field is absent. */
        fun textsOrNull(name: String): List<String>? =
            (present(name) as? JsonArray)?.mapNotNull { item ->
                item.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString
            }

        /** An array of strings, one per line. */
        fun lines(name: String): String =
            (present(name) as? JsonArray)?.joinToString("\n") { it.asString } ?: missing(name)

        fun raw(name: String): RawJson = rawOrNull(name) ?: missing(name)

        fun rawOrNull(name: String): RawJson? = present(name)?.let { RawJson(it.toString()) }

        /** A nested object, so a `control_request` can read the typed scalars inside `request`. */
        fun nested(name: String): JsonObject? = present(name) as? JsonObject

        private fun primitive(name: String): JsonElement? = present(name)?.takeIf { it.isJsonPrimitive }

        private fun present(name: String): JsonElement? = json.get(name)?.takeUnless { it.isJsonNull }

        private fun missing(name: String): Nothing =
            throw IllegalArgumentException("line is missing the required field `$name`")
    }

    /**
     * One builder per kind, keyed rather than branched.
     *
     * A nineteen-armed `when` would be one unit that grows every time the protocol does; a map keeps
     * each kind's field list next to that kind alone, and a kind with no entry falls through to
     * unknown instead of to an unreachable branch.
     */
    private val BUILDERS: Map<AgentEventKind, (Fields) -> AgentEvent.Known> =
        mapOf(
            AgentEventKind.STREAM_EVENT to { f ->
                AgentEvent.StreamEvent(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    event = f.raw("event"),
                    parentToolUseId = f.textOrNull("parent_tool_use_id"),
                    ttftMs = f.wholeOrNull("ttft_ms"),
                    userMessageUuid = f.textOrNull("user_message_uuid"),
                    userMessageUuids = f.rawOrNull("user_message_uuids"),
                )
            },
            AgentEventKind.ASSISTANT to { f ->
                AgentEvent.Assistant(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    timestamp = f.text("timestamp"),
                    requestId = f.textOrNull("request_id"),
                    message = f.raw("message"),
                    parentToolUseId = f.textOrNull("parent_tool_use_id"),
                    userMessageUuid = f.textOrNull("user_message_uuid"),
                    userMessageUuids = f.rawOrNull("user_message_uuids"),
                    wireToolInputs = f.rawOrNull("wire_tool_inputs"),
                    subagentType = f.textOrNull("subagent_type"),
                    taskDescription = f.textOrNull("task_description"),
                    error = f.textOrNull("error"),
                )
            },
            AgentEventKind.COMMAND_LIFECYCLE to { f ->
                AgentEvent.CommandLifecycle(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    commandUuid = f.text("command_uuid"),
                    state = f.text("state"),
                )
            },
            AgentEventKind.SYSTEM_STATUS to { f ->
                AgentEvent.SystemStatus(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    status = f.textOrNull("status"),
                    permissionMode = f.textOrNull("permissionMode"),
                )
            },
            AgentEventKind.USER to { f ->
                AgentEvent.User(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    timestamp = f.text("timestamp"),
                    message = f.raw("message"),
                    parentToolUseId = f.textOrNull("parent_tool_use_id"),
                    toolUseResult = f.rawOrNull("tool_use_result"),
                    subagentType = f.textOrNull("subagent_type"),
                    taskDescription = f.textOrNull("task_description"),
                )
            },
            AgentEventKind.CONTROL_RESPONSE to { f ->
                // request_id / subtype / error live inside `response`; `response` itself stays RawJson.
                val responseObject = f.nested("response")
                AgentEvent.ControlResponse(
                    response = f.raw("response"),
                    requestId = responseObject?.let { primitiveText(it, "request_id") },
                    subtype = responseObject?.let { primitiveText(it, "subtype") },
                    error = responseObject?.let { primitiveText(it, "error") },
                )
            },
            AgentEventKind.SYSTEM_INIT to { f ->
                AgentEvent.SystemInit(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    cwd = f.text("cwd"),
                    model = f.text("model"),
                    permissionMode = f.text("permissionMode"),
                    apiKeySource = f.text("apiKeySource"),
                    claudeCodeVersion = f.text("claude_code_version"),
                    outputStyle = f.text("output_style"),
                    viewMode = f.text("view_mode"),
                    scratchpadPath = f.textOrNull("scratchpad_path"),
                    messagingSocketPath = f.text("messaging_socket_path"),
                    fastModeState = f.text("fast_mode_state"),
                    tools = f.raw("tools"),
                    mcpServers = f.raw("mcp_servers"),
                    slashCommands = f.raw("slash_commands"),
                    terminalSlashCommands = f.raw("terminal_slash_commands"),
                    agents = f.raw("agents"),
                    skills = f.raw("skills"),
                    plugins = f.raw("plugins"),
                    capabilities = f.raw("capabilities"),
                    memoryPaths = f.raw("memory_paths"),
                    analyticsDisabled = f.flag("analytics_disabled"),
                    productFeedbackDisabled = f.flag("product_feedback_disabled"),
                    perTurnEffortActive = f.flag("per_turn_effort_active"),
                    fastModeDisabledReason = f.textOrNull("fast_mode_disabled_reason"),
                )
            },
            AgentEventKind.RESULT to { f ->
                AgentEvent.Result(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    subtype = f.text("subtype"),
                    // An error result (sdk.d.ts SDKResultError) has no result text; its errors say what went wrong.
                    result = f.textOrNull("result") ?: f.lines("errors"),
                    isError = f.flag("is_error"),
                    stopReason = f.textOrNull("stop_reason"),
                    terminalReason = f.textOrNull("terminal_reason"),
                    numTurns = f.count("num_turns"),
                    resultIndex = f.count("result_index"),
                    queuedTurnCount = f.count("queued_turn_count"),
                    totalCostUsd = f.money("total_cost_usd"),
                    durationMs = f.whole("duration_ms"),
                    durationApiMs = f.whole("duration_api_ms"),
                    ttftMs = f.wholeOrNull("ttft_ms"),
                    ttftStreamMs = f.wholeOrNull("ttft_stream_ms"),
                    timeToRequestMs = f.wholeOrNull("time_to_request_ms"),
                    firstContentFrameMs = f.wholeOrNull("first_content_frame_ms"),
                    fastModeState = f.text("fast_mode_state"),
                    usage = f.raw("usage"),
                    modelUsage = f.raw("modelUsage"),
                    permissionDenials = f.raw("permission_denials"),
                    subagentStats = f.raw("subagent_stats"),
                    apiErrorStatus = f.textOrNull("api_error_status"),
                    fastModeDisabledReason = f.textOrNull("fast_mode_disabled_reason"),
                    requestSentWallMs = f.wholeOrNull("request_sent_wall_ms"),
                    userMessageUuid = f.textOrNull("user_message_uuid"),
                    userMessageUuids = f.textsOrNull("user_message_uuids"),
                    origin = f.rawOrNull("origin"),
                    localCommand = f.textOrNull("local_command"),
                )
            },
            AgentEventKind.RATE_LIMIT_EVENT to { f ->
                AgentEvent.RateLimitEvent(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    rateLimitInfo = f.raw("rate_limit_info"),
                )
            },
            AgentEventKind.SYSTEM_BACKGROUND_TASKS_CHANGED to { f ->
                AgentEvent.SystemBackgroundTasksChanged(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    tasks = f.raw("tasks"),
                )
            },
            AgentEventKind.SYSTEM_THINKING_TOKENS to { f ->
                AgentEvent.SystemThinkingTokens(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    estimatedTokens = f.whole("estimated_tokens"),
                    estimatedTokensDelta = f.whole("estimated_tokens_delta"),
                    userMessageUuid = f.textOrNull("user_message_uuid"),
                )
            },
            AgentEventKind.SYSTEM_TASK_STARTED to { f ->
                AgentEvent.SystemTaskStarted(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    taskId = f.text("task_id"),
                    toolUseId = f.text("tool_use_id"),
                    description = f.text("description"),
                    taskType = f.text("task_type"),
                    isBackgrounded = f.flag("is_backgrounded"),
                    subagentType = f.textOrNull("subagent_type"),
                    spawnDepth = f.countOrNull("spawn_depth"),
                    prompt = f.textOrNull("prompt"),
                    ownedBySubagent = f.flagOrNull("owned_by_subagent"),
                )
            },
            AgentEventKind.SYSTEM_TASK_PROGRESS to { f ->
                AgentEvent.SystemTaskProgress(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    taskId = f.text("task_id"),
                    description = f.text("description"),
                    subagentType = f.text("subagent_type"),
                    lastToolName = f.text("last_tool_name"),
                    usage = f.raw("usage"),
                    toolUseId = f.textOrNull("tool_use_id"),
                )
            },
            AgentEventKind.SYSTEM_TASK_UPDATED to { f ->
                AgentEvent.SystemTaskUpdated(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    taskId = f.text("task_id"),
                    patch = f.raw("patch"),
                )
            },
            AgentEventKind.SYSTEM_TASK_NOTIFICATION to { f ->
                AgentEvent.SystemTaskNotification(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    taskId = f.text("task_id"),
                    toolUseId = f.text("tool_use_id"),
                    status = f.text("status"),
                    outputFile = f.text("output_file"),
                    summary = f.text("summary"),
                    usage = f.rawOrNull("usage"),
                )
            },
            AgentEventKind.CONTROL_REQUEST to { f ->
                // The attribution/kind scalars live inside `request`; `request` itself stays RawJson.
                val requestObject = f.nested("request")
                AgentEvent.ControlRequest(
                    requestId = f.text("request_id"),
                    request = f.raw("request"),
                    agentId = requestObject?.let { primitiveText(it, "agent_id") },
                    toolName = requestObject?.let { primitiveText(it, "tool_name") },
                    toolUseId = requestObject?.let { primitiveText(it, "tool_use_id") },
                )
            },
            AgentEventKind.SYSTEM_COMMANDS_CHANGED to { f ->
                AgentEvent.SystemCommandsChanged(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    commands = f.raw("commands"),
                )
            },
            AgentEventKind.SYSTEM_COMPACT_BOUNDARY to { f ->
                AgentEvent.SystemCompactBoundary(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    compactMetadata = f.raw("compact_metadata"),
                    logicalParentUuid = f.textOrNull("logical_parent_uuid"),
                )
            },
            AgentEventKind.SYSTEM_UI_INVALIDATE to { f ->
                AgentEvent.SystemUiInvalidate(
                    uuid = f.text("uuid"),
                    sessionId = f.text("session_id"),
                    event = f.textOrNull("event"),
                )
            },
        )
}
