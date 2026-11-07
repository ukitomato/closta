package dev.ukitomato.closta.providers.claude.history

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import dev.ukitomato.closta.core.interfaces.SavedSessions
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeFalse
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.Files
import java.nio.file.NoSuchFileException
import java.nio.file.Path
import java.nio.file.attribute.FileTime
import java.nio.file.attribute.PosixFilePermissions

/**
 * The reader of the CLI's saved sessions, on a place the test makes in a temporary directory: the record the
 * CLI
 * wrote when the capture was taken, and records built here for the edges.
 */
class ProjectTranscriptsTest {
    @TempDir
    lateinit var config: Path

    private val cwd = "/work/the project"
    private val logged = mutableListOf<String>()

    private fun sessions(
        directory: String? = cwd,
        io: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.Unconfined,
    ) = ProjectTranscripts(config, directory, io) { logged += it }

    private fun place(): Path =
        config.resolve("projects").resolve(ProjectTranscripts.nameOf(cwd)).also {
            Files.createDirectories(it)
        }

    private var counter = 0

    private fun id(): String = "00000000-0000-4000-8000-%012d".format(++counter)

    /** Writes a record named by [id]; [modified] is how many seconds after the epoch it was last written. */
    private fun record(
        lines: List<String>,
        id: String = id(),
        modified: Long = 1_000_000L + counter,
    ): String {
        val file = place().resolve("$id.jsonl")
        Files.writeString(file, lines.joinToString("\n", postfix = "\n"))
        Files.setLastModifiedTime(file, FileTime.fromMillis(modified * 1000))
        return id
    }

    private fun obj(vararg members: Pair<String, Any>): JsonObject =
        JsonObject().also { json ->
            members.forEach { (key, value) ->
                when (value) {
                    is Boolean -> json.addProperty(key, value)
                    is String -> json.addProperty(key, value)
                    is Number -> json.addProperty(key, value)
                    is com.google.gson.JsonElement -> json.add(key, value)
                    else -> error("not a JSON value")
                }
            }
        }

    private fun text(vararg blocks: String): JsonArray =
        JsonArray().also { array -> blocks.forEach { array.add(obj("type" to "text", "text" to it)) } }

    private fun toolResult(id: String = "toolu_1"): JsonArray =
        JsonArray().also {
            it.add(
                obj(
                    "type" to "tool_result",
                    "tool_use_id" to id,
                    "content" to "ok",
                    "is_error" to false,
                ),
            )
        }

    private fun userLine(
        content: com.google.gson.JsonElement,
        vararg more: Pair<String, Any>,
    ): String =
        obj(
            "type" to "user",
            "uuid" to "u-${++counter}",
            "sessionId" to SESSION,
            "timestamp" to "2026-10-17T05:40:20.077Z",
            "isSidechain" to false,
            "message" to obj("role" to "user", "content" to content),
            *more,
        ).toString()

    private fun userSays(
        sentence: String,
        vararg more: Pair<String, Any>,
    ) = userLine(com.google.gson.JsonPrimitive(sentence), *more)

    private fun assistantLine(
        blocks: com.google.gson.JsonArray,
        messageId: String = "msg_$counter",
        vararg more: Pair<String, Any>,
    ): String =
        obj(
            "type" to "assistant",
            "uuid" to "a-${++counter}",
            "sessionId" to SESSION,
            "timestamp" to "2026-10-17T05:40:21.000Z",
            "requestId" to "req_$counter",
            "isSidechain" to false,
            "message" to obj("id" to messageId, "role" to "assistant", "content" to blocks),
            *more,
        ).toString()

    private fun says(sentence: String): String = assistantLine(text(sentence))

    private fun meta(type: String): String = obj("type" to type, "sessionId" to SESSION).toString()

    private fun <T> run(block: suspend () -> T): T = runBlocking { block() }

    // ---- the list ----

