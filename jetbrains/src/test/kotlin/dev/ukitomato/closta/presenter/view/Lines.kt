package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.RawJson
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText

/** Stdout lines built by hand, for the paths the captures do not take. Field values that do not matter are fixed. */
object Lines {
    private const val SESSION = "s-1"

    fun quote(text: String): String = JsonText.compact(JsonString(text))

    fun queued(command: String) = AgentEvent.CommandLifecycle("lc", SESSION, command, "queued")

    fun started(command: String) = AgentEvent.CommandLifecycle("lc", SESSION, command, "started")

    private fun frame(json: String) = AgentEvent.StreamEvent("se", SESSION, RawJson(json))

    fun messageStart(id: String) = frame("""{"type":"message_start","message":{"id":${quote(id)}}}""")

    fun blockStart(
        index: Int,
        block: String,
    ) = frame("""{"type":"content_block_start","index":$index,"content_block":$block}""")

    private fun delta(
        index: Int,
        delta: String,
    ) = frame("""{"type":"content_block_delta","index":$index,"delta":$delta}""")

    fun textDelta(
        index: Int,
        text: String,
    ) = delta(index, """{"type":"text_delta","text":${quote(text)}}""")

    fun thinkingDelta(
        index: Int,
        text: String,
    ) = delta(index, """{"type":"thinking_delta","thinking":${quote(text)}}""")

    fun jsonDelta(
        index: Int,
        partial: String,
    ) = delta(index, """{"type":"input_json_delta","partial_json":${quote(partial)}}""")

    fun blockStop(index: Int) = frame("""{"type":"content_block_stop","index":$index}""")

    fun messageStop() = frame("""{"type":"message_stop"}""")

    fun text(text: String) = """{"type":"text","text":${quote(text)}}"""

    fun thinking(text: String) = """{"type":"thinking","thinking":${quote(text)},"signature":"sig"}"""

    fun toolUse(
        id: String,
        name: String,
        input: String = "{}",
    ) = """{"type":"tool_use","id":${quote(id)},"name":${quote(name)},"input":$input}"""

    fun assistant(
        id: String,
        block: String,
        parent: String? = null,
    ) = AgentEvent.Assistant(
        uuid = "a",
        sessionId = SESSION,
        timestamp = "t",
        requestId = "req",
        message = RawJson("""{"id":${quote(id)},"role":"assistant","content":[$block]}"""),
        parentToolUseId = parent,
    )

    fun user(
        uuid: String,
        content: String,
        parent: String? = null,
    ) = AgentEvent.User(uuid, SESSION, "t", RawJson("""{"role":"user","content":$content}"""), parentToolUseId = parent)

    fun toolResult(
        toolUseId: String,
        content: String,
        isError: Boolean? = null,
    ): String {
        val error = isError?.let { ""","is_error":$it""" }.orEmpty()
        return """[{"type":"tool_result","tool_use_id":${quote(toolUseId)},"content":$content$error}]"""
    }

    fun result(
        command: String?,
        isError: Boolean = false,
        text: String = "done",
        cost: Double = 0.0,
        modelUsage: String = "{}",
    ) = AgentEvent.Result(
        uuid = "r",
        sessionId = SESSION,
        subtype = "success",
        result = text,
        isError = isError,
        stopReason = "end_turn",
        terminalReason = "completed",
        numTurns = 1,
        resultIndex = 0,
        queuedTurnCount = 0,
        totalCostUsd = cost,
        durationMs = 0,
        durationApiMs = 0,
        ttftMs = 0,
        ttftStreamMs = 0,
        timeToRequestMs = 0,
        firstContentFrameMs = 0,
        fastModeState = "off",
        usage = RawJson("{}"),
        modelUsage = RawJson(modelUsage),
        permissionDenials = RawJson("[]"),
        subagentStats = RawJson("{}"),
        userMessageUuid = command,
    )

