package dev.ukitomato.closta.platforms.intellij.chat

/**
 * Counts the screens that show each session, and which of them are in view. A screen leases its session while it is
 * open and returns the lease when it closes; returning the last lease stops nothing (a session outlives its screens:
 * it is stopped from the sessions list, or with its project), but [onUnheld] is told (a move holds a bridging lease,
 * so moving a conversation never tells it). A screen says whether it is in view ([Lease.visible]);
 * [onChange] is told each time a session comes into view or goes out of it.
 *
 * Free of `com.intellij`, so the fast tests run it. Called on the EDT.
 */
class ViewLeases(
    private val onChange: (sessionId: String) -> Unit = {},
    private val onUnheld: (sessionId: String) -> Unit = {},
) {
    private val shown = HashMap<String, Int>()
    private val held = HashMap<String, Int>()

    fun lease(sessionId: String): Lease {
        held[sessionId] = (held[sessionId] ?: 0) + 1
        return Lease(sessionId)
    }

    private fun unhold(sessionId: String) {
        val now = (held[sessionId] ?: 0) - 1
        if (now > 0) {
            held[sessionId] = now
        } else {
            held.remove(sessionId)
            onUnheld(sessionId)
        }
    }

    /** Whether any screen that holds a lease of [sessionId] is in view. */
    fun isVisible(sessionId: String): Boolean = (shown[sessionId] ?: 0) > 0

    private fun count(
        sessionId: String,
        by: Int,
    ) {
        val before = isVisible(sessionId)
        val now = (shown[sessionId] ?: 0) + by
        if (now > 0) shown[sessionId] = now else shown.remove(sessionId)
        if (isVisible(sessionId) != before) onChange(sessionId)
    }

    inner class Lease internal constructor(
        val sessionId: String,
    ) {
        private var returned = false
        private var inView = false

        /** Whether this screen is in view now; a returned lease shows nothing. */
        fun visible(shown: Boolean) {
            if (returned || shown == inView) return
            inView = shown
            count(sessionId, if (shown) 1 else -1)
        }

        /** Returns the lease; a second call does nothing. */
        fun release() {
            if (returned) return
            visible(false)
            returned = true
            unhold(sessionId)
        }
    }
}

/**
 * Whether a screen is in view for [ViewLeases.Lease.visible]: shown, in a window that is the active one (an editor
 * window of its own, a floating tool window, or the project's frame). A screen in a window behind another is not seen.
 */
fun screenInView(
    showing: Boolean,
    windowActive: Boolean,
): Boolean = showing && windowActive
