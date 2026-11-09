package dev.ukitomato.closta.providers.claude.history

import com.google.gson.JsonPrimitive
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.FileTime

/**
 * The title a saved session is listed by, chosen as Claude Code chooses it: the newest `custom-title`, then the newest
 * `ai-title`, then the newest `last-prompt`, then the first request. The lines are made here in the shape the CLI
 * writes them (2.1.3xx); no line of a real record is used.
 */
class ProjectTranscriptsTitlesTest {
    @TempDir
    lateinit var config: Path

    private val cwd = "/work/the project"

    private fun sessions() = ProjectTranscripts(config, cwd, Dispatchers.Unconfined)

    private var counter = 0

    private fun id(): String = "00000000-0000-4000-8000-%012d".format(++counter)

    private fun record(lines: List<String>): String {
        val id = id()
        val place = config.resolve("projects").resolve(ProjectTranscripts.nameOf(cwd))
        Files.createDirectories(place)
        val file = place.resolve("$id.jsonl")
        Files.writeString(file, lines.joinToString("\n", postfix = "\n"))
        Files.setLastModifiedTime(file, FileTime.fromMillis((1_000_000L + counter) * 1000))
        return id
    }

    private fun titles(): Map<String, String> = runBlocking { sessions().list().associate { it.id to it.title } }

    private fun quoted(text: String) = JsonPrimitive(text).toString()

    private fun user(content: String) =
        """{"parentUuid":null,"isSidechain":false,"type":"user","message":{"role":"user","content":$content},""" +
            """"uuid":"u-${++counter}","timestamp":"2026-11-09T01:00:00.000Z","sessionId":"$SESSION"}"""

    private fun userSays(sentence: String) = user(quoted(sentence))

    private fun userBlocks(vararg texts: String) =
        user(texts.joinToString(",", "[", "]") { """{"type":"text","text":${quoted(it)}}""" })

    private fun assistant(sentence: String) =
        """{"type":"assistant","uuid":"a-${++counter}","sessionId":"$SESSION","timestamp":"t","requestId":"r",""" +
            """"isSidechain":false,"message":{"id":"m$counter","role":"assistant",""" +
            """"content":[{"type":"text","text":${quoted(sentence)}}]}}"""

    private fun aiTitle(title: String) = """{"type":"ai-title","aiTitle":${quoted(title)},"sessionId":"$SESSION"}"""

    private fun customTitle(title: String) =
        """{"type":"custom-title","customTitle":${quoted(title)},"sessionId":"$SESSION"}"""

    private fun lastPrompt(prompt: String) =
        """{"type":"last-prompt","lastPrompt":${quoted(prompt)},"leafUuid":"u-$counter","sessionId":"$SESSION"}"""

    // More bytes of conversation than the end that is read for the titles.
    private fun pastTheTail(): List<String> = List(TAIL_BYTES / FILLER.length + 2) { assistant(FILLER) }

    // ---- which line names a session ----

    @Test
    fun `a name the user gave wins over the CLI's title and the last prompt, even when written before them`() {
        val sid =
            record(
                listOf(customTitle("my name"), userSays("first"), aiTitle("cli title"), lastPrompt("again")),
            )

        assertEquals("my name", titles()[sid])
    }

    @Test
    fun `the newest line of a kind wins`() {
        val renamed = record(listOf(customTitle("old name"), userSays("first"), customTitle("new name")))
        val retitled = record(listOf(userSays("first"), aiTitle("first title"), assistant("ok"), aiTitle("second")))
        val prompted = record(listOf(userSays("first"), lastPrompt("first"), userSays("later"), lastPrompt("later")))

        val titles = titles()

        assertEquals("new name", titles[renamed])
        assertEquals("second", titles[retitled])
        assertEquals("later", titles[prompted], "the last prompt, with no title")
    }

    @Test
    fun `a title with nothing in it is no title, and a title is one line of eighty characters`() {
        val blank = record(listOf(userSays("first"), aiTitle("cli title"), customTitle("   ")))
        val long = record(listOf(userSays("first"), aiTitle("  one\n two  " + "x".repeat(100))))

        val titles = titles()

        assertEquals("cli title", titles[blank])
        assertEquals("one two " + "x".repeat(72), titles[long])
    }

    @Test
    fun `with no title line the first request is the title`() {
        val sid = record(listOf(userSays("the request"), assistant("an answer"), userSays("more")))

        assertEquals("the request", titles()[sid])
    }

    @Test
    fun `a title line does not list a record no user speaks in`() {
        val sid = record(listOf(aiTitle("a title"), assistant("alone")))

        assertFalse(sid in titles())
    }

    @Test
    fun `a title line said inside a message is not a title line, and a damaged line is passed over`() {
        val sid = record(listOf(userSays("the request"), userSays(aiTitle("not a title")), "{\"type\":\"ai-title\","))

        assertEquals("the request", titles()[sid])
    }

    // ---- where the title lines are read ----

    @Test
    fun `the end of a long record is read for its titles`() {
        val sid = record(listOf(userSays("the request")) + pastTheTail() + aiTitle("at the end"))

        assertEquals("at the end", titles()[sid])
    }

    @Test
    fun `a title line before the first request is read, and one at the end is newer`() {
        val headOnly = record(listOf(customTitle("from the head"), userSays("the request")) + pastTheTail())
        val both =
            record(listOf(customTitle("from the head"), userSays("the request")) + pastTheTail() + customTitle("new"))

        val titles = titles()

        assertEquals("from the head", titles[headOnly])
        assertEquals("new", titles[both])
    }

    @Test
    fun `a title line past the first request and before the end that is read is not looked for`() {
        val sid = record(listOf(userSays("the request"), aiTitle("in the middle")) + pastTheTail())

        assertEquals("the request", titles()[sid])
    }

    // ---- the first request ----

    @Test
    fun `a block the IDE put in, of its tags only, is not the request`() {
        val opened =
            record(
                listOf(
                    userBlocks(
                        "<ide_opened_file>The user opened the file /work/a.kt in the IDE.</ide_opened_file>",
                        "fix the retry loop",
                    ),
                ),
            )
        val selected =
            record(
                listOf(
                    userBlocks(
                        "<ide_selection>The user selected the lines 1 to 2:\nval a = 1\n</ide_selection>",
                        "  ",
                        "explain this",
                    ),
                ),
            )
        val onlyTags =
            record(
                listOf(
                    userSays("<ide_opened_file>The user opened the file /work/a.kt.</ide_opened_file>"),
                    userSays("the next one"),
                ),
            )
        val tagAndWords =
            record(listOf(userBlocks("<ide_opened_file>/work/a.kt</ide_opened_file> look at this")))

        val titles = titles()

        assertEquals("fix the retry loop", titles[opened])
        assertEquals("explain this", titles[selected])
        assertEquals("the next one", titles[onlyTags], "a string of tags only is no request either")
        assertEquals(
            "<ide_opened_file>/work/a.kt</ide_opened_file> look at this",
            titles[tagAndWords],
            "a block with words of its own is a request",
        )
    }

    private companion object {
        const val SESSION = "336ed47b-2675-4317-b3f5-a3b48abb03a2"
        const val TAIL_BYTES = RecordTitles.TAIL_BYTES.toInt()
        val FILLER = "y".repeat(1000)
    }
}
