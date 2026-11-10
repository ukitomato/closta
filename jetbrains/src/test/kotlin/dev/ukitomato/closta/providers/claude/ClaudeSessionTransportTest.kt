package dev.ukitomato.closta.providers.claude

import dev.ukitomato.closta.core.models.AgentEvent
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import java.io.IOException

/**
 * The transport edges: a very large single line and a stream cut mid-line must not jam or
 * hang. The `@Timeout` is a safety net that only fires on a genuine hang — the success path returns at once.
 */
class ClaudeSessionTransportTest {
    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a 200 KB line arrives whole as one event`() =
        runBlocking {
            val big = "x".repeat(BIG_LINE_CHARS)
            val session = ClaudeSession(FakeAgentProcess(straightReplay(listOf(big))), SESSION_ID)
            val received = mutableListOf<AgentEvent>()
            session.events.collect { received += it }
            assertEquals(1, received.size) { "one 200 KB line must arrive as one event — not split, not dropped" }
            val broken = received.single() as AgentEvent.BrokenLine
            assertEquals(BIG_LINE_CHARS, broken.line.length) { "the whole 200 KB line is carried through" }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a truncated stream surfaces its line then an error without hanging`() =
        runBlocking {
            val partial = """{"type":"stream_event","""
            val session =
                ClaudeSession(
                    FakeAgentProcess(
                        straightReplay(
                            listOf(partial),
                            ProcessTermination.Error(IllegalStateException("process died")),
                        ),
                    ),
                    SESSION_ID,
                )
            val received = mutableListOf<AgentEvent>()
            var thrown: Throwable? = null
            try {
                session.events.collect { received += it }
            } catch (
                @Suppress("TooGenericExceptionCaught") failure: Throwable,
            ) {
                thrown = failure
            }
            assertEquals(1, received.size) { "the partial line arrives (as a broken line) before the error" }
            assertNotNull(thrown) { "a truncated stream surfaces as an error, not a silent end" }
        }

    // A CLI that already ended: its stdin is closed, and its stdout still holds a line it wrote (as capture 36's
    // result), which arrives only once the host has tried to write.
    private class EndedProcess(
        line: String,
    ) : AgentProcess {
        private val tried = CompletableDeferred<Unit>()

        override val stdoutLines: Flow<String> =
            flow {
                tried.await()
                emit(line)
            }

        override suspend fun writeStdin(line: String) {
            tried.complete(Unit)
            throw IOException("stdin closed")
        }

        override suspend fun awaitExit(): Int = 1

        override fun destroy() = Unit
    }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a write that fails does not stop the read, and a send after the end fails`() =
        runBlocking {
            val line = """{"type":"system","subtype":"status","status":"requesting","session_id":"s","uuid":"u"}"""
            val session = ClaudeSession(EndedProcess(line), SESSION_ID)
            session.interrupt()
            val received = mutableListOf<AgentEvent>()
            session.events.collect { received += it }
            assertEquals(1, received.size) { "the line written before the CLI ended is read: $received" }
            assertThrows(Exception::class.java) { runBlocking { session.interrupt() } }
            Unit
        }

    private companion object {
        const val SESSION_ID = "test-session"
        const val BIG_LINE_CHARS = 200_000
        const val TIMEOUT_SECONDS = 30L
    }
}
