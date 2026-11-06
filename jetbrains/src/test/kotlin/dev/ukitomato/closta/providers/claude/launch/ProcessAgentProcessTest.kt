package dev.ukitomato.closta.providers.claude.launch

import dev.ukitomato.closta.providers.claude.AgentProcess
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import java.util.concurrent.TimeUnit

/**
 * Drives [ProcessAgentProcess] with **local** `sh -c` processes via [NativeProcessSpawner] — no WSL, no real
 * `claude` (that end-to-end runs in the IDE). Proves the process→[AgentProcess] bridge: stdout lines, stdin
 * round-trip, exit code, destroy, stderr drain (no deadlock), a 200 KB line, and nonzero-exit→exception.
 * Each test carries a coarse [Timeout] as a hang safety net.
 */
class ProcessAgentProcessTest {
    private fun sh(script: String): ProcessAgentProcess =
        ProcessAgentProcess(NativeProcessSpawner.spawn(listOf("sh", "-c", script), emptyMap(), null))

    @Test
    @Timeout(TIMEOUT)
    fun `stdout lines arrive in order and the stream completes on a clean exit`() =
        runBlocking {
            val received = mutableListOf<String>()
            sh("printf 'a\\nb\\nc\\n'").stdoutLines.collect { received += it }
            assertEquals(listOf("a", "b", "c"), received)
        }

    @Test
    @Timeout(TIMEOUT)
    fun `writeStdin round-trips through the process`() =
        runBlocking {
            val process = sh("read x; echo \"got:\$x\"")
            val received = mutableListOf<String>()
            val collector = launch { process.stdoutLines.collect { received += it } }
            process.writeStdin("hello")
            collector.join()
            assertEquals(listOf("got:hello"), received)
        }

    @Test
    @Timeout(TIMEOUT)
    fun `awaitExit returns the process exit code`() =
        runBlocking {
            assertEquals(0, sh("exit 0").awaitExit())
            assertEquals(3, sh("exit 3").awaitExit())
        }

    @Test
    @Timeout(TIMEOUT)
    fun `a nonzero exit surfaces as a ProcessExitException on stdoutLines`() =
        runBlocking {
            val thrown =
                try {
                    sh("echo hi; exit 3").stdoutLines.collect { }
                    null
                } catch (
                    @Suppress("TooGenericExceptionCaught") failure: Throwable,
                ) {
                    failure
                }
            assertNotNull(thrown) { "a nonzero exit must surface as an exception, not a normal completion" }
            assertTrue(thrown is ProcessExitException && thrown.exitCode == 3)
            assertFalse(thrown is CancellationException) { "abnormal exit must not be a cancellation" }
        }

    @Test
    @Timeout(TIMEOUT)
    fun `exit 127 command-not-found is distinguished by code and surfaces on stdoutLines`() =
        runBlocking {
            // 127 = command not found: the process started but the command was not resolved.
            assertEquals(127, sh("exit 127").awaitExit())
            // The abnormal exit must also surface on the stream, not end it silently.
            val thrown =
                try {
                    sh("exit 127").stdoutLines.collect { }
                    null
                } catch (
                    @Suppress("TooGenericExceptionCaught") failure: Throwable,
                ) {
                    failure
                }
            assertTrue(thrown is ProcessExitException && thrown.exitCode == 127) {
                "exit 127 must surface as ProcessExitException(127) on stdoutLines"
            }
        }

    @Test
    @Timeout(TIMEOUT)
    fun `destroy terminates a long-running process without hanging`() =
        runBlocking {
            val process = sh("sleep 30")
            process.destroy()
            // Returns promptly (killed), not after 30s; the @Timeout is the safety net.
            val code = process.awaitExit()
            assertTrue(code != 0) { "a destroyed process exits nonzero (signalled)" }
        }

    @Test
    @Timeout(TIMEOUT)
    fun `a flood of stderr does not deadlock the stdout reader`() =
        runBlocking {
            // ~30000 stderr lines far exceed the OS pipe buffer; without draining stderr the process would
            // block on write and the stdout reader would hang. One stdout line must still arrive.
            val received = mutableListOf<String>()
            sh("i=0; while [ \$i -lt 30000 ]; do echo \"e\$i\" 1>&2; i=\$((i+1)); done; echo done")
                .stdoutLines
                .collect { received += it }
            assertEquals(listOf("done"), received)
        }

