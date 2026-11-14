package dev.ukitomato.closta.providers.claude.fixtures

import com.google.gson.JsonParser
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import java.io.File

/**
 * Reads recorded captures off the test classpath and turns them into [AgentEvent]s, for tests only.
 *
 * This is the loader, not the decoder. Turning a line into a value is the production codec's job
 * ([StreamJsonCodec.decode]); this object delegates to it and adds only the things a test needs and
 * the codec must not have — classpath IO to fetch a capture, and `manifest.json` to know what should
 * be there. Keeping the IO here is what lets the codec stay pure: a stdout reader that pumps lines is
 * the session's concern, and nothing under `src/main/` reads a capture.
 *
 * It replaced the earlier stand-in reader, which held its own copy of the builder table. Two decoders
 * would have meant a protocol change could be followed by one and not the other; there is one now,
 * and this loader routes every line through it.
 */
object CaptureFixtures {
    /** The capture index, sitting next to the captures at the root of the test classpath. */
    const val MANIFEST = "manifest.json"

    private const val CAPTURE_SUFFIX = ".ndjson"

    /**
     * Lines of a capture that the codec cannot place, by capture and wire type — an exception table that
     * has three rows for the recorder's own mark in the resume, fork and cut captures, and four for
     * kinds 2.1.319 sends that the codec has not learnt yet.
     * Tests that derive their expectations from it (the turn left open, the thread still running, the
     * unknown-kind tally) expect nothing unusual from the CLI's own lines.
     *
     * To add a row, write a comment on it with the reason and what will fix it, e.g.
     * `"22-foo" to mapOf("system/init" to 1), // why it is unplaceable; fixed when the codec learns it`.
     * A row without a reason and a fix is a silent hole in the captures.
     */
    val KNOWN_UNPLACED: Map<String, Map<String, Int>> =
        mapOf(
            // The recorder's own mark between the two stdouts of a resume scene (`recorder/record.mjs`). It is not
            // a line the CLI wrote, so the codec rightly does not place it; it stays one line of the capture (the
            // manifest counts it) and one unknown kind in the tally. It stays as long as the scene is recorded.
            "22-resume" to mapOf(RECORDER_BOUNDARY to 1),
            // The same mark, between the two stdouts of the fork scene (`--resume --fork-session`).
            "26-fork-session" to mapOf(RECORDER_BOUNDARY to 1),
            // The same mark, between the two stdouts of the cut scene (`--resume --fork-session
            // --resume-session-at`).
            "27-resume-session-at" to mapOf(RECORDER_BOUNDARY to 1),
            // `/clear` answers with `conversation_reset` (SDKConversationResetMessage), which the codec does not
            // type yet. The row goes when the codec learns the kind.
            "33-clear-reset" to mapOf("conversation_reset" to 1),
            // A denied tool use is announced as `system/permission_denied` (SDKPermissionDeniedMessage), which the
            // codec does not type yet: in 36 the main agent's Bash under `dontAsk`, in 10 and 11 a subagent's
            // Monitor or Bash that needed an approval. The three rows go when the codec learns the kind.
            "36-permission-denied" to mapOf("system/permission_denied" to 1),
            "10-background-task" to mapOf("system/permission_denied" to 1),
            "11-background-followup" to mapOf("system/permission_denied" to 1),
        )

    /** The wire type of the recorder's mark that separates the two stdouts of a resume capture. */
    const val RECORDER_BOUNDARY = "recorder_boundary"

    /** One capture, as `manifest.json` describes it. */
    data class Scenario(
        val scenario: String,
        val file: String,
        val claudeVersion: String,
        val sha256: String,
        val lines: Int,
    )

    /** `manifest.json` itself. */
    data class Manifest(
        val claudeVersion: String,
        val scenarioCount: Int,
        val scenarios: List<Scenario>,
    )

    /** Converts one line, through the production codec. */
    fun parse(line: String): AgentEvent = StreamJsonCodec.decode(line)

    /** Converts a whole capture. Blank lines are not lines: a trailing newline is not an event. */
    fun parseAll(text: String): List<AgentEvent> = nonBlankLines(text).map(::parse)

    /** The lines a capture actually contains, which is what `manifest.json` counts. */
    fun nonBlankLines(text: String): List<String> = text.lineSequence().filter { it.isNotBlank() }.toList()

