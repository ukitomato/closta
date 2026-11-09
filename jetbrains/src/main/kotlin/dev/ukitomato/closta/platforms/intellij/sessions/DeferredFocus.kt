package dev.ukitomato.closta.platforms.intellij.sessions

/**
 * Whether the detail pane puts the keyboard in a wait when it draws one. Only a request made ([asked]) while the
 * session chosen last ([switched]) has not been drawn yet is kept, and only for that first draw: a session already on
 * screen, or a wait that comes later, never takes the keyboard by itself.
 *
 * Free of `com.intellij`, so the fast tests run it.
 */
internal class DeferredFocus {
    private var drawnSinceSwitch = false
    private var wanted = false

    /** Another session (or none) is chosen: nothing of it is drawn yet, and nothing is asked for it. */
    fun switched() {
        drawnSinceSwitch = false
        wanted = false
    }

    /** The user asked for the keyboard in the wait, with none on screen: kept only until the first draw. */
    fun asked() {
        wanted = !drawnSinceSwitch
    }

    /** The chosen session was drawn; true when the keyboard goes to the wait now on screen. */
    fun drawn(waiting: Boolean): Boolean {
        val focus = wanted && waiting
        wanted = false
        drawnSinceSwitch = true
        return focus
    }
}
