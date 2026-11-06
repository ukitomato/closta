package dev.ukitomato.closta.platforms.intellij.thread

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import javax.swing.JPanel
import javax.swing.JRadioButton
import javax.swing.JTextArea
import javax.swing.JTextField

class CardFocusTest {
    private val thread = JPanel()
    private val inThread = JTextArea().also { thread.add(it) }
    private val composer = JTextArea()
    private val panel =
        JPanel().apply {
            add(thread)
            add(composer)
        }

    @Test
    fun aCardTakesTheKeyboardFromTheThread() {
        assertTrue(cardMayTakeFocus(inThread, thread))
    }

    @Test
    fun aCardNeverTakesTheKeyboardFromTheComposer() {
        assertFalse(cardMayTakeFocus(composer, thread))
        assertFalse(cardMayTakeFocus(panel, thread))
    }

    @Test
    fun noOwnerNoFocus() {
        assertFalse(cardMayTakeFocus(null, thread))
    }

    private fun card(): JPanel {
        val card = JPanel().apply { isFocusable = true }
        card.add(JRadioButton("Yes"))
        card.add(JRadioButton("No"))
        card.add(JTextField().apply { name = "note" })
        return card
    }

    @Test
    fun theRoleIsThePartsNameOrTextOrEmptyForTheCard() {
        val card = card()
        assertEquals("", focusRole(card, card))
        assertEquals("No", focusRole(card.getComponent(1), card))
        assertEquals("note", focusRole(card.getComponent(2), card))
    }

    @Test
    fun noRoleWhenTheKeyboardIsOutside() {
        assertNull(focusRole(composer, card()))
        assertNull(focusRole(null, card()))
    }

    @Test
    fun theNewCardsPartOfTheSameRoleTakesIt() {
        val again = card()
        assertSame(again.getComponent(1), partFor("No", again))
        assertSame(again.getComponent(2), partFor("note", again))
    }

    @Test
    fun aRoleThatIsGoneOrHiddenFallsBackToTheCard() {
        val again = card()
        again.getComponent(2).isVisible = false
        assertSame(again, partFor("note", again))
        assertSame(again, partFor("Maybe", again))
        assertSame(again, partFor("", again))
    }

    @Test
    fun aCardThatTakesNoKeyboardFallsBackToItsFirstPart() {
        val question = card().apply { isFocusable = false }
        assertSame(question.getComponent(0), partFor("", question))
    }
}
