package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.interfaces.Clock
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.Attachment
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.services.Interrupt
import dev.ukitomato.closta.core.services.ReconnectMcpServer
import dev.ukitomato.closta.core.services.RequestContextUsage
import dev.ukitomato.closta.core.services.RequestMcpStatus
import dev.ukitomato.closta.core.services.RequestSettings
import dev.ukitomato.closta.core.services.RespondToApproval
import dev.ukitomato.closta.core.services.RewindFiles
import dev.ukitomato.closta.core.services.SendMessage
import dev.ukitomato.closta.core.services.SetMcpServerEnabled
import dev.ukitomato.closta.core.services.StopTask
import dev.ukitomato.closta.core.services.SwitchEffort
import dev.ukitomato.closta.core.services.SwitchModel
import dev.ukitomato.closta.core.services.SwitchPermissionMode
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.ApplyRecord
import dev.ukitomato.closta.presenter.view.AttachmentRecord
import dev.ukitomato.closta.presenter.view.AttachmentRefusal
import dev.ukitomato.closta.presenter.view.ChangedFile
import dev.ukitomato.closta.presenter.view.ControlKind
import dev.ukitomato.closta.presenter.view.FileSearchRecord
import dev.ukitomato.closta.presenter.view.PassedOn
import dev.ukitomato.closta.presenter.view.PresenterInput
import dev.ukitomato.closta.presenter.view.REWIND_UNKNOWN_MESSAGE
import dev.ukitomato.closta.presenter.view.ResumeRefusal
import dev.ukitomato.closta.presenter.view.SelectionRecord
import dev.ukitomato.closta.presenter.view.turnsSoFar
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * The use cases (and StopTask), assembled for one running session — its [AgentSession] and the real [Clock]. This
 * is their composition root: one set per session, because the service holds many sessions
 * and a tab is only a view.
 */
