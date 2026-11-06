package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectCloseListener
import com.intellij.openapi.util.Disposer
import dev.ukitomato.closta.platforms.intellij.session.ClaudeSessionService
import dev.ukitomato.closta.platforms.intellij.session.SessionOpening
import dev.ukitomato.closta.platforms.intellij.session.savedId
import dev.ukitomato.closta.platforms.intellij.settings.ProviderPick
import dev.ukitomato.closta.platforms.intellij.settings.ProviderSettings
import dev.ukitomato.closta.platforms.intellij.settings.nameOf

/**
 * This project's open conversations, by session id, lent to the screens that show them. A session outlives its
 * screens: closing the last one leaves the CLI running, and the sessions list ([ChatDirectory]) still shows it. A
 * session is stopped from the list ([stop], [archive]) or when the project closes; those that ran then are marked
 * so the list offers to resume them when the project opens again ([wasRunningMarks]).
 *
 * Called on the EDT.
 */
@Service(Service.Level.PROJECT)
class ChatSessions(
    private val project: Project,
) : Disposable {
    private val sources = LinkedHashMap<String, ChatSource>()

    /** Whether the project is closing: its screens close then, and a session that runs says nothing of it. */
    @Volatile
    var closing = false
        private set

    private fun directory() = service<ChatDirectory>()

    /** Opens a real session in [workingDirectory] (the project's folder when null), lists it, and returns its id. */
    fun open(
        opening: SessionOpening,
        title: String,
        workingDirectory: String? = null,
        provider: ProviderPick = ProviderPick.Active,
    ): String {
        val runtime =
            project.service<ClaudeSessionService>().open(
                opening = opening,
                workingDirectory = workingDirectory,
                provider = provider,
            )
        val source =
            ChatSource.Live(
                project,
                runtime,
                title,
                opensWithContent = opening != SessionOpening.New,
                providerName = service<ProviderSettings>().nameOf(provider),
            )
        // A session that ran when the project last closed and is resumed now is no longer only a mark.
        opening.savedId?.let(project::clearWasRunningMark)
        adopt(source)
        directory().register(project, source)
        return source.sessionId
    }

    /** Holds [source] like a session it opened, without listing it (the benchmark's fixed conversation). */
    fun adopt(source: ChatSource): String {
        sources[source.sessionId] = source
        return source.sessionId
    }

    fun source(sessionId: String): ChatSource? = sources[sessionId]

    fun lease(sessionId: String): ViewLeases.Lease = directory().leases.lease(sessionId)

    /** Stops the session's CLI and takes it out of the list; a screen still showing it shows it ended. */
    fun stop(sessionId: String) {
        directory().unregister(sessionId)
        sources.remove(sessionId)?.let(Disposer::dispose)
    }

    /**
     * Stops the session as the user asked from the screen. One in another folder than the project's (a worktree) with a
     * conversation leaves a mark first, so the list still offers to resume it: the saved list reads only the project's.
     */
    fun stopFromScreen(sessionId: String) {
        val source = sources[sessionId]
        val messages =
            source
                ?.view
                ?.value
                ?.transcript
                ?.messages
                ?.size ?: 0
        if (source != null && marksOnStop(source.workingDirectory, project.basePath, messages)) {
            project.markStopped(sessionId, WasRunningMark(source.workingDirectory, source.title))
        }
        stop(sessionId)
    }

    /** Stops the session and hides it from the list (its saved conversation stays). */
    fun archive(sessionId: String) = directory().archive(sessionId)

    /**
     * Moves [sessionId] through [moveChat]. The bridging lease is returned two EDT turns later, after the IDE has made
     * the new place (an editor tab may be made after openFile returns).
     */
    fun move(
        sessionId: String,
        openNew: () -> Boolean,
        closeOld: () -> Unit,
    ): Boolean =
        moveChat(directory().leases, sessionId, openNew, closeOld) { release ->
            ApplicationManager.getApplication().invokeLater { ApplicationManager.getApplication().invokeLater(release) }
        }

    init {
        // The marks are written while the project closes and before its services are disposed: by then the IDE has
        // cancelled the sessions' scopes, so their status no longer says they ran.
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            ProjectCloseListener.TOPIC,
            object : ProjectCloseListener {
                override fun projectClosing(project: Project) {
                    if (project != this@ChatSessions.project) return
                    closing = true
                    markWasRunning(project, sources.values)
                }
            },
        )
    }

    // The project closes: the sessions still open are marked again (in case the close came without projectClosing),
    // then every session is stopped.
    override fun dispose() {
        val open = sources.toMap()
        markWasRunning(project, open.values)
        sources.clear()
        open.forEach { (id, source) ->
            directory().unregister(id)
            Disposer.dispose(source)
        }
    }
}

/** Marks the sessions of [sources] whose CLI was alive and had a conversation, so the list offers to resume them. */
private fun markWasRunning(
    project: Project,
    sources: Collection<ChatSource>,
) {
    val open =
        sources.filterIsInstance<ChatSource.Live>().map { live ->
            OpenAtClose(
                live.sessionId,
                aliveAtClose(live.runtime.status.value),
                live.view.value.transcript.messages.size,
                live.workingDirectory?.takeIf { it != project.basePath },
                live.title.takeIf { live.workingDirectory != project.basePath },
            )
        }
    project.saveWasRunningMarks(marksAtClose(project.wasRunningMarks(), open))
}
