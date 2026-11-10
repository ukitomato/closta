package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.presenter.view.SwitchKind
import dev.ukitomato.closta.presenter.view.SwitchOutcome
import dev.ukitomato.closta.presenter.view.SwitchRecord
import dev.ukitomato.closta.presenter.view.threadIsRunning
import dev.ukitomato.closta.providers.claude.FakeSavedSessions
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import dev.ukitomato.closta.providers.claude.history.CapturedTranscript
import dev.ukitomato.closta.providers.claude.launch.ClaudeLaunchSpec
import dev.ukitomato.closta.providers.claude.protocol.StdinEncoder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.job
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import java.io.IOException
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

/**
 * Turning the sandbox on restarts the session's CLI under the same runtime, over the fake processes of
 * [SessionRuntimeTest]: the restart's argv, the wait for the old process, the one fallback without the sandbox when the
 * sandboxed CLI does not start, and turning it off live.
 */
class SessionRuntimeSandboxTest {
    /** The session processes in the order they are spawned; a spawn past the list gets a plain process. */
    private class Processes(
        vararg given: FakeProcess,
    ) {
        private val queue = ConcurrentLinkedQueue(given.toList())
        val spawned: MutableList<FakeProcess> = CopyOnWriteArrayList()
        val aliveAtSpawn: MutableList<Boolean> = CopyOnWriteArrayList()

        /** Throws for the session spawn with this index (0 is the first). */
        var failAt: Int? = null

        val spawner =
            FakeSpawner { argv ->
                if (argv.last() == "--version") {
                    FakeProcess.finished("2.1.282 (Claude Code)\n")
                } else {
                    aliveAtSpawn += spawned.any { it.isAlive }
                    if (failAt == spawned.size) throw IOException("spawn failed")
                    (queue.poll() ?: FakeProcess()).also { spawned += it }
                }
            }

        fun argvs() = spawner.calls.map { it.argv }.filter { it.last() != "--version" }
    }

    private fun childOf(parent: CoroutineScope) =
        CoroutineScope(parent.coroutineContext + SupervisorJob(parent.coroutineContext.job))

    private fun runtime(
        processes: Processes,
        parent: CoroutineScope,
        sandbox: Boolean = false,
        opening: SessionOpening = SessionOpening.New,
        saved: FakeSavedSessions? = null,
    ) = SessionRuntime(
        opening.savedId ?: ID,
        childOf(parent),
        object : SessionLaunchPlanner {
            override suspend fun plan(
                sessionId: String,
                workingDirectory: String?,
            ) = SessionLaunch(processes.spawner, ClaudeLaunchSpec(sessionId = sessionId, cwd = workingDirectory))
        },
        WORKING_DIR,
        RecordingLog(),
        versionTimeout = GUARD,
        opening = opening,
        saved = saved,
        closeWait = GUARD,
        sandbox = sandbox,
    )

