@file:Suppress("ktlint:standard:filename", "MatchingDeclarationName") // the introduced-diagnostics service joins it

package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.Diagnostic

/** The findings a file gained over a turn: the file's absolute [path] and the [added] ones, in the order found. */
data class DiagnosticsReport(
    val path: String,
    val added: List<Diagnostic>,
)
