package dev.ukitomato.closta.platforms.intellij.session

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import java.io.File
import java.io.IOException

/**
 * The decision to save before a message is sent: off saves nothing, on saves once, a save that throws or does
 * not finish is logged as a type or a timeout and lets the message go. The wait is the limit given here (a few
 * milliseconds), never the real five seconds.
 */
class SaveBeforeSendTest {
    private val logged = mutableListOf<String>()
    private var saves = 0

    private fun step(
        enabled: () -> Boolean = { true },
        limitMillis: Long = SaveBeforeSend.DEFAULT_LIMIT_MILLIS,
        save: suspend () -> Unit = { saves++ },
    ) = SaveBeforeSend(enabled, save, logged::add, limitMillis)

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `off does not call the save`() =
        runBlocking {
            step(enabled = { false })()
            assertEquals(0, saves)
            assertEquals(emptyList<String>(), logged)
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `on calls the save once per message`() =
        runBlocking {
            val step = step()
            step()
            assertEquals(1, saves)
            step()
            assertEquals(2, saves)
            assertEquals(emptyList<String>(), logged)
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `the setting is read at each call`() =
        runBlocking {
            var on = false
            val step = step(enabled = { on })
            step()
            on = true
            step()
            on = false
            step()
            assertEquals(1, saves)
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a save that throws is logged as its type only, and the call returns`() =
        runBlocking {
            step(save = { throw IOException("SECRET-CANARY /home/someone/notes.txt") })()
            assertEquals(1, logged.size)
            assertTrue("java.io.IOException" in logged.single(), logged.toString())
            assertTrue("SECRET-CANARY" !in logged.single() && "notes.txt" !in logged.single())
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a save that does not finish in the limit is logged as a timeout, and the call returns`() =
        runBlocking {
            step(limitMillis = 20, save = { awaitCancellation() })()
            assertEquals(1, logged.size)
            assertTrue("20 ms" in logged.single(), logged.toString())
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a cancellation is not swallowed`() {
        assertThrows(CancellationException::class.java) {
            runBlocking { step(save = { throw CancellationException("cancelled") })() }
        }
        assertEquals(emptyList<String>(), logged)
    }

    @Test
    fun `the limit is five seconds`() {
        assertEquals(5_000L, SaveBeforeSend.DEFAULT_LIMIT_MILLIS)
    }

    @Test
    fun `the decision is free of com intellij`() {
        val relative = "src/main/kotlin/dev/ukitomato/closta/platforms/intellij/session/SaveBeforeSend.kt"
        val file =
            generateSequence(File("").absoluteFile) { it.parentFile }
                .flatMap { sequenceOf(File(it, relative), File(it, "jetbrains/$relative")) }
                .first { it.isFile }
        val text = file.readText()
        assertTrue(Regex("""^\s*import\s+com\.intellij""", RegexOption.MULTILINE).find(text) == null)
        assertTrue("com.intellij" !in text.replace(Regex("""(?s)/\*.*?\*/"""), ""))
    }

    private companion object {
        const val TIMEOUT_SECONDS = 20L
    }
}
