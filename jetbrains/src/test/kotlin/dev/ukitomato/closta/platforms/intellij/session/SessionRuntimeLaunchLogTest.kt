package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.providers.claude.launch.ClaudeLaunchSpec
import dev.ukitomato.closta.providers.claude.launch.ProcessSpawner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.job
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import kotlin.time.Duration.Companion.seconds

/** The folders a session is given as working directories reach the process, and never the log. */
class SessionRuntimeLaunchLogTest {
    private val dirs = listOf("/home/u/secret-lib-a", "/home/u/secret-lib-b")

    private fun planner(spawner: ProcessSpawner) =
        object : SessionLaunchPlanner {
            override suspend fun plan(
                sessionId: String,
                workingDirectory: String?,
            ) = SessionLaunch(
                spawner,
                ClaudeLaunchSpec(sessionId = sessionId, cwd = workingDirectory, additionalDirectories = dirs),
            )
        }

    @Test
    @Timeout(30)
    fun `the process gets the folders, and the log line shows redacted ones`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val session = FakeProcess()
            val spawner =
                FakeSpawner { argv ->
                    if (argv.last() == "--version") FakeProcess.finished("2.1.285 (Claude Code)\n") else session
                }
            val log = RecordingLog()
            val runtime =
                SessionRuntime(
                    "s1",
                    CoroutineScope(parent.coroutineContext + SupervisorJob(parent.coroutineContext.job)),
                    planner(spawner),
                    "/work",
                    log,
                    versionTimeout = 10.seconds,
                )
            runtime.start()
            withTimeout(10.seconds) { runtime.status.first { it is SessionStatus.Running } }
            assertTrue(
                spawner.calls.any { call ->
                    dirs.all { "--add-dir=$it" in call.argv }
                },
            ) { "the process was given the folders" }
            val started = log.lines.filter { it.contains("started") }
            assertEquals(1, started.size)
            assertTrue(started.single().contains("--add-dir=<redacted>"), started.single())
            assertFalse(log.lines.any { it.contains("secret-lib") }) { log.lines.joinToString("\n") }
            runtime.close()
            parent.cancel()
        }

    @Test
    fun `a launch printed as a string hides the folders too`() {
        val launch = SessionLaunch(FakeSpawner { FakeProcess() }, ClaudeLaunchSpec("s", additionalDirectories = dirs))
        assertFalse(launch.toString().contains("secret-lib"), launch.toString())
    }
}
