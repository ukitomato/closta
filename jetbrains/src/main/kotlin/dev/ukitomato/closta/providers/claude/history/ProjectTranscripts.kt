package dev.ukitomato.closta.providers.claude.history

import dev.ukitomato.closta.core.interfaces.SavedSessions
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.SavedSessionSummary
import dev.ukitomato.closta.core.models.SavedTranscript
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.IOException
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.NoSuchFileException
import java.nio.file.Path
import java.nio.file.attribute.BasicFileAttributes
import kotlin.coroutines.CoroutineContext

/**
 * The saved sessions of one project, read from the record the CLI writes:
 * `<configDir>/projects/<name>/<id>.jsonl`, one JSON object a line, where `<name>` is the project's working directory
 * with every character that is not a letter or a digit made a `-` (the SDK's `sdk.mjs`).
 * It only reads: the file is never written, moved or removed.
 *
 * A record is not stream-json (its ids are `sessionId`, not `session_id`, and it holds lines of its own kinds besides
 * the conversation), so it has a reader of its own ([RecordLines]) and the stdout codec is left as it is. Only the
 * `user` and `assistant` lines of the main conversation become events, in the shape the codec gives the same lines of
 * stdout: the same fold then draws them.
 *
 * [workingDirectory] is the directory the CLI is started in, and the name is made from its real path (symbolic links
 * resolved), as the CLI names it, unless `resolveLinks` is false (a WSL project: a Linux path).
 * With none, or a name longer than [MAX_NAME_LENGTH] (the SDK cuts such a name and adds
 * a hash that this has no capture of), or no place by that name, nothing is listed or restored, and the reason is
 * logged: a place other than the CLI's is never read instead. [log] gets counts and reasons, never a title or a line.
 *
 * What is read is bounded: a line over [RecordLines.MAX_LINE_BYTES] is counted and not parsed, a line that is not a
 * user or an assistant line by its type is not parsed, and a record over [MAX_RECORD_BYTES] is read from its newest
 * end only (the older part is not restored, and the view says so). A file in the place that is a symbolic link is
 * neither listed nor read: nothing outside the place is.
 *
 * The reads run on [io]. Free of `com.intellij`.
 */
