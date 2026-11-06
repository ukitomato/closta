package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.ThreadRow
import dev.ukitomato.closta.presenter.view.Transcript
import dev.ukitomato.closta.presenter.view.TurnChangesRecord
import dev.ukitomato.closta.presenter.view.TurnEndRow

// What TurnChanges and the changes bar decide, free of com.intellij so the fast suite holds it. Paths are
// system-independent ('/').

private val NOT_COLLECTED = setOf(".git", ".idea")
private const val SECOND_MS = 1_000L
private const val MINUTE_S = 60L

/** Whether a change to [path] is the session's: under [root], and not in a `.git` or `.idea` folder. */
fun collects(
    root: String,
    path: String,
): Boolean {
    val base = root.trimEnd('/')
    if (!path.startsWith("$base/")) return false
    return path.removePrefix("$base/").split('/').none { it in NOT_COLLECTED }
}

/** [path] as the user reads it: from [root] when it is under it. */
fun shownPath(
    root: String,
    path: String,
): String {
    val base = root.trimEnd('/')
    return if (path.startsWith("$base/")) path.removePrefix("$base/") else path
}

/** The words of a turn's end line: how long it took, and how many files it changed (once the host has looked). */
fun turnEndText(row: TurnEndRow): String {
    val time = row.durationMs?.let(::duration)
    val files =
        when (val changes = row.changes) {
            null -> ClostaBundle.message("chat.turnEnd.checking")
            else -> if (changes.files.isEmpty()) ClostaBundle.message("chat.turnEnd.noChanges") else filesWord(changes)
        }
    return listOfNotNull(time, files).joinToString(" · ")
}

private fun duration(ms: Long): String {
    val seconds = ms / SECOND_MS
    return if (seconds < MINUTE_S) {
        ClostaBundle.message("chat.duration.seconds", seconds)
    } else {
        ClostaBundle.message("chat.duration.minutes", seconds / MINUTE_S, seconds % MINUTE_S)
    }
}

/** The changes bar over the composer: the last turn's files, while the user has neither kept nor reverted them. */
data class ChangesBarState(
    val askKey: String,
    val count: Int,
    val more: Boolean = false,
    /** Files Revert All cannot put back (Local History holds no content of them at the label). */
    val unrevertable: Int = 0,
) {
    val text: String
        get() =
            listOfNotNull(
                ClostaBundle.message(if (more) "chat.changes.changedMore" else "chat.changes.changed", count),
                if (unrevertable > 0) ClostaBundle.message("chat.changes.unrevertable", unrevertable) else null,
            ).joinToString(" · ")
}

private fun filesWord(changes: TurnChangesRecord) =
    ClostaBundle.message(if (changes.more) "chat.turnEnd.filesMore" else "chat.turnEnd.files", changes.files.size)

/** The bar for [rows]: the last turn's end, when it changed files and [settled] does not hold its ask. */
fun changesBar(
    rows: List<ThreadRow>,
    settled: Set<String>,
): ChangesBarState? {
    val last = rows.lastOrNull { it is TurnEndRow } as? TurnEndRow ?: return null
    val changes = last.changes
    val count = changes?.files?.size ?: 0
    return if (changes == null || count == 0 || last.askKey in settled) {
        null
    } else {
        ChangesBarState(last.askKey, count, changes.more, changes.files.count { !it.revertable })
    }
}

/** The asks of [pending] whose turn has ended and whose changes the host has not yet found. */
fun toLookAt(
    transcript: Transcript,
    pending: Set<String>,
): List<String> =
    transcript.turnEnds.values
        .mapNotNull { it.askKey }
        .filter { it in pending && it !in transcript.turnChanges }