    @Test
    fun `the list is the project's records, the most recently written first, 50 at most`() {
        val ids = (1..55).map { n -> record(listOf(userSays("question $n")), modified = 1_000L + n) }

        val listed = run { sessions().list() }

        assertEquals(SavedSessions.MAX_LISTED, listed.size)
        assertEquals(ids.reversed().take(SavedSessions.MAX_LISTED), listed.map { it.id }, "the newest 50, newest first")
        assertEquals("question 55", listed.first().title)
        assertEquals((1_000L + 55) * 1000, listed.first().updatedAtMs)
        assertTrue(listed.first().bytes > 0)
    }

    @Test
    fun `a title is the first sentence of a user of eighty characters, and the id where there is none`() {
        val long = "x".repeat(79) + "😀😀tail"
        val spaced = record(listOf(meta("queue-operation"), userSays("  one\n\n   two\tthree  ")))
        val cut = record(listOf(userSays(long)))
        val skipsNoSentence =
            record(listOf(userLine(toolResult()), userLine(text("", "  ")), userLine(text("", "the real one"))))
        val noSentence = record(listOf(userLine(toolResult()), says("hi")))
        val noSentenceId = noSentence

        val titles = run { sessions().list() }.associate { it.id to it.title }

        assertEquals("one two three", titles[spaced], "white space is one space")
        assertEquals("x".repeat(79) + "😀", titles[cut], "eighty characters, never through a surrogate pair")
        assertEquals(
            "the real one",
            titles[skipsNoSentence],
            "a user line with no sentence is passed over for the next",
        )
        assertEquals(noSentenceId, titles[noSentence], "the id when no user line has a sentence")
    }

    @Test
    fun `a record with no user in its first 200 lines is not listed, and a sentence after them is not looked for`() {
        val onlyAssistant = record(listOf(meta("queue-operation"), says("hi")))
        val empty = record(emptyList())
        val onlySidechain = record(listOf(userSays("deep", "isSidechain" to true), meta("mode")))
        val lateUser = record(List(200) { meta("attachment") } + userSays("too late"))
        val sentenceLate =
            record(
                listOf(userLine(toolResult())) + List(199) { meta("attachment") } + userSays("past 200"),
            )
        val sentenceInTime =
            record(
                listOf(userLine(toolResult())) + List(198) { meta("attachment") } + userSays("at 200"),
            )
        val metaOnly = record(listOf(userSays("a note to the model", "isMeta" to true)))

        val titles = run { sessions().list() }.associate { it.id to it.title }

        assertEquals(
            setOf(sentenceLate, sentenceInTime),
            titles.keys,
            "only a record with a user line in its first 200 lines",
        )
        assertEquals(
            sentenceLate,
            titles[sentenceLate],
            "the sentence is the 201st line: no sentence in the first 200, so the id",
        )
        assertEquals("at 200", titles[sentenceInTime], "the 200th line is still looked at")
        assertTrue(listOf(onlyAssistant, empty, onlySidechain, lateUser, metaOnly).none { it in titles })
    }

    @Test
    fun `only a record named by a session id is one, and none is listed for a place that is not there`() {
        record(listOf(userSays("kept")), id = "11111111-2222-4333-8444-555555555555")
        Files.writeString(place().resolve("notes.jsonl"), userSays("not a session id") + "\n")
        Files.writeString(place().resolve("22222222-2222-4333-8444-555555555555.txt"), userSays("not a record") + "\n")
        Files.createDirectories(place().resolve("33333333-2222-4333-8444-555555555555.jsonl"))

        assertEquals(listOf("kept"), run { sessions().list() }.map { it.title })
        assertEquals(emptyList<Any>(), run { sessions(directory = "/another/place").list() }, "no place, no sessions")
    }

    @Test
    fun `no working directory, or a name past 200 characters, lists nothing and says why`() {
        record(listOf(userSays("hidden")))

        assertEquals(emptyList<Any>(), run { sessions(directory = null).list() })
        assertTrue(logged.last().contains("no working directory"), logged.toString())

        val longDirectory = "/" + "d".repeat(ProjectTranscripts.MAX_NAME_LENGTH)
        assertEquals(emptyList<Any>(), run { sessions(directory = longDirectory).list() })
        assertTrue(logged.last().contains("longer than ${ProjectTranscripts.MAX_NAME_LENGTH}"), logged.toString())
        // The edge: 200 characters is a name the SDK keeps as it is.
        val exact = "d".repeat(ProjectTranscripts.MAX_NAME_LENGTH - 1)
        val before = logged.size
        assertEquals(emptyList<Any>(), run { sessions(directory = "/$exact").list() })
        assertFalse(logged.drop(before).any { it.contains("longer than") }, "200 characters is looked for")
    }

