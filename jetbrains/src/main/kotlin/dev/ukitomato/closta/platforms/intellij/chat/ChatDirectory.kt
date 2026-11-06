package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.EDT
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import dev.ukitomato.closta.core.interfaces.Clock
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.platforms.intellij.session.SystemClock
import dev.ukitomato.closta.platforms.intellij.sessions.badgeEveryWindow
import dev.ukitomato.closta.platforms.intellij.sessions.waitingCount
import dev.ukitomato.closta.platforms.intellij.store.AppSettingsStore
import dev.ukitomato.closta.presenter.view.GroupSince
import dev.ukitomato.closta.presenter.view.SessionSummary
import dev.ukitomato.closta.presenter.view.groupSinceAfter
import dev.ukitomato.closta.presenter.view.sessionSummary
import dev.ukitomato.closta.presenter.view.sessionTitle
import dev.ukitomato.closta.presenter.view.threadIsRunning
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.nio.file.Path
import java.time.Instant

/**
 * Every open session of every open project, for the sessions list, its badge and the notifications, which work across
 * windows. A project's [ChatSessions] registers the sessions it opens and unregisters those it stops; this keeps, for
 * each, whether it is unread and what the list shows of it. The screens lease their sessions here ([lease]), so whether
 * a session is in view is known across projects too.
 *
 * Archiving hides a session from the list and stops it; the saved conversation stays, so it can be resumed. The ids of
 * the archived sessions are kept in the application's settings.
 *
 * State changes on the EDT; [entries] may be read from any thread.
 */
