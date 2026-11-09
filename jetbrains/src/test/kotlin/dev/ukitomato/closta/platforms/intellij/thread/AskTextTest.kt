package dev.ukitomato.closta.platforms.intellij.thread

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class AskTextTest {
    @Test
    fun mentionsAreTheWordsThatStartWithAnAt() {
        val text = "Fix @src/A.kt and @B.kt#L5-10, not a@b.c"
        assertEquals(listOf("@src/A.kt", "@B.kt#L5-10,"), mentions(text).map { text.substring(it) })
        assertEquals(listOf(0 until 5), mentions("@a.kt"))
    }

    @Test
    fun aLongAskFoldsAfterTwelveLines() {
        val long = (1..13).joinToString("\n") { "line $it" }
        assertEquals((1..12).joinToString("\n") { "line $it" }, foldedAsk(long))
        assertNull(foldedAsk((1..12).joinToString("\n") { "line $it" }))
    }
}
