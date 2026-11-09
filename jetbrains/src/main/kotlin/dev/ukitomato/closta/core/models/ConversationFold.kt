package dev.ukitomato.closta.core.models

/**
 * Folds one [AgentEvent] into a [ConversationState].
 *
 * `fold(state, event)` is a pure function: it reads no clock, is not `suspend`, imports nothing from
 * `core/interfaces`, and returns a fresh state rather than mutating one.
 * The same event sequence therefore always folds to the same final state.
 *
 * It reads only the *typed* top-level fields of an event. Every nested `RawJson` — an Anthropic
 * message, an SSE frame, a control payload, a task patch, a background-task set — is left unopened,
 * because opening it would pull provider-shaped content into `core/models`. That
 * is what keeps [ConversationState] free of any display content.
 *
 * It never throws. An [AgentEvent.UnknownKind] or [AgentEvent.BrokenLine] — or any event that carries
 * nothing this fold reflects — leaves the state untouched, because a reader that throws stops reading
 * and a stopped stdout reader deadlocks the CLI behind a full pipe.
 */
fun fold(
    state: ConversationState,
    event: AgentEvent,
): ConversationState =
    when (event) {
        is AgentEvent.SystemInit -> foldInit(state, event)
        is AgentEvent.CommandLifecycle -> foldLifecycle(state, event)
        is AgentEvent.Result -> foldResult(state, event)
        is AgentEvent.SystemThinkingTokens -> state.copy(thinkingEstimate = event.estimatedTokens)
        is AgentEvent.SystemTaskStarted -> foldTaskStarted(state, event)
        is AgentEvent.SystemTaskNotification -> foldTaskNotification(state, event)
        is AgentEvent.ControlRequest -> foldControlRequest(state, event)
        is AgentEvent.ControlResponse -> foldControlResponse(state, event)
        is AgentEvent.SystemStatus -> foldStatus(state, event)

        // Carries no typed top-level field that changes the domain state core keeps. Content lives in
        // RawJson (message / event / tool_use_result) and is the presenter's to project, not core's.
        is AgentEvent.Assistant,
        is AgentEvent.User,
        is AgentEvent.StreamEvent,
        is AgentEvent.SystemTaskProgress,
        is AgentEvent.RateLimitEvent,
        // Authority-free or RawJson-only: deliberately not opened.
        is AgentEvent.SystemTaskUpdated,
        is AgentEvent.SystemBackgroundTasksChanged,
        // Command list and compaction figures belong to the projection and the UI, not core.
        is AgentEvent.SystemCommandsChanged,
        is AgentEvent.SystemCompactBoundary,
        // The version-drift and transport alarms: never let them break the state.
        is AgentEvent.UnknownKind,
        is AgentEvent.BrokenLine,
        -> state
    }

/**
 * `system/init` is idempotent: it (re)establishes [SessionInfo] from typed fields and touches nothing
 * else. It arrives many times per session — on every self-resume — so resetting turns/tasks/usage
 * here would erase the conversation each time.
 */
private fun foldInit(
    state: ConversationState,
    event: AgentEvent.SystemInit,
): ConversationState =
    state.copy(
        session =
            SessionInfo(
                sessionId = event.sessionId,
                model = event.model,
                permissionMode = event.permissionMode,
                cwd = event.cwd,
                version = event.claudeCodeVersion,
            ),
    )

/**
 * A `control_response` whose subtype is `error` becomes a [NoticeKind.CONTROL_ERROR] notice carrying
 * the error text and the `request_id`, so the host can match it to the request it sent.
 * Any other response (success, or one that lifted no subtype) changes nothing.
 */
private fun foldControlResponse(
    state: ConversationState,
    event: AgentEvent.ControlResponse,
): ConversationState =
    if (event.subtype == CONTROL_ERROR_SUBTYPE) {
        state.copy(
            notices =
                state.notices +
                    Notice(NoticeKind.CONTROL_ERROR, event.error.orEmpty(), requestId = event.requestId),
        )
    } else {
        state
    }

/**
 * `system/status` carries the permission mode the CLI is effectively in. When there is a session the
 * session's mode is replaced by it, so an accepted permission suggestion or a successful
 * `set_permission_mode` reaches the state through this line. With no session yet
 * the line is dropped: the next `system/init` brings the current mode.
 */
