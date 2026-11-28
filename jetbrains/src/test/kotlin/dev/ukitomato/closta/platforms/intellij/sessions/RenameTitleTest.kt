package dev.ukitomato.closta.platforms.intellij.sessions

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class RenameTitleTest {
    @Test
    fun `only white space is no name`() {
        assertNull(renameTitle(""))
        assertNull(renameTitle("  \t \n  "))
    }

    @Test
    fun `a line break is a space and the ends are trimmed`() {
        assertEquals("one two", renameTitle("  one\ntwo \n"))
        assertEquals("one two", renameTitle("one\r\ntwo"))
    }

    @Test
    fun `the name is cut after 200 characters`() {
        assertEquals("a".repeat(RENAME_MAX), renameTitle("a".repeat(RENAME_MAX + 1)))
        assertEquals(200, RENAME_MAX)
        assertEquals("a".repeat(RENAME_MAX), renameTitle("a".repeat(RENAME_MAX)))
    }
}
