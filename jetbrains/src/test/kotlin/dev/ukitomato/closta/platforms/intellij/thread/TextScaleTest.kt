package dev.ukitomato.closta.platforms.intellij.thread

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TextScaleTest {
    @Test
    fun theSameScaleKeepsTheHeight() {
        assertFalse(needsRemeasure(TextScale(1.75, 1.75), TextScale(1.75, 1.75)))
    }

    @Test
    fun anotherScaleMeasuresAgain() {
        assertTrue(needsRemeasure(TextScale(1.0, 1.0), TextScale(1.75, 1.75)))
        assertTrue(needsRemeasure(TextScale(1.5, 1.5), TextScale(1.5, 1.25)))
    }

    @Test
    fun anUnknownScaleMeasuresAgain() {
        assertTrue(needsRemeasure(null, TextScale(1.0, 1.0)))
    }

    @Test
    fun onlyTheRowsMeasuredAtAnotherScaleOrAnUnknownOneAreMeasuredAgain() {
        val main = TextScale(1.0, 1.0)
        val here = TextScale(1.75, 1.75)
        assertEquals(listOf(0, 2), rowsToRemeasure(listOf(main, here, null), here))
    }

    @Test
    fun onOneScreenNoRowIsMeasuredAgain() {
        val here = TextScale(1.25, 1.25)
        assertEquals(emptyList<Int>(), rowsToRemeasure(listOf(here, here), here))
    }
}
