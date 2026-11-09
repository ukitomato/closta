package dev.ukitomato.closta.platforms.intellij.chat

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import javax.swing.JPanel
import javax.swing.JTextArea

class FocusBackTest {
    private val bar = JPanel()
    private val link = JTextArea().also { bar.add(it) }
    private val composer = JTextArea()
    private val panel =
        JPanel().apply {
            add(bar)
            add(composer)
        }
    private val editor = JTextArea()

    @Test
    fun theKeyboardWentWithWhatHeldIt() {
        assertTrue(keyboardWentWith(link, bar))
        assertTrue(keyboardWentWith(bar, bar))
    }

    @Test
    fun theKeyboardElsewhereDidNotGo() {
        assertFalse(keyboardWentWith(composer, bar))
        assertFalse(keyboardWentWith(editor, bar))
    }

    @Test
    fun noOwnerMeansItWentAndNoPlaceMeansAlways() {
        assertTrue(keyboardWentWith(null, bar))
        assertTrue(keyboardWentWith(editor, null))
    }

    @Test
    fun theComposerTakesItBackOnlyFromItsOwnPanelOrNowhere() {
        assertTrue(composerMayTakeBack(null, panel, composerShown = true))
        assertTrue(composerMayTakeBack(link, panel, composerShown = true))
        assertFalse(composerMayTakeBack(editor, panel, composerShown = true))
    }

    @Test
    fun aHiddenComposerTakesNothing() {
        assertFalse(composerMayTakeBack(null, panel, composerShown = false))
        assertFalse(composerMayTakeBack(link, panel, composerShown = false))
    }
}
