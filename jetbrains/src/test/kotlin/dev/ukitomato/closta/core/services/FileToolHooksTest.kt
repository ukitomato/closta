package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AnalysisWait
import dev.ukitomato.closta.core.interfaces.Diagnostic
import dev.ukitomato.closta.core.interfaces.DiagnosticSeverity
import dev.ukitomato.closta.core.interfaces.Diagnostics
import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.core.interfaces.SaveResult
import dev.ukitomato.closta.core.interfaces.UnsavedDocuments
import dev.ukitomato.closta.core.models.FileToolCall
import dev.ukitomato.closta.core.models.HookPhase
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
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
    fun `the default limits are two seconds for the save and three for the analysis`() {
        assertEquals(2_000L, FileToolHooks.DEFAULT_SAVE_LIMIT_MILLIS)
        assertEquals(3_000L, FileToolHooks.DEFAULT_ANALYSIS_LIMIT_MILLIS)
        assertEquals(64, FileToolHooks.DEFAULT_SNAPSHOT_LIMIT)
    }

    private class FakeDiagnostics(
        private val read: suspend (String?) -> IdeResult<List<Diagnostic>>,
    ) : Diagnostics {
        override suspend fun diagnostics(path: String?) = read(path)
    }

    private class FakeAnalysis(
        private val visible: Boolean = true,
        private val refresh: suspend (String, Long) -> Boolean = { _, _ -> true },
    ) : AnalysisWait {
        override fun canAnalyse(path: String) = visible

        override suspend fun refreshAndAwait(
            path: String,
            limitMillis: Long,
        ) = refresh(path, limitMillis)
    }

    private fun error(
        line: Int,
        message: String = "Unresolved reference 'bar'.",
    ) = Diagnostic("/p/secret-name.kt", line, 1, DiagnosticSeverity.ERROR, message, "kotlin")

    private fun reporting(
        reads: ArrayDeque<IdeResult<List<Diagnostic>>>,
        analysis: AnalysisWait? = FakeAnalysis(),
        enabled: () -> Boolean = { true },
        diagnosticsLimit: Long = 3_000,
        snapshotLimit: Int = 64,
    ) = FileToolHooks(
        scope,
        Recording(),
        { true },
        logged::add,
        2_000,
        FakeDiagnostics { reads.removeFirst() },
        analysis,
        enabled,
        diagnosticsLimit,
        snapshotLimit,
    )

    private fun ok(vararg found: Diagnostic) = IdeResult.Ok(found.toList())

    private val post = call.copy(phase = HookPhase.AFTER)

    @Test
    fun `type only - an edit that adds an error gives a report, and the report flows to its subscriber`() =
        runBlocking {
            val hooks = reporting(ArrayDeque(listOf(ok(error(1)), ok(error(1), error(7, "Expecting '}'.")))))
            val seen = CopyOnWriteArrayList<Pair<String, DiagnosticsReport>>()
            val collecting = scope.launch(start = CoroutineStart.UNDISPATCHED) { hooks.reports.collect { seen += it } }
            hooks.before(call)
            val report = hooks.after(post)
            assertEquals(DiagnosticsReport("/p/secret-name.kt", listOf(error(7, "Expecting '}'."))), report)
            withTimeout(2_000) { while (seen.isEmpty()) kotlinx.coroutines.delay(10) }
            assertEquals("t1", seen.single().first)
            assertEquals(report, seen.single().second)
            collecting.cancel()
        }

    @Test
    fun `type only - an edit that adds no error gives nothing`() =
        runBlocking {
            val hooks = reporting(ArrayDeque(listOf(ok(error(1)), ok(error(9)))))
            hooks.before(call)
            assertNull(hooks.after(post))
        }

    @Test
    fun `type only - no copy was taken so there is no report, for each reason`() =
        runBlocking {
            val noReads = { ArrayDeque<IdeResult<List<Diagnostic>>>() }
            // the file is not visible
            reporting(noReads(), FakeAnalysis(visible = false)).also {
                it.before(call)
                assertNull(it.after(post))
            }
            // a new file: the IDE cannot read its diagnostics
            reporting(ArrayDeque(listOf(IdeResult.Failed(IdeFailureKind.NOT_FOUND, "x")))).also {
                it.before(call.copy(toolName = "Write"))
                assertEquals(0, it.snapshots())
                assertNull(it.after(post.copy(toolName = "Write")))
            }
            // the setting is off
            reporting(noReads(), enabled = { false }).also {
                it.before(call)
                assertNull(it.after(post))
            }
            // a host with no analysis wait
            reporting(noReads(), analysis = null).also {
                it.before(call)
                assertNull(it.after(post))
            }
        }

    @Test
    fun `type only - the analysis that did not finish gives nothing`() =
        runBlocking {
            val hooks = reporting(ArrayDeque(listOf(ok(), ok(error(1)))), FakeAnalysis(refresh = { _, _ -> false }))
            hooks.before(call)
            assertNull(hooks.after(post))
        }

    @Test
    fun `type only - the setting is read at the after-hook too`() =
        runBlocking {
            var on = true
            val hooks = reporting(ArrayDeque(listOf(ok(), ok(error(1)))), enabled = { on })
            hooks.before(call)
            on = false
            assertNull(hooks.after(post))
        }

    @Test
    fun `type only - a read before the tool takes no copy`() =
        runBlocking {
            val hooks = reporting(ArrayDeque())
            hooks.before(call.copy(toolName = "Read"))
            assertEquals(0, hooks.snapshots())
        }

    @Test
    fun `type only - a copy that cannot be read lets the before-hook go on at the save limit`() =
        runBlocking {
            val hooks =
                FileToolHooks(
                    scope,
                    Recording(),
                    { true },
                    logged::add,
                    100,
                    FakeDiagnostics { awaitCancellation() },
                    FakeAnalysis(),
                    { true },
                )
            val start = System.nanoTime()
            hooks.before(call)
            val tookMillis = (System.nanoTime() - start) / 1_000_000
            assertTrue(tookMillis in 95..150, "went on after $tookMillis ms, limit 100 ms plus 50 ms")
            assertEquals(0, hooks.snapshots())
            assertNull(hooks.after(post))
        }

    @Test
    fun `type only - the copy is taken after the save, inside the same limit`() =
        runBlocking {
            val order = CopyOnWriteArrayList<String>()
            val documents =
                Recording {
                    order += "save"
                    SaveResult.SAVED
                }
            val hooks =
                FileToolHooks(
                    scope,
                    documents,
                    { true },
                    logged::add,
                    2_000,
                    FakeDiagnostics {
                        order += "read"
                        ok()
                    },
                    FakeAnalysis(),
                    { true },
                )
            hooks.before(call)
            assertEquals(listOf("save", "read"), order.toList())
        }

    @Test
    fun `type only - copies are taken while saving is off`() =
        runBlocking {
            val documents = Recording()
            val hooks =
                FileToolHooks(
                    scope,
                    documents,
                    { false },
                    logged::add,
                    2_000,
                    FakeDiagnostics { ok() },
                    FakeAnalysis(),
                    { true },
                )
            hooks.before(call)
            assertTrue(documents.saved.isEmpty())
            assertEquals(1, hooks.snapshots())
        }

    @Test
    fun `type only - a refresh that does not return gives null within the analysis limit`() =
        runBlocking {
            val hooks =
                reporting(
                    ArrayDeque(listOf(ok())),
                    FakeAnalysis(refresh = { _, _ -> awaitCancellation() }),
                    diagnosticsLimit = 100,
                )
            hooks.before(call)
            val start = System.nanoTime()
            assertNull(hooks.after(post))
            val tookMillis = (System.nanoTime() - start) / 1_000_000
            assertTrue(tookMillis in 95..150, "gave up after $tookMillis ms, limit 100 ms plus 50 ms")
        }

    @Test
    fun `type only - a later read that does not return gives null within the analysis limit`() =
        runBlocking {
            var reads = 0
            val hooks =
                FileToolHooks(
                    scope,
                    Recording(),
                    { true },
                    logged::add,
                    2_000,
                    FakeDiagnostics { if (reads++ == 0) ok() else awaitCancellation() },
                    FakeAnalysis(),
                    { true },
                    100,
                )
            hooks.before(call)
            val start = System.nanoTime()
            assertNull(hooks.after(post))
            val tookMillis = (System.nanoTime() - start) / 1_000_000
            assertTrue(tookMillis in 95..150, "gave up after $tookMillis ms, limit 100 ms plus 50 ms")
        }

    @Test
    fun `type only - seventy before-hooks with no after-hook keep sixty-four copies, the oldest dropped`() =
        runBlocking {
            val hooks = reporting(ArrayDeque((0 until 70).map { ok() } + (0 until 70).map { ok(error(1)) }))
            repeat(70) { hooks.before(call.copy(toolUseId = "t$it")) }
            assertEquals(64, hooks.snapshots())
            for (i in 0 until 6) assertNull(hooks.after(post.copy(toolUseId = "t$i")), "t$i was dropped")
            assertEquals(64, hooks.snapshots())
            assertEquals(1, hooks.after(post.copy(toolUseId = "t6"))!!.added.size)
            assertEquals(63, hooks.snapshots())
        }

    @Test
    fun `type only - the end of a turn drops every copy`() =
        runBlocking {
            val hooks = reporting(ArrayDeque((0 until 3).map { ok() } + (0 until 3).map { ok(error(1)) }))
            repeat(3) { hooks.before(call.copy(toolUseId = "t$it")) }
            hooks.turnEnded()
            assertEquals(0, hooks.snapshots())
            for (i in 0 until 3) assertNull(hooks.after(post.copy(toolUseId = "t$i")))
        }

    @Test
    fun `type only - the logs carry no path and no diagnostic text`() =
        runBlocking {
            val hooks =
                reporting(
                    ArrayDeque(listOf(ok(error(1, "secret message")))),
                    FakeAnalysis(refresh = { _, _ -> awaitCancellation() }),
                    diagnosticsLimit = 50,
                )
            hooks.before(call)
            hooks.after(post)
            logged.forEach {
                assertFalse(it.contains("secret"), it)
            }
        }
}