    @Suppress("LongParameterList")
    fun request(
        requestId: String,
        tool: String,
        toolUseId: String?,
        input: String = "{}",
        agentId: String? = null,
        suggestions: String? = null,
    ): AgentEvent.ControlRequest {
        val use = toolUseId?.let { ""","tool_use_id":${quote(it)}""" }.orEmpty()
        val offered = suggestions?.let { ""","permission_suggestions":$it""" }.orEmpty()
        return AgentEvent.ControlRequest(
            requestId = requestId,
            request =
                RawJson(
                    """{"subtype":"can_use_tool","tool_name":${quote(tool)},"input":$input$offered$use}""",
                ),
            agentId = agentId,
            toolName = tool,
            toolUseId = toolUseId,
        )
    }

    fun taskStarted(
        taskId: String,
        toolUseId: String,
        background: Boolean = false,
    ) = AgentEvent.SystemTaskStarted("ts", SESSION, taskId, toolUseId, "d", "local_agent", isBackgrounded = background)

    /** `system/init` of a session of [model] in [mode], in [cwd]. */
    fun init(
        model: String = "claude-sonnet-5-5",
        mode: String = "default",
        cwd: String = "/work",
        slashCommands: String = "[]",
    ) = AgentEvent.SystemInit(
        uuid = "i",
        sessionId = SESSION,
        cwd = cwd,
        model = model,
        permissionMode = mode,
        apiKeySource = "none",
        claudeCodeVersion = "2.1.282",
        outputStyle = "text",
        viewMode = "normal",
        scratchpadPath = "/tmp",
        messagingSocketPath = "/tmp/sock",
        fastModeState = "off",
        tools = RawJson("[]"),
        mcpServers = RawJson("[]"),
        slashCommands = RawJson(slashCommands),
        terminalSlashCommands = RawJson("[]"),
        agents = RawJson("[]"),
        skills = RawJson("[]"),
        plugins = RawJson("[]"),
        capabilities = RawJson("{}"),
        memoryPaths = RawJson("[]"),
        analyticsDisabled = false,
        productFeedbackDisabled = false,
        perTurnEffortActive = false,
    )

    /** The success of the host's `initialize`, whose `response` is [body] (a JSON object, with the commands in it). */
    fun initialized(
        body: String,
        requestId: String = "init-1",
    ) = AgentEvent.ControlResponse(
        RawJson("""{"subtype":"success","request_id":${quote(requestId)},"response":$body}"""),
        requestId = requestId,
        subtype = "success",
    )

    /** `system/status`, which carries the permission mode the CLI is now in. */
    fun status(mode: String) = AgentEvent.SystemStatus("st", SESSION, status = null, permissionMode = mode)

    /** The answer to a control request the host sent, saying it went through; [body] is the answer's body, if any. */
    fun controlOk(
        requestId: String,
        body: String? = null,
    ) = AgentEvent.ControlResponse(
        RawJson(
            """{"subtype":"success","request_id":${quote(requestId)}""" +
                (body?.let { ""","response":$it""" }.orEmpty()) +
                "}",
        ),
        requestId = requestId,
        subtype = "success",
    )

    /** `system/status` with a [status] and no mode: `compacting`, or null when it is over. */
    fun statusOnly(status: String?) = AgentEvent.SystemStatus("st", SESSION, status = status, permissionMode = null)

    fun compactBoundary(metadata: String) = AgentEvent.SystemCompactBoundary("cb", SESSION, RawJson(metadata))

    /** The answer to a control request the host sent, saying it was refused. */
    fun controlError(
        requestId: String,
        error: String,
    ) = AgentEvent.ControlResponse(
        RawJson("""{"subtype":"error","request_id":${quote(requestId)},"error":${quote(error)}}"""),
        requestId = requestId,
        subtype = "error",
        error = error,
    )

    fun taskNotification(
        taskId: String,
        toolUseId: String,
        status: String,
    ) = AgentEvent.SystemTaskNotification("tn", SESSION, taskId, toolUseId, status, "out", "summary")
}
