package dev.ukitomato.closta.providers.claude.history

import java.io.IOException
import java.nio.file.Files
import java.nio.file.InvalidPathException
import java.nio.file.Path

/**
 * Where the CLI keeps the records of one project: `<configDir>/projects/<name>/`, with `<name>` made from the
 * real path of [workingDirectory] (links resolved, as the CLI names it; the capture's recorder does the same). A place
 * that cannot be found is not made up: nothing is listed or restored, and the reason is logged in the words of what
 * was being done ([Use]); a place other than the CLI's is never read instead.
 */
internal class RecordPlace(
    configDir: () -> Path?,
    private val workingDirectory: String?,
    private val resolveLinks: Boolean,
    private val log: (String) -> Unit,
) {
    // Asked once, under a lock (a list and a read can run side by side), and a null is kept.
    private val config: Path? by lazy(LazyThreadSafetyMode.SYNCHRONIZED, configDir)

    /** What a place that is not there leaves undone: the list is empty, and a record to restore is not read. */
    enum class Use(
        val consequence: String,
    ) {
        LIST("none are listed"),
        READ("nothing is restored"),
    }

    /** The place of the project's records, or null (and the reason logged) when there is none to read. */
    fun find(use: Use): Path? {
        val name = workingDirectory?.let { ProjectTranscripts.nameOf(if (resolveLinks) physical(it) else it) }
        val short = name?.takeIf { it.length <= ProjectTranscripts.MAX_NAME_LENGTH }
        val root = if (short == null) null else config
        val place = short?.let { root?.resolve("projects")?.resolve(it) }
        val reason =
            when {
                name == null -> "the project has no working directory"
                short == null -> "the project's directory name is longer than ${ProjectTranscripts.MAX_NAME_LENGTH}"
                root == null -> "the CLI's config directory could not be found"
                !Files.isDirectory(place) -> "the CLI has no place for this project yet"
                else -> null
            }
        if (reason != null) log("saved sessions: $reason, so ${use.consequence}")
        return place.takeIf { reason == null }
    }

    // A directory that cannot be resolved is named as it is, and said so.
    private fun physical(directory: String): String =
        try {
            Path.of(directory).toRealPath().toString()
        } catch (ignored: IOException) {
            unresolved(directory)
        } catch (ignored: InvalidPathException) {
            unresolved(directory)
        }

    private fun unresolved(directory: String): String {
        log("saved sessions: the project's directory has no real path, so its name is used as it is")
        return directory
    }
}
