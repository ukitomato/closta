package dev.ukitomato.closta.platforms.intellij.thread

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.awt.event.InputEvent.ALT_DOWN_MASK
import java.awt.event.InputEvent.CTRL_DOWN_MASK
import java.awt.event.InputEvent.META_DOWN_MASK
import java.awt.event.InputEvent.SHIFT_DOWN_MASK
import java.awt.event.KeyEvent.VK_1
import java.awt.event.KeyEvent.VK_2
import java.awt.event.KeyEvent.VK_3
import java.awt.event.KeyEvent.VK_ENTER
import java.awt.event.KeyEvent.VK_ESCAPE
import java.awt.event.KeyEvent.VK_NUMPAD2
import java.awt.event.KeyEvent.VK_TAB
import java.awt.event.KeyEvent.VK_W

class CardKeysTest {
    @Test
    fun enterDoesNothingOnPermissionAndPlanCards() {
        assertNull(cardKey(CardKind.PERMISSION, VK_ENTER, 0, 3, inText = false))
        assertNull(cardKey(CardKind.PLAN, VK_ENTER, 0, 3, inText = false))
    }

    @Test
    fun digitsChoose() {
        assertEquals(CardKey.Choose(0), cardKey(CardKind.PERMISSION, VK_1, 0, 3, inText = false))
        assertEquals(CardKey.Choose(2), cardKey(CardKind.PERMISSION, VK_3, 0, 3, inText = false))
        assertEquals(CardKey.Choose(1), cardKey(CardKind.PLAN, VK_NUMPAD2, 0, 3, inText = false))
        assertNull(cardKey(CardKind.PERMISSION, VK_3, 0, 2, inText = false))
        assertEquals(CardKey.Choose(1), cardKey(CardKind.PERMISSION, VK_2, 0, 2, inText = false))
    }

    @Test
    fun digitsWithModifiersDoNothing() {
        listOf(CTRL_DOWN_MASK, ALT_DOWN_MASK, SHIFT_DOWN_MASK, META_DOWN_MASK).forEach { mask ->
            assertNull(cardKey(CardKind.PERMISSION, VK_1, mask, 3, inText = false))
            assertNull(cardKey(CardKind.PLAN, VK_1, mask, 3, inText = false))
        }
    }

    @Test
    fun escapeDenies() {
        assertEquals(CardKey.Deny, cardKey(CardKind.PERMISSION, VK_ESCAPE, 0, 3, inText = false))
        assertEquals(CardKey.Deny, cardKey(CardKind.PLAN, VK_ESCAPE, 0, 3, inText = false))
        assertEquals(CardKey.Deny, cardKey(CardKind.QUESTION, VK_ESCAPE, 0, 0, inText = false))
    }

    @Test
    fun ctrlEnterAnswersAQuestion() {
        assertEquals(CardKey.Answer, cardKey(CardKind.QUESTION, VK_ENTER, CTRL_DOWN_MASK, 0, inText = false))
        assertEquals(CardKey.Answer, cardKey(CardKind.QUESTION, VK_ENTER, META_DOWN_MASK, 0, inText = false))
        assertNull(cardKey(CardKind.QUESTION, VK_ENTER, 0, 0, inText = false))
    }

    @Test
    fun aQuestionTakesNoDigits() {
        assertNull(cardKey(CardKind.QUESTION, VK_1, 0, 3, inText = false))
    }

    @Test
    fun theJumpKeyGoesBackToTheComposerFromEveryCard() {
        CardKind.entries.forEach { kind ->
            assertEquals(CardKey.ToComposer, cardKey(kind, VK_W, ALT_DOWN_MASK or SHIFT_DOWN_MASK, 3, inText = false))
        }
        assertNull(cardKey(CardKind.PERMISSION, VK_W, ALT_DOWN_MASK, 3, inText = false))
        assertEquals(VK_W, JUMP_KEY.keyCode)
    }

    @Test
    fun keysShowOnlyWithFocus() {
        assertEquals(CardHint.KEYS, cardHint(focusInCard = true, waiting = 1))
        assertEquals(CardHint.KEYS, cardHint(focusInCard = true, waiting = 3))
    }

    @Test
    fun jumpShowsWhenACardWaitsAndFocusIsOutside() {
        assertEquals(CardHint.JUMP, cardHint(focusInCard = false, waiting = 1))
        assertEquals(CardHint.JUMP, cardHint(focusInCard = false, waiting = 2))
    }

    @Test
    fun nothingWhenNoCardWaits() {
        assertEquals(CardHint.NONE, cardHint(focusInCard = false, waiting = 0))
    }

    @Test
    fun escInAQuestionsTextLineOnlyLeavesTheLine() =
        assertEquals(CardKey.LeaveText, cardKey(CardKind.QUESTION, VK_ESCAPE, 0, 0, inText = true))

    @Test
    fun escOnTheCardSaysNo() {
        CardKind.entries.forEach { assertEquals(CardKey.Deny, cardKey(it, VK_ESCAPE, 0, 3, inText = false)) }
    }

    @Test
    fun aDigitInATextLineIsADigit() = assertNull(cardKey(CardKind.PERMISSION, VK_1, 0, 3, inText = true))

    @Test
    fun tabIsLeftToTheFocusTraversal() {
        assertNull(cardKey(CardKind.PERMISSION, VK_TAB, 0, 3, inText = false))
        assertNull(cardKey(CardKind.PERMISSION, VK_TAB, SHIFT_DOWN_MASK, 3, inText = false))
    }

    @Test
    fun enterNeverAnswersAPermissionOrAPlan() {
        listOf(true, false).forEach { inText ->
            assertNull(cardKey(CardKind.PERMISSION, VK_ENTER, 0, 3, inText))
            assertNull(cardKey(CardKind.PLAN, VK_ENTER, 0, 3, inText))
        }
    }
}
