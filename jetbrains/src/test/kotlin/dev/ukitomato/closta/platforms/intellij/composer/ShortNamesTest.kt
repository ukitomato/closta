package dev.ukitomato.closta.platforms.intellij.composer

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
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
}
