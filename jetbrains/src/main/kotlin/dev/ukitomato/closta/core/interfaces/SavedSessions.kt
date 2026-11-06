package dev.ukitomato.closta.core.interfaces

import dev.ukitomato.closta.core.models.SavedSessionSummary
import dev.ukitomato.closta.core.models.SavedTranscript

/**
 * The sessions the CLI saved for the project: the list of them, and the conversation of one. The CLI writes the
 * record and this only reads it: a record is never changed here.
 *
 * Both throw when the place cannot be read (a permission, an IO error, a record that is not there), and say nothing of
 * what was in it; a caller that must go on (a session that is resumed without its past) catches that. A place that
 * holds
 * no sessions is not a failure: [list] gives an empty list.
 *
 * Reading is bounded, and a reader says what it left out: [read] counts the lines it did not give ([SavedTranscript]'s
 * skipped and dropped), a record of one session that cannot be read does not make [list] throw (it is left out of the
 * list), and a read stops when its caller is cancelled.
 *
 * Second implementation: a CLI started through WSL saves its record inside WSL, where the IDE's own `~` is not
 * the CLI's, so that start-up needs an implementation that reads the record from there. Every start-up today runs the
 * CLI on the IDE's own OS, where the two are the same place.
 */
interface SavedSessions {
    /** The project's saved sessions, the most recently written first, at most [MAX_LISTED]. */
    suspend fun list(): List<SavedSessionSummary>

    /**
     * The conversation of the saved session [sessionId], every line of it: only an implementation's bound on the bytes
     * it reads (the newest end of a record too big) leaves older lines out, and counts them as dropped.
     */
    suspend fun read(sessionId: String): SavedTranscript

    /**
     * Where to cut the conversation of [sessionId] to rewind it to the user line [userUuid]: the parentUuid of
     * that line, the last line of what is kept. Null when the line is not in what [read] would read, or has no parent
     * (the first thing the user said), or the record cannot be read. The default knows no record, so it is null.
     */
    suspend fun cutPoint(
        sessionId: String,
        userUuid: String,
    ): String? = null

    /**
     * The conversation of [sessionId] up to the line before the user line [stopBefore]: [read], stopped there.
     * Asked only after [cutPoint] gave a value for the same line. The default throws rather than give the whole
     * conversation, which is not what was asked for.
     */
    suspend fun read(
        sessionId: String,
        stopBefore: String,
    ): SavedTranscript = throw UnsupportedOperationException("this record cannot be read up to a line")

    companion object {
        /** The most sessions [list] gives. */
        const val MAX_LISTED = 50
    }
}
