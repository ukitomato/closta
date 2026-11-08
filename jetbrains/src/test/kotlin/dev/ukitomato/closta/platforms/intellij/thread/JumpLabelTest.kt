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

    @Test
    fun aCardIsOffScreenWhenItIsEntirelyAboveOrBelowTheView() {
        assertEquals(2, waitingOffScreen(listOf(-300..-100, 100..200, 900..1000), viewTop = 0, viewBottom = 800))
        assertEquals(0, waitingOffScreen(listOf(0..50, 700..799), viewTop = 0, viewBottom = 800))
        assertEquals(0, waitingOffScreen(emptyList(), viewTop = 0, viewBottom = 800))
    }

    @Test
    fun aCardWithPartInSightIsOnScreen() {
        assertEquals(0, waitingOffScreen(listOf(-300..100), viewTop = 0, viewBottom = 800))
        assertEquals(0, waitingOffScreen(listOf(700..1200), viewTop = 0, viewBottom = 800))
        assertEquals(0, waitingOffScreen(listOf(-300..1200), viewTop = 0, viewBottom = 800))
    }

    @Test
    fun aCardTouchingTheViewOnlyAtAnEdgeIsOffScreen() {
        assertEquals(1, waitingOffScreen(listOf(-300..0), viewTop = 0, viewBottom = 800))
        assertEquals(1, waitingOffScreen(listOf(800..900), viewTop = 0, viewBottom = 800))
    }
}
