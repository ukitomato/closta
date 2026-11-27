package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.presenter.view.ExportWords

private const val NAME_MAX = 80
private const val FALLBACK = "conversation"
private const val UNUSABLE = "/\\:*?\"<>|"

/** The name a saved export starts with: [title] without what a file name cannot hold, cut, then `-<date>.md`. */
fun exportFileName(
    title: String,
    date: String,
): String {
    val safe =
        title
            .map { if (it in UNUSABLE || it.isISOControl()) '_' else it }
            .joinToString("")
            .take(NAME_MAX)
            .trim()
    return "${safe.ifEmpty { FALLBACK }}-$date.md"
}

/** The fixed words of an export, each read from the bundle by [text]. */
fun exportWords(text: (String) -> String): ExportWords =
    ExportWords(
        you = text("thread.export.you"),
        claude = text("thread.export.claude"),
        attachment = text("thread.export.attachment"),
        subagent = text("thread.export.subagent"),
        denied = text("thread.export.denied"),
        withdrawn = text("thread.export.withdrawn"),
        cleared = text("thread.export.cleared"),
        compacted = text("thread.export.compacted"),
        olderLeftOut = text("thread.export.olderLeftOut"),
        model = text("thread.export.model"),
        exportedAt = text("thread.export.exportedAt"),
    )
