package dev.ukitomato.closta.platforms.intellij.composer

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class RangeTextTest {
    @Test
    fun aChipSaysTheLines() = assertEquals("L42-58", rangeLabel("src/Auth.kt", 42, 58, forChip = true))

    @Test
    fun theMessageSaysThePathAndTheLines() =
        assertEquals("@src/Auth.kt#L42-58", rangeLabel("src/Auth.kt", 42, 58, forChip = false))

    @Test
    fun oneLineIsOneNumber() {
        assertEquals("L42", rangeLabel("src/Auth.kt", 42, 42, forChip = true))
        assertEquals("@src/Auth.kt#L42", rangeLabel("src/Auth.kt", 42, 42, forChip = false))
    }
}
