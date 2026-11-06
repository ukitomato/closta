package dev.ukitomato.closta.providers.claude.history

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import java.nio.file.Files
import java.nio.file.Path

/**
 * Capture 27 as the tests of a rewind use it: the record its first CLI saved (two turns, each said by one
 * user line), put where the reader looks, and the lines that were typed. Only the capture's own words are read.
 */
object CutCapture {
    private const val CAPTURE = "27-resume-session-at.ndjson"

    private val rows: List<JsonObject> by lazy {
        val (name, _) = checkNotNull(CaptureFixtures.manifestTranscript(CAPTURE))
        CaptureFixtures
            .textOf(name)
            .lines()
            .filter { it.isNotBlank() }
            .map { JsonParser.parseString(it).asJsonObject }
    }

    // The lines the user typed, in order: a user line whose message content is a string.
    private val said: List<JsonObject> by lazy {
        rows.filter {
            it.str("type") == "user" &&
                it
                    .getAsJsonObject("message")
                    .get("content")
                    ?.asJsonPrimitive
                    ?.isString == true
        }
    }

    private fun JsonObject.str(key: String): String? = get(key)?.takeIf { it.isJsonPrimitive }?.asString

    /** The id the record was saved under. */
    val sessionId: String by lazy { checkNotNull(rows.first { it.has("sessionId") }.str("sessionId")) }

    /** The uuid of the first thing the user said, and of the second. */
    val firstUserUuid: String by lazy { checkNotNull(said[0].str("uuid")) }
    val secondUserUuid: String by lazy { checkNotNull(said[1].str("uuid")) }

    /** What the second line's `parentUuid` says: where the capture's own CLI was told to cut. */
    val secondParentUuid: String by lazy { checkNotNull(said[1].str("parentUuid")) }

    /** How many lines the user typed in the record. */
    val turns: Int get() = said.size

    /** Puts the record in the place of [directory] under [config], as the CLI saved it, and gives its reader. */
    fun reader(
        config: Path,
        directory: String,
        io: kotlinx.coroutines.CoroutineDispatcher,
    ): ProjectTranscripts {
        val place = config.resolve("projects").resolve(ProjectTranscripts.nameOf(directory))
        Files.createDirectories(place)
        val (name, _) = checkNotNull(CaptureFixtures.manifestTranscript(CAPTURE))
        Files.write(place.resolve("$sessionId.jsonl"), CaptureFixtures.bytesOf(name))
        return ProjectTranscripts(config, directory, io)
    }
}