@Suppress("TooManyFunctions") // one function per command the host gives the session
class SessionCommands internal constructor(
    session: AgentSession,
    private val clock: Clock,
    private val conversation: ConversationStore,
    /**
     * Called after a user message is in the transcript and before it is written to the CLI (it saves the
     * IDE's unsaved documents). By default nothing.
     */
    private val beforeSend: suspend () -> Unit = {},
    /** Where the type of an exception [beforeSend] threw is written (never its words). */
    private val log: (String) -> Unit = {},
) {
    private val send = SendMessage(session)
    private val respond = RespondToApproval(session, clock)
    private val switch = SwitchModel(session)
    private val modeUseCase = SwitchPermissionMode(session)
    private val usageUseCase = RequestContextUsage(session)
    private val settingsUseCase = RequestSettings(session)
    private val effortUseCase = SwitchEffort(session)
    private val mcpStatusUseCase = RequestMcpStatus(session)
    private val mcpEnabledUseCase = SetMcpServerEnabled(session)
    private val mcpReconnectUseCase = ReconnectMcpServer(session)
    private val rewindUseCase = RewindFiles(session)
    private val stop = Interrupt(session)
    private val stopTaskUseCase = StopTask(session)

    /**
     * Sends a user message the webview shows as [messageId]: the message goes into the transcript first, under the
     * store's lock, so it stands before anything the CLI says about the turn.
     */
    suspend fun sendMessage(
        messageId: String,
        text: String,
        attachments: List<Attachment> = emptyList(),
    ) {
        // The transcript keeps the point of each file (its name, kind, size and where it was), never its bytes.
        val noted =
            attachments.map { AttachmentRecord(it.name, it.kind, it.mediaType, it.bytes.size.toLong(), it.path) }
        // The uuid the CLI is told the message by; the transcript keeps which message it is, to name it later.
        val uuid = UUID.randomUUID().toString()
        conversation.transition { it.sent(PresenterInput.UserSent(messageId, text, noted, uuid)) }
        beforeSending()
        send(text, attachments, uuid)
    }

    // A way in that fails is not a reason to hold the message back: the CLI reads the disk's version of a document.
    private suspend fun beforeSending() {
        try {
            beforeSend()
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            log("claude session: the step before sending threw (${failure.javaClass.name}); sending anyway")
        }
    }

    /**
     * Answers a pending approval; the resolved state is written under the same lock the event fold takes.
     * [passedOn] is what goes to the CLI with an allow ([PassedOn.updatedPermissions], a JSON array) and is shown on
     * the approval once it is answered (the accepted suggestions, the input it ran with).
     *
     * An answer the CLI took but the transcript could not record is not an answer that failed: it is thrown as
     * [AnswerNotRecorded], so the caller does not offer the approval again to be answered a second time. Core's state
     * without the approval is kept all the same (only the transcript's record of the answer is missing).
     */
    suspend fun respondToApproval(
        decision: ApprovalDecision,
        requestedAt: Instant,
        payload: String? = null,
        passedOn: PassedOn = PassedOn(),
    ) = conversation.transition { view ->
        // An approval already answered (a second click, a key pressed twice) is not answered to the CLI again: the
        // check is under the store's lock, so two answers at once still make one.
        if (view.conversation.pendingApprovals.none { it.requestId == decision.requestId }) return@transition view
        val after = respond(view.conversation, decision, requestedAt, payload, passedOn.updatedPermissions)
        try {
            val elapsedMs = Duration.between(requestedAt, clock.now()).toMillis().coerceAtLeast(0)
            view.decided(after, decision, elapsedMs, passedOn)
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            // The CLI has the answer, so core's state must no longer hold the approval, whatever the transcript did.
            throw CommitThenFail(view.copy(conversation = after), AnswerNotRecorded(failure))
        }
    }

    /** An answer for [approvalId] could not be passed on: the approval says so, in the host's one fixed sentence. */
    suspend fun answerFailed(approvalId: String) =
        conversation.transition { it.answerFailed(approvalId, ANSWER_FAILED) }

    /** The host's answer to the webview's file query goes into the view, to become the thread's fileSearch. */
    suspend fun filesFound(search: FileSearchRecord) = conversation.transition { it.filesFound(search) }

    /** The host's answer to the webview's request for the selection goes into the view. */
    suspend fun selectionCaptured(selection: SelectionRecord) =
        conversation.transition { it.selectionCaptured(selection) }

    /** The host's answer to the webview's `apply-code` goes into the view. */
    suspend fun codeApplied(applied: ApplyRecord) = conversation.transition { it.codeApplied(applied) }

    /** What the turn that answered the user message [askKey] changed on disk, as the host found it. */
    suspend fun turnChangesFound(
        askKey: String,
        files: List<ChangedFile>,
        more: Boolean = false,
    ) = conversation.transition { it.requested(PresenterInput.TurnChangesFound(askKey, files, more)) }

    /**
     * Changes the model live. The request is made under an id of the host's own, and is folded into the view as
     * pending **before** it is written: the CLI's answer carries the same id, and can be folded only after the request
     * it answers is known. A write that throws (a session already closed) is recorded as failed, and thrown again.
     */
    suspend fun switchModel(model: String) = requested(ControlKind.MODEL, model) { switch(model, it) }

    /** Changes the permission mode live, as [switchModel] does. */
    suspend fun switchMode(mode: String) = requested(ControlKind.MODE, mode) { modeUseCase(mode, it) }

    /** Asks the CLI how much of the context window is used, as [switchModel] does. */
    suspend fun requestContextUsage() = requested(ControlKind.CONTEXT, null) { usageUseCase(it) }

    /**
     * Asks the CLI for the settings in effect, as [switchModel] does; the answer is the view's effort and model.
     */
    suspend fun requestSettings() = requested(ControlKind.SETTINGS, null) { settingsUseCase(it) }

    /**
     * Changes the effort live, as [switchModel] does: the CLI uses it from its next request, so a turn that
     * runs is not in the way. The settings are asked for again once the CLI says it took it (SessionRuntime).
     */
    suspend fun switchEffort(effort: String) = requested(ControlKind.EFFORT, effort) { effortUseCase(effort, it) }

    /** Asks the CLI which MCP servers the session has, as [switchModel] does; the answer is the view's list. */
    suspend fun requestMcpStatus() = requested(ControlKind.MCP_STATUS, null) { mcpStatusUseCase(it) }

    /**
     * Turns the MCP server [name] on or off, as [switchModel] does. [enabled] is the wanted value, so the same
     * command twice leaves the same state; the record is of the server's name.
     */
    suspend fun setMcpServerEnabled(
        name: String,
        enabled: Boolean,
    ) = requested(if (enabled) ControlKind.MCP_ENABLE else ControlKind.MCP_DISABLE, name) {
        mcpEnabledUseCase(name, enabled, it)
    }

    /** Reconnects the MCP server [name], as [switchModel] does. */
    suspend fun reconnectMcpServer(name: String) =
        requested(ControlKind.MCP_RECONNECT, name) { mcpReconnectUseCase(name, it) }

    /**
     * Asks the CLI to put the files back as they were before the message the webview shows as [messageId], or with
     * [dryRun] what would change. The request is made under an id of the host's own and folded into the view
     * as pending **before** it is written, as [switchModel] does. A message the view has no uuid for is recorded as not
     * sent (a failed answer), and a write that throws is recorded as failed and thrown again. The first guard is not
     * the rule of when a rewind is allowed (that is `rewindRefusal`, which the bridge applies before it calls this): it
     * covers a message that went away between the bridge's check and this transition.
     */
    suspend fun rewindFiles(
        commandId: String,
        messageId: String,
        dryRun: Boolean,
    ) {
        val id = UUID.randomUUID().toString()
        var uuid: String? = null
        conversation.transition { view ->
            uuid = view.transcript.userUuids[messageId]
            if (uuid == null) {
                view.requested(PresenterInput.RewindNotSent(commandId, messageId, dryRun, REWIND_UNKNOWN_MESSAGE))
            } else {
                val sends = view.transcript.routing.sends
                val turns = turnsSoFar(view.conversation)
                view.requested(PresenterInput.RewindRequested(id, commandId, messageId, dryRun, sends, turns))
            }
        }
        val target = uuid ?: return
        try {
            rewindUseCase(target, dryRun, id)
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            conversation.transition { it.requested(PresenterInput.ControlSendFailed(id)) }
            throw failure
        }
    }

    /** Records that the rewind [commandId] was not sent to the CLI, and why [reason]. */
    suspend fun rewindNotSent(
        commandId: String,
        messageId: String,
        dryRun: Boolean,
        reason: String,
    ) = conversation.transition { it.requested(PresenterInput.RewindNotSent(commandId, messageId, dryRun, reason)) }

    /** Records that the restart for [effort] was refused because a turn is running. */
    suspend fun refuseEffort(effort: String) {
        val id = UUID.randomUUID().toString()
        conversation.transition { it.requested(PresenterInput.EffortRefused(id, effort)) }
    }

    /** Records that a message was not sent because of its attachments, and why. */
    suspend fun refuseAttachment(reason: AttachmentRefusal) {
        val id = UUID.randomUUID().toString()
        conversation.transition { it.requested(PresenterInput.AttachmentRefused(id, reason)) }
    }

    /** Records that opening the saved session [sessionId] was refused, and why [reason]. */
    suspend fun refuseResume(
        sessionId: String,
        reason: ResumeRefusal = ResumeRefusal.TURN,
    ) {
        val id = UUID.randomUUID().toString()
        conversation.transition { it.requested(PresenterInput.ResumeRefused(id, sessionId, reason)) }
    }

    private suspend fun requested(
        kind: ControlKind,
        value: String?,
        write: suspend (String) -> Unit,
    ) {
        val id = UUID.randomUUID().toString()
        conversation.transition { it.requested(PresenterInput.ControlRequested(id, kind, value)) }
        try {
            write(id)
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            // A write that did not happen is not an answer to wait for. The bridge logs the failure's type: the
            // sentence of what happened is not kept here.
            conversation.transition { it.requested(PresenterInput.ControlSendFailed(id)) }
            throw failure
        }
    }

    /** Stops the turn: the view knows first (it shows "Stopping…" and ends the turn at the next `result`). */
    suspend fun interrupt() {
        conversation.transition { it.requested(PresenterInput.StopRequested) }
        stop()
    }

    /** Stops one running task by the CLI's own id. */
    suspend fun stopTask(taskId: String) = stopTaskUseCase(taskId)

    companion object {
        /** What an approval says when its answer could not be passed on: fixed, never the text of an exception. */
        val ANSWER_FAILED: String get() = ClostaBundle.message("session.answerFailed")
    }
}

