package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.SaveResult
import dev.ukitomato.closta.core.interfaces.UnsavedDocuments
import dev.ukitomato.closta.core.models.FileToolCall
import dev.ukitomato.closta.core.models.HookPhase
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.concurrent.CopyOnWriteArrayList

class FileToolHooksTest {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val logged = CopyOnWriteArrayList<String>()
    private val call = FileToolCall(HookPhase.BEFORE, "Edit", "/p/secret-name.kt", "t1", null)

    @AfterEach
    fun stop() = scope.cancel()

    private class Recording(
        private val result: suspend (String) -> SaveResult = { SaveResult.SAVED },
    ) : UnsavedDocuments {
        val saved = CopyOnWriteArrayList<String>()

        override suspend fun saveIfModified(path: String): SaveResult {
            saved += path
            return result(path)
        }
    }

    private fun hooks(
        documents: UnsavedDocuments?,
        enabled: () -> Boolean = { true },
        limit: Long = 2_000,
    ) = FileToolHooks(scope, documents, enabled, logged::add, limit)

    @Test
    fun `type only - a file is saved once before the tool runs`() =
        runBlocking {
            val documents = Recording()
            hooks(documents).before(call)
            assertEquals(listOf("/p/secret-name.kt"), documents.saved)
        }

    @Test
    fun `type only - nothing is saved while the setting is off, and the setting is read at each call`() =
        runBlocking {
            val documents = Recording()
            var on = false
            val hooks = hooks(documents, { on })
            hooks.before(call)
            assertTrue(documents.saved.isEmpty())
            on = true
            hooks.before(call)
            assertEquals(1, documents.saved.size)
        }

    @Test
    fun `type only - a host with no documents does not fail`() =
        runBlocking {
            hooks(null).before(call)
            assertTrue(logged.isEmpty())
        }

    @Test
    fun `type only - a save that throws is logged by type only and does not fail the call`() =
        runBlocking {
            hooks(Recording { throw IllegalStateException("/p/secret-name.kt is locked") }).before(call)
            assertEquals(1, logged.size)
            assertTrue(logged.single().contains("IllegalStateException"))
            assertFalse(logged.single().contains("secret-name"))
        }

    @Test
    fun `type only - a save that does not return lets the call go on at the limit and is not cancelled`() =
        runBlocking {
            val release = CompletableDeferred<Unit>()
            val finished = CompletableDeferred<Unit>()
            val documents =
                Recording {
                    release.await()
                    finished.complete(Unit)
                    SaveResult.SAVED
                }
            val start = System.nanoTime()
            hooks(documents, limit = 100).before(call)
            val tookMillis = (System.nanoTime() - start) / 1_000_000
            assertTrue(tookMillis in 95..150, "went on after $tookMillis ms, limit 100 ms plus 50 ms")
            assertEquals(1, logged.size)
            assertTrue(logged.single().contains("100 ms"))
            assertFalse(finished.isCompleted)
            release.complete(Unit)
            withTimeout(2_000) { finished.await() }
        }

    @Test
    fun `type only - many calls for one file while its save is blocked start one save`() =
        runBlocking {
            val release = CompletableDeferred<Unit>()
            val documents =
                Recording {
                    release.await()
                    SaveResult.SAVED
                }
            val hooks = hooks(documents, limit = 50)
            repeat(20) { hooks.before(call) }
            assertEquals(1, documents.saved.size)
            hooks.before(call.copy(path = "/p/other.kt"))
            assertEquals(2, documents.saved.size)
            release.complete(Unit)
            withTimeout(2_000) { while (documents.saved.size < 2 || !hooksIdle(hooks)) kotlinx.coroutines.delay(10) }
            hooks.before(call)
            assertEquals(3, documents.saved.size)
        }

    private fun hooksIdle(hooks: FileToolHooks) = hooks.pendingSaves() == 0

    @Test
    fun `the default limit is two seconds`() {
        assertEquals(2_000L, FileToolHooks.DEFAULT_SAVE_LIMIT_MILLIS)
    }
}
