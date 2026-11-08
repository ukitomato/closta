package dev.ukitomato.closta.platforms.intellij.composer

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class OutgoingTest {
    @Test
    fun theWordsComeBackIntoAnEmptyField() = assertEquals("fix it", restoredText("  ", "fix it"))

    @Test
    fun theWordsGoAboveWhatWasTypedSince() = assertEquals("fix it\nand this", restoredText("and this", "fix it"))

    private val range = { s: LineSelection -> "${s.path}#L${s.start}-${s.end}" }
    private val picked = listOf(LineSelection("a.kt", 1, 2))

    private fun message(words: String) = Outgoing(words, picked, "src/Foo.kt", emptyList())

    @Test
    fun aSlashCommandGoesAlone() = assertEquals("/compact", outgoingText(message("/compact"), range))

    @Test
    fun aSlashCommandWithLeadingSpacesGoesAlone() =
        assertEquals("  /compact", outgoingText(message("  /compact"), range))

    @Test
    fun aMessageCarriesTheRangesAndTheFile() =
        assertEquals("fix\na.kt#L1-2\n@src/Foo.kt", outgoingText(message("fix"), range))
}
