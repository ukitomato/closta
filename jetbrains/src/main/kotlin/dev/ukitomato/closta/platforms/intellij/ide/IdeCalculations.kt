package dev.ukitomato.closta.platforms.intellij.ide

import dev.ukitomato.closta.core.interfaces.Diagnostic
import dev.ukitomato.closta.core.interfaces.DiagnosticSeverity
import dev.ukitomato.closta.core.interfaces.FileList
import dev.ukitomato.closta.core.interfaces.FileQuery
import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.core.interfaces.IdeResult
import java.nio.file.InvalidPathException
import java.nio.file.Path
import java.nio.file.Paths

/*
 * The arithmetic behind the IntelliJ implementations of the IDE seams, kept free of `com.intellij` so that
 * `src/test` measures it: the part of each seam that calls the platform is thin, and this is everything else.
 */

/** A query's limit as the host uses it: at least 1, at most [FileQuery.MAX_LIMIT]. */
internal fun clampLimit(requested: Int): Int = requested.coerceIn(1, FileQuery.MAX_LIMIT)

/**
 * Whether [relativePath] answers [needle]: an empty needle matches all, else a case-insensitive part
 * of the file's name, the last part of the path. A folder's name does not make its files match.
 */
internal fun matchesQuery(
    relativePath: String,
    needle: String,
): Boolean = needle.isEmpty() || relativePath.substringAfterLast('/').contains(needle, ignoreCase = true)

/** The first [limit] of [found], in path order, and whether [found] had more than that. */
internal fun limited(
    found: List<String>,
    limit: Int,
): FileList {
    val sorted = found.sorted()
    return FileList(sorted.take(limit), truncated = sorted.size > limit)
}

/** [absolute] relative to [base] with `/` separators, or null when it is not inside [base]. `""` for [base] itself. */
internal fun relativePath(
    base: String,
    absolute: String,
): String? {
    val root = pathOrNull(base)?.normalize()
    val path = pathOrNull(absolute)?.normalize()?.takeIf { it.isAbsolute }
    return if (root == null || path == null || !path.startsWith(root)) {
        null
    } else {
        root.relativize(path).joinToString("/") { it.toString() }
    }
}

/** [path] (relative to [base], or absolute) as a normalized absolute path inside [base], or null if it leaves it. */
@Suppress("ReturnCount") // each refusal is one early return
internal fun resolveInside(
    base: String,
    path: String,
): String? {
    val root = pathOrNull(base)?.normalize() ?: return null
    val given = pathOrNull(path) ?: return null
    val absolute = (if (given.isAbsolute) given else root.resolve(given)).normalize()
    return if (absolute.startsWith(root)) absolute.toString() else null
}

private fun pathOrNull(text: String): Path? =
    try {
        Paths.get(text)
    } catch (
        @Suppress("SwallowedException") bad: InvalidPathException,
    ) {
        null
    }

/** A character range of a document: [start] up to [end], both offsets. */
internal data class OffsetRange(
    val start: Int,
    val end: Int,
)

/**
 * The characters a replacement covers. Lines are 1-based and inclusive; the range runs from the start of
 * [startLine] to the end of [endLine] *without* its line break, so the file's line structure survives a replacement
 * that does not end in a break of its own. No lines at all means the whole text of [textLength] characters. Giving only
 * one of the two lines, or a range outside the [lineCount] lines, is a refusal and changes nothing.
 */
@Suppress("LongParameterList") // the file's shape (counts and two offset lookups) and the asked range
internal fun replacementRange(
    lineCount: Int,
    textLength: Int,
    startLine: Int?,
    endLine: Int?,
    lineStart: (Int) -> Int,
    lineEnd: (Int) -> Int,
): IdeResult<OffsetRange> =
    when {
        startLine == null && endLine == null -> IdeResult.Ok(OffsetRange(0, textLength))
        startLine == null || endLine == null ->
            IdeResult.Failed(IdeFailureKind.INVALID_ARGUMENT, "give both startLine and endLine, or neither")
        startLine < 1 || endLine < startLine ->
            IdeResult.Failed(IdeFailureKind.OUT_OF_RANGE, "the line range is not valid")
        endLine > lineCount -> IdeResult.Failed(IdeFailureKind.OUT_OF_RANGE, "the file has only $lineCount lines")
        else -> IdeResult.Ok(OffsetRange(lineStart(startLine - 1), lineEnd(endLine - 1)))
    }

/**
 * The 1-based last line of a selection from [selectionStart] to [selectionEnd] (offsets), where [lineOf] gives the
 * 0-based line of an offset. A selection that ends at the very start of a line does not include that line.
 */
internal fun inclusiveEndLine(
    selectionStart: Int,
    selectionEnd: Int,
    lineOf: (Int) -> Int,
): Int = lineOf(if (selectionEnd > selectionStart) selectionEnd - 1 else selectionEnd) + 1

/**
 * One finding from what the IDE highlighted, or null when it is not one to report: below a warning, or without a text.
 * [atLeastError] and [atLeastWarning] are the highlight's severity compared with the platform's two levels; the offsets
 * are 0-based and become the 1-based line and column.
 */
@Suppress("LongParameterList") // one finding's fields, as the platform gives them
internal fun diagnosticOf(
    path: String,
    line0: Int,
    column0: Int,
    atLeastError: Boolean,
    atLeastWarning: Boolean,
    description: String?,
    source: String?,
): Diagnostic? {
    val severity =
        when {
            atLeastError -> DiagnosticSeverity.ERROR
            atLeastWarning -> DiagnosticSeverity.WARNING
            else -> return null
        }
    val text = description?.trim().orEmpty()
    return if (text.isEmpty()) null else Diagnostic(path, line0 + 1, column0 + 1, severity, text, source)
}

/** Where the left side of a Write's diff comes from: nothing, the document, or no diff at all. */
internal sealed interface DiffLeft {
    /** The file does not exist (after a refresh): the left side is empty, a new file. */
    data object Empty : DiffLeft

    /** The file's document (with changes not yet saved) is the left side. */
    data object Current : DiffLeft

    /** Nothing is opened: showing an empty left for a file that exists would make it look new. */
    data class Refused(
        val failure: IdeResult.Failed,
    ) : DiffLeft
}

/**
 * The left side of a Write's diff, from what the platform found. [fileExists] is whether the file was found after a
 * refresh; [canonicalPath] is where the file really is (links followed), and [hasDocument] is asked only once the file
 * is known to be inside [base], whether a document can be had for it (it cannot for a binary, a file too large for the
 * IDE, or a directory). A file that is there but outside the project or without a document is a refusal, never empty.
 */
internal fun diffLeftSource(
    base: String,
    resolved: String,
    fileExists: Boolean,
    canonicalPath: String?,
    hasDocument: () -> Boolean,
): DiffLeft =
    when {
        !fileExists -> DiffLeft.Empty
        relativePath(base, canonicalPath ?: resolved) == null ->
            DiffLeft.Refused(IdeResult.Failed(IdeFailureKind.OUTSIDE_PROJECT, "the path is not inside the project"))
        !hasDocument() ->
            DiffLeft.Refused(IdeResult.Failed(IdeFailureKind.INVALID_ARGUMENT, "the file is not a text file"))
        else -> DiffLeft.Current
    }
