package dev.ukitomato.closta.presenter.view

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test

class TerminalTextTest {
    private val esc = "\u001B"

    @Test
    fun `colour sequences go and the words stay`() {
        assertEquals("error: x ok", terminalText("$esc[1;31merror$esc[0m: x $esc[32mok$esc[0m"))
    }

    @Test
    fun `cursor movements and erases go`() {
        assertEquals("ab\ncd", terminalText("$esc[2Jab$esc[3A\n$esc[?25lcd$esc[K"))
    }

    @Test
    fun `an OSC title goes whether a bell or a string terminator ends it`() {
        assertEquals("before after", terminalText("before $esc]0;title\u0007after"))
        assertEquals("before after", terminalText("before $esc]2;title$esc\\after"))
    }

    @Test
    fun `an OSC with no end does not take the next line`() {
        assertEquals("a \nnext", terminalText("a $esc]0;never ends\nnext"))
    }

    @Test
    fun `a carriage return goes back to the start of the line and overwrites`() {
        assertEquals("20%", terminalText("10%\r20%"))
        assertEquals("Xbc", terminalText("abc\rX"))
        assertEquals("done  g\nnext", terminalText("working\rdone  \nnext"))
    }

    @Test
    fun `a carriage return before a line feed is only a line end`() {
        assertEquals("a\nb\n", terminalText("a\r\nb\r\n"))
        assertEquals("abc", terminalText("abc\r"))
    }

    @Test
    fun `other control characters are made visible and tab and line feed stay`() {
        assertEquals("a\tb\n<U+0007><U+0008>c<U+001B>d", terminalText("a\tb\n\u0007\bc${esc}d"))
    }

    @Test
    fun `markup is left as text`() {
        assertEquals("<b>x</b> <html>", terminalText("<b>x</b> <html>"))
    }

    @Tag("perf")
    @Test
    fun `eight KiB of coloured output reads within the budget`() {
        val line = "$esc[1;32mPASS$esc[0m src/test/some/path/File$ 123\r\n"
        val raw = line.repeat(8192 / line.length)
        repeat(WARM_UP) { terminalText(raw) }
        val runs =
            List(RUNS) {
                val start = System.nanoTime()
                terminalText(raw)
                (System.nanoTime() - start) / NANOS_PER_MS
            }
        val took = runs.sorted()[RUNS / 2]
        println("perf terminalText8KiB median=${"%.3f".format(took)}ms runs=${runs.map { "%.3f".format(it) }}")
        assertTrue(took <= BUDGET_MS, "reading 8 KiB took ${took}ms (budget ${BUDGET_MS}ms)")
    }

    private companion object {
        const val WARM_UP = 5
        const val RUNS = 5
        const val BUDGET_MS = 5.0
        const val NANOS_PER_MS = 1_000_000.0
    }
}
