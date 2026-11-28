package dev.ukitomato.closta.core.interfaces

/**
 * The files open in the IDE's editor tabs, in the order of the tabs. The counterpart of a VS Code host is its
 * `window.tabGroups`.
 */
interface OpenEditors {
    /** The open files, or a failure as a value. Files that are not on disk (a chat, a diff) are not listed. */
    suspend fun list(): IdeResult<List<OpenEditor>>
}

/**
 * One open file: [path] is the absolute path as the IDE writes it, [active] is the tab in front, [modified] is whether
 * its buffer has changes not yet on disk. [toString] says no more than the flags, so a log line carries no path.
 */
data class OpenEditor(
    val path: String,
    val active: Boolean,
    val modified: Boolean,
) {
    override fun toString(): String = "OpenEditor(active=$active, modified=$modified)"
}
