package dev.ukitomato.closta.providers.claude.history

import com.google.gson.JsonParser
import dev.ukitomato.closta.core.models.SavedTranscript
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import java.nio.file.Files

/**
 * Capture 22 as the tests of the history use it: the record the first CLI saved, read by the real reader from a
 * place made in a temporary directory, and the two stdouts either side of the recorder's mark.
 */
object CapturedTranscript {
    const val CAPTURE = "22-resume.ndjson"

    private val boundary = "\"type\":\"${CaptureFixtures.RECORDER_BOUNDARY}\""

    private val lines: List<String> by lazy { CaptureFixtures.nonBlankLines(CaptureFixtures.textOf(CAPTURE)) }

    private val mark: Int by lazy {
        lines.indexOfFirst { boundary in it }.also {
            check(
                it > 0,
            ) { "no mark in $CAPTURE" }
        }
    }

    /** The first CLI's stdout: what a host that started the session new would have folded. */
    val firstStdout: List<String> get() = lines.take(mark)

    /** The second CLI's stdout (`--resume`): the new turn only. */
    val secondStdout: List<String> get() = lines.drop(mark + 1)

    /** The id both CLIs say, and the record was saved under. */
    val sessionId: String by lazy {
        val (name, _) = checkNotNull(CaptureFixtures.manifestTranscript(CAPTURE))
        val first = CaptureFixtures.textOf(name).lineSequence().first { "\"sessionId\"" in it }
        JsonParser
            .parseString(first)
            .asJsonObject
            .get("sessionId")
            .asString
    }

    /** What the reader gives for the record of the capture. */
    fun read(): SavedTranscript {
        val config = Files.createTempDirectory("transcript-22")
        try {
            val directory = "/work/the project"
            val place = config.resolve("projects").resolve(ProjectTranscripts.nameOf(directory))
            Files.createDirectories(place)
            val (name, _) = checkNotNull(CaptureFixtures.manifestTranscript(CAPTURE))
            Files.write(place.resolve("$sessionId.jsonl"), CaptureFixtures.bytesOf(name))
            return runBlocking { ProjectTranscripts(config, directory, Dispatchers.Unconfined).read(sessionId) }
        } finally {
            config.toFile().deleteRecursively()
        }
    }
}
