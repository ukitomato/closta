package dev.ukitomato.closta.core.models

/**
 * A JSON fragment carried through verbatim instead of being modelled.
 *
 * Nested provider structures — an Anthropic message, a raw SSE frame, a control-protocol payload —
 * belong to the provider, not to core. Folding them into core types here would drag the vocabulary
 * of one CLI into the layer that is supposed to outlive it, and would drop whatever the current
 * version happens to send that we did not think to declare. Keeping the text means nothing is lost
 * and the shape stays the provider's problem.
 */
@JvmInline
value class RawJson(
    val text: String,
)

/**
 * The stdout line kinds observed in the recorded captures (CLI 2.1.282, 21 captures).
 *
 * Eighteen: `command_lifecycle` arrives on every turn but has no declaration in the official SDK
 * types, and the captures win over the official types when they disagree. The official
 * union declares 44 kinds; seventeen of the eighteen are among them (including
 * `system/commands_changed` and `system/compact_boundary`, which both the types and the captures
 * carry), and the rest never arrive and are deliberately not modelled — an unmodelled kind is
 * counted as unknown, which is how a version bump announces itself.
 *
 * [wireType] is the `type` field as it arrives, with `/<subtype>` appended for `system` lines so
 * that a `system` line never collapses into a single bucket.
 */
enum class AgentEventKind(
    val wireType: String,
) {
    STREAM_EVENT("stream_event"),
    ASSISTANT("assistant"),
    COMMAND_LIFECYCLE("command_lifecycle"),
    SYSTEM_STATUS("system/status"),
    USER("user"),
    CONTROL_RESPONSE("control_response"),
    SYSTEM_INIT("system/init"),
    RESULT("result"),
    RATE_LIMIT_EVENT("rate_limit_event"),
    SYSTEM_BACKGROUND_TASKS_CHANGED("system/background_tasks_changed"),
    SYSTEM_THINKING_TOKENS("system/thinking_tokens"),
    SYSTEM_TASK_STARTED("system/task_started"),
    SYSTEM_TASK_PROGRESS("system/task_progress"),
    SYSTEM_TASK_UPDATED("system/task_updated"),
    SYSTEM_TASK_NOTIFICATION("system/task_notification"),
    CONTROL_REQUEST("control_request"),
    SYSTEM_COMMANDS_CHANGED("system/commands_changed"),
    SYSTEM_COMPACT_BOUNDARY("system/compact_boundary"),
    ;

    companion object {
        private val BY_WIRE_TYPE: Map<String, AgentEventKind> = entries.associateBy(AgentEventKind::wireType)

        /** The kind for [wireType], or `null` when nothing declares it — the caller counts it as unknown. */
        fun ofWireType(wireType: String): AgentEventKind? = BY_WIRE_TYPE[wireType]
    }
}

/**
 * One line of the agent CLI's stdout, as core understands it.
 *
 * One line in, one value out: lines are never split or merged, because reconstructing a conversation
 * from them is the fold's job and anything decided here would be decided before the fold can
 * see it. Twenty variants — the [AgentEventKind] eighteen, plus [UnknownKind] and [BrokenLine].
 *
 * The two catch-alls are variants rather than errors on purpose. A reader that throws stops reading,
 * and a stdout reader that stops deadlocks the CLI behind a full pipe; a reader that silently drops
 * the line loses the one signal that says the protocol moved. So every line becomes a value, and the
 * odd ones get counted (see [UnknownEventTally]).
 *
 * Fields are typed where the captures show a value on every line of that kind, and nullable where
 * the captures show the field missing or explicitly null (`system/status.status` is null on 5 of 34
 * lines even though the official type forbids it). Nested objects and arrays stay as [RawJson].
 */
sealed interface AgentEvent {
    /** A line whose kind is declared here. The catch-alls deliberately do not implement this. */
    sealed interface Known : AgentEvent {
        val kind: AgentEventKind
    }

    /** Partial assistant output: one raw Anthropic SSE frame per line. The bulk of any capture. */
    data class StreamEvent(
        val uuid: String,
        val sessionId: String,
        val event: RawJson,
        val parentToolUseId: String? = null,
        val ttftMs: Long? = null,
        val userMessageUuid: String? = null,
        val userMessageUuids: RawJson? = null,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.STREAM_EVENT
    }

    /** A completed assistant message. */
    data class Assistant(
        val uuid: String,
        val sessionId: String,
        val timestamp: String,
        val requestId: String,
        val message: RawJson,
        val parentToolUseId: String? = null,
        val userMessageUuid: String? = null,
        val userMessageUuids: RawJson? = null,
        val wireToolInputs: RawJson? = null,
        val subagentType: String? = null,
        val taskDescription: String? = null,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.ASSISTANT
    }

