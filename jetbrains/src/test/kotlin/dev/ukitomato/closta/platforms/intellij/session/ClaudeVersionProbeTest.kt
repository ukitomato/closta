package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.providers.claude.launch.ClaudeLaunchSpec
import dev.ukitomato.closta.providers.claude.launch.WorkingDirectoryMissingException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

/**
 * [ClaudeVersionProbe] over fake processes: what it runs, what it reads back, how each way of failing is sorted, and
 * that the process it started is destroyed on every path — a timeout and a cancellation included.
 */
class ClaudeVersionProbeTest {
    private fun launch(
        spawner: FakeSpawner,
        env: Map<String, String> = mapOf("K" to "v"),
    ) = SessionLaunch(spawner, ClaudeLaunchSpec(sessionId = "s", cwd = "/work", env = env))

    private fun failureOf(block: suspend () -> Unit): SessionFailure =
        assertThrows(SessionStartException::class.java) { runBlocking { block() } }.failure

    private fun failureOfCheck(answer: () -> Process): SessionFailure =
        failureOf { ClaudeVersionProbe.version(launch(FakeSpawner { answer() }), 5.seconds, LiveProcesses()) }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `runs claude --version with the session's spawner, environment and working directory`() =
        runBlocking {
            val spawner = FakeSpawner { FakeProcess.finished("\n  2.1.285 (Claude Code)  \nextra\n") }
            val version = ClaudeVersionProbe.version(launch(spawner), 5.seconds, LiveProcesses())
            assertEquals("2.1.285", version)
            val expected = FakeSpawner.Call(listOf("claude", "--version"), mapOf("K" to "v"), "/work")
            assertEquals(listOf(expected), spawner.calls)
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `only a version is taken from the output, and anything else is not repeated`() {
        val marker = "version-probe-marker-AWS_SESSION_TOKEN=secret"
        listOf(marker, "claude $marker", "2.1.$marker", "2.1.286" + "x".repeat(33), "v2.1.286").forEach { printed ->
            val failure = failureOfCheck { FakeProcess.finished("$printed\n") }
            assertEquals(SessionFailure.VersionCheckFailed("the output is not a version"), failure) { printed }
            assertFalse(failure.cause.contains("marker")) { failure.cause }
        }
        assertEquals("2.1.286", ClaudeVersionProbe.versionOf("2.1.286 (Claude Code)"))
        assertEquals("2.2.0-beta.1+build.7", ClaudeVersionProbe.versionOf("2.2.0-beta.1+build.7"))
    }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `nonzero, 127, no output and a spawn that throws are sorted into their failures`() {
        assertEquals(SessionFailure.VersionCheckFailed("exit code 2"), failureOfCheck { FakeProcess.finished("", 2) })
        assertEquals(SessionFailure.CommandNotFound, failureOfCheck { FakeProcess.finished("", 127) })
        assertEquals(SessionFailure.VersionCheckFailed("no output"), failureOfCheck { FakeProcess.finished(" \n") })
        assertEquals(SessionFailure.LaunchFailed("error=2"), failureOfCheck { throw IOException("error=2") })
    }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a spawn that names a working folder that is not there is that failure`() {
        assertEquals(
            SessionFailure.WorkingDirectoryMissing("/work/wt"),
            failureOfCheck { throw WorkingDirectoryMissingException("/work/wt", IOException("error=2")) },
        )
    }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a check that does not answer in time fails and its process is destroyed`() {
        val hanging = FakeProcess()
        val failure =
            failureOf { ClaudeVersionProbe.version(launch(FakeSpawner { hanging }), 100.milliseconds, LiveProcesses()) }
        assertTrue(failure is SessionFailure.VersionCheckFailed)
        assertTrue(hanging.destroyed)
    }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `cancelling the check destroys its process and returns promptly`() =
        runBlocking {
            val hanging = FakeProcess()
            val spawned = CompletableDeferred<Unit>()
            val spawner =
                FakeSpawner {
                    spawned.complete(Unit)
                    hanging
                }
            val check =
                async(Dispatchers.Default) { ClaudeVersionProbe.version(launch(spawner), 30.seconds, LiveProcesses()) }
            spawned.await()
            withTimeout(5.seconds) {
                check.cancel()
                check.join()
            }
            assertTrue(hanging.destroyed)
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a cancel that lands while the process is being spawned still destroys it`() =
        runBlocking {
            val hanging = FakeProcess()
            val spawning = CountDownLatch(1)
            val release = CountDownLatch(1)
            val spawner =
                FakeSpawner {
                    spawning.countDown()
                    release.await()
                    hanging
                }
            val check =
                async(Dispatchers.Default) { ClaudeVersionProbe.version(launch(spawner), 30.seconds, LiveProcesses()) }
            try {
                assertTrue(spawning.await(5, TimeUnit.SECONDS))
                check.cancel()
                release.countDown()
                withTimeout(5.seconds) { check.join() }
                assertTrue(hanging.destroyed)
            } finally {
                release.countDown()
            }
        }

    private companion object {
        const val TIMEOUT_SECONDS = 30L
    }
}
