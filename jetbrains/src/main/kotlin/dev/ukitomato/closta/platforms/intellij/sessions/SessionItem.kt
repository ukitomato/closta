package dev.ukitomato.closta.platforms.intellij.sessions

import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.chat.ChatDirectory
import dev.ukitomato.closta.platforms.intellij.chat.Placement
import dev.ukitomato.closta.platforms.intellij.chat.shownAt
import dev.ukitomato.closta.presenter.view.SessionGroup
import dev.ukitomato.closta.presenter.view.WindowGroup
import dev.ukitomato.closta.presenter.view.windowGroupOf

/** A session in the sessions tree: an open one, or one that ran when the project last closed (a mark). */
sealed interface SessionItem {
    val sessionId: String
    val title: String

    fun group(): SessionGroup

    /** The heading it sits under. */
    fun windowGroup(): WindowGroup

    data class Live(
        val entry: ChatDirectory.Entry,
    ) : SessionItem {
        override val sessionId: String get() = entry.sessionId
        override val title: String get() = entry.title

        override fun group() = entry.summary.group

        override fun windowGroup() = windowGroupOf(entry.summary.group)
    }

    data class Mark(
        override val sessionId: String,
        override val title: String,
        /** Where it ran when not in the project's folder (a worktree): it is resumed there. */
        val workingDirectory: String? = null,
    ) : SessionItem {
        override fun group() = SessionGroup.OTHER

        override fun windowGroup() = WindowGroup.WAS_RUNNING
    }
}

/** Whether the item's title is bold: a finished session the user has not read. */
fun SessionItem.isUnread(): Boolean = group() == SessionGroup.UNREAD

/** Where [entry]'s session is shown in its project's window (sidebar or editor tab), in words; null when nowhere. */
internal fun shownAtText(entry: ChatDirectory.Entry): String? =
    when (shownAt(entry.project, entry.sessionId)) {
        Placement.SIDEBAR -> ClostaBundle.message("sessions.window.placement.sidebar")
        Placement.EDITOR_TAB -> ClostaBundle.message("sessions.window.placement.tab")
        null -> null
    }