    /**
     * Turn boundary. Undeclared in the official SDK types yet present on every turn, two lines ahead
     * of `system/init`; paired with a user message uuid it is what distinguishes a turn the user
     * started from one the CLI resumed on its own.
     *
     * [state] stays a string: the captures only ever show `queued`, `started` and `completed`, and
     * the `cancelled` the SDK's prose mentions has never been recorded. Modelling an unrecorded value
     * would be guessing at its spelling.
     */
    data class CommandLifecycle(
        val uuid: String,
        val sessionId: String,
        val commandUuid: String,
        val state: String,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.COMMAND_LIFECYCLE
    }

    /** Coarse progress. [status] is nullable because the captures contain nulls. */
    data class SystemStatus(
        val uuid: String,
        val sessionId: String,
        val status: String? = null,
        val permissionMode: String? = null,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.SYSTEM_STATUS
    }

    /** A user message echoed back, carrying tool results when the turn ran tools. */
    data class User(
        val uuid: String,
        val sessionId: String,
        val timestamp: String,
        val message: RawJson,
        val parentToolUseId: String? = null,
        val toolUseResult: RawJson? = null,
        val subagentType: String? = null,
        val taskDescription: String? = null,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.USER
    }

    /**
     * Reply to a control request the host sent on stdin. Carries its own success/error subtype.
     *
     * [requestId], [subtype] and [error] are lifted from `response` as a forward evolution of the
     * type (the same move made on [ControlRequest]) so the fold can tell a
     * rejected request from an accepted one and name which request it was without opening the
     * `RawJson`. [error] is whatever `response.error` holds, which only an `error` reply carries. The
     * body of a success stays in [response]; `error_code` is deliberately not lifted (no declaration
     * in the official types).
     */
    data class ControlResponse(
        val response: RawJson,
        val requestId: String? = null,
        val subtype: String? = null,
        val error: String? = null,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.CONTROL_RESPONSE
    }

    /** Session metadata at the start of a turn. The widest line in the protocol. */
    data class SystemInit(
        val uuid: String,
        val sessionId: String,
        val cwd: String,
        val model: String,
        val permissionMode: String,
        val apiKeySource: String,
        val claudeCodeVersion: String,
        val outputStyle: String,
        val viewMode: String,
        val scratchpadPath: String? = null,
        val messagingSocketPath: String,
        val fastModeState: String,
        val tools: RawJson,
        val mcpServers: RawJson,
        val slashCommands: RawJson,
        val terminalSlashCommands: RawJson,
        val agents: RawJson,
        val skills: RawJson,
        val plugins: RawJson,
        val capabilities: RawJson,
        val memoryPaths: RawJson,
        val analyticsDisabled: Boolean,
        val productFeedbackDisabled: Boolean,
        val perTurnEffortActive: Boolean,
        val fastModeDisabledReason: String? = null,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.SYSTEM_INIT
    }

    /**
     * End of a turn, with cost and timing.
     *
     * [subtype] stays a field rather than splitting this into success and error variants: only
     * `success` has ever been recorded, and the error shape would be invented.
     * [stopReason], [terminalReason] and the four time-to-first fields are nullable because a
     * `/compact` result carries `stop_reason: null` and omits the rest (the official types
     * declare them optional too).
     * [totalCostUsd] is a session running total, not a per-turn figure.
     */
    data class Result(
        val uuid: String,
        val sessionId: String,
        val subtype: String,
        val result: String,
        val isError: Boolean,
        val stopReason: String? = null,
        val terminalReason: String? = null,
        val numTurns: Int,
        val resultIndex: Int,
        val queuedTurnCount: Int,
        val totalCostUsd: Double,
        val durationMs: Long,
        val durationApiMs: Long,
        val ttftMs: Long? = null,
        val ttftStreamMs: Long? = null,
        val timeToRequestMs: Long? = null,
        val firstContentFrameMs: Long? = null,
        val fastModeState: String,
        val usage: RawJson,
        val modelUsage: RawJson,
        val permissionDenials: RawJson,
        val subagentStats: RawJson,
        val apiErrorStatus: String? = null,
        val fastModeDisabledReason: String? = null,
        val requestSentWallMs: Long? = null,
        val userMessageUuid: String? = null,
        val userMessageUuids: RawJson? = null,
        val origin: RawJson? = null,
        /** Set on the result of a local command such as `/compact`; `null` on a model turn. */
        val localCommand: String? = null,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.RESULT
    }

    /** Remaining quota and reset time. */
    data class RateLimitEvent(
        val uuid: String,
        val sessionId: String,
        val rateLimitInfo: RawJson,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.RATE_LIMIT_EVENT
    }

