package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.Diagnostic
import dev.ukitomato.closta.core.interfaces.DiagnosticSeverity
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class IntroducedDiagnosticsTest {
    private fun error(
        line: Int,
        message: String = "Unresolved reference 'bar'.",
        source: String? = "kotlin",
        severity: DiagnosticSeverity = DiagnosticSeverity.ERROR,
    ) = Diagnostic("/p/a.kt", line, 1, severity, message, source)

    @Test
    fun `an error that only moved to another line adds nothing`() {
        assertTrue(introducedDiagnostics(listOf(error(3)), listOf(error(30))).isEmpty())
    }

    @Test
    fun `an error seen once before and three times after is two new ones, in the later order`() {
        val after = listOf(error(5), error(9), error(12))
        assertEquals(listOf(error(9), error(12)), introducedDiagnostics(listOf(error(1)), after).takeLast(2))
        assertEquals(2, introducedDiagnostics(listOf(error(1)), after).size)
    }

    @Test
    fun `the new ones come in the order of the later list`() {
        val other = error(2, "Expecting '}'.", null)
        val result = introducedDiagnostics(emptyList(), listOf(other, error(8)))
        assertEquals(listOf(other, error(8)), result)
    }

    @Test
    fun `errors that went away add nothing`() {
        assertTrue(introducedDiagnostics(listOf(error(1), error(2)), emptyList()).isEmpty())
    }

    @Test
    fun `warnings are not counted, before or after`() {
        val warning = error(4, severity = DiagnosticSeverity.WARNING)
        assertTrue(introducedDiagnostics(emptyList(), listOf(warning)).isEmpty())
        assertEquals(listOf(error(4)), introducedDiagnostics(listOf(warning), listOf(error(4))))
    }

    @Test
    fun `a different message or source is a different error`() {
        assertEquals(1, introducedDiagnostics(listOf(error(1)), listOf(error(1, source = "java"))).size)
        assertEquals(1, introducedDiagnostics(listOf(error(1)), listOf(error(1, message = "x"))).size)
    }
}
