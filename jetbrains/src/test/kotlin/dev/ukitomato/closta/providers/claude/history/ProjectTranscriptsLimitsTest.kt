package dev.ukitomato.closta.providers.claude.history

import dev.ukitomato.closta.core.models.AgentEvent
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeFalse
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.FileTime
import java.nio.file.attribute.PosixFilePermissions
import java.util.concurrent.CancellationException
import kotlin.coroutines.CoroutineContext

/**
 * What bounds the reader of the saved sessions: a line over the limit, a line that is not a user or an
 * assistant line, a record over the limit, a read that is cancelled, a file that is a link, a record that cannot be
 * read among others, a time before 1970, the place named from the real path, and a compaction's summary as a title.
 */
class ProjectTranscriptsLimitsTest {
    @TempDir
    lateinit var config: Path

    private val cwd = "/work/the project"
    private val logged = java.util.concurrent.CopyOnWriteArrayList<String>()

    private fun sessions(
        directory: String? = cwd,
        io: CoroutineDispatcher = Dispatchers.Unconfined,
        maxRecordBytes: Long = ProjectTranscripts.MAX_RECORD_BYTES,
    ) = ProjectTranscripts(config, directory, io, maxRecordBytes) { logged += it }

    private fun placeOf(directory: String = cwd): Path =
        config.resolve("projects").resolve(ProjectTranscripts.nameOf(directory)).also { Files.createDirectories(it) }

    private var counter = 0

    private fun id(): String = "00000000-0000-4000-8000-%012d".format(++counter)

    private fun user(
        sentence: String,
        extra: String = "",
        uuid: String = "u-${++counter}",
    ) = """{"type":"user","uuid":"$uuid","sessionId":"$SESSION","timestamp":"t","isSidechain":false$extra,""" +
        """"message":{"role":"user","content":"$sentence"}}"""

    private fun assistant(sentence: String) =
        """{"type":"assistant","uuid":"a-${++counter}","sessionId":"$SESSION","timestamp":"t","requestId":"r",""" +
            """"isSidechain":false,"message":{"id":"m$counter","role":"assistant",""" +
            """"content":[{"type":"text","text":"$sentence"}]}}"""

    private fun record(
        lines: List<String>,
        directory: String = cwd,
        id: String = id(),
        modifiedSeconds: Long = 1_000_000L + counter,
    ): String {
        val file = placeOf(directory).resolve("$id.jsonl")
        Files.writeString(file, lines.joinToString("\n", postfix = "\n"))
        Files.setLastModifiedTime(file, FileTime.fromMillis(modifiedSeconds * 1000))
        return id
    }

    private fun <T> run(block: suspend () -> T): T = runBlocking { block() }

    // ---- a line over the limit, and a line that is not the conversation's ----

    @Test
    fun `a line over the limit is counted and not read, and the lines after it are`() {
        val huge = user("x".repeat(RecordLines.MAX_LINE_BYTES + 10))
        val sid = record(listOf(user("before"), huge, assistant("after")))

        val read = run { sessions().read(sid) }

        assertEquals(listOf("User", "Assistant"), read.events.map { it::class.simpleName })
        assertEquals(1, read.skipped, "the long line is skipped, as a damaged one is")
        assertTrue(logged.any { "1 over the line limit" in it }, logged.toString())
        assertTrue(logged.none { "xxxx" in it }, "only counts are logged")
    }

    @Test
    fun `a line exactly at the limit is read, and one byte more is not`() {
        val room = RecordLines.MAX_LINE_BYTES - user("", uuid = "u").length
        val sid = record(listOf(user("x".repeat(room), uuid = "u"), user("x".repeat(room + 1), uuid = "u")))

        val read = run { sessions().read(sid) }

        assertEquals(1, read.events.size)
        assertEquals(1, read.skipped)
    }

    @Test
    fun `a title is not looked for in a line over the limit`() {
        record(listOf(user("y".repeat(RecordLines.MAX_LINE_BYTES + 1)), user("the short one")))

        assertEquals(listOf("the short one"), run { sessions().list() }.map { it.title })
    }