    /** The set of background tasks changed; [tasks] is the whole new set, not a delta. */
    data class SystemBackgroundTasksChanged(
        val uuid: String,
        val sessionId: String,
        val tasks: RawJson,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.SYSTEM_BACKGROUND_TASKS_CHANGED
    }

    /**
     * Thinking-token estimate. Both figures are per assistant message and reset on the next one,
     * so they must not be accumulated across a turn.
     */
    data class SystemThinkingTokens(
        val uuid: String,
        val sessionId: String,
        val estimatedTokens: Long,
        val estimatedTokensDelta: Long,
        val userMessageUuid: String? = null,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.SYSTEM_THINKING_TOKENS
    }

    /** A subagent or background task started. */
    data class SystemTaskStarted(
        val uuid: String,
        val sessionId: String,
        val taskId: String,
        val toolUseId: String,
        val description: String,
        val taskType: String,
        val isBackgrounded: Boolean,
        val subagentType: String? = null,
        val spawnDepth: Int? = null,
        val prompt: String? = null,
        val ownedBySubagent: Boolean? = null,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.SYSTEM_TASK_STARTED
    }

    /** Progress for a running task. */
    data class SystemTaskProgress(
        val uuid: String,
        val sessionId: String,
        val taskId: String,
        val description: String,
        val subagentType: String,
        val lastToolName: String,
        val usage: RawJson,
        val toolUseId: String? = null,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.SYSTEM_TASK_PROGRESS
    }

    /** A task's record changed; [patch] holds only the changed fields. */
    data class SystemTaskUpdated(
        val uuid: String,
        val sessionId: String,
        val taskId: String,
        val patch: RawJson,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.SYSTEM_TASK_UPDATED
    }

    /** A task finished and has output waiting. */
    data class SystemTaskNotification(
        val uuid: String,
        val sessionId: String,
        val taskId: String,
        val toolUseId: String,
        val status: String,
        val outputFile: String,
        val summary: String,
        val usage: RawJson? = null,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.SYSTEM_TASK_NOTIFICATION
    }

    /**
     * The CLI asking the host to decide a tool call — only `can_use_tool`. The codec places a
     * `control_request` here only when `request.subtype` is `can_use_tool`; any other subtype
     * (`mcp_message`, `hook_callback`, …) is counted as [UnknownKind] so it never becomes a pending
     * approval nobody can answer.
     *
     * [request] stays a whole [RawJson]: its `input`, `permission_suggestions`, question text and
     * options are provider-shaped content and stay unopened by core. The
     * three scalar fields below are lifted from the `request` object's top level as a *forward
     * evolution* of the type so that the fold can
     * attribute and classify a pending approval without opening that `RawJson`:
     *  - [toolName] decides the [ApprovalKind] (`AskUserQuestion` → ASK, else APPROVAL).
     *  - [toolUseId] is the optional tool correlation; null still keeps the approval by
     *    [requestId].
     *  - [agentId] attributes a subagent-issued approval to its `task_id`; null
     *    means the main conversation issued it.
     */
    data class ControlRequest(
        val requestId: String,
        val request: RawJson,
        val agentId: String? = null,
        val toolName: String? = null,
        val toolUseId: String? = null,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.CONTROL_REQUEST
    }

    /**
     * `system/commands_changed`: the slash-command list changed. [commands] is the whole new list and
     * stays [RawJson]; the fold does not keep it (it belongs to the projection and the UI).
     */
    data class SystemCommandsChanged(
        val uuid: String,
        val sessionId: String,
        val commands: RawJson,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.SYSTEM_COMMANDS_CHANGED
    }

    /**
     * `system/compact_boundary`: a conversation compaction happened. [compactMetadata] (`trigger`,
     * `pre_tokens`, …) stays [RawJson]; the fold does not keep it.
     */
    data class SystemCompactBoundary(
        val uuid: String,
        val sessionId: String,
        val compactMetadata: RawJson,
        val logicalParentUuid: String? = null,
    ) : Known {
        override val kind: AgentEventKind get() = AgentEventKind.SYSTEM_COMPACT_BOUNDARY
    }

    /**
     * A well-formed JSON line whose `type` is not one of the eighteen, or one that is missing a field
     * the declared shape needs. Kept whole so that whatever arrives can be read back later.
     *
     * This is the version-drift alarm: a CLI upgrade that adds a line kind shows up here rather than
     * disappearing.
     */
    data class UnknownKind(
        val wireType: String,
        val raw: RawJson,
    ) : AgentEvent

    /**
     * A line that is not JSON at all. Distinct from [UnknownKind] because the cause is different — a
     * new line kind means the CLI moved, while a broken line means the transport or the scrubber
     * damaged the stream — and so is the response.
     */
    data class BrokenLine(
        val line: String,
        val reason: String,
    ) : AgentEvent
}
