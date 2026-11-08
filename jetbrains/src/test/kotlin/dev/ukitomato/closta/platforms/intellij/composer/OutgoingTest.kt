package dev.ukitomato.closta.platforms.intellij.composer

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class OutgoingTest {
    @Test
    fun theWordsComeBackIntoAnEmptyField() = assertEquals("fix it", restoredText("  ", "fix it"))

    @Test
    fun theWordsGoAboveWhatWasTypedSince() = assertEquals("fix it\nand this", restoredText("and this", "fix it"))
}
