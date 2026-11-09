package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.ToolResult

// What a subagent's tab says, decided without the IDE. Free of `com.intellij`.

/** Where the subagent of a tab is: still running, done, or ended with an error. */
enum class TabState { RUNNING, DONE, FAILED }

/** The state of the subagent whose starting call has [result] (null while it runs). */
fun tabState(result: ToolResult?): TabState =
    when {
        result == null -> TabState.RUNNING
        result.isError == true -> TabState.FAILED
        else -> TabState.DONE
    }

/** A conversation's tab name: [title] cut to [CHAT_TAB_MAX], or New Conversation's when it is blank. */
fun chatTabTitle(title: String): String = tabTitle(title, CHAT_TAB_MAX, ClostaBundle.message("chat.newChat.title"))

/** How long a conversation's tab name may be, in the sidebar and among the editor tabs. */
const val CHAT_TAB_MAX = 32

/**
 * A tab's title: [text] in at most [max] characters, cut with "…" (the whole text is its tooltip); [blank] when it is
 * empty.
 */
fun tabTitle(
    text: String,
    max: Int,
    blank: String,
): String {
    val title = text.trim()
    return when {
        title.isEmpty() -> blank
        title.length <= max -> title
        else -> title.take(max - 1).trimEnd() + "…"
    }
}