    private fun <T> withParent(block: suspend (CoroutineScope) -> T): T =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            try {
                block(parent)
            } finally {
                parent.cancel()
            }
        }

    // Running on the [spawns]-th session process.
    private suspend fun SessionRuntime.runningOn(
        processes: Processes,
        spawns: Int,
    ) = withTimeout(GUARD) {
        status.first { it is SessionStatus.Running && processes.spawned.size == spawns } as SessionStatus.Running
    }

    private suspend fun untilTrue(condition: () -> Boolean) = withTimeout(GUARD) { while (!condition()) delay(POLL) }

    private fun SessionRuntime.sandboxSwitches(): List<SwitchRecord> =
        view.value.transcript.operations.switches
            .filter { it.kind == SwitchKind.SANDBOX }

    // A message sent and its turn ended, so a restart is allowed and resumes.
    private suspend fun SessionRuntime.oneTurn(
        commands: SessionCommands,
        process: FakeProcess,
    ) {
        commands.sendMessage("m1", "hello")
        CaptureFixtures.nonBlankLines(CaptureFixtures.textOf(TURN)).forEach(process::emit)
        withTimeout(GUARD) {
            view.first { it.transcript.routing.sends == 1 && !threadIsRunning(it.conversation, it.transcript) }
        }
    }

    private fun success(id: String) =
        """{"type":"control_response","response":{"subtype":"success","request_id":"$id"}}"""

    // The [index]-th session process refuses to start as capture 36's first CLI did: once it has the settings request
    // the host writes at once, it writes its one error result and exits with 1.
    private suspend fun Processes.refuseToStart(index: Int) {
        untilTrue { spawned.size > index }
        val process = spawned[index]
        val asked = withContext(Dispatchers.IO) { process.nextStdinLine(GUARD.inWholeMilliseconds) }
        assertTrue(checkNotNull(asked).contains("\"subtype\":\"get_settings\""), asked)
        process.emit(CaptureFixtures.nonBlankLines(CaptureFixtures.textOf(UNAVAILABLE)).first())
        process.exit(1)
    }

    private fun List<String>.flagValue(flag: String) = zipWithNext().firstOrNull { it.first == flag }?.second

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun launchCarriesSandbox() =
        withParent { parent ->
            val processes = Processes()
            val runtime = runtime(processes, parent, sandbox = true)
            runtime.start()
            runtime.runningOn(processes, 1)
            assertEquals(ClaudeLaunchSpec.SANDBOX_SETTINGS, processes.argvs().single().flagValue("--settings"))
            assertTrue(runtime.view.value.transcript.operations.launchSandbox)
            val first = withContext(Dispatchers.IO) { processes.spawned[0].nextStdinLine(GUARD.inWholeMilliseconds) }
            assertTrue(checkNotNull(first).contains("\"subtype\":\"get_settings\""), "the settings are asked at once")
            runtime.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun turningOnRestartsWithResumeAndSettings() =
        withParent { parent ->
            val processes = Processes()
            val runtime = runtime(processes, parent)
            runtime.start()
            val running = runtime.runningOn(processes, 1)
            runtime.oneTurn(running.commands, processes.spawned[0])
            val before = runtime.view.value
            val expected =
                restartSpec(
                    ClaudeLaunchSpec(sessionId = ID, cwd = WORKING_DIR),
                    SessionOpening.New,
                    true,
                    carriedChoices(before),
                    true,
                ).toArgv()
            assertTrue(runtime.turnSandboxOn())
            val again = runtime.runningOn(processes, 2)
            assertTrue(again.commands !== running.commands)
            assertEquals(expected, processes.argvs()[1])
            assertTrue("--resume=$ID" in expected)
            assertEquals(before.transcript.messages.size, runtime.view.value.transcript.messages.size)
            assertTrue(processes.spawned[0].destroyed)
            runtime.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun relaunchWaitsForTheOldProcess() =
        withParent { parent ->
            val first = FakeProcess(endsOnDestroy = false)
            val processes = Processes(first)
            val runtime = runtime(processes, parent)
            runtime.start()
            runtime.runningOn(processes, 1)
            assertTrue(runtime.turnSandboxOn())
            untilTrue { first.destroyed }
            first.exit(FakeProcess.SIGTERM_EXIT)
            runtime.runningOn(processes, 2)
            assertEquals(listOf(false, false), processes.aliveAtSpawn, "the second spawn came after the first ended")
            runtime.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun relaunchDoesNotRestoreAgain() =
        withParent { parent ->
            val resumed = CapturedTranscript.sessionId
            val saved = FakeSavedSessions(transcripts = mapOf(resumed to CapturedTranscript.read()))
            val processes = Processes()
            val runtime = runtime(processes, parent, opening = SessionOpening.Resume(resumed), saved = saved)
            runtime.start()
            runtime.runningOn(processes, 1)
            assertTrue(runtime.turnSandboxOn())
            runtime.runningOn(processes, 2)
            assertEquals(listOf(resumed), saved.reads)
            assertTrue("--resume=$resumed" in processes.argvs()[1])
            runtime.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun relaunchCarriesChoices() =
        withParent { parent ->
            val processes = Processes()
            val runtime = runtime(processes, parent)
            runtime.start()
            val commands = runtime.runningOn(processes, 1).commands
            val process = processes.spawned[0]
            for (switch in listOf<suspend () -> Unit>(
                { commands.switchMode("plan") },
                { commands.switchModel("opus") },
                { commands.switchEffort("high") },
            )) {
                switch()
                val id =
                    runtime.view.value.transcript.operations.switches
                        .last()
                        .id
                process.emit(success(id))
                withTimeout(GUARD) {
                    runtime.view.first { view ->
                        view.transcript.operations.switches
                            .any { it.id == id && it.outcome == SwitchOutcome.APPLIED }
                    }
                }
            }
            assertTrue(runtime.turnSandboxOn())
            runtime.runningOn(processes, 2)
            val argv = processes.argvs()[1]
            val flags = listOf("--permission-mode", "--model", "--effort")
            assertEquals(listOf("plan", "opus", "high"), flags.map { argv.flagValue(it) })
            runtime.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun sandboxStartFailureFallsBackOnce() =
        withParent { parent ->
            val processes = Processes()
            val runtime = runtime(processes, parent)
            runtime.start()
            val running = runtime.runningOn(processes, 1)
            runtime.oneTurn(running.commands, processes.spawned[0])
            val notices = runtime.conversation.value.notices
            val cost = runtime.conversation.value.usage.sessionCostUsd
            assertTrue(runtime.turnSandboxOn())
            processes.refuseToStart(1)
            runtime.runningOn(processes, 3)
            val argvs = processes.argvs()
            assertTrue("--settings" in argvs[1])
            assertFalse("--settings" in argvs[2], "${argvs[2]}")
            assertTrue("--resume=$ID" in argvs[2])
            val record = runtime.sandboxSwitches().single()
            assertEquals(SwitchOutcome.FAILED, record.outcome)
            assertTrue(record.detail.orEmpty().startsWith("Sandbox required but unavailable"), record.detail)
            assertEquals(notices, runtime.conversation.value.notices)
            assertEquals(cost, runtime.conversation.value.usage.sessionCostUsd)
            assertFalse(runtime.view.value.transcript.operations.launchSandbox)
            runtime.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun fallbackFailureIsAFailure() =
        withParent { parent ->
            val processes = Processes(FakeProcess(), FakeProcess(), FakeProcess().apply { exit(1) })
            val runtime = runtime(processes, parent)
            runtime.start()
            runtime.runningOn(processes, 1)
            assertTrue(runtime.turnSandboxOn())
            processes.refuseToStart(1)
            val end = withTimeout(GUARD) { runtime.status.first { it is SessionStatus.Failed } }
            assertInstanceOf(SessionStatus.Failed::class.java, end)
            assertEquals(3, processes.argvs().size)
            assertEquals(SwitchOutcome.FAILED, runtime.sandboxSwitches().single().outcome)
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun launchStartFailureFallsBack() =
        withParent { parent ->
            val processes = Processes()
            val runtime = runtime(processes, parent, sandbox = true)
            runtime.start()
            processes.refuseToStart(0)
            runtime.runningOn(processes, 2)
            val argvs = processes.argvs()
            assertTrue("--settings" in argvs[0])
            assertFalse("--settings" in argvs[1], "${argvs[1]}")
            assertTrue("--session-id=$ID" in argvs[1])
            val record = runtime.sandboxSwitches().single()
            assertEquals(SwitchOutcome.FAILED, record.outcome)
            assertTrue(record.detail.orEmpty().startsWith("Sandbox required but unavailable"), record.detail)
            assertFalse(runtime.view.value.transcript.operations.launchSandbox)
            runtime.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun relaunchRefusedWhileTurnRuns() =
        withParent { parent ->
            val processes = Processes()
            val runtime = runtime(processes, parent)
            runtime.start()
            runtime.runningOn(processes, 1).commands.sendMessage("m1", "hello")
            assertFalse(runtime.turnSandboxOn())
            assertEquals(SwitchOutcome.REJECTED, runtime.sandboxSwitches().single().outcome)
            assertEquals(1, processes.argvs().size)
            runtime.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun secondRelaunchIgnored() =
        withParent { parent ->
            val processes = Processes()
            val runtime = runtime(processes, parent)
            runtime.start()
            runtime.runningOn(processes, 1)
            assertTrue(runtime.turnSandboxOn())
            assertFalse(runtime.turnSandboxOn())
            runtime.runningOn(processes, 2)
            assertFalse(runtime.turnSandboxOn(), "the switch still waits for the settings")
            assertEquals(1, runtime.sandboxSwitches().size)
            assertEquals(2, processes.argvs().size)
            runtime.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun closeDuringRelaunchEndsAll() =
        withParent { parent ->
            val first = FakeProcess(endsOnDestroy = false)
            val processes = Processes(first)
            val runtime = runtime(processes, parent)
            val job = runtime.start()
            runtime.runningOn(processes, 1)
            assertTrue(runtime.turnSandboxOn())
            untilTrue { first.destroyed }
            runtime.close()
            first.exit(FakeProcess.SIGTERM_EXIT)
            withTimeout(GUARD) { job.join() }
            assertTrue(processes.spawned.all { it.destroyed })
            assertEquals(1, processes.argvs().size, "nothing was started after the close")
            assertEquals(SessionStatus.Closed, runtime.status.value)
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun aRestartWhoseSpawnFailsLeavesNoSwitchPending() =
        withParent { parent ->
            val processes = Processes().apply { failAt = 1 }
            val runtime = runtime(processes, parent)
            runtime.start()
            runtime.runningOn(processes, 1)
            assertTrue(runtime.turnSandboxOn())
            withTimeout(GUARD) { runtime.status.first { it is SessionStatus.Failed } }
            assertEquals(SwitchOutcome.FAILED, runtime.sandboxSwitches().single().outcome)
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun turnSandboxOffWritesApplyFlagSettings() =
        withParent { parent ->
            val processes = Processes()
            val runtime = runtime(processes, parent)
            runtime.start()
            val commands = runtime.runningOn(processes, 1).commands
            val process = processes.spawned[0]
            commands.turnSandboxOff()
            val id = runtime.sandboxSwitches().single().id
            val line = withContext(Dispatchers.IO) { process.nextStdinLine(GUARD.inWholeMilliseconds) }
            assertEquals(StdinEncoder.sandboxOff(id), line)
            process.emit(success(id))
            val next = withContext(Dispatchers.IO) { process.nextStdinLine(GUARD.inWholeMilliseconds) }
            assertTrue(checkNotNull(next).contains("\"subtype\":\"get_settings\""), next)
            runtime.close()
        }

    private companion object {
        const val ID = "0f8fad5b-d9cb-469f-a165-70867728950e"
        const val WORKING_DIR = "/work/project"
        const val TIMEOUT_SECONDS = 30L
        const val TURN = "01-baseline-text.ndjson"
        const val UNAVAILABLE = "36-sandbox-unavailable.ndjson"
        val GUARD = 10.seconds
        val POLL = 10.milliseconds
    }
}
