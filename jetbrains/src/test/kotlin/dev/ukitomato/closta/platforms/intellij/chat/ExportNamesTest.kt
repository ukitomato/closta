package dev.ukitomato.closta.platforms.intellij.chat

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class ExportNamesTest {
    @Test
    fun `characters a file name cannot hold become underscores`() {
        assertEquals("a_b_c_d_e_f_g_h_i_j-2026-11-28.md", exportFileName("a/b\\c:d*e?f\"g<h>i|j", "2026-11-28"))
        assertEquals("a_b-2026-11-28.md", exportFileName("a\u0000b", "2026-11-28"))
    }

    @Test
    fun `a long name is cut at eighty characters before the date`() {
        val name = exportFileName("x".repeat(200), "2026-11-28")
        assertEquals("x".repeat(80) + "-2026-11-28.md", name)
    }

    @Test
    fun `an empty name is conversation`() {
        assertEquals("conversation-2026-11-28.md", exportFileName("", "2026-11-28"))
        assertEquals("conversation-2026-11-28.md", exportFileName("   ", "2026-11-28"))
    }

    @Test
    fun `the words are read from the bundle by their keys`() {
        val words = exportWords { key -> "<$key>" }
        assertEquals("<thread.export.you>", words.you)
        assertEquals("<thread.export.exportedAt>", words.exportedAt)
    }
}
