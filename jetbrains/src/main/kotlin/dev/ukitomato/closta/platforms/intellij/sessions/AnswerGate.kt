package dev.ukitomato.closta.platforms.intellij.sessions

import dev.ukitomato.closta.core.interfaces.Clock
import dev.ukitomato.closta.platforms.intellij.thread.CardAnswer
import dev.ukitomato.closta.presenter.view.ANSWER_DELAY_MS
import dev.ukitomato.closta.presenter.view.ShownAsk
import dev.ukitomato.closta.presenter.view.acceptsAnswer
import dev.ukitomato.closta.presenter.view.shownAfter
import java.time.Duration
import javax.swing.JComponent
import javax.swing.Timer

/**
 * The one way the detail pane answers: every button and key of an answer view goes through an [Ask] this gate made,
 * and an [Ask] sends only what [acceptsAnswer] lets through — the request the pane shows, still waiting in the shown
 * session, shown for [ANSWER_DELAY_MS] at least. So a press meant for one request never answers another that took its
 * place, in this session or in another one the selection moved to.
 *
 * The pane tells the gate what it shows on every redraw ([shown]) and when it shows another session ([reset]); a new
 * session, a new request, or the pane coming back into view starts the delay again. While the delay runs, the guarded
 * buttons are disabled; a [Timer] enables them when it is over, if the same request is still shown.
 *
 * Free of `com.intellij`, so the fast tests run it. EDT only; [dispose] stops its timer.
 */
internal class AnswerGate(
    private val clock: Clock,
) {
    private var shown: ShownAsk? = null
    private var current: Ask? = null
    private val timer = Timer(0) { opened() }.apply { isRepeats = false }

    /** The pane shows another session, or none: nothing shown before can be answered any more. */
    fun reset() {
        shown = null
        current = null
        timer.stop()
    }

    /**
     * The pane redrew [sessionId] showing the wait [requestId] (null when none waits). The delay starts again when
     * either changed.
     */
    fun shown(
        sessionId: String,
        requestId: String?,
    ) {
        val before = shown
        val now = shownAfter(before, sessionId, requestId, clock.now())
        shown = now
        if (now !== before) {
            current = null
            arm()
        }
    }

    /** The pane came back into view: what it shows was not seen until now, so the delay starts again. */
    fun seenAgain() {
        val before = shown ?: return
        shown = before.copy(since = clock.now())
        current?.refresh()
        arm()
    }

    /**
     * The answers of a view made for [requestId], the request [shown] last named; any [Ask] made before stops
     * answering. A view made again for the same request is a new thing on screen too: the delay starts
     * again. [waitingNow] reads the shown session's waiting request ids at the moment of a press; [deliver] sends
     * an answer that got through, calling back when it could not be passed on.
     */
    fun ask(
        requestId: String,
        waitingNow: () -> Set<String>,
        deliver: (CardAnswer, failed: () -> Unit) -> Unit,
    ): Ask {
        val before =
            checkNotNull(shown?.takeIf { it.requestId == requestId }) {
                "an ask for a request the pane does not show"
            }
        shown = before.copy(since = clock.now())
        arm()
        return Ask(requestId, waitingNow, deliver).also { current = it }
    }

    fun dispose() = reset()

    private fun delayLeftMs(): Long {
        val since = shown?.since ?: return 0
        return ANSWER_DELAY_MS - Duration.between(since, clock.now()).toMillis()
    }

    private fun arm() {
        timer.stop()
        val left = delayLeftMs()
        if (left > 0) {
            timer.initialDelay = (left + 1).toInt()
            timer.start()
        }
    }

    private fun opened() {
        // A timer may fire a little early on some systems; then it waits the rest.
        if (delayLeftMs() > 0) arm() else current?.refresh()
    }

    /**
     * The answers of one answer view to [requestId]. It sends once ([send]); its guarded components ([guard]) are
     * enabled only while it would send.
     */
    inner class Ask internal constructor(
        val requestId: String,
        private val waitingNow: () -> Set<String>,
        private val deliver: (CardAnswer, failed: () -> Unit) -> Unit,
    ) {
        private var sent = false
        private val guarded = ArrayList<Pair<JComponent, () -> Boolean>>()

        /** Told when an answer this sent could not be passed on (the view says so). */
        var onFailed: () -> Unit = {}

        /** Whether a press would send now. */
        fun accepts(): Boolean = !sent && current === this && acceptsAnswer(shown, requestId, waitingNow(), clock.now())

        /** Keeps [component] enabled only while this would send and [ready] (the view's own condition) holds. */
        fun guard(
            component: JComponent,
            ready: () -> Boolean = { true },
        ) {
            guarded += component to ready
            component.isEnabled = accepts() && ready()
        }

        /** Enables the guarded components that may be pressed now, disables the others. */
        fun refresh() {
            val open = accepts()
            guarded.forEach { (component, ready) -> component.isEnabled = open && ready() }
        }

        /**
         * Sends what [make] builds, if a press is accepted now and [make] builds something; once only. Returns whether
         * it was sent.
         */
        fun send(make: () -> CardAnswer?): Boolean {
            val answer = if (accepts()) make() else null
            if (answer != null) {
                sent = true
                refresh()
                deliver(answer) { onFailed() }
            }
            return answer != null
        }
    }
}
