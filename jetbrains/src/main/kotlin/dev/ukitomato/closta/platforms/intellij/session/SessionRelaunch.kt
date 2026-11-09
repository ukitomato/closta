package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.presenter.view.ResumeRefusal

/**
 * How a panel starts its session again: by [close]ing the one it has and [open]ing another, with the effort the
 * user chose. The effort is the panel's, not the session's: it is remembered here, so the Restart Session of the tool
 * window starts with it too, and a restart that fails to open still remembers it.
 *
 * The order is fixed: the effort is remembered first, then the old session is closed (its process ends with it),
 * then the new one is opened. The one exception is a fork of this tab's own session: it is
 * opened after the close has finished, inside [afterClosed], which is called synchronously right after [close]
 * returns (the default runs it at once); every other start opens right after [close], without waiting. Nothing is
 * carried from one session to the next but the effort: the new session has a new id, an empty conversation, and the
 * CLI's own model and permission mode. A saved session to open is the one other thing a new session is given,
 * and only for that one start: it is not remembered, so the restarts after it, and an effort switch, start new
 * sessions again.
 *
 * A saved session another tab of the tool window already has is not opened a second time: [heldElsewhere] says
 * so for an id, and the relaunch then closes nothing, opens nothing and remembers no effort; it returns the refusal,
 * [ResumeRefusal.ELSEWHERE]. The session this tab has now ([current]) is not another tab's, so it is never asked about.
 *
 * Every session this opens is given the same [workingDirectory] (null is the project's root), by start, restart
 * and both kinds of relaunch, so a tab opened in a worktree stays there however its session is started again.
 *
 * Free of `com.intellij` (a test reads this file to keep it so): [open] and [close] are given as functions, the panel's
 * own, which are not run here from any thread but the one the panel uses them on (the EDT).
 */
class SessionRelaunch(
    private val open: (effort: String?, opening: SessionOpening, workingDirectory: String?) -> Unit,
    private val close: () -> Unit,
    private val heldElsewhere: (id: String) -> Boolean = { false },
    private val workingDirectory: String? = null,
    private val current: () -> String? = { null },
    /**
     * Runs the [open] it is given when the session just closed has ended, used only for a fork of this tab's
     * own session, whose record the closing CLI may still be writing. The default opens at once. The [open] it gets
     * does nothing if another start, restart or [cancelPending] came after it was handed over.
     */
    private val afterClosed: (open: () -> Unit) -> Unit = { it() },
) {
    // Counts the starts: a wait for a closing session is cancelled by any later one, and by the panel's end.
    private var generation = 0

    // The id of the session closed for a fork of itself, while [afterClosed] still holds that fork: [current] may no
    // longer say it, but it is still this tab's own, so a second Fork of it waits too. Forgotten when the wait ends.
    private var closing: String? = null

    /** The effort the next session starts with, or null while the user has chosen none. */
    var effort: String? = null
        private set

    /** The session starts with the effort now remembered (none, at the panel's first start). */
    fun start() {
        generation++
        closing = null
        open(effort, SessionOpening.New, workingDirectory)
    }

    /** A start that [afterClosed] is still holding does not happen (the panel is going). */
    fun cancelPending() {
        generation++
        closing = null
    }

    /**
     * A new session with [newEffort], which is remembered even if opening it fails; null keeps the effort remembered.
     * With [opening] a saved session the new session opens that saved session, once. The refusal when that
     * session is held by another tab and nothing was done; null when a session was opened. A fork is
     * refused the same way: another tab's session is not forked either, and this tab's own ([current]) is.
     */
    fun relaunch(
        newEffort: String?,
        opening: SessionOpening = SessionOpening.New,
    ): ResumeRefusal? {
        val saved = opening.savedId
        val mine = saved != null && (saved == current() || saved == closing)
        if (saved != null && !mine && heldElsewhere(saved)) return ResumeRefusal.ELSEWHERE
        if (newEffort != null) effort = newEffort
        generation++
        closing = null
        val own = opening is SessionOpening.Fork && mine
        close()
        if (own) {
            val held = generation
            val chosen = effort
            closing = saved
            afterClosed {
                if (generation == held) {
                    closing = null
                    open(chosen, opening, workingDirectory)
                }
            }
        } else {
            open(effort, opening, workingDirectory)
        }
        return null
    }

    /** A new session as the last one was started: the effort the user last chose, if any. */
    fun restart() {
        generation++
        closing = null
        close()
        open(effort, SessionOpening.New, workingDirectory)
    }
}

/**
 * The id of the session a start opens: a fork has the new id the host made ([newId]), a resume the id it was
 * saved under, a new conversation [newId]. Kept apart from the IDE's service so that a test can say which.
 */
fun sessionIdFor(
    opening: SessionOpening,
    newId: String,
): String = if (opening is SessionOpening.Resume) opening.id else newId
