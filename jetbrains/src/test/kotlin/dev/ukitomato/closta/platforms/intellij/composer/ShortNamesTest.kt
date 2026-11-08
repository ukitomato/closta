package dev.ukitomato.closta.platforms.intellij.composer

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ShortNamesTest {
    @Test
    fun everyKnownLevelHasItsOwnShortName() {
        assertEquals("L", shortEffort("Low"))
        assertEquals("Med", shortEffort("Medium"))
        assertEquals("H", shortEffort("High"))
        assertEquals("XH", shortEffort("Extra High"))
        assertEquals("Max", shortEffort("Max"))
        assertNotEquals(shortEffort("Medium"), shortEffort("Max"))
    }

    @Test
    fun anUnknownLevelStaysAsItIs() = assertEquals("turbo", shortEffort("turbo"))

    @Test
    fun aLongModelNameIsCutWithAnEllipsis() {
        assertEquals("Opus 5.5", shortModel("Opus 5.5", 20))
        assertEquals("Claude Opus 5.5 wit…", shortModel("Claude Opus 5.5 with a long name", 20))
    }

    private val all = listOf("default", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions")

    @Test
    fun shiftTabSkipsBypassAndComesRound() = assertEquals("default", nextMode(all, "dontAsk"))

    @Test
    fun shiftTabGoesToTheNextOne() = assertEquals("plan", nextMode(all, "acceptEdits"))

    @Test
    fun aModeOfNoneCountsAsDefault() = assertEquals("acceptEdits", nextMode(all, null))

    @Test
    fun noModesNoNext() = assertNull(nextMode(emptyList(), null))

    @Test
    fun onlyBypassNoNext() = assertNull(nextMode(listOf("bypassPermissions"), "default"))
}
