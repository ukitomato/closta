package dev.ukitomato.closta.platforms.intellij.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Which sessions have a content-roots notice up: each session's launched folders against the folders [rootsNow] gives
 * for its working directory, run through [rootsNotice] at each change of the IDE's roots. The state of the notices
 * lives here, not on any screen: a notice is up once per session however many screens show it, and a sync that
 * changes nothing says nothing. Free of `com.intellij`.
 */
class RootsWatch(
    private val rootsNow: (workingDirectory: String?) -> Set<String>,
) {
    private class Entry(
        val cwd: String?,
        val launched: Set<String>,
        var shown: Boolean = false,
        var shownOnce: Boolean = false,
    )

    private val entries = LinkedHashMap<String, Entry>()
    private val up = MutableStateFlow<Set<String>>(emptySet())

    /** The ids of the sessions whose notice is up. */
    val pending: StateFlow<Set<String>> = up

    /** The session [id], running in [cwd], was launched with [roots]: a launch again of the same id starts over. */
    @Synchronized
    fun launched(
        id: String,
        cwd: String?,
        roots: Set<String>,
    ) {
        entries[id] = Entry(cwd, roots)
        publish()
    }

    /** The IDE's content roots may have changed. */
    @Synchronized
    fun rootsChanged() {
        for (entry in entries.values) {
            when (rootsNotice(entry.launched, rootsNow(entry.cwd), entry.shown, entry.shownOnce)) {
                NoticeChange.SHOW -> {
                    entry.shown = true
                    entry.shownOnce = true
                }
                NoticeChange.HIDE -> entry.shown = false
                NoticeChange.NONE -> Unit
            }
        }
        publish()
    }

    /** The session [id] is gone. */
    @Synchronized
    fun forget(id: String) {
        entries.remove(id)
        publish()
    }

    private fun publish() {
        up.value = entries.filterValues { it.shown }.keys.toSet()
    }
}
