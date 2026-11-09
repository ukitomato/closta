package dev.ukitomato.closta.platforms.intellij.sessions

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class DeferredFocusTest {
    @Test
    fun askedBeforeTheFirstDrawFocusesAWaitDrawnThen() {
        val focus = DeferredFocus()
        focus.switched()
        focus.asked()
        assertTrue(focus.drawn(waiting = true))
    }

    @Test
    fun askedBeforeTheFirstDrawIsDroppedWhenThatDrawIsNoWait() {
        val focus = DeferredFocus()
        focus.switched()
        focus.asked()
        assertFalse(focus.drawn(waiting = false))
        // A wait that comes minutes later does not take the keyboard.
        assertFalse(focus.drawn(waiting = true))
    }

    @Test
    fun askedAfterTheSessionWasDrawnIsNeverKept() {
        val focus = DeferredFocus()
        focus.switched()
        assertFalse(focus.drawn(waiting = false))
        focus.asked()
        assertFalse(focus.drawn(waiting = true))
    }

    @Test
    fun anotherSessionDropsWhatWasAsked() {
        val focus = DeferredFocus()
        focus.switched()
        focus.asked()
        focus.switched()
        assertFalse(focus.drawn(waiting = true))
    }

    @Test
    fun notAskedNeverFocuses() {
        val focus = DeferredFocus()
        focus.switched()
        assertFalse(focus.drawn(waiting = true))
    }
}