private fun foldStatus(
    state: ConversationState,
    event: AgentEvent.SystemStatus,
): ConversationState {
    val mode = event.permissionMode
    val session = state.session
    return if (mode != null && session != null) {
        state.copy(session = session.copy(permissionMode = mode))
    } else {
        state
    }
}

/**
 * `command_lifecycle{queued|started}` opens a turn keyed by `command_uuid`, once — a `queued` then a
 * `started` for the same uuid is still one turn. `completed` is not a terminator and opens nothing:
 * it only marks an open turn [Turn.lifecycleDone]. A turn closes on a `result` that names it, and a
 * marked turn also closes with the turn whose `result` comes after its mark: a message sent mid-turn that the CLI
 * took into the running turn gets no `result` of its own (see [foldResult]).
 */
private fun foldLifecycle(
    state: ConversationState,
    event: AgentEvent.CommandLifecycle,
): ConversationState =
    when (event.state) {
        LIFECYCLE_QUEUED, LIFECYCLE_STARTED ->
            if (state.turns.any { it.commandUuid == event.commandUuid }) {
                state
            } else {
                state.copy(turns = state.turns + Turn(event.commandUuid, TurnPhase.OPEN))
            }
        LIFECYCLE_COMPLETED ->
            state.copy(
                turns =
                    state.turns.map {
                        if (it.phase == TurnPhase.OPEN && it.commandUuid == event.commandUuid) {
                            it.copy(lifecycleDone = true)
                        } else {
                            it
                        }
                    },
            )
        else -> state
    }

/**
 * A `result` always *replaces* the session cost (it is a session running total),
 * may raise an error notice, and closes the open turns it answered: those whose `command_uuid` is its
 * `user_message_uuid` or is in its `user_message_uuids`. Messages sent while a turn runs may be run together as the
 * next turn, whose `result` names only the last of them and lists them all; the others' lifecycle completes only after
 * that `result` (recorded with 2.1.319). When it closes a turn it carries `result.is_error` onto the
 * turn's [Turn.incompleteReason] — the reason string on failure, `null` on success.
 *
 * A `result` that names no open turn closes nothing and is counted as a
 * conversation-level spontaneous resume — closing there would discard an unanswered approval and hang
 * the CLI forever, and a self-resume carries no per-turn correlation so it is never attributed to a
 * turn.
 *
 * A `result` that closes a turn also *discards the pending approvals*: once the correlated `result`
 * arrives the CLI has stopped waiting on those requests, so keeping them would leave the approval queue
 * non-empty forever (as `discardPendingPermissions` does in the original TypeScript implementation). A failed
 * `result` (`is_error`) discards them as well, whether or not it closes a turn — a failure/interruption releases
 * everything (as its `releaseAll` does). A successful self-resume (closes no turn) does *not* discard: the
 * CLI is still blocking on those requests, and dropping them would hang it. There is no
 * per-turn key on a [PendingApproval] (the observed maximum outstanding is one), so
 * "that turn's pending" is the whole list.
 */
private fun foldResult(
    state: ConversationState,
    event: AgentEvent.Result,
): ConversationState {
    val withCost = state.copy(usage = state.usage.copy(sessionCostUsd = event.totalCostUsd))
    val withNotice =
        if (event.isError) {
            withCost.copy(notices = withCost.notices + Notice(NoticeKind.ERROR, event.result))
        } else {
            withCost
        }

    val named = event.userMessageUuids.orEmpty().toSet() + listOfNotNull(event.userMessageUuid)
    val closes = withNotice.turns.any { it.phase == TurnPhase.OPEN && it.commandUuid in named }
    val base =
        if (closes) {
            val reason = if (event.isError) event.result else null
            val closed =
                withNotice.turns.map { turn ->
                    // The turns the result names, and the messages taken in whose lifecycle completed already (an
                    // older CLI names only the first).
                    val answered = turn.commandUuid in named || turn.lifecycleDone
                    if (turn.phase == TurnPhase.OPEN && answered) {
                        turn.copy(phase = TurnPhase.CLOSED, incompleteReason = reason)
                    } else {
                        turn
                    }
                }
            withNotice.copy(turns = closed)
        } else {
            withNotice.copy(spontaneousResumeCount = withNotice.spontaneousResumeCount + 1)
        }

    val discardsPending = closes || event.isError
    return if (discardsPending && base.pendingApprovals.isNotEmpty()) {
        base.copy(pendingApprovals = emptyList())
    } else {
        base
    }
}