    @Test
    fun `a line is a conversation line by its type, and the others are not parsed`() {
        val spaced = """{ "type" : "assistant", "uuid": "a" }"""
        assertTrue(RecordLines.mayBeConversation(user("hi")))
        assertTrue(RecordLines.mayBeConversation(assistant("hi")))
        assertTrue(RecordLines.mayBeConversation(spaced), "white space around the colon is still the type")
        assertFalse(RecordLines.mayBeConversation("""{"type":"queue-operation","operation":"enqueue"}"""))
        assertFalse(RecordLines.mayBeConversation("""{"type":"attachment","note":"the user said"}"""))
        assertFalse(RecordLines.mayBeConversation("{not json"))
        // What the type does not name is not an event, with or without the rest of what makes one.
        assertNull(
            RecordLines.eventOf("""{"type":"attachment","uuid":"x","sessionId":"s","timestamp":"t","message":{}}"""),
        )
        assertNotNull(RecordLines.eventOf(user("hi")))
    }

    // ---- a record over the limit ----

    @Test
    fun `a record over the limit is read from its newest end, from a whole line, and says older ones were left out`() {
        val lines = List(40) { n -> assistant("line number $n") }
        val sid = record(lines)
        val size = Files.size(placeOf().resolve("$sid.jsonl"))
        val cap = size / 4

        val read = run { sessions(maxRecordBytes = cap).read(sid) }

        val said = read.events.map { (it as AgentEvent.Assistant).message.text }
        assertTrue(said.isNotEmpty() && said.size < lines.size, "only the newest end: ${said.size} of ${lines.size}")
        assertTrue(said.last().contains("line number 39"), "the newest line is the last one")
        assertTrue(said.all { it.contains("line number") }, "every line kept is a whole line")
        assertEquals(
            (40 - said.size until 40).map { "line number $it" },
            said.map { text -> Regex("line number \\d+").find(text)!!.value },
            "the kept lines are the newest ones, in order",
        )
        assertTrue(read.dropped > 0, "the view is told that older ones were left out")
        assertTrue(logged.any { "oldest part of the record was not read" in it }, logged.toString())
    }

    @Test
    fun `a record within the limit is read whole`() {
        val sid = record(List(10) { assistant("line $it") })
        val size = Files.size(placeOf().resolve("$sid.jsonl"))

        val read = run { sessions(maxRecordBytes = size).read(sid) }

        assertEquals(10, read.events.size)
        assertEquals(0, read.dropped)
        assertTrue(logged.none { "oldest part" in it })
    }

    // ---- a read that is cancelled ----

    @Test
    fun `a read of a big record stops when it is cancelled, and does not outlive the one that asked`() {
        // About 22 MB of lines that are not the conversation: a read that did not look would run to the end and log.
        val big = placeOf().resolve("${id()}.jsonl")
        val line = """{"type":"attachment"}""" + "\n"
        Files.newBufferedWriter(big).use { out -> repeat(1_000_000) { out.write(line) } }
        val sid = big.fileName.toString().removeSuffix(".jsonl")

        runBlocking {
            val started = CompletableDeferred<Unit>()
            val finished = CompletableDeferred<Unit>()
            val io =
                object : CoroutineDispatcher() {
                    override fun dispatch(
                        context: CoroutineContext,
                        block: Runnable,
                    ) {
                        Dispatchers.IO.dispatch(context) {
                            started.complete(Unit)
                            block.run()
                            finished.complete(Unit)
                        }
                    }
                }
            val reading = async { sessions(io = io).read(sid) }
            started.await()
            reading.cancel()

            withTimeout(GUARD_MS) { finished.await() }
            assertThrows(CancellationException::class.java) { runBlocking { reading.await() } }
        }
        // The loop looked at the cancellation: it ended before it got to say it had read the lot.
        assertTrue(logged.none { it.startsWith("saved sessions: read ") }, logged.toString())
    }

