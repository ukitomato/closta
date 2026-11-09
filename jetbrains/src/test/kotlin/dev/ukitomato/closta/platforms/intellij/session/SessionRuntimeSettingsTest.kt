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
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import kotlin.time.Duration.Companion.seconds

/**
 * What a session takes from the settings, over the fake processes: the permission mode its CLI is started in
 * (read when it starts, and through an effort or a resume as well), and the step before each message.
 */
class SessionRuntimeSettingsTest {
    private fun planner(spawner: ProcessSpawner) =
        object : SessionLaunchPlanner {
            override suspend fun plan(
                sessionId: String,
                workingDirectory: String?,
            ) = SessionLaunch(spawner, ClaudeLaunchSpec(sessionId = sessionId, cwd = workingDirectory))
        }

    private fun childOf(parent: CoroutineScope) =
        CoroutineScope(parent.coroutineContext + SupervisorJob(parent.coroutineContext.job))

    private fun spawner(session: FakeProcess) =
        FakeSpawner { argv ->
            if (argv.last() == "--version") FakeProcess.finished("2.1.285 (Claude Code)\n") else session
        }

    private fun CoroutineScope.runtime(
        spawner: ProcessSpawner,
        effort: String? = null,
        resume: String? = null,
        beforeSend: suspend () -> Unit = {},
        startMode: () -> String? = { null },
    ) = SessionRuntime(
        resume ?: ID,
        childOf(this),
        planner(spawner),
        WORKING_DIR,
        RecordingLog(),
        versionTimeout = GUARD,
        effort = effort,
        opening = resume?.let { SessionOpening.Resume(it) } ?: SessionOpening.New,
        beforeSend = beforeSend,
        startMode = startMode,
    )

    private suspend fun SessionRuntime.running() = withTimeout(GUARD) { status.first { it is SessionStatus.Running } }

    private fun FakeSpawner.sessionArgv() = calls.map { it.argv }.last { it.last() != "--version" }

    private fun List<String>.flagValue(flag: String) = zipWithNext().firstOrNull { it.first == flag }?.second

    private fun <T> withParent(block: suspend (CoroutineScope) -> T): T =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            try {
                block(parent)
            } finally {
                parent.cancel()
            }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a mode in the settings starts the CLI with it, with no effort and no resume`() =
        withParent { parent ->
            val spawner = spawner(FakeProcess())
            val runtime = parent.runtime(spawner, startMode = { "plan" })
            runtime.start()
            runtime.running()
            val argv = spawner.sessionArgv()
            assertEquals(listOf("--permission-mode", "plan"), argv.dropWhile { it != "--permission-mode" }.take(2))
            assertEquals(1, argv.count { it == "--permission-mode" })
            assertFalse(argv.contains("--effort"))
            runtime.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `no mode in the settings leaves the argv as it was`() =
        withParent { parent ->
            val spawner = spawner(FakeProcess())
            val runtime = parent.runtime(spawner)
            runtime.start()
            runtime.running()
            val expected = ClaudeLaunchSpec(sessionId = ID, cwd = WORKING_DIR).toArgv()
            assertEquals(expected, spawner.sessionArgv())
            assertFalse(spawner.sessionArgv().contains("--permission-mode"))
            runtime.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `the same mode is in the argv of an effort relaunch and of a resume`() =
        withParent { parent ->
            val withEffort = spawner(FakeProcess())
            val one = parent.runtime(withEffort, effort = "high", startMode = { "acceptEdits" })
            one.start()
            one.running()
            val effortArgv = withEffort.sessionArgv()
            assertEquals("acceptEdits", effortArgv.flagValue("--permission-mode"))
            assertEquals("high", effortArgv.flagValue("--effort"))
            one.close()

            val resumed = spawner(FakeProcess())
            val two = parent.runtime(resumed, resume = RESUMED, startMode = { "acceptEdits" })
            two.start()
            two.running()
            val resumeArgv = resumed.sessionArgv()
            assertEquals("acceptEdits", resumeArgv.flagValue("--permission-mode"))
            assertTrue(resumeArgv.contains("--resume=$RESUMED"), resumeArgv.toString())
            two.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `the mode is read each time a session starts`() =
        withParent { parent ->
            var mode: String? = "plan"
            val first = spawner(FakeProcess())
            val a = parent.runtime(first, startMode = { mode })
            a.start()
            a.running()
            mode = "auto"
            val second = spawner(FakeProcess())
            val b = parent.runtime(second, startMode = { mode })
            b.start()
            b.running()
            assertEquals("plan", first.sessionArgv().flagValue("--permission-mode"))
            assertEquals("auto", second.sessionArgv().flagValue("--permission-mode"))
            a.close()
            b.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `the step before sending runs before the line reaches the CLI, and a throwing step does not stop the send`() =
        withParent { parent ->
            val events = java.util.concurrent.CopyOnWriteArrayList<String>()
            val process = FakeProcess()
            var thrown = false
            val runtime =
                parent.runtime(
                    spawner(process),
                    beforeSend = {
                        events += "before; lines so far ${process.stdinLines().size}"
                        if (!thrown) {
                            thrown = true
                            throw java.io.IOException("SECRET-CANARY")
                        }
                    },
                )
            runtime.start()
            val running = runtime.running() as SessionStatus.Running
            running.commands.sendMessage("m1", "hello")
            val line = checkNotNull(withContext(Dispatchers.IO) { process.nextStdinLine(GUARD.inWholeMilliseconds) })
            assertTrue(line.contains("\"type\":\"user\"") && line.contains("hello"))
            assertEquals(listOf("before; lines so far 0"), events)
            runtime.close()
        }

    private companion object {
        const val ID = "0f8fad5b-d9cb-469f-a165-70867728950e"
        const val RESUMED = "336ed47b-2675-4317-b3f5-a3b48abb03a2"
        const val WORKING_DIR = "/work/project"
        const val TIMEOUT_SECONDS = 30L
        val GUARD = 10.seconds
    }
}