/**
 * The conversation of one session — core's state and the transcript of it ([SessionView]) — with every write
 * serialised: the event fold and an approval's resolution both read the current state and replace it, and without one
 * lock between them a write computed from an older state would drop events folded meanwhile.
 */
internal class ConversationStore {
    private val lock = Mutex()
    private val views = MutableStateFlow(SessionView())
    private val states = MutableStateFlow(ConversationState())

    /** Core's state alone. */
    val state: StateFlow<ConversationState> = states.asStateFlow()

    /** Core's state and the transcript, always from the same write. */
    val view: StateFlow<SessionView> = views.asStateFlow()

    suspend fun transition(step: suspend (SessionView) -> SessionView) {
        lock.withLock {
            val next =
                try {
                    step(views.value)
                } catch (partial: CommitThenFail) {
                    publish(partial.view)
                    throw partial.failure
                }
            publish(next)
        }
    }

    private fun publish(next: SessionView) {
        views.value = next
        states.value = next.conversation
    }
}

/** A step that failed after part of its write was certain: [view] is written all the same, and [failure] is thrown. */
internal class CommitThenFail(
    val view: SessionView,
    val failure: Throwable,
) : RuntimeException(null, failure)

/**
 * The CLI was given the answer, and the host's record of it then failed. Not a failed answer: the approval is not to be
 * answered again, so this is a type of its own for the caller to tell from a write that did not go through. The
 * cause is kept for a log of its type only; its message may carry the conversation.
 */
class AnswerNotRecorded(
    cause: Throwable,
) : RuntimeException("the answer was passed on but could not be recorded", cause)