    // ---- a file that is a link ----

    @Test
    fun `a record that is a link is not listed and not read, wherever it points`() {
        val outside = Files.createDirectories(config.resolve("elsewhere")).resolve("a.jsonl")
        Files.writeString(outside, user("outside the place") + "\n")
        val linkId = id()
        Files.createSymbolicLink(placeOf().resolve("$linkId.jsonl"), outside)
        val real = record(listOf(user("inside the place")))

        assertEquals(listOf(real), run { sessions().list() }.map { it.id }, "the link is not a record of the place")
        assertThrows(IOException::class.java) { run { sessions().read(linkId) } }
        assertTrue(logged.none { "outside the place" in it })
    }

    // ---- one record among others ----

    @Test
    fun `a record that cannot be read is left out of the list, and the others are listed, with the count logged`() {
        val kept = record(listOf(user("kept one")))
        val blocked = record(listOf(user("blocked")))
        val also = record(listOf(user("kept two")))
        val file = placeOf().resolve("$blocked.jsonl")
        Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("---------"))
        try {
            assumeFalse(Files.isReadable(file), "this user can read a file with no permission (root)")

            val listed = run { sessions().list() }

            assertEquals(setOf(kept, also), listed.map { it.id }.toSet())
            assertTrue(logged.any { "1 could not be read" in it }, logged.toString())
            assertTrue(logged.none { "blocked" in it })
        } finally {
            Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rw-------"))
        }
    }

    // ---- a time before 1970 ----

    @Test
    fun `a record written before 1970 is listed at time 0, never a negative one`() {
        val sid = record(listOf(user("old")), modifiedSeconds = -5)

        val listed = run { sessions().list() }

        assertEquals(sid, listed.single().id)
        assertEquals(0L, listed.single().updatedAtMs)
    }

    // ---- the place ----

    @Test
    fun `the place is named from the real path of the directory, as the CLI names it`() {
        val real = Files.createDirectories(config.resolve("real-project"))
        val link = Files.createSymbolicLink(config.resolve("link-to-project"), real)
        // The CLI wrote the record under the name of the real path.
        val sid = record(listOf(user("under the real name")), directory = real.toRealPath().toString())

        val viaLink = run { sessions(directory = link.toString()).list() }
        val direct = run { sessions(directory = real.toString()).list() }

        assertEquals(listOf(sid), viaLink.map { it.id }, "a project opened through a link finds the record")
        assertEquals(listOf(sid), direct.map { it.id })
    }

    @Test
    fun `a place that is not there says why, in the words of what was asked`() {
        run { sessions(directory = "/nowhere/at all").list() }
        assertTrue(logged.last().contains("has no place for this project") && logged.last().endsWith("none are listed"))
        run { runCatching { sessions(directory = "/nowhere/at all").read(SESSION) } }
        assertTrue(
            logged.last().contains("has no place for this project") && logged.last().endsWith("nothing is restored"),
        )
        assertTrue(logged.any { "no real path" in it }, "a directory with no real path is named as it is, and said so")
    }

    // ---- a compaction's summary ----

    @Test
    fun `a summary of a compaction is not a title, as it is not a line that is read`() {
        val withSummary = record(listOf(user("the summary", ""","isCompactSummary":true"""), user("what I said")))
        val onlySummary = record(listOf(user("the summary", ""","isCompactSummary":true""")))

        val titles = run { sessions().list() }.associate { it.id to it.title }

        assertEquals("what I said", titles[withSummary])
        assertFalse(onlySummary in titles, "a record where only the CLI wrote a user line is not a session to open")
        val read = run { sessions().read(withSummary) }
        assertEquals(1, read.events.size)
        assertInstanceOf(AgentEvent.User::class.java, read.events.single())
    }

    private companion object {
        const val SESSION = "336ed47b-2675-4317-b3f5-a3b48abb03a2"
        const val GUARD_MS = 30_000L
    }
}