    @Test
    fun `the name of a place makes every character but a letter or a digit a dash`() {
        assertEquals("-home-me-my-project--x-1", ProjectTranscripts.nameOf("/home/me/my.project/_x/1"))
        assertEquals("--", ProjectTranscripts.nameOf("😀"), "per UTF-16 unit, as the SDK's replace does")
    }

    @Test
    fun `a place that cannot be read makes the list throw`() {
        record(listOf(userSays("x")))
        val place = place()
        Files.setPosixFilePermissions(place, PosixFilePermissions.fromString("---------"))
        try {
            assumeFalse(Files.isReadable(place), "this user can read a directory with no permission (root)")
            assertThrows(java.io.IOException::class.java) { run { sessions().list() } }
        } finally {
            Files.setPosixFilePermissions(place, PosixFilePermissions.fromString("rwx------"))
        }
    }

    // ---- the read ----

    @Test
    fun `a read gives the user and assistant lines as the events stdout gives, and counts the rest`() {
        val sid =
            record(
                listOf(
                    meta("queue-operation"),
                    userSays("hello"),
                    meta("attachment"),
                    "{not json",
                    assistantLine(text("hi"), messageId = "msg_1"),
                    assistantLine(text("deep"), "msg_2", "isSidechain" to true),
                    userSays("a note", "isMeta" to true),
                    userSays("a summary", "isCompactSummary" to true),
                    userLine(toolResult(), "toolUseResult" to obj("stdout" to "ok")),
                    meta("last-prompt"),
                ),
            )

        val read = run { sessions().read(sid) }

        assertEquals(listOf("User", "Assistant", "User"), read.events.map { it::class.simpleName })
        assertEquals(7, read.skipped, "other kinds, a damaged line, a sub-agent's, a note, a summary")
        assertEquals(0, read.dropped)
        val tool = read.events[2] as AgentEvent.User
        assertEquals("""{"stdout":"ok"}""", tool.toolUseResult?.text)
        val assistant = read.events[1] as AgentEvent.Assistant
        assertEquals(SESSION, assistant.sessionId)
        assertTrue(assistant.requestId.orEmpty().startsWith("req_"))
        assertTrue(assistant.message.text.contains("msg_1"))
    }

    @Test
    fun `a line without the fields an event needs is skipped, not half made`() {
        val sid =
            record(
                listOf(
                    obj("type" to "user", "message" to obj("role" to "user", "content" to "no uuid")).toString(),
                    obj("type" to "assistant", "uuid" to "a1", "sessionId" to SESSION, "timestamp" to "t").toString(),
                    userSays("fine"),
                ),
            )

        val read = run { sessions().read(sid) }

        assertEquals(1, read.events.size)
        assertEquals(2, read.skipped)
    }

    private fun sessions(maxRecordBytes: Long) =
        ProjectTranscripts(config, cwd, Dispatchers.Unconfined, maxRecordBytes) { logged += it }

    @Test
    fun readGivesEveryLine() {
        val sid = record(List(EVERY_LINE) { says("line $it") })

        val read = run { sessions().read(sid) }

        assertEquals(EVERY_LINE, read.events.size)
        assertEquals(0, read.dropped)
    }

    @Test
    fun `a record cut by its size drops, first, a result that lost its call`() {
        val older = List(10) { says("older $it") }
        val newer = listOf(userLine(toolResult()), says("after the result"), userSays("and then"))
        val sid = record(older + newer)
        // The newest lines whole, and a few bytes of the line before them: the read starts inside that line.
        val tail = newer.joinToString("\n", postfix = "\n").toByteArray().size

        val read = run { sessions(maxRecordBytes = tail + PART_OF_A_LINE).read(sid) }

        assertEquals(2, read.events.size, "the result that heads the rest belongs to a call that was cut away")
        assertInstanceOf(AgentEvent.Assistant::class.java, read.events.first())
        assertTrue(read.dropped >= 2, "the cut line, and the result that lost its call")
    }

