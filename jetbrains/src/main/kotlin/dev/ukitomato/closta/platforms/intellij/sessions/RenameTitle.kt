package dev.ukitomato.closta.platforms.intellij.sessions

/** How long a name the user gives a session may be. */
const val RENAME_MAX = 200

private val LINE_BREAKS = Regex("[\r\n]+")

/** The name the user typed as the CLI is asked to keep it: on one line, trimmed and cut; null when nothing is left. */
fun renameTitle(text: String): String? =
    text
        .replace(LINE_BREAKS, " ")
        .trim()
        .take(RENAME_MAX)
        .takeIf { it.isNotEmpty() }
