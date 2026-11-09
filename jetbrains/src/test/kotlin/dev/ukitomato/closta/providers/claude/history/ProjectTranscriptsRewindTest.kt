package dev.ukitomato.closta.providers.claude.history

import dev.ukitomato.closta.core.interfaces.SavedSessions
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.SavedSessionSummary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

/**
 * The cut point of a rewind and the read that stops before it, on the record capture 27 saved: two turns,
 * the second said by the user line that the cut is made before.
 */
class ProjectTranscriptsRewindTest {
    @TempDir
    lateinit var config: Path

    private val cwd = "/work/the project"
    private val sessionId = CutCapture.sessionId
    private val missing = "00000000-0000-4000-8000-000000000999"

    private fun reader() = CutCapture.reader(config, cwd, Dispatchers.Unconfined)

    @Test
    fun `the cut point of the second thing the user said is its parentUuid, the first has none`() {
        assertEquals(2, CutCapture.turns, "the capture has two user turns")
        val reader = reader()
        assertTrue(CutCapture.secondParentUuid.isNotBlank())
        assertEquals(
            CutCapture.secondParentUuid,
            runBlocking { reader.cutPoint(sessionId, CutCapture.secondUserUuid) },
        )
        assertNull(runBlocking { reader.cutPoint(sessionId, CutCapture.firstUserUuid) }, "no line before the first")
        assertNull(runBlocking { reader.cutPoint(sessionId, missing) })
    }

    @Test
    fun `reading up to the second user line gives the first turn and none of the second`() {
        val reader = reader()
        val read = runBlocking { reader.read(sessionId, CutCapture.secondUserUuid) }
        assertEquals(
            listOf(CutCapture.firstUserUuid),
            read.events.filterIsInstance<AgentEvent.User>().map { it.uuid },
        )
        assertTrue(read.events.any { it is AgentEvent.Assistant }, "the answer of the first turn is there")
        // Without a line to stop before, the read goes on to the end as it did.
        val whole = runBlocking { reader.read(sessionId) }
        assertEquals(
            listOf(CutCapture.firstUserUuid, CutCapture.secondUserUuid),
            whole.events.filterIsInstance<AgentEvent.User>().map { it.uuid },
        )
        assertTrue(whole.events.size > read.events.size)
    }

    @Test
    fun `a line that is not in the record is not read up to, it throws and does not give the whole conversation`() {
        assertThrows(NoSuchElementException::class.java) { runBlocking { reader().read(sessionId, missing) } }
    }

    @Test
    fun `a parentUuid that is not a UUID is no point to cut at, it does not reach the CLI's argv`() {
        val reader = reader()
        val file = config.resolve("projects").resolve(ProjectTranscripts.nameOf(cwd)).resolve("$sessionId.jsonl")
        for (shape in listOf("--help", "abc", "00000000-0000-4000-8000-00000000000g")) {
            Files.writeString(file, Files.readString(file).replace(CutCapture.secondParentUuid, shape))
            assertNull(runBlocking { reader.cutPoint(sessionId, CutCapture.secondUserUuid) }, shape)
            Files.writeString(file, Files.readString(file).replace(shape, CutCapture.secondParentUuid))
        }
        assertEquals(CutCapture.secondParentUuid, runBlocking { reader.cutPoint(sessionId, CutCapture.secondUserUuid) })
    }

    @Test
    fun `a record that is not there has no cut point, and the defaults of the interface do not guess`() {
        val none = ProjectTranscripts(config, cwd, Dispatchers.Unconfined)
        assertNull(runBlocking { none.cutPoint(sessionId, "x") })
        val bare =
            object : SavedSessions {
                override suspend fun list() = emptyList<SavedSessionSummary>()

                override suspend fun read(sessionId: String) = throw UnsupportedOperationException()
            }
        assertNull(runBlocking { bare.cutPoint("s", "u") })
        assertThrows(UnsupportedOperationException::class.java) { runBlocking { bare.read("s", "u") } }
    }
}