    @Test
    @Timeout(TIMEOUT)
    fun `stderr flooded after stdout closes does not deadlock the exit wait`() =
        runBlocking {
            // The process emits one stdout line, closes stdout, then floods stderr while still alive. If the
            // stderr drain were stopped at stdout EOF (before awaiting exit), the stderr pipe would fill and
            // awaitExit()/waitFor() would deadlock. Reverting that fix fails this via the @Timeout (anti-false-green).
            val received = mutableListOf<String>()
            sh("echo done; exec 1>&-; i=0; while [ \$i -lt 30000 ]; do echo \"e\$i\" 1>&2; i=\$((i+1)); done")
                .stdoutLines
                .collect { received += it }
            assertEquals(listOf("done"), received)
        }

    @Test
    @Timeout(TIMEOUT)
    fun `a 200 KB single line arrives whole without deadlocking`() =
        runBlocking {
            val received = mutableListOf<String>()
            sh("yes x | head -n $BIG | tr -d '\\n'; echo").stdoutLines.collect { received += it }
            assertEquals(1, received.size)
            assertEquals(BIG, received.single().length)
        }

    @Test
    @Timeout(TIMEOUT)
    fun `launchClaude injects the spec argv env and cwd into the spawner`() =
        runBlocking {
            // launchClaude is the ProcessSpawner injection point (ProcessAgentProcess wraps the
            // already-launched Process). Verify the spec's argv/env/cwd reach the spawner (the WSL spawner fills
            // the same seam).
            var args: List<String>? = null
            var env: Map<String, String>? = null
            var wd: String? = null
            val spec = ClaudeLaunchSpec(sessionId = "s-1", model = "m-1", env = mapOf("K" to "v"), cwd = "/tmp")
            val spawner =
                ProcessSpawner { a, e, w ->
                    args = a
                    env = e
                    wd = w
                    NativeProcessSpawner.spawn(listOf("sh", "-c", "exit 0"), emptyMap(), null)
                }
            val agent = launchClaude(spec, spawner)
            agent.awaitExit()
            assertEquals(spec.toArgv(), args)
            assertEquals(mapOf("CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING" to "true", "K" to "v"), env)
            assertEquals("/tmp", wd)
        }

    @Test
    fun `the default destroyForcibly of an AgentProcess is destroy`() {
        var destroyed = 0
        val fake =
            object : AgentProcess {
                override val stdoutLines: Flow<String> = emptyFlow()

                override suspend fun writeStdin(line: String) = Unit

                override suspend fun awaitExit(): Int = 0

                override fun destroy() {
                    destroyed++
                }
            }
        fake.destroyForcibly()
        assertEquals(1, destroyed)
    }

    @Test
    @Timeout(TIMEOUT)
    fun `destroyForcibly ends a process that ignores the end signal and the child it left, destroy does not`() {
        val raw =
            NativeProcessSpawner.spawn(
                listOf("sh", "-c", "trap '' TERM; sleep 30 & echo \$!; while :; do sleep 1; done"),
                emptyMap(),
                null,
            )
        // The cleanup kills through the handle taken here, not by looking the pid up again: the handle keeps the
        // child's start time, so a pid reused by another process after the child ended is not killed.
        var childHandle: ProcessHandle? = null
        try {
            val first = raw.inputStream.bufferedReader().readLine()
            val pid = first.trim().toLong()
            val child = checkNotNull(ProcessHandle.of(pid).orElse(null)) { "the child is not there" }
            childHandle = child
            val agent = ProcessAgentProcess(raw)

            agent.destroy()
            assertFalse(raw.waitFor(1, TimeUnit.SECONDS), "the end signal is ignored, so it is still running")
            assertTrue(raw.isAlive)

            agent.destroyForcibly()
            assertTrue(raw.waitFor(GUARD_SECONDS, TimeUnit.SECONDS), "the parent ended after a forced kill")
            assertTrue(waitGone(child), "the child ended too")
        } finally {
            raw.destroyForcibly()
            childHandle?.destroyForcibly()
        }
    }

    private fun waitGone(handle: ProcessHandle): Boolean {
        val end = System.nanoTime() + TimeUnit.SECONDS.toNanos(GUARD_SECONDS)
        while (handle.isAlive && System.nanoTime() < end) Thread.sleep(POLL_MILLIS)
        return !handle.isAlive
    }

    private companion object {
        const val GUARD_SECONDS = 5L
        const val POLL_MILLIS = 20L
        const val TIMEOUT = 30L
        const val BIG = 200_000
    }
}
