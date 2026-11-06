package dev.ukitomato.closta.platforms.intellij.thread

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class JumpLabelTest {
    @Test
    fun aCardWaitingBelowChangesTheJump() {
        assertEquals(JumpLabel.WAITING, jumpLabel(waitingBelow = true))
        assertEquals(JumpLabel.LATEST, jumpLabel(waitingBelow = false))
    }

    @Test
    fun aCardIsBelowWhenItsTopIsUnderTheView() {
        assertTrue(waitingBelow(listOf(900), viewBottom = 800))
        assertFalse(waitingBelow(listOf(700), viewBottom = 800))
        assertFalse(waitingBelow(emptyList(), viewBottom = 800))
    }
}
