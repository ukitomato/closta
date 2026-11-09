package dev.ukitomato.closta.providers.claude

import dev.ukitomato.closta.core.interfaces.SavedSessions
import dev.ukitomato.closta.core.models.SavedSessionSummary
import dev.ukitomato.closta.core.models.SavedTranscript
import java.io.IOException

/**
 * A [SavedSessions] that holds what a test gives it instead of reading a record: [listed], and the transcripts
 * by session id. A [listFailure] or a [readFailure] makes the call throw, as an unreadable place does. What was asked is
 * kept ([lists], [reads]) so a test can say a read did not happen.
 */
class FakeSavedSessions(
    var listed: List<SavedSessionSummary> = emptyList(),
    var transcripts: Map<String, SavedTranscript> = emptyMap(),
) : SavedSessions {
    var listFailure: Throwable? = null
    var readFailure: Exception? = null

    var lists = 0
        private set
    private val asked = mutableListOf<String>()

    /** The ids [read] was called with, in order. */
    val reads: List<String> get() = asked.toList()

    override suspend fun list(): List<SavedSessionSummary> {
        lists++
        listFailure?.let { throw it }
        return listed
    }

    override suspend fun read(sessionId: String): SavedTranscript {
        asked += sessionId
        readFailure?.let { throw it }
        return transcripts[sessionId] ?: throw IOException("no record for the session")
    }
}
