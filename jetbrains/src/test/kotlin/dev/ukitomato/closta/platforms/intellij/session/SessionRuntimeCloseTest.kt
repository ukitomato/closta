package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.providers.claude.FakeSavedSessions
import dev.ukitomato.closta.providers.claude.history.CapturedTranscript
import dev.ukitomato.closta.providers.claude.launch.ClaudeLaunchSpec
import dev.ukitomato.closta.providers.claude.launch.ProcessSpawner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.job
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds
import kotlin.time.TimeSource

/**
 * What a close waits for: the Job [SessionRuntime.closeJob] returns is complete when the process has ended, or
 * when the wait ran out, and a session that ended by itself waits for nothing. Waits are real and short; a process that
 * does not end is released at the end of each test.
 */
class SessionRuntimeCloseTest {
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

    private fun runtime(
        process: FakeProcess,
        parent: CoroutineScope,
        log: SessionLog,
        closeWait: Duration,
    ) = SessionRuntime(
        ID,
        childOf(parent),
        planner(spawner(process)),
        "/work/project",
        log,
        versionTimeout = GUARD,
        closeWait = closeWait,
    )

    // Polls until [condition] is true, up to [GUARD]: a fixed wait would pass or fail with the machine's load.
    private suspend fun untilTrue(condition: () -> Boolean) {
        withTimeout(GUARD) { while (!condition()) delay(POLL) }
    }

