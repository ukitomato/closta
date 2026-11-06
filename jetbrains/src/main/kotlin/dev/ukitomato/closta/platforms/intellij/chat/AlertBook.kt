package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.presenter.view.AlertChange
import dev.ukitomato.closta.presenter.view.SessionAlert
import dev.ukitomato.closta.presenter.view.Transcript
import dev.ukitomato.closta.presenter.view.alertsBetween

/**
 * What [SessionAlerts] remembers of each session, apart: the view it last saw (to ask [alertsBetween] what changed) and
 * the keys it has notified. A change seen while the session is in view raises nothing and notifies nothing, so what
 * still waits when the session goes out of view ([hidden]) is raised then. Each key is raised once until it expires.
 * Free of `com.intellij`.
 */
class AlertBook {
    private val last = HashMap<String, Pair<ConversationState, Transcript>>()
    private val notified = HashMap<String, MutableSet<String>>()

    fun changed(
        sessionId: String,
        now: Pair<ConversationState, Transcript>,
        inView: Boolean,
    ): AlertChange {
        val change = alertsBetween(last[sessionId], now)
        last[sessionId] = now
        val mine = notified.getOrPut(sessionId) { HashSet() }
        mine -= change.expired.toSet()
        if (inView) return change.copy(raised = emptyList())
        val raised = (change.raised + waiting(now)).distinctBy { it.key }.filter { it.key !in mine }
        mine += raised.map { it.key }
        return AlertChange(raised, change.expired)
    }

    /** The session went out of view: what waits in its last view and was not notified yet. */
    fun hidden(sessionId: String): List<SessionAlert> {
        val now = last[sessionId] ?: return emptyList()
        val mine = notified.getOrPut(sessionId) { HashSet() }
        val raised = waiting(now).filter { it.key !in mine }
        mine += raised.map { it.key }
        return raised
    }

    fun forget(sessionId: String) {
        last.remove(sessionId)
        notified.remove(sessionId)
    }

    private fun waiting(now: Pair<ConversationState, Transcript>): List<SessionAlert> = alertsBetween(null, now).raised
}