    /** Reads a capture off the test classpath and converts it. */
    fun readCapture(fileName: String): List<AgentEvent> = parseAll(textOf(fileName))

    /** The raw bytes of a classpath fixture — sha256 is taken over these, not over decoded text. */
    fun bytesOf(fileName: String): ByteArray =
        checkNotNull(javaClass.classLoader.getResourceAsStream(fileName)) {
            "`$fileName` is not on the test classpath — check the fixture wiring in jetbrains/build.gradle.kts"
        }.use { it.readBytes() }

    /** The text of a classpath fixture. The recorder writes UTF-8. */
    fun textOf(fileName: String): String = String(bytesOf(fileName), Charsets.UTF_8)

    /** Where the fixtures sit on disk, so that "what is actually there" can be listed. */
    fun fixtureDirectory(): File {
        val url =
            checkNotNull(javaClass.classLoader.getResource(MANIFEST)) {
                "`$MANIFEST` is not on the test classpath — check the fixture wiring in jetbrains/build.gradle.kts"
            }
        return File(url.toURI()).parentFile
    }

    /** The capture files present on the classpath, regardless of what the manifest claims. */
    fun captureFileNames(): List<String> =
        (fixtureDirectory().listFiles()?.asList() ?: emptyList())
            .filter { it.isFile && it.name.endsWith(CAPTURE_SUFFIX) }
            .map { it.name }
            .sorted()

    /** The CLI flags `manifest.json` records for the capture [file] (the `flags` array). */
    fun manifestFlags(file: String): List<String> {
        val root = JsonParser.parseString(textOf(MANIFEST)).asJsonObject
        val entry =
            root.getAsJsonArray("scenarios").map { it.asJsonObject }.single { it.get("file").asString == file }
        return entry.getAsJsonArray("flags").map { it.asString }
    }

    /** The flags of the second CLI of a resume capture (`resume_flags`), or null for a capture with one CLI. */
    fun manifestResumeFlags(file: String): List<String>? {
        val root = JsonParser.parseString(textOf(MANIFEST)).asJsonObject
        val entry =
            root.getAsJsonArray("scenarios").map { it.asJsonObject }.single { it.get("file").asString == file }
        return entry.getAsJsonArray("resume_flags")?.map { it.asString }
    }

    /** The stdin lines the recorder wrote next to an attachments capture: the file, its sha256 and line count. */
    data class StdinLines(
        val file: String,
        val sha256: String,
        val lines: Int,
    )

    /** What `manifest.json` records of the stdin lines kept for the capture [file], or null for any other capture. */
    fun manifestStdin(file: String): StdinLines? {
        val root = JsonParser.parseString(textOf(MANIFEST)).asJsonObject
        val entry =
            root.getAsJsonArray("scenarios").map { it.asJsonObject }.single { it.get("file").asString == file }
        val name = entry.get("stdin_file")?.asString ?: return null
        return StdinLines(name, entry.get("stdin_sha256").asString, entry.get("stdin_lines").asInt)
    }

    /** The transcript saved next to a resume capture: its file name and the sha256 the manifest recorded. */
    fun manifestTranscript(file: String): Pair<String, String>? {
        val root = JsonParser.parseString(textOf(MANIFEST)).asJsonObject
        val entry =
            root.getAsJsonArray("scenarios").map { it.asJsonObject }.single { it.get("file").asString == file }
        val name = entry.get("transcript_file")?.asString ?: return null
        return name to entry.get("transcript_sha256").asString
    }

    /** Parses `manifest.json`. */
    fun manifest(): Manifest {
        val root = JsonParser.parseString(textOf(MANIFEST)).asJsonObject
        val scenarios =
            root.getAsJsonArray("scenarios").map { entry ->
                val item = entry.asJsonObject
                Scenario(
                    scenario = item.get("scenario").asString,
                    file = item.get("file").asString,
                    claudeVersion = item.get("claude_version").asString,
                    sha256 = item.get("sha256").asString,
                    lines = item.get("lines").asInt,
                )
            }
        return Manifest(
            claudeVersion = root.get("claude_version").asString,
            scenarioCount = root.get("scenario_count").asInt,
            scenarios = scenarios,
        )
    }
}