    private suspend fun SessionRuntime.running() = withTimeout(GUARD) { status.first { it is SessionStatus.Running } }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `the Job closeJob returns is not complete while the process is running, and is when it ends`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess(endsOnDestroy = false)
            val log = RecordingLog()
            val runtime = runtime(process, parent, log, closeWait = GUARD)
            try {
                runtime.start()
                runtime.running()

                val closed: Job = runtime.closeJob()
                untilTrue { process.destroyed }
                assertFalse(closed.isCompleted, "the process has not ended, so the close is not over")

                process.exit(0)
                withTimeout(GUARD) { closed.join() }
                assertTrue(log.lines.any { "closed, the process ended" in it }, log.lines.toString())
            } finally {
                process.exit(0)
                parent.cancel()
            }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `close does not wait for the process, only closeJob does`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess(endsOnDestroy = false)
            val log = RecordingLog()
            val own = childOf(parent)
            val runtime =
                SessionRuntime(
                    ID,
                    own,
                    planner(spawner(process)),
                    "/work/project",
                    log,
                    versionTimeout = GUARD,
                    closeWait = GUARD,
                )
            try {
                runtime.start()
                runtime.running()

                runtime.close()
                untilTrue { process.destroyed }
                // The process has not ended, and the scope's Job is complete all the same: nothing was waited for.
                withTimeout(FAST) { own.coroutineContext.job.join() }
                assertFalse(log.lines.any { "closed, the process" in it }, "no wait was made: ${log.lines}")
            } finally {
                process.exit(0)
                parent.cancel()
            }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a close that lands while the process is being spawned still waits for it`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess(endsOnDestroy = false)
            val log = RecordingLog()
            val spawning = CountDownLatch(1)
            val release = CountDownLatch(1)
            val spawner =
                FakeSpawner { argv ->
                    if (argv.last() == "--version") {
                        FakeProcess.finished("2.1.285 (Claude Code)\n")
                    } else {
                        spawning.countDown()
                        release.await()
                        process
                    }
                }
            val runtime =
                SessionRuntime(
                    ID,
                    childOf(parent),
                    planner(spawner),
                    "/work/project",
                    log,
                    versionTimeout = GUARD,
                    closeWait = GUARD,
                )
            try {
                runtime.start()
                assertTrue(spawning.await(GUARD.inWholeSeconds, TimeUnit.SECONDS))
                val closed = runtime.closeJob()
                release.countDown()
                untilTrue { process.destroyed }
                assertFalse(closed.isCompleted, "the process the spawn made has not ended, so the close is not over")

                process.exit(0)
                withTimeout(GUARD) { closed.join() }
                assertTrue(log.lines.any { "closed, the process ended" in it }, log.lines.toString())
            } finally {
                release.countDown()
                process.exit(0)
                parent.cancel()
            }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a wait for the end that fails is logged with the type of the failure, not as an end`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess(endsOnDestroy = false, waitFails = IllegalStateException("secret detail"))
            val log = RecordingLog()
            val runtime = runtime(process, parent, log, closeWait = GUARD)
            try {
                runtime.start()
                runtime.running()

                withTimeout(GUARD) { runtime.closeJob().join() }

                assertTrue(
                    log.lines.any { it.startsWith("WARN") && "java.lang.IllegalStateException" in it },
                    log.lines.toString(),
                )
                assertFalse(log.lines.any { "the process ended" in it }, log.lines.toString())
                assertFalse(log.lines.any { "secret detail" in it }, "the message is not logged: ${log.lines}")
            } finally {
                process.exit(0)
                parent.cancel()
            }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a process that does not end lets the Job complete when the wait runs out, and the log says so`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess(endsOnDestroy = false)
            val log = RecordingLog()
            val wait = 300.milliseconds
            val runtime = runtime(process, parent, log, closeWait = wait)
            try {
                runtime.start()
                runtime.running()

                val begun = TimeSource.Monotonic.markNow()
                val closed = runtime.closeJob()
                withTimeout(GUARD) { closed.join() }

                assertTrue(begun.elapsedNow() >= wait, "it waited: ${begun.elapsedNow()}")
                assertTrue(
                    log.lines.any { it.startsWith("WARN") && "did not end in 300ms" in it },
                    log.lines.toString(),
                )
            } finally {
                process.exit(0)
                parent.cancel()
            }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a session that fails does not wait for its process, however long the wait is`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess(endsOnDestroy = false)
            val log = RecordingLog()
            CapturedTranscript.secondStdout.map { it.replace(resumed, OTHER) }.forEach(process::emit)
            val runtime =
                SessionRuntime(
                    ID,
                    childOf(parent),
                    planner(spawner(process)),
                    "/work/project",
                    log,
                    versionTimeout = GUARD,
                    opening = SessionOpening.Fork(resumed),
                    saved = FakeSavedSessions(transcripts = mapOf(resumed to CapturedTranscript.read())),
                    closeWait = GUARD,
                )
            try {
                // The first init says another id than the fork's: the start fails with the process still running.
                runtime.start()
                val failed = withTimeout(FAST) { runtime.status.first { it is SessionStatus.Failed } }
                assertEquals(SessionStatus.Failed(SessionFailure.ForkIdMismatch), failed)
                assertTrue(process.destroyed, "the process was told to end")
                assertFalse(log.lines.any { "closed, the process" in it }, "no wait was made: ${log.lines}")
            } finally {
                process.exit(0)
                parent.cancel()
            }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a process that does not end in the wait is killed once, and a kill that ends it is logged`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess(endsOnDestroy = false, endsOnKill = true)
            val log = RecordingLog()
            val runtime = runtime(process, parent, log, closeWait = 300.milliseconds)
            try {
                runtime.start()
                runtime.running()

                withTimeout(GUARD) { runtime.closeJob().join() }

                assertEquals(1, process.forceKills)
                val warn = log.lines.indexOfFirst { "did not end in 300ms" in it }
                val info = log.lines.indexOfFirst { "killed, the process ended" in it }
                assertTrue(warn >= 0 && info > warn, log.lines.toString())
                val killed = log.lines[info]
                assertTrue(killed.startsWith("WARN") && "record may be missing" in killed, killed)
                assertFalse(log.lines.any { "did not end after a kill" in it }, log.lines.toString())
            } finally {
                process.exit(0)
                parent.cancel()
            }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a kill that throws is logged with the exception's type and the wait still ends`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess(endsOnDestroy = false, killFails = IllegalStateException("no kill"))
            val log = RecordingLog()
            val runtime =
                SessionRuntime(
                    ID,
                    childOf(parent),
                    planner(spawner(process)),
                    "/work/project",
                    log,
                    versionTimeout = GUARD,
                    closeWait = 200.milliseconds,
                    killWait = 200.milliseconds,
                )
            try {
                runtime.start()
                runtime.running()

                withTimeout(GUARD) { runtime.closeJob().join() }

                assertEquals(1, process.forceKills)
                assertTrue(
                    log.lines.any {
                        it.startsWith("WARN") && "the kill failed" in it && "IllegalStateException" in it
                    },
                    log.lines.toString(),
                )
                assertFalse(log.lines.any { "no kill" in it }, "the message is not logged: ${log.lines}")
                assertTrue(log.lines.any { "did not end after a kill" in it }, log.lines.toString())
            } finally {
                process.exit(0)
                parent.cancel()
            }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a process that survives the kill is given up after the kill wait, and the log says so`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess(endsOnDestroy = false)
            val log = RecordingLog()
            val runtime =
                SessionRuntime(
                    ID,
                    childOf(parent),
                    planner(spawner(process)),
                    "/work/project",
                    log,
                    versionTimeout = GUARD,
                    closeWait = 200.milliseconds,
                    killWait = 200.milliseconds,
                )
            try {
                runtime.start()
                runtime.running()

                withTimeout(GUARD) { runtime.closeJob().join() }

                assertEquals(1, process.forceKills)
                assertTrue(
                    log.lines.any { it.startsWith("WARN") && "did not end after a kill" in it },
                    log.lines.toString(),
                )
                assertFalse(log.lines.any { "killed, the process ended" in it }, log.lines.toString())
            } finally {
                process.exit(0)
                parent.cancel()
            }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a close that the process answers is never a kill, whether through closeJob or close`() =
        runBlocking {
            for (viaJob in listOf(true, false)) {
                val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
                val process = FakeProcess()
                val log = RecordingLog()
                val own = childOf(parent)
                val runtime =
                    SessionRuntime(
                        ID,
                        own,
                        planner(spawner(process)),
                        "/work/project",
                        log,
                        versionTimeout = GUARD,
                        closeWait = GUARD,
                    )
                try {
                    runtime.start()
                    runtime.running()
                    if (viaJob) withTimeout(GUARD) { runtime.closeJob().join() } else runtime.close()
                    withTimeout(GUARD) { own.coroutineContext.job.join() }
                    assertTrue(process.destroyed)
                    assertEquals(0, process.forceKills, "viaJob=$viaJob: ${log.lines}")
                } finally {
                    process.exit(0)
                    parent.cancel()
                }
            }
        }

    private companion object {
        const val ID = "0f8fad5b-d9cb-469f-a165-70867728950e"
        val resumed = CapturedTranscript.sessionId
        const val OTHER = "22222222-2222-4222-8222-222222222222"
        const val TIMEOUT_SECONDS = 30L
        val GUARD = 10.seconds
        val FAST = 3.seconds
        val POLL = 5.milliseconds
    }
}