/**
 * A `control_request` enqueues a [PendingApproval] keyed by its typed [AgentEvent.ControlRequest.requestId]
 * (present on every one), so the fold never opens the `request` `RawJson` to place it.
 * The kind comes from the typed `tool_name` (`AskUserQuestion` → ASK,
 * else APPROVAL), and `agent_id`/`tool_use_id` ride along as attribution.
 *
 * A repeat of a `request_id` already pending is *not* enqueued twice (the duplicate guard of
 * `PermissionQueue.enqueue` in the original TypeScript implementation).
 */
private fun foldControlRequest(
    state: ConversationState,
    event: AgentEvent.ControlRequest,
): ConversationState {
    if (state.pendingApprovals.any { it.requestId == event.requestId }) return state
    val kind = if (event.toolName == ASK_USER_QUESTION) ApprovalKind.ASK else ApprovalKind.APPROVAL
    val pending =
        PendingApproval(
            requestId = event.requestId,
            kind = kind,
            toolUseId = event.toolUseId,
            agentId = event.agentId,
        )
    return state.copy(pendingApprovals = state.pendingApprovals + pending)
}

/**
 * `task_started` records a subagent/background task as running, keyed by `task_id`, with its parent
 * held by id (`tool_use_id` of the spawning `Agent`) — never by array index.
 *
 * A repeat of the same `task_id` refreshes a still-running record, but must **not demote an already
 * resolved one back to running**: `background_tasks_changed` is non-monotonic, so a `task_id` that has
 * already completed can reappear, and completion — decided by the typed
 * `task_notification.status` — is authoritative and outlives a late `task_started`.
 * So a task that is [TaskStatus.COMPLETE] or [TaskStatus.INCOMPLETE] is kept as it
 * is.
 */
private fun foldTaskStarted(
    state: ConversationState,
    event: AgentEvent.SystemTaskStarted,
): ConversationState {
    val started =
        Task(
            taskId = event.taskId,
            parentToolUseId = event.toolUseId,
            subagentType = event.subagentType,
            isBackgrounded = event.isBackgrounded,
            spawnDepth = event.spawnDepth,
            status = TaskStatus.RUNNING,
        )
    return state.copy(
        tasks =
            state.tasks.upsertById(started) { existing ->
                if (existing.status == TaskStatus.RUNNING) started else existing
            },
    )
}

/**
 * `task_notification` is the *authority* on completion: its typed `status` field decides the task's
 * outcome, so the `RawJson` `patch` on `task_updated` is never opened for this. A status
 * of `completed` resolves to [TaskStatus.COMPLETE]; anything else resolves to [TaskStatus.INCOMPLETE]
 * carrying that status as the reason. A notification for an unknown `task_id` is ignored.
 */
private fun foldTaskNotification(
    state: ConversationState,
    event: AgentEvent.SystemTaskNotification,
): ConversationState =
    state.copy(
        tasks =
            state.tasks.map { task ->
                if (task.taskId != event.taskId) {
                    task
                } else if (event.status == TASK_COMPLETED) {
                    task.copy(status = TaskStatus.COMPLETE, incompleteReason = null)
                } else {
                    task.copy(status = TaskStatus.INCOMPLETE, incompleteReason = event.status)
                }
            },
    )

/** Replaces the [Task] with the same `task_id`, or appends it, keeping arrival order stable. */
private fun List<Task>.upsertById(
    task: Task,
    update: (Task) -> Task,
): List<Task> =
    if (any { it.taskId == task.taskId }) {
        map { if (it.taskId == task.taskId) update(it) else it }
    } else {
        this + task
    }

private const val LIFECYCLE_QUEUED = "queued"
private const val LIFECYCLE_STARTED = "started"
private const val LIFECYCLE_COMPLETED = "completed"
private const val TASK_COMPLETED = "completed"
private const val CONTROL_ERROR_SUBTYPE = "error"
private const val ASK_USER_QUESTION = "AskUserQuestion"
