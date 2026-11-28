@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName") // the introduced-diagnostics service joins it

package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.Diagnostic
import dev.ukitomato.closta.core.interfaces.DiagnosticSeverity

/** The findings a file gained over a turn: the file's absolute [path] and the [added] ones, in the order found. */
data class DiagnosticsReport(
    val path: String,
    val added: List<Diagnostic>,
)

/**
 * The errors in [after] that [before] did not have, in [after]'s order. Warnings are not counted. An error is the same
 * one when its severity, message and source are, wherever it stands: lines that only moved add nothing. Counted as a
 * multiset, so a third copy of an error that was there twice is one new error.
 */
fun introducedDiagnostics(
    before: List<Diagnostic>,
    after: List<Diagnostic>,
): List<Diagnostic> {
    val unmatched = HashMap<Triple<DiagnosticSeverity, String, String?>, Int>()
    for (found in before) {
        if (found.severity ==
            DiagnosticSeverity.ERROR
        ) {
            unmatched.merge(found.identity(), 1, Int::plus)
        }
    }
    return after.filter { found ->
        found.severity == DiagnosticSeverity.ERROR &&
            (unmatched[found.identity()] ?: 0).let { left ->
                if (left > 0) unmatched[found.identity()] = left - 1
                left == 0
            }
    }
}

private fun Diagnostic.identity() = Triple(severity, message, source)
