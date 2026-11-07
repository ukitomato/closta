package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.openapi.Disposable
import com.intellij.openapi.components.service
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.project.Project
import dev.ukitomato.closta.core.models.Attachment
import dev.ukitomato.closta.platforms.intellij.session.ClaudeSessionService
import dev.ukitomato.closta.platforms.intellij.session.SessionNotice
import dev.ukitomato.closta.platforms.intellij.session.SessionRuntime
import dev.ukitomato.closta.platforms.intellij.session.SessionStatus
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.platforms.intellij.thread.CardAnswer
import dev.ukitomato.closta.presenter.view.RewindOutcome
import dev.ukitomato.closta.presenter.view.RewindRecord
import dev.ukitomato.closta.presenter.view.threadIsRunning
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Where a conversation on screen comes from: a real session, or a fixed one the dev tools push to. Disposing it ends
 * it (a real session is closed). Never logs what is said.
 */
@Suppress("TooManyFunctions") // one function per command the screen sends
interface ChatSource : Disposable {
    val sessionId: String
    val title: String
    val view: StateFlow<SessionView>
    val notice: StateFlow<SessionNotice?>
    val canSend: StateFlow<Boolean>

    /** Whether it is still starting: when it cannot send, that tells "starting" from "ended". */
    val starting: Boolean

    /** Where its CLI runs (a worktree's folder, or the project's); null when it has none. */
    val workingDirectory: String?

    /** Whether it has something to draw as soon as it opens (a resume): only then is "first draw" measured. */
    val opensWithContent: Boolean

    /** The provider its CLI was started with, shown in the header; null when it has no CLI. */
    val providerName: String? get() = null

    suspend fun send(
        text: String,
        attachments: List<Attachment>,
    )

    suspend fun switchModel(model: String)

    suspend fun switchEffort(effort: String)

    suspend fun switchMode(mode: String)

    suspend fun respond(answer: CardAnswer)

    suspend fun interrupt()

    suspend fun stopTask(taskId: String)

    /** Asks the CLI for its MCP servers; the answer is the view's list. */
    suspend fun requestMcpStatus()

    suspend fun setMcpServerEnabled(
        name: String,
        enabled: Boolean,
    )

    suspend fun reconnectMcpServer(name: String)

    /**
     * Asks the CLI to put the files back as they were before the ask [messageId] and waits for its answer: the record
     * of it, or null when the session is not running or no answer came in time.
     */
    suspend fun rewindFiles(messageId: String): RewindRecord?

    /** A real `claude` session, opened through [ClaudeSessionService]. */
    @Suppress("TooManyFunctions") // one override per command
    class Live(
        private val project: Project,
        val runtime: SessionRuntime,
        override val title: String,
        override val opensWithContent: Boolean,
        override val providerName: String? = null,
    ) : ChatSource {
        private val scope = project.service<ClaudeSessionService>().viewScope(this)
        override val sessionId: String get() = runtime.id
        override val view: StateFlow<SessionView> = runtime.view
        override val notice: StateFlow<SessionNotice?> =
            runtime.status
                .map(SessionNotice::of)
                .stateIn(scope, SharingStarted.Eagerly, SessionNotice.of(runtime.status.value))
        override val canSend: StateFlow<Boolean> =
            runtime.status.map { it is SessionStatus.Running }.stateIn(scope, SharingStarted.Eagerly, false)
        override val starting: Boolean get() = runtime.status.value is SessionStatus.Starting

        /** When each approval was first seen here: the answer tells the CLI how long the user took. */
        private val seen = ConcurrentHashMap<String, Instant>()

        /** The user messages sent whose turn's changes are still to be found. */
        private val unlooked: MutableSet<String> = ConcurrentHashMap.newKeySet()

        /** The user messages sent while a turn ran: their label goes down when their own turn starts. */
        private val waiting: MutableSet<String> = ConcurrentHashMap.newKeySet()
        private val changes = project.service<TurnChanges>()
        private val root: String? get() = runtime.workingDirectory ?: project.basePath
        override val workingDirectory: String? get() = root

        init {
            scope.launch {
                view.collect { now ->
                    for (pending in now.conversation.pendingApprovals) {
                        seen.putIfAbsent(pending.requestId, Instant.now())
                    }
                    for (ask in startedAsks(now.transcript, waiting)) {
                        waiting -= ask
                        root?.let { changes.begin(ask, it) }
                    }
                    for (ask in toLookAt(now.transcript, unlooked)) {
                        unlooked -= ask
                        scope.launch {
                            val found = changes.end(ask)
                            commands()?.turnChangesFound(ask, found.files, found.more)
                        }
                    }
                }
            }
        }

        private fun commands() = (runtime.status.value as? SessionStatus.Running)?.commands

        override suspend fun send(
            text: String,
            attachments: List<Attachment>,
        ) {
            val commands = commands() ?: return
            val folder = root ?: return
            // The message's key is the turn's ask. Its Local History label goes down before the CLI can change a file:
            // now when nothing runs, else when its own turn starts (the turn running now is still changing files).
            val ask = UUID.randomUUID().toString()
            val now = view.value
            if (threadIsRunning(now.conversation, now.transcript)) waiting += ask else changes.begin(ask, folder)
            unlooked += ask
            var sent = false
            try {
                commands.sendMessage(ask, text, attachments)
                sent = true
            } finally {
                if (!sent) forget(ask)
            }
        }

        private fun forget(ask: String) {
            unlooked -= ask
            waiting -= ask
            changes.drop(ask)
        }

        override suspend fun switchModel(model: String) {
            commands()?.switchModel(model)
        }

        override suspend fun switchEffort(effort: String) {
            commands()?.switchEffort(effort)
        }

        override suspend fun switchMode(mode: String) {
            commands()?.switchMode(mode)
        }

        override suspend fun respond(answer: CardAnswer) {
            val asked = seen.remove(answer.requestId) ?: Instant.now()
            val commands = commands()
            if (commands == null) {
                return
            }
            answerOrMarkFailed(
                { commands.respondToApproval(answer.decision, asked, answer.payload, answer.passedOn) },
                { commands.answerFailed(answer.requestId) },
                { thisLogger().warn(it) },
            )
        }

        override suspend fun interrupt() {
            commands()?.interrupt()
        }

        override suspend fun stopTask(taskId: String) {
            commands()?.stopTask(taskId)
        }

        override suspend fun requestMcpStatus() {
            commands()?.requestMcpStatus()
        }

        override suspend fun setMcpServerEnabled(
            name: String,
            enabled: Boolean,
        ) {
            commands()?.setMcpServerEnabled(name, enabled)
        }

        override suspend fun reconnectMcpServer(name: String) {
            commands()?.reconnectMcpServer(name)
        }

        override suspend fun rewindFiles(messageId: String): RewindRecord? {
            val commands = commands() ?: return null
            val id = UUID.randomUUID().toString()
            commands.rewindFiles(id, messageId, dryRun = false)
            return withTimeoutOrNull(REWIND_WAIT_MS) {
                view
                    .map { it.transcript.operations.rewind }
                    .first { it?.commandId == id && it.outcome != RewindOutcome.PENDING }
            }
        }

        override fun dispose() {
            unlooked.forEach(changes::drop)
            project.service<ClaudeSessionService>().close(runtime.id)
        }
    }
}

/** How long a rewind of the files waits for the CLI's answer. */
private const val REWIND_WAIT_MS = 30_000L
