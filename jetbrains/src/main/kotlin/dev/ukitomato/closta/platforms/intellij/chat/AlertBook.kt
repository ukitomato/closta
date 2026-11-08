package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.presenter.view.FinishedAlert
import dev.ukitomato.closta.presenter.view.SessionAlert
import dev.ukitomato.closta.presenter.view.Transcript
import dev.ukitomato.closta.presenter.view.alertsBetween

/** The oldest wait of a session and how many wait behind it: what its one waiting notification says. */
data class WaitingNotice(
    val alert: SessionAlert,
    val more: Int,
)

/** The notice for [waiting] (in arrival order); null when nothing waits. */
fun waitingNotice(waiting: List<SessionAlert>): WaitingNotice? =
    waiting.firstOrNull()?.let { WaitingNotice(it, waiting.size - 1) }

/**
 * What to do with a session's notifications. [replace]: the waiting notification that is shown is to be replaced by
 * [waiting] (taken away when it is null). [fresh]: a wait that was not notified before has come, so the OS may be
 * told. [finished]: a turn ended out of view.
 */
data class NoticeChange(
    val waiting: WaitingNotice?,
    val replace: Boolean,
    val fresh: Boolean,
    val finished: FinishedAlert?,
)

/**
 * What [SessionAlerts] remembers of each session, apart: the view it last saw (to ask [alertsBetween] what changed),
 * the waiting notice it shows and the waits it has notified. A session has one waiting notice, of its oldest wait. It
 * is shown out of view, and re-shown only when a wait has come, or when the wait it shows was answered and others
 * remain; a count that merely went down leaves it as it is. A change seen while the session is in view shows nothing,
 * so what waits when it goes out of view ([hidden]) is shown then; a notice still up when the session is in view is
 * taken away once its wait is answered. Free of `com.intellij`.
 */
class AlertBook {
    private class Memory {
        var shown: WaitingNotice? = null
        val notified = HashSet<String>()
    }

    private val last = HashMap<String, Pair<ConversationState, Transcript>>()
    private val memory = HashMap<String, Memory>()

    fun changed(
        sessionId: String,
        now: Pair<ConversationState, Transcript>,
        inView: Boolean,
    ): NoticeChange {
        val before = last[sessionId]
        last[sessionId] = now
        val finished =
            if (inView) null else alertsBetween(before, now).raised.filterIsInstance<FinishedAlert>().firstOrNull()
        return decide(sessionId, waiting(now), inView, finished)
    }

    /** The session went out of view: what waits in its last view is shown now unless it already is. */
    fun hidden(sessionId: String): NoticeChange {
        val now = last[sessionId] ?: return NoticeChange(null, replace = false, fresh = false, finished = null)
        return decide(sessionId, waiting(now), inView = false, finished = null)
    }

    /** [waiting] is what waits now, in arrival order. */
    fun decide(
        sessionId: String,
        waiting: List<SessionAlert>,
        inView: Boolean,
        finished: FinishedAlert? = null,
    ): NoticeChange {
        val mine = memory.getOrPut(sessionId) { Memory() }
        val keys = waiting.mapTo(HashSet()) { it.key }
        val shown = mine.shown
        val answered = shown != null && shown.alert.key !in keys
        mine.notified.retainAll(keys)
        if (inView) {
            if (answered) mine.shown = null
            return NoticeChange(null, replace = answered, fresh = false, finished = finished)
        }
        val increased = keys.any { it !in mine.notified }
        mine.notified += keys
        val notice = waitingNotice(waiting)
        val replace = notice != shown && (increased || answered || shown == null)
        if (replace) mine.shown = notice
        return NoticeChange(if (replace) notice else shown, replace, fresh = replace && increased, finished = finished)
    }

    fun forget(sessionId: String) {
        last.remove(sessionId)
        memory.remove(sessionId)
    }

    private fun waiting(now: Pair<ConversationState, Transcript>): List<SessionAlert> =
        alertsBetween(null, now).raised.filter { it !is FinishedAlert }
}
