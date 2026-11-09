package dev.ukitomato.closta.core.models

/**
 * The domain state of one conversation, folded from a stream of [AgentEvent]s.
 *
 * What core keeps and what it deliberately does not is the whole point of this type. It keeps the
 * *domain* — who is in session, which turns opened and closed, what the session has cost, which
 * subagent and background tasks are running, the latest thinking-token estimate, and any notices —
 * and it keeps nothing of the *display*: no message text, no thinking prose, no tool arguments or
 * results. Those live in a provider-shaped `RawJson` on the events, and pulling them apart here would
 * drag one CLI's content vocabulary into `core/models`, the layer that is meant to outlive it. The
 * presenter projects that content from the same events; core never reconstructs it.
 *
 * The type is immutable: every field is a `val`, and [ConversationFold.fold] returns a new value
 * rather than mutating one, which is what makes folding the same events twice give the same state.
 */
data class ConversationState(
    /** Session metadata, or `null` until a `system/init` establishes it. */
    val session: SessionInfo? = null,
    /** Turns in arrival order, each correlated by its `command_uuid`. */
    val turns: List<Turn> = emptyList(),
    /** Session-level usage figures. */
    val usage: Usage = Usage(),
    /** Subagent and background tasks in arrival order, correlated by `task_id`. */
    val tasks: List<Task> = emptyList(),
    /**
     * The latest thinking-token estimate, per assistant message and non-cumulative, so it is
     * *replaced* on each `system/thinking_tokens` rather than accumulated (`AgentEvent.kt` doc on
     * [AgentEvent.SystemThinkingTokens]). `null` until one arrives.
     */
    val thinkingEstimate: Long? = null,
    /** Notices raised while folding (errors and the like), in arrival order. */
    val notices: List<Notice> = emptyList(),
    /**
     * How many `result` lines arrived that closed no turn — a `user_message_uuid` that is null or
     * matches no open turn, i.e. a background completion that resumed the conversation on its own.
     * Kept as its own figure because "a turn the user started" and "a turn the CLI resumed" are a
     * distinction the domain must not lose, and
     * because it is the positive evidence that such a `result` did *not* close a turn.
     */
    val spontaneousResumeCount: Int = 0,
    /**
     * Unanswered host-input requests in arrival order — the approvals and questions the CLI is
     * currently blocking on. Holds only the *pending* ones: a resolved, timed-out or discarded
     * request is removed rather than kept as a terminal state, so an empty list is the positive
     * evidence that "the approval queue is empty" at the end of a conversation.
     * The `control_request`'s content stays in its `RawJson` and never lands here.
     */
    val pendingApprovals: List<PendingApproval> = emptyList(),
)

/**
 * Session metadata, built from the *typed* top-level fields of `system/init` only. The wide nested
 * fields (`tools`, `agents`, `mcp_servers`, …) stay as `RawJson` on the event and are not opened
 * here — they are provider-shaped and belong to the provider, not to core.
 */
data class SessionInfo(
    val sessionId: String,
    val model: String,
    val permissionMode: String,
    val cwd: String,
    /** The CLI version, from `system/init.claude_code_version`. */
    val version: String,
)

/**
 * One turn — a single request/response round the CLI ran, identified by its `command_uuid`.
 *
 * A turn opens on `command_lifecycle{queued|started}` and closes only on a `result` that names this turn's
 * `command_uuid` in `user_message_uuid` or `user_message_uuids`. `command_lifecycle{completed}` is *not* a
 * terminator.
 *
 * [incompleteReason] is per-turn and correlates cleanly by `command_uuid`: when the correlated
 * `result` closes this turn it carries `result.is_error` here — the reason string when the turn
 * failed, `null` when it succeeded. A turn that is [TurnPhase.CLOSED] with a
 * non-null reason is a failed turn, which the presenter projects to `incomplete{reason}`. This is distinct from
 * the conversation-level [ConversationState.spontaneousResumeCount] (self-resumes carry no
 * per-turn correlation and are never attributed to a turn) and from the task-level
 * [Task.incompleteReason].
 */
data class Turn(
    val commandUuid: String,
    val phase: TurnPhase,
    val incompleteReason: String? = null,
    /** The CLI's `command_lifecycle` said `completed` while the turn was open (a message taken into another turn). */
    val lifecycleDone: Boolean = false,
)

/** Whether a [Turn] is still open or has been closed by its correlated `result`. */
enum class TurnPhase {
    OPEN,
    CLOSED,
}

/**
 * A subagent or background task, correlated by `task_id`.
 *
 * The parent is held by id — [parentToolUseId] is the `tool_use_id` of the `Agent` tool call that
 * spawned it — never by array index, so that a subagent tool inserted mid-stream cannot break a path.
 * The presenter nests these under `ToolCallMessagePart.messages` by following the same id.
 */
data class Task(
    val taskId: String,
    val parentToolUseId: String?,
    val subagentType: String?,
    val isBackgrounded: Boolean,
    val spawnDepth: Int?,
    val status: TaskStatus,
    /** Present only when [status] is [TaskStatus.INCOMPLETE]; the reason the task did not complete. */
    val incompleteReason: String? = null,
)

/**
 * The lifecycle value of a [Task], chosen to be *isomorphic* to assistant-ui's
 * `ToolCallMessagePartStatus` (`running` / `complete` / `incomplete(reason)`) so the presenter can project it
 * mechanically, without core importing any assistant-ui type (impossible across Kotlin/TS, and core stays
 * free of UI types). `requires-action` (approval) is not modelled here: pending approvals are their own state.
 */
enum class TaskStatus {
    RUNNING,
    COMPLETE,
    INCOMPLETE,
}

/** Session-level usage. Per-turn token totals are out of scope (they are `RawJson`). */
data class Usage(
    /**
     * The session running total in USD, from `result.total_cost_usd`. It is a session cumulative
     * figure, so folding *replaces* it rather than adding. `0.0` until a
     * `result` arrives.
     */
    val sessionCostUsd: Double = 0.0,
)

/** Something worth surfacing that is not itself a turn/task/usage change — so far, errors. */
data class Notice(
    val kind: NoticeKind,
    val message: String,
    /**
     * The `request_id` of the control request a [NoticeKind.CONTROL_ERROR] answers, so the host can
     * match it to what it sent. `null` for every other kind.
     */
    val requestId: String? = null,
)

/** The kind of a [Notice]. */
enum class NoticeKind {
    ERROR,

    /** A control request the host sent was answered with an error (`control_response` subtype `error`). */
    CONTROL_ERROR,
}
