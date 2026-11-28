package dev.ukitomato.closta.platforms.intellij.chat

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.JsonPrimitive
import dev.ukitomato.closta.presenter.view.MessageSource
import dev.ukitomato.closta.presenter.view.Transcript

// The conversation each tab that was cleared with `/clear` last showed, kept per project in the application's settings
// so the tab resumes it after the IDE restarts, however its session stopped. Free of `com.intellij`.

/** The most tabs kept; the oldest are dropped past it. */
const val MAX_CLEARED_TABS = 64

/**
 * What a cleared tab resumes: the conversation's saved id, null when nothing was said after the `/clear` (a new
 * conversation opens), and the folder it ran in (null: the project's).
 */
data class ClearedTab(
    val resumeId: String?,
    val workingDirectory: String?,
)

/**
 * The cleared tabs in one value of the application's settings: a JSON array, oldest first, of `{"host", "id"?, "dir"?}`
 * where `host` is the tab's session id. A value that is not one reads as no tabs.
 */
object ClearedTabs {
    fun encode(tabs: Map<String, ClearedTab>): String =
        JsonArray()
            .apply {
                tabs.forEach { (host, tab) ->
                    add(
                        JsonObject().apply {
                            addProperty("host", host)
                            tab.resumeId?.let { addProperty("id", it) }
                            tab.workingDirectory?.let { addProperty("dir", it) }
                        },
                    )
                }
            }.toString()

    fun decode(text: String?): Map<String, ClearedTab> {
        val items =
            try {
                if (text.isNullOrBlank()) null else JsonParser.parseString(text) as? JsonArray
            } catch (
                @Suppress("TooGenericExceptionCaught") _: RuntimeException,
            ) {
                null
            }
        return items
            ?.mapNotNull(::tabOf)
            ?.toMap(LinkedHashMap())
            .orEmpty()
    }

    /** [tabs] with [tab] last under [hostId] (an earlier one of it dropped), the oldest dropped past the limit. */
    fun withTab(
        tabs: Map<String, ClearedTab>,
        hostId: String,
        tab: ClearedTab,
    ): Map<String, ClearedTab> =
        (tabs - hostId + (hostId to tab)).entries.toList().takeLast(MAX_CLEARED_TABS).associate {
            it.toPair()
        }

    /**
     * [tabs] after sessions stopped, each as its host id with what it showed, null when it was not cleared: a cleared
     * one writes its row, one not cleared drops the row an earlier run of the same id left.
     */
    fun after(
        tabs: Map<String, ClearedTab>,
        stopped: List<Pair<String, ClearedTab?>>,
    ): Map<String, ClearedTab> =
        stopped.fold(tabs) { kept, (host, tab) -> if (tab == null) kept - host else withTab(kept, host, tab) }

    private fun tabOf(item: JsonElement): Pair<String, ClearedTab>? {
        val fields = item as? JsonObject
        val host = fields?.text("host")?.takeIf { it.isNotBlank() }
        return host?.let { it to ClearedTab(fields.text("id"), fields.text("dir")) }
    }

    private fun JsonObject.text(key: String): String? = (get(key) as? JsonPrimitive)?.takeIf { it.isString }?.asString
}

/** Whether a message was sent after the last `/clear`; false while the conversation was never cleared. */
fun Transcript.sentAfterClear(): Boolean {
    val cleared = clearedAt ?: return false
    return messages.order.drop(cleared + 1).any { messages[it]?.source == MessageSource.Sent }
}

/**
 * What to keep of the tab of the session [hostId] whose conversation is saved under [resumeId]; null when it was never
 * cleared. Before the CLI's first `init` after the clear ([resumeId] is still [hostId]) or with nothing sent since,
 * there is no conversation to resume.
 */
@Suppress("LongParameterList")
fun clearedTabOf(
    hostId: String,
    resumeId: String,
    clearedAt: Int?,
    sentAfterClear: Boolean,
    workingDirectory: String?,
    projectBase: String?,
): ClearedTab? {
    if (clearedAt == null) return null
    val dir = workingDirectory?.takeIf { it != projectBase }
    return ClearedTab(resumeId.takeIf { it != hostId && sentAfterClear }, dir)
}
