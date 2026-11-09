package dev.ukitomato.closta.presenter.view

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** One character from its code point, so the test source stays ASCII and never holds a hidden character itself. */
private fun ch(code: Int): String = Char(code).toString()

class VisibleTextTest {
    @Test
    fun `a right-to-left override becomes a mark`() =
        assertEquals(VisibleText("evil<U+202E>txt.sh", true), visible("evil" + ch(0x202E) + "txt.sh"))

    @Test
    fun `tabs and newlines stay`() = assertEquals(VisibleText("a\tb\nc", false), visible("a\tb\nc"))

    @Test
    fun `zero width, bidi isolates, BOM and C1 controls become marks`() {
        assertEquals(VisibleText("<U+200B>", true), visible(ch(0x200B)))
        assertEquals(VisibleText("<U+2066>", true), visible(ch(0x2066)))
        assertEquals(VisibleText("<U+FEFF>", true), visible(ch(0xFEFF)))
        assertEquals(VisibleText("<U+0085>", true), visible(ch(0x0085)))
    }

    @Test
    fun `every code point in the marked ranges becomes a mark`() {
        val ranges =
            listOf(
                0x202A..0x202E,
                0x2066..0x2069,
                0x200B..0x200F,
                0x2028..0x2029,
                0x0000..0x0008,
                0x000B..0x000C,
                0x000D..0x001F,
                0x0080..0x009F,
                0xFEFF..0xFEFF,
            )
        for (range in ranges) {
            for (code in range) {
                val expected = "<U+%04X>".format(code)
                assertEquals(VisibleText(expected, true), visible(ch(code)), "U+%04X".format(code))
            }
        }
    }

    @Test
    fun `characters next to the marked ranges stay`() {
        val neighbours =
            listOf(
                0x0020,
                0x007E,
                0x007F,
                0x00A0,
                0x00AD,
                0x1680,
                0x2000,
                0x200A,
                0x2010,
                0x2027,
                0x202F,
                0x2065,
                0x206A,
                0xFEFE,
                0xFF00,
            )
        val kept = neighbours.joinToString("") { ch(it) }
        assertEquals(VisibleText(kept, false), visible(kept))
    }

    @Test
    fun `carriage return is marked`() = assertEquals(VisibleText("a<U+000D>b", true), visible("a" + ch(0x000D) + "b"))

    @Test
    fun `a mark keeps the surrounding text in order`() =
        assertEquals(
            VisibleText("x<U+200B>y<U+202E>z<U+0080>", true),
            visible("x" + ch(0x200B) + "y" + ch(0x202E) + "z" + ch(0x0080)),
        )

    @Test
    fun `empty text has no hidden characters`() = assertEquals(VisibleText("", false), visible(""))
}
