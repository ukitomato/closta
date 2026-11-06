package dev.ukitomato.closta.core.interfaces

/**
 * Errors and warnings the IDE has *already* found. Asking never starts a new analysis.
 *
 * Second implementation: VS Code's `languages.getDiagnostics(uri?)`.
 */
interface Diagnostics {
    /** The diagnostics of the file at absolute [path], or of every open file when [path] is null. */
    suspend fun diagnostics(path: String?): IdeResult<List<Diagnostic>>
}

/**
 * One finding. [path] is absolute — unlike the other seams' relative paths — because the MCP `uri` is absolute and the
 * open files that diagnostics reads may lie outside the project. [line] and [column] are 1-based; [source] names the
 * inspection when known.
 */
data class Diagnostic(
    val path: String,
    val line: Int,
    val column: Int,
    val severity: DiagnosticSeverity,
    val message: String,
    val source: String? = null,
)

enum class DiagnosticSeverity { ERROR, WARNING }