    @Test
    fun `a read of a record that is not there throws`() {
        val sid = record(List(3) { says("line $it") })
        assertThrows(
            NoSuchFileException::class.java,
        ) { run { sessions().read("99999999-2222-4333-8444-555555555555") } }
        assertThrows(IllegalArgumentException::class.java) { run { sessions().read("../escape") } }
        assertThrows(NoSuchFileException::class.java) { run { sessions(directory = null).read(sid) } }
    }

    @Test
    fun `reading and listing never write the record`() {
        val sid = record(listOf(userSays("hello"), says("hi")), modified = 1_234L)
        val file = place().resolve("$sid.jsonl")
        val before = Files.readAllBytes(file)

        run { sessions().list() }
        run { sessions().read(sid) }

        assertTrue(before.contentEquals(Files.readAllBytes(file)), "the bytes")
        assertEquals(1_234_000L, Files.getLastModifiedTime(file).toMillis(), "the time of the last write")
        assertEquals(listOf("$sid.jsonl"), File(place().toString()).list()!!.toList(), "nothing else was made")
    }

    @Test
    fun `the log says counts and reasons and never what a line said`() {
        val secret = "the user's own words 4711"
        val sid = record(listOf(userSays(secret), says("and the answer 4712"), "{not json"))

        run { sessions().list() }
        run { sessions().read(sid) }

        assertTrue(logged.isNotEmpty())
        assertTrue(logged.none { it.contains("4711") || it.contains("4712") }, logged.toString())
    }

    // ---- the capture ----

    @Test
    fun `the record of capture 22 reads as the user and assistant lines the CLI saved`() {
        val sid = capturedRecord()

        val read = run { sessions().read(sid) }

        assertEquals(
            listOf("User", "Assistant", "Assistant", "User", "Assistant"),
            read.events.map { it::class.simpleName },
        )
        assertEquals(22, read.skipped, "27 lines of the record, 5 of them the conversation")
        assertEquals(0, read.dropped)
        val prompt = read.events.first() as AgentEvent.User
        assertTrue(prompt.message.text.contains("echo hello-from-resume"), "the user's own words are in the record")
        assertNull(prompt.toolUseResult)
        val result = read.events[3] as AgentEvent.User
        assertTrue(result.toolUseResult != null, "the tool's result is lifted as stdout's tool_use_result is")
    }

    @Test
    fun `capture 22's record is listed by its first sentence`() {
        val sid = capturedRecord()

        val listed = run { sessions().list() }

        assertEquals(listOf(sid), listed.map { it.id })
        assertEquals("Run this exact bash command and report its output: echo hello-from-resume", listed.single().title)
    }

    // The record taken when the capture was recorded, put where the reader looks for it, under the id it was saved as.
    private fun capturedRecord(): String {
        val (name, sha) = checkNotNull(CaptureFixtures.manifestTranscript("22-resume.ndjson"))
        val bytes = CaptureFixtures.bytesOf(name)
        assertEquals(
            sha,
            java.security.MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") {
                "%02x".format(it)
            },
        )
        val sessionId = SESSION_OF_CAPTURE
        Files.write(place().resolve("$sessionId.jsonl"), bytes)
        return sessionId
    }

    private companion object {
        const val EVERY_LINE = 2_500
        const val PART_OF_A_LINE = 5L
        const val SESSION = "336ed47b-2675-4317-b3f5-a3b48abb03a2"
        val SESSION_OF_CAPTURE: String by lazy { sessionOfCapture() }

        // The id the capture's record was saved under: its lines say it.
        fun sessionOfCapture(): String {
            val (name, _) = checkNotNull(CaptureFixtures.manifestTranscript("22-resume.ndjson"))
            val first = CaptureFixtures.textOf(name).lineSequence().first { it.contains("\"sessionId\"") }
            return com.google.gson.JsonParser
                .parseString(first)
                .asJsonObject
                .get("sessionId")
                .asString
        }
    }
}
