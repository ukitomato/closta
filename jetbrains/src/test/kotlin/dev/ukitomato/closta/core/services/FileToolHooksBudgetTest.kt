package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.SaveResult
import dev.ukitomato.closta.core.interfaces.UnsavedDocuments
import dev.ukitomato.closta.core.models.FileToolCall
import dev.ukitomato.closta.core.models.HookPhase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test

/** A file tool call whose file needs no saving costs the call next to nothing. */
class FileToolHooksBudgetTest {
    @Tag("perf")
    @Test
    fun `two hundred calls on unmodified files stay within budget`() {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        try {
            val documents =
                object : UnsavedDocuments {
                    override suspend fun saveIfModified(path: String) = SaveResult.NOT_MODIFIED
                }
            val hooks = FileToolHooks(scope, documents, { true }, {})
            val call = FileToolCall(HookPhase.BEFORE, "Read", "/p/a.kt", "t", null)
            runBlocking { repeat(WARM_UP) { hooks.before(call) } }
            val times =
                runBlocking {
                    List(CALLS) {
                        val start = System.nanoTime()
                        hooks.before(call)
                        (System.nanoTime() - start) / NANOS_PER_MS
                    }
                }
            val sorted = times.sorted()
            val median = sorted[CALLS / 2]
            val p95 = sorted[CALLS * 95 / 100]
            println("perf fileToolBefore median=${"%.3f".format(median)}ms p95=${"%.3f".format(p95)}ms")
            assertTrue(median <= MEDIAN_BUDGET_MS, "median ${median}ms (budget ${MEDIAN_BUDGET_MS}ms)")
            assertTrue(p95 <= P95_BUDGET_MS, "p95 ${p95}ms (budget ${P95_BUDGET_MS}ms)")
        } finally {
            scope.cancel()
        }
    }

    @Tag("perf")
    @Test
    fun `two hundred after-hooks with no copy stay within budget`() {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        try {
            val hooks = FileToolHooks(scope, null, { true }, {}, reportEnabled = { true })
            val call = FileToolCall(HookPhase.AFTER, "Edit", "/p/a.kt", "t", null)
            runBlocking { repeat(WARM_UP) { hooks.after(call) } }
            val sorted =
                runBlocking {
                    List(CALLS) {
                        val start = System.nanoTime()
                        hooks.after(call.copy(toolUseId = "t$it"))
                        (System.nanoTime() - start) / NANOS_PER_MS
                    }
                }.sorted()
            val p95 = sorted[CALLS * 95 / 100]
            println("perf fileToolAfterWithoutCopy p95=${"%.3f".format(p95)}ms")
            assertTrue(p95 <= P95_BUDGET_MS, "p95 ${p95}ms (budget ${P95_BUDGET_MS}ms)")
        } finally {
            scope.cancel()
        }
    }

    private companion object {
        const val CALLS = 200
        const val WARM_UP = 50
        const val NANOS_PER_MS = 1_000_000.0
        const val MEDIAN_BUDGET_MS = 5.0
        const val P95_BUDGET_MS = 20.0
    }
}