@Service(Service.Level.APP)
class ChatDirectory(
    private val scope: CoroutineScope,
) : Disposable {
    /**
     * One session in the list. [summary] is its group and the reason it waits; [head] its repository and branch;
     * [since] when it came under its heading in the sessions window, so reading it keeps the time it finished (null
     * when unknown: it was already there when it was registered).
     */
    data class Entry(
        val project: Project,
        val sessionId: String,
        val source: ChatSource,
        val title: String,
        val summary: SessionSummary,
        val unread: Boolean,
        val head: GitHead?,
        val since: Instant? = null,
    )

    internal class Registered(
        val project: Project,
        val source: ChatSource,
        val job: Job,
        var running: Boolean,
        var unread: Boolean = false,
        var head: GitHead? = null,
    ) {
        /** When the session came under its heading; its time is null if it was there at the start. */
        var since: GroupSince? = null
    }

    private val clock = SystemClock()
    private val registered = LinkedHashMap<String, Registered>()
    private val state = MutableStateFlow<List<Entry>>(emptyList())
    private val archived = SessionMarks.decode(settings().get(ARCHIVED)).toMutableSet()

    /** The screens that show each session, in every project. */
    val leases =
        ViewLeases(::visibilityChanged) { sessionId ->
            // The last screen closed: a session that still runs goes on, and says so (not while its project closes).
            val session = registered[sessionId]?.takeIf { it.running && !it.project.isDisposed }
            if (session != null && !session.project.service<ChatSessions>().closing) {
                state.value.firstOrNull { it.sessionId == sessionId }?.let(alerts::keepsRunning)
            }
        }

    /** What the list shows, in the order the sessions were opened; archived ones are not in it. */
    val entries: StateFlow<List<Entry>> = state.asStateFlow()

    /** Listeners told on the EDT after a session's view changed in a way the list or the notifications care about. */
    private val viewListeners = mutableListOf<(Entry, SessionView) -> Unit>()

    // The notifications about the sessions out of view: they listen to this directory until it is disposed.
    private val alerts = SessionAlerts(this, scope, this)

    init {
        scope.launch {
            entries.map(::waitingCount).distinctUntilChanged().collect { waiting ->
                withContext(Dispatchers.EDT) { badgeEveryWindow(waiting) }
            }
        }
    }

    /** Adds the session [source] of [project] to the list; one that was archived is shown again (it was resumed). */
    fun register(
        project: Project,
        source: ChatSource,
    ) {
        val id = source.sessionId
        if (archived.remove(id)) saveArchived(archived)
        val view = source.view.value
        val job =
            scope.launch {
                source.view
                    .map { now -> Change(now, threadIsRunning(now.conversation, now.transcript), waitingIds(now)) }
                    .distinctUntilChanged { a, b -> a.running == b.running && a.waiting == b.waiting }
                    .collect { change -> withContext(Dispatchers.EDT) { changed(id, change) } }
            }
        val group = sessionSummary(view.conversation, view.transcript, false).group
        val session = Registered(project, source, job, threadIsRunning(view.conversation, view.transcript))
        session.since = groupSinceAfter(null, group, clock.now())
        registered[id] = session
        publish()
        scope.launch {
            val head = (source.workingDirectory ?: project.basePath)?.let { GitHead.of(Path.of(it)) }
            withContext(Dispatchers.EDT) {
                registered[id]?.let {
                    it.head = head
                    publish()
                }
            }
        }
    }

    /** Takes the session out of the list (it was stopped, or its project closed). */
    fun unregister(sessionId: String) {
        registered.remove(sessionId)?.job?.cancel()
        publish()
    }

    fun markRead(sessionId: String) {
        val session = registered[sessionId] ?: return
        if (!session.unread) return
        session.unread = false
        publish()
    }

    /** Stops the session and hides it from the list; its saved conversation stays. */
    fun archive(sessionId: String) {
        archived += sessionId
        saveArchived(archived)
        val session = registered[sessionId]
        if (session == null) {
            publish()
        } else {
            session.project.service<ChatSessions>().stop(sessionId)
        }
    }

    /**
     * Whether the user sees the session: a screen of it is shown in the active window (its lease says so; any window:
     * the project's frame, an editor window of its own, a floating tool window).
     */
    fun isVisible(sessionId: String): Boolean = leases.isVisible(sessionId)

    // A session that came into view is read; one that went out of view is told to the notifications, for what still
    // waits in it.
    private fun visibilityChanged(sessionId: String) {
        if (isVisible(sessionId)) markRead(sessionId) else alerts.hidden(sessionId)
    }

    /** Tells [listener], on the EDT, each change of a session's view that the list or the notifications care about. */
    fun onViewChanged(
        parent: Disposable,
        listener: (Entry, SessionView) -> Unit,
    ) {
        viewListeners += listener
        Disposer.register(parent) { viewListeners -= listener }
    }

    private class Change(
        val view: SessionView,
        val running: Boolean,
        val waiting: List<String>,
    )

    private fun changed(
        id: String,
        change: Change,
    ) {
        val session = registered[id] ?: return
        session.unread = unreadAfter(session.running, change.running, isVisible(id), session.unread)
        session.running = change.running
        val entry = publish().getValue(id)
        viewListeners.toList().forEach { it(entry, change.view) }
    }

    /** Puts every session's entry in [entries] (archived ones left out) and returns them all by id. */
    private fun publish(): Map<String, Entry> {
        val all = registered.mapValues { (id, session) -> entryOf(id, session, noteGroupSince(session, clock)) }
        state.value = all.filterKeys { it !in archived }.values.toList()
        return all
    }

    override fun dispose() {
        registered.values.forEach { it.job.cancel() }
        registered.clear()
    }

    companion object {
        const val ARCHIVED = "closta.sessions.archived"

        private fun settings() = service<AppSettingsStore>()
    }
}

private fun waitingIds(view: SessionView): List<String> =
    view.conversation.pendingApprovals
        .map { it.requestId }
        .filter { it.isNotEmpty() }

private fun entryOf(
    id: String,
    session: ChatDirectory.Registered,
    since: Instant?,
): ChatDirectory.Entry {
    val view = session.source.view.value
    return ChatDirectory.Entry(
        project = session.project,
        sessionId = id,
        source = session.source,
        title = sessionTitle(view.transcript) ?: session.source.title,
        summary = sessionSummary(view.conversation, view.transcript, session.unread),
        unread = session.unread,
        head = session.head,
        since = since,
    )
}

private fun saveArchived(ids: Set<String>) {
    service<AppSettingsStore>().set(ChatDirectory.ARCHIVED, SessionMarks.encode(ids))
}

// Notes the heading the session is under now and returns the time it came under it.
private fun noteGroupSince(
    session: ChatDirectory.Registered,
    clock: Clock,
): Instant? {
    val view = session.source.view.value
    val group = sessionSummary(view.conversation, view.transcript, session.unread).group
    val since = groupSinceAfter(session.since, group, clock.now())
    session.since = since
    return since.since
}
