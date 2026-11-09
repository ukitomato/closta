package dev.ukitomato.closta.platforms.intellij.thread

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import javax.swing.JButton
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

    private val target = JPanel()

    private fun waitingCard() =
        object : JPanel(), WaitingCard {
            override val waiting = true
        }

    @Test
    fun aCardTakesTheKeyboardFromThePlainThread() {
        val button = JButton().also { thread.add(it) }
        assertTrue(cardMayTakeFocus(button, thread, target))
    }

    @Test
    fun aCardNeverTakesTheKeyboardFromTheComposer() {
        assertFalse(cardMayTakeFocus(composer, thread, target))
        assertFalse(cardMayTakeFocus(panel, thread, target))
    }

    @Test
    fun noOwnerNoFocus() {
        assertFalse(cardMayTakeFocus(null, thread, target))
    }

    @Test
    fun aCardDoesNotTakeTheKeyboardFromATextLineInTheThread() {
        assertFalse(cardMayTakeFocus(inThread, thread, target))
        assertFalse(cardMayTakeFocus(JTextField().also { thread.add(it) }, thread, target))
        assertFalse(cardMayTakeFocus(JTextArea().apply { isEditable = false }.also { thread.add(it) }, thread, target))
    }

    @Test
    fun aCardDoesNotTakeTheKeyboardFromAnotherWaitingCard() {
        val other = waitingCard()
        val button = JButton()
        other.add(button)
        thread.add(other)
        assertFalse(cardMayTakeFocus(button, thread, target))
        assertFalse(cardMayTakeFocus(other, thread, target))
    }

    @Test
    fun aCardMayTakeTheKeyboardBackFromItself() {
        val card = waitingCard()
        val button = JButton()
        card.add(button)
        thread.add(card)
        assertTrue(cardMayTakeFocus(button, thread, card))
    }

    @Test
    fun aCardThatIsNoLongerWaitingKeepsNoKeyboard() {
        val answered =
            object : JPanel(), WaitingCard {
                override val waiting = false
            }
        val button = JButton()
        answered.add(button)
        thread.add(answered)
        assertTrue(cardMayTakeFocus(button, thread, target))
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
