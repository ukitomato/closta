package dev.ukitomato.closta.providers.claude.history

import com.google.gson.JsonPrimitive
import dev.ukitomato.closta.core.models.SavedTranscript
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

/**
 * The name the user gave a session (`custom-title`), read back with the transcript so a resumed session keeps it.
 * The lines are made here in the shape the CLI writes them; no line of a real record is used.
 */
class ProjectTranscriptsCustomTitleTest {
    @TempDir
    lateinit var config: Path

    private val cwd = "/work/the project"
    private val id = "336ed47b-2675-4317-b3f5-a3b48abb03a2"

    private fun reader() = ProjectTranscripts(config, cwd, Dispatchers.Unconfined)

    private fun write(vararg lines: String) {
        val place = config.resolve("projects").resolve(ProjectTranscripts.nameOf(cwd))
        Files.createDirectories(place)
        Files.writeString(place.resolve("$id.jsonl"), lines.joinToString("\n", postfix = "\n"))
    }

    private fun custom(title: String) =
        """{"type":"custom-title","customTitle":${JsonPrimitive(title)},"sessionId":"$id"}"""

    private fun aiTitle(title: String) = """{"type":"ai-title","aiTitle":${JsonPrimitive(title)},"sessionId":"$id"}"""

    private fun user(
        uuid: String,
        text: String,
    ) = """{"parentUuid":null,"isSidechain":false,"type":"user","message":{"role":"user","content":""" +
        """${JsonPrimitive(text)}},"uuid":"$uuid","timestamp":"2026-11-09T01:00:00.000Z","sessionId":"$id"}"""

    @Test
    fun `read gives the newest custom-title of the record`() {
        write(custom("first name"), user("u-1", "hello"), custom("second name"), aiTitle("cli title"))

        assertEquals("second name", runBlocking { reader().read(id).customTitle })
    }

    @Test
    fun `read gives no custom title when the record has none, whatever else names it`() {
        write(user("u-1", "hello"), aiTitle("cli title"))

        assertNull(runBlocking { reader().read(id).customTitle })
    }

    @Test
    fun `the read that stops before a line, a fork, carries no custom title`() {
        write(custom("my name"), user("u-1", "hello"), user("u-2", "again"))

        val fork = runBlocking { reader().read(id, "u-2") }

        assertEquals(1, fork.events.size)
        assertNull(fork.customTitle)
    }

    @Test
    fun `a custom-title line is not an event of the conversation, it is skipped as before`() {
        write(custom("my name"), user("u-1", "hello"))

        val read = runBlocking { reader().read(id) }

        assertEquals(1, read.events.size)
        assertEquals(1, read.skipped)
    }

    @Test
    fun `SavedTranscript toString says whether it has a name and never the name`() {
        val named = SavedTranscript(emptyList(), 0, 0, customTitle = "secret plan")
        val unnamed = SavedTranscript(emptyList(), 0, 0)

        assertFalse(named.toString().contains("secret plan"))
        assertFalse(named.toString() == unnamed.toString(), "a name is told apart by its presence")
    }
}
