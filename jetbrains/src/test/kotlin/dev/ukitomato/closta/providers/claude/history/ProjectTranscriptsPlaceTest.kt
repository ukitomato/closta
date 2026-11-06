package dev.ukitomato.closta.providers.claude.history

import dev.ukitomato.closta.core.models.SavedSessionSummary
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.NoSuchFileException
import java.nio.file.Path
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/** The record of a project in WSL: a place asked once, and a Linux path named as is. */
class ProjectTranscriptsPlaceTest {
    @TempDir
    lateinit var config: Path

    private val linux = "/home/u/my_proj"
    private val id = "00000000-0000-4000-8000-000000000001"
    private val logged = mutableListOf<String>()

    private fun write() {
        val place = config.resolve("projects").resolve("-home-u-my-proj")
        Files.createDirectories(place)
        Files.writeString(
            place.resolve("$id.jsonl"),
            """{"type":"user","uuid":"u-1","sessionId":"$id","timestamp":"2026-10-17T05:40:20.077Z",""" +
                """"isSidechain":false,"message":{"role":"user","content":"hello"}}""" + "\n",
        )
    }

    private fun sessions(place: () -> Path?) =
        ProjectTranscripts(place, linux, Dispatchers.Unconfined, resolveLinks = false) { logged += it }

    @Test
    fun `a Linux path is named as it is, and its record is listed and read back`() =
        runBlocking {
            write()
            val sessions = sessions { config }
            val listed: List<SavedSessionSummary> = sessions.list()
            assertEquals(listOf(id), listed.map { it.id })
            assertEquals(1, sessions.read(id).events.size)
        }

    @Test
    fun `a place that is not found lists none, restores nothing, and says why`() =
        runBlocking {
            val sessions = sessions { null }
            assertTrue(sessions.list().isEmpty())
            try {
                sessions.read(id)
                error("nothing should be read")
            } catch (expected: NoSuchFileException) {
                // nothing is restored
            }
            assertTrue(
                logged.any { it.contains("the CLI's config directory could not be found") },
            ) { logged.toString() }
        }

    @Test
    fun `the place is asked for once, however many reads and lists follow, and a null is kept`() =
        runBlocking {
            write()
            val calls = AtomicInteger()
            val sessions = sessions { calls.incrementAndGet().let { config } }
            sessions.list()
            sessions.read(id)
            sessions.list()
            assertEquals(1, calls.get())

            val missing = AtomicInteger()
            val none = sessions { missing.incrementAndGet().let { null } }
            none.list()
            none.list()
            assertEquals(1, missing.get())
        }

    @Test
    fun `a list and a read that ask side by side find the place asked for once`() {
        write()
        val calls = AtomicInteger()
        val inside = CountDownLatch(1)
        val release = CountDownLatch(1)
        val sessions =
            sessions {
                calls.incrementAndGet()
                inside.countDown()
                release.await(GUARD_SECONDS, TimeUnit.SECONDS)
                config
            }
        val pool = Executors.newFixedThreadPool(2)
        try {
            val list = pool.submit<Any> { runBlocking { sessions.list() } }
            assertTrue(inside.await(GUARD_SECONDS, TimeUnit.SECONDS)) // the first asker is in the function, held
            val read = pool.submit<Any> { runBlocking { sessions.read(id) } }
            Thread.sleep(SETTLE_MILLIS) // the second asker has reached the lock behind it
            release.countDown()
            list.get(GUARD_SECONDS, TimeUnit.SECONDS)
            read.get(GUARD_SECONDS, TimeUnit.SECONDS)
        } finally {
            release.countDown()
            pool.shutdownNow()
        }
        assertEquals(1, calls.get())
    }

    private companion object {
        const val GUARD_SECONDS = 10L
        const val SETTLE_MILLIS = 200L
    }
}