class ProjectTranscripts(
    /**
     * Where the CLI's config directory is, or null when it cannot be found: asked at most once, on the first
     * read, and a null is remembered, so a session whose place was not found stays empty. Called on [io].
     */
    configDir: () -> Path?,
    private val workingDirectory: String?,
    private val io: CoroutineDispatcher = Dispatchers.IO,
    /** The most bytes of a record read; a test sets it small. */
    private val maxRecordBytes: Long = MAX_RECORD_BYTES,
    /** False names the place from [workingDirectory] as it is (a Linux path the IDE's OS cannot resolve). */
    resolveLinks: Boolean = true,
    private val log: (String) -> Unit = {},
) : SavedSessions {
    /** The CLI runs on the IDE's own OS: its config directory is a path that is already known. */
    constructor(
        configDir: Path,
        workingDirectory: String?,
        io: CoroutineDispatcher = Dispatchers.IO,
        maxRecordBytes: Long = MAX_RECORD_BYTES,
        log: (String) -> Unit = {},
    ) : this({ configDir }, workingDirectory, io, maxRecordBytes, true, log)

    private val places = RecordPlace(configDir, workingDirectory, resolveLinks, log)

    override suspend fun list(): List<SavedSessionSummary> = withContext(io) { listBlocking() }

    override suspend fun read(sessionId: String): SavedTranscript =
        withContext(io) { readBlocking(sessionId, currentCoroutineContext(), stop = null).transcript }

    override suspend fun cutPoint(
        sessionId: String,
        userUuid: String,
    ): String? =
        withContext(io) {
            try {
                // Read only as far as the line: its parent is all that is wanted. It goes into the CLI's argv, so one
                // that is not a UUID is no point to cut at.
                val read = readBlocking(sessionId, currentCoroutineContext(), Stop(userUuid, keepLine = true))
                val parent = if (read.stopped) read.lines.lastOrNull()?.parentUuid else null
                parent?.takeIf(RecordLines::isSessionId)
            } catch (ignoredUnreadable: IOException) {
                log("saved sessions: no cut point, the record could not be read")
                null
            } catch (ignoredNoRecord: IllegalArgumentException) {
                log("saved sessions: no cut point, not a session id")
                null
            }
        }

    override suspend fun read(
        sessionId: String,
        stopBefore: String,
    ): SavedTranscript =
        withContext(io) {
            val read = readBlocking(sessionId, currentCoroutineContext(), Stop(stopBefore, keepLine = false))
            // Not the whole conversation, which is not asked for: the caller says the history could not be put back.
            if (!read.stopped) throw NoSuchElementException("the line to stop before is not in the record")
            read.transcript
        }

    private fun listBlocking(): List<SavedSessionSummary> {
        val place = places.find(RecordPlace.Use.LIST) ?: return emptyList()
        var unreadable = 0
        val files =
            Files.newDirectoryStream(place, "*$SUFFIX").use { stream -> stream.toList() }.mapNotNull {
                stamped(it) { unreadable++ }
            }
        val newest =
            files
                .sortedWith(compareByDescending<Stamped> { it.modifiedMs }.thenBy { it.path.fileName.toString() })
                .take(SavedSessions.MAX_LISTED)
        val listed = newest.mapNotNull { head(it) { unreadable++ } }
        // One record that cannot be read is left out of the list, not a reason to list none: only the count is logged.
        log("saved sessions: listed ${listed.size} of ${files.size} records, $unreadable could not be read")
        return listed
    }

    private class Stamped(
        val path: Path,
        val id: String,
        val modifiedMs: Long,
        val bytes: Long,
    )

    // A record is a regular file (not a link) named by a session id; anything else in the place is not one. A file that
    // was removed since the directory was listed is no longer there to list, and one that cannot be read is counted.
    private fun stamped(
        path: Path,
        unreadable: () -> Unit,
    ): Stamped? {
        val name = path.fileName.toString().removeSuffix(SUFFIX)
        val attributes = if (RecordLines.isSessionId(name)) attributesOf(path, unreadable) else null
        // A time before 1970 is no time the view can show: the least it can say is 0.
        return attributes?.takeIf { it.isRegularFile }?.let {
            Stamped(path, name, it.lastModifiedTime().toMillis().coerceAtLeast(0), it.size())
        }
    }

    private fun attributesOf(
        path: Path,
        unreadable: () -> Unit,
    ): BasicFileAttributes? =
        try {
            Files.readAttributes(path, BasicFileAttributes::class.java, LinkOption.NOFOLLOW_LINKS)
        } catch (ignoredRemoved: NoSuchFileException) {
            null
        } catch (ignoredUnreadable: IOException) {
            unreadable()
            null
        }

    /**
     * The summary of one record, titled as [RecordTitles.titleOf] says, or null when no user speaks in it or when it
     * cannot be read.
     */
    private fun head(
        stamped: Stamped,
        unreadable: () -> Unit,
    ): SavedSessionSummary? {
        val title =
            try {
                RecordTitles.titleOf(stamped.path)
            } catch (ignoredRemoved: NoSuchFileException) {
                null
            } catch (ignoredUnreadable: IOException) {
                unreadable()
                null
            }
        return title?.let {
            SavedSessionSummary(stamped.id, it.ifEmpty { stamped.id }, stamped.modifiedMs, stamped.bytes)
        }
    }

    private class Reading {
        val kept = ArrayDeque<RecordLines.Kept>()
        var skipped = 0
        var tooLong = 0
        var dropped = 0
        var oldestUnread = false
        var stopped = false

        // Keeps a line, or counts it as skipped. False when the line is the one the read stops at (kept or not, as
        // [stop] says).
        fun take(
            event: RecordLines.Kept?,
            stop: Stop?,
        ): Boolean {
            if (event != null && stop != null && event.isUserLine(stop.uuid)) {
                stopped = true
                if (stop.keepLine) kept.addLast(event)
                return false
            }
            if (event == null) skipped++ else kept.addLast(event)
            return true
        }
    }

    /** The user line a read stops at ([keepLine]: the line is kept, or the read ends before it). */
    private class Stop(
        val uuid: String,
        val keepLine: Boolean,
    )

    /** What a read gave: the transcript, the lines it kept, and whether it stopped at the line it was told to. */
    private class ReadResult(
        val transcript: SavedTranscript,
        val lines: List<RecordLines.Kept>,
        val stopped: Boolean,
    )

    private fun readBlocking(
        sessionId: String,
        context: CoroutineContext,
        stop: Stop?,
    ): ReadResult {
        require(RecordLines.isSessionId(sessionId)) { "not a session id" }
        val place = places.find(RecordPlace.Use.READ) ?: throw NoSuchFileException("no place for the saved sessions")
        // Every line of the conversation that the byte limit lets in; the older ones are counted as dropped.
        val reading = Reading()
        val opened = RecordFiles.open(place.resolve("$sessionId$SUFFIX"), maxRecordBytes)
        if (opened.oldestUnread) {
            // The lines before were never read, so they cannot be counted: at least one was dropped, for the view to
            // say that older ones were left out.
            reading.dropped++
            reading.oldestUnread = true
        }
        BoundedLines(opened.input, RecordLines.MAX_LINE_BYTES).use { lines ->
            collect(lines, reading, context, stop)
        }
        // A cut can leave, first, the answer to a call that was cut away: with nothing to belong to, it is left out
        // too.
        while (reading.dropped > 0 && reading.kept.firstOrNull()?.onlyResults == true) {
            reading.kept.removeFirst()
            reading.dropped++
        }
        log(
            "saved sessions: read ${reading.kept.size} lines, ${reading.skipped} skipped " +
                "(${reading.tooLong} over the line limit), ${reading.dropped} dropped" +
                if (reading.oldestUnread) ", the oldest part of the record was not read" else "",
        )
        return ReadResult(
            SavedTranscript(reading.kept.map { it.event }, reading.skipped, reading.dropped),
            reading.kept.toList(),
            reading.stopped,
        )
    }

    // The loop looks at its own cancellation: a read of a big record does not outlive the session that asked for it.
    private fun collect(
        lines: BoundedLines,
        reading: Reading,
        context: CoroutineContext,
        stop: Stop?,
    ) {
        while (true) {
            context.ensureActive()
            val line = lines.next() ?: return
            when {
                line is BoundedLines.Line.TooLong -> {
                    reading.skipped++
                    reading.tooLong++
                }
                (line as BoundedLines.Line.Text).text.isBlank() -> Unit
                else -> if (!reading.take(RecordLines.eventOf(line.text), stop)) return
            }
        }
    }

    companion object {
        /** The SDK keeps a name up to this many characters as it is; a longer one it cuts and adds a hash to. */
        const val MAX_NAME_LENGTH = 200

        /**
         * The most bytes of a record that are read: of a bigger one only this much of its newest end, from the first
         * whole line in it. Older lines were not read, so the read says it dropped some.
         */
        const val MAX_RECORD_BYTES = 64L * 1024 * 1024

        private const val SUFFIX = ".jsonl"

        /** The name of a project's place: the directory with every character but a letter or a digit made a `-`. */
        fun nameOf(directory: String): String =
            directory.map { if (it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9') it else '-' }.joinToString("")
    }
}

// Whether a line of the record is the user line [uuid], the one a rewound read stops before.
private fun RecordLines.Kept.isUserLine(uuid: String): Boolean = event is AgentEvent.User && event.uuid == uuid
