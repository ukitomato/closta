package dev.ukitomato.closta.platforms.intellij.thread

import java.net.URI
import java.nio.file.InvalidPathException
import java.nio.file.Path

/** Where a link in a reply goes. */
sealed interface LinkTarget {
    /** A web page, for the browser. */
    data class Web(
        val url: String,
    ) : LinkTarget

    /** A file of the project, opened in the editor at [line] (1-based) when the link names one. */
    data class File(
        val path: String,
        val line: Int?,
    ) : LinkTarget
}

private val SCHEME = Regex("^[A-Za-z][A-Za-z0-9+.-]*:")
private val LINE_SUFFIX = Regex("(?::(\\d+)(?::\\d+)?|#L(\\d+)(?:-L?\\d+)?)$")

/**
 * Where the link [href] of a reply goes: `http(s)://` to the browser; a path (relative to [projectRoot], absolute,
 * or `file:`) with an optional `:line` or `#Lline` to the editor, only when it lies inside [projectRoot]; anything
 * else (`javascript:`, `mailto:`, an anchor) nowhere. Free of `com.intellij`, so the fast tests check it.
 */
fun linkTarget(
    href: String,
    projectRoot: String?,
): LinkTarget? {
    val link = href.trim()
    val lower = link.lowercase()
    return when {
        lower.startsWith("http://") || lower.startsWith("https://") -> LinkTarget.Web(link)
        lower.startsWith("file:") -> fileUri(link)?.let { projectFile(it, projectRoot) }
        // The scheme is looked for before a line suffix only: `README.md:10` is a file and its line.
        link.isEmpty() || link.startsWith("#") || hasScheme(LINE_SUFFIX.replace(link, "")) -> null
        else -> projectFile(link, projectRoot)
    }
}

private fun hasScheme(link: String) = SCHEME.containsMatchIn(link) && !isWindowsDrive(link)

private fun isWindowsDrive(link: String) = link.length > 2 && link[1] == ':' && (link[2] == '\\' || link[2] == '/')

private fun fileUri(link: String): String? = runCatching { URI(link).path }.getOrNull()

private fun projectFile(
    link: String,
    projectRoot: String?,
): LinkTarget.File? {
    val root = projectRoot ?: return null
    val match = LINE_SUFFIX.find(link)
    val line = match?.let { (it.groupValues[1].ifEmpty { it.groupValues[2] }).toIntOrNull() }
    val bare = match?.let { link.substring(0, it.range.first) } ?: link
    return try {
        val base = Path.of(root).normalize()
        val path = base.resolve(bare).normalize()
        if (path.startsWith(base)) LinkTarget.File(path.toString(), line) else null
    } catch (_: InvalidPathException) {
        null
    }
}
