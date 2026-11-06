package dev.ukitomato.closta.platforms.intellij.session

import com.google.gson.JsonObject
import dev.ukitomato.closta.platforms.intellij.auth.SignInOutcome
import dev.ukitomato.closta.platforms.intellij.settings.ProviderLaunch
import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import dev.ukitomato.closta.providers.claude.launch.BedrockConfig
import dev.ukitomato.closta.providers.claude.launch.ClaudeLaunchSpec
import dev.ukitomato.closta.providers.claude.launch.ProcessSpawner
import dev.ukitomato.closta.providers.claude.launch.WorkingDirectoryMissingException
import dev.ukitomato.closta.providers.claude.mcp.SdkMcpServer
import kotlinx.coroutines.CompletableDeferred
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
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import java.io.IOException
import java.time.Instant
import kotlin.time.Duration.Companion.seconds

/**
 * Drives [SessionRuntime] over fake OS processes: the order of the launch, the teardown on every way a session can
 * end — including a cancellation that lands before the stream is collected — the classification of failures, what
 * the launch log may contain, and the composition root. `ProcessAgentProcess` and `ClaudeSession` run
 * for real on top of the fakes. Waits are events (a status reached, a job joined), bounded only as a hang guard.
 */
class SessionRuntimeTest {
    private fun runtime(
        spawner: ProcessSpawner,
        parent: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
        env: Map<String, String> = emptyMap(),
        log: SessionLog = RecordingLog(),
        planner: SessionLaunchPlanner = planner(spawner, env),
    ): SessionRuntime = SessionRuntime(ID, childOf(parent), planner, WORKING_DIR, log, versionTimeout = GUARD)

    private fun planner(
        spawner: ProcessSpawner,
        env: Map<String, String>,
    ) = object : SessionLaunchPlanner {
        override suspend fun plan(
            sessionId: String,
            workingDirectory: String?,
        ) = SessionLaunch(spawner, ClaudeLaunchSpec(sessionId = sessionId, cwd = workingDirectory, env = env))
    }

    // The service cuts each session a supervisor child of its own scope; this is the same shape without the IDE.
    private fun childOf(parent: CoroutineScope) =
        CoroutineScope(parent.coroutineContext + SupervisorJob(parent.coroutineContext.job))

    // Every version check gets its own finished process: a check reads its process to the end and destroys it.
    private fun versionCheck() = FakeProcess.finished("$VERSION\n")

    private fun spawner(session: FakeProcess) =
        FakeSpawner { argv -> if (argv.last() == VERSION_FLAG) versionCheck() else session }

    private suspend fun SessionRuntime.running() = withTimeout(GUARD) { status.first { it is SessionStatus.Running } }

    private suspend fun SessionRuntime.ended() =
        withTimeout(GUARD) { status.first { it !is SessionStatus.Starting && it !is SessionStatus.Running } }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `starts with the version check, then exactly one long-lived process with the spec's argv`() =
        runBlocking {
            val session = FakeProcess()
            val spawner = spawner(session)
            val runtime = runtime(spawner)
            runtime.start()
            val running = runtime.running() as SessionStatus.Running
            assertEquals(PARSED_VERSION, running.version)
            val expected = ClaudeLaunchSpec(sessionId = ID, cwd = WORKING_DIR).toArgv()
            assertEquals(listOf(listOf("claude", "--version"), expected), spawner.calls.map { it.argv })
            assertEquals(1, spawner.calls.count { it.argv == expected })
            assertEquals(setOf(WORKING_DIR), spawner.calls.map { it.workingDir }.toSet())
            runtime.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a session started with an effort has it in its argv and its view before it runs, and one without has none`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val session = FakeProcess()
            val spawner = spawner(session)
            val runtime =
                SessionRuntime(
                    ID,
                    childOf(parent),
                    planner(spawner, emptyMap()),
                    WORKING_DIR,
                    RecordingLog(),
                    versionTimeout = GUARD,
                    effort = "high",
                )
            runtime.start()
            runtime.running()
            val expected = ClaudeLaunchSpec(sessionId = ID, cwd = WORKING_DIR, effort = "high").toArgv()
            assertTrue(spawner.calls.any { it.argv == expected }) { "the process was started with --effort high" }
            assertEquals(listOf("--effort", "high"), expected.zipWithNext().first { it.first == "--effort" }.toList())
            assertEquals("high", runtime.view.value.transcript.operations.effort)
            runtime.close()
            val plain = runtime(spawner(FakeProcess()), parent)
            plain.start()
            plain.running()
            assertNull(plain.view.value.transcript.operations.effort)
            plain.close()
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `closing a running session destroys its process`() =
        runBlocking {
            val session = FakeProcess()
            val runtime = runtime(spawner(session))
            val job = runtime.start()
            runtime.running()
            runtime.close()
            job.join()
            assertTrue(session.destroyed)
            assertEquals(SessionStatus.Closed, runtime.status.value)
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `closing during the version check destroys the check and never starts the session`() =
        runBlocking {
            val hanging = FakeProcess()
            val spawned = CompletableDeferred<Unit>()
            val spawner =
                FakeSpawner {
                    spawned.complete(Unit)
                    hanging
                }
            val runtime = runtime(spawner)
            val job = runtime.start()
            withTimeout(GUARD) { spawned.await() }
            runtime.close()
            job.join()
            assertTrue(hanging.destroyed)
            assertEquals(1, spawner.calls.size)
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a cancellation right after the spawn still destroys the new process`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val session = FakeProcess()
            lateinit var target: SessionRuntime
            val spawner =
                FakeSpawner { argv ->
                    if (argv.last() == VERSION_FLAG) {
                        versionCheck()
                    } else {
                        // Cancelled while the spawn is under way: the process exists, the stream is not collected yet.
                        target.close()
                        session
                    }
                }
            target = runtime(spawner, parent)
            target.start().join()
            assertTrue(session.destroyed)
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `closing one of two sessions leaves the other running, and cancelling the owner ends both`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val first = FakeProcess()
            val second = FakeProcess()
            val a = runtime(spawner(first), parent)
            val b = runtime(spawner(second), parent)
            val aJob = a.start()
            val bJob = b.start()
            a.running()
            b.running()
            // close() cancels; the process goes when the cancelled body has run its finally, so wait for the job.
            a.close()
            aJob.join()
            assertTrue(first.destroyed)
            assertFalse(second.destroyed)
            parent.cancel()
            bJob.join()
            assertTrue(second.destroyed)
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a clean exit ends the session, 127 and other codes fail it, and nothing restarts`() =
        runBlocking {
            val clean = FakeProcess()
            val cleanSpawner = spawner(clean)
            val ended = runtime(cleanSpawner)
            ended.start()
            ended.running()
            clean.exit(0)
            assertEquals(SessionStatus.Ended, ended.ended())
            assertEquals(2, cleanSpawner.calls.size)

            val missing = FakeProcess()
            val notFound = runtime(spawner(missing))
            notFound.start()
            notFound.running()
            missing.exit(COMMAND_NOT_FOUND)
            assertEquals(SessionStatus.Failed(SessionFailure.CommandNotFound), notFound.ended())

            val crashed = FakeProcess()
            val abnormal = runtime(spawner(crashed))
            abnormal.start()
            abnormal.running()
            crashed.exit(3)
            assertEquals(SessionStatus.Failed(SessionFailure.EndedAbnormally("exit code 3")), abnormal.ended())
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a spawn that throws and a planner that throws are reported as their own failures`() =
        runBlocking {
            val cannotRun =
                FakeSpawner { argv ->
                    if (argv.last() == VERSION_FLAG) versionCheck() else throw IOException(NOT_FOUND)
                }
            val launch = runtime(cannotRun)
            launch.start()
            assertEquals(SessionStatus.Failed(SessionFailure.LaunchFailed(NOT_FOUND)), launch.ended())

            val broken =
                object : SessionLaunchPlanner {
                    override suspend fun plan(
                        sessionId: String,
                        workingDirectory: String?,
                    ): SessionLaunch = error("provider record holds $CANARY")
                }
            val planned = runtime(FakeSpawner { versionCheck() }, planner = broken)
            planned.start()
            val failed = planned.ended() as SessionStatus.Failed
            assertEquals(SessionFailure.PlanFailed(IllegalStateException::class.java.name), failed.failure)
            assertFalse(failed.failure.cause.contains(CANARY))
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a start that names a working folder that is not there fails with that, after a check that passed`() =
        runBlocking {
            val gone =
                FakeSpawner { argv ->
                    if (argv.last() == VERSION_FLAG) {
                        versionCheck()
                    } else {
                        throw WorkingDirectoryMissingException("/work/wt", IOException(NOT_FOUND))
                    }
                }
            val log = RecordingLog()
            val launch = runtime(gone, log = log)
            launch.start()
            assertEquals(SessionStatus.Failed(SessionFailure.WorkingDirectoryMissing("/work/wt")), launch.ended())
            // The screen says which folder; the log says only what kind of failure, as a path holds the user's name.
            val warning = "WARN claude session $ID: failed (WorkingDirectoryMissing)"
            assertTrue(log.lines.any { it == warning }, "${log.lines}")
            assertFalse(log.lines.any { it.contains("/work/wt") }, "${log.lines}")
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a failure the planner names keeps its words, and nothing is spawned`() =
        runBlocking {
            val untrustedSpawner = FakeSpawner { versionCheck() }
            val untrusted =
                runtime(untrustedSpawner, planner = TrustGatedPlanner({ false }, planner(untrustedSpawner, emptyMap())))
            untrusted.start()
            assertEquals(SessionStatus.Failed(SessionFailure.ProjectNotTrusted), untrusted.ended())
            assertEquals(0, untrustedSpawner.calls.size)

            val bedrockSpawner = FakeSpawner { versionCheck() }
            val bedrock =
                ProviderLaunch.NeedsBedrockSignIn(
                    ProviderId.generate(),
                    BedrockConfig(region = "eu-west-1"),
                    providerName = "Bedrock dev",
                    mfaDevice = "GAHT12345678",
                    sessionDurationSeconds = 43_200,
                )
            val signIn =
                runtime(
                    bedrockSpawner,
                    planner = NativeSessionLaunchPlanner({ bedrock }) { _, _ -> SignInOutcome.Cancelled },
                )
            signIn.start()
            assertEquals(SessionStatus.Failed(SessionFailure.BedrockSignInCancelled), signIn.ended())
            assertEquals(0, bedrockSpawner.calls.size)
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `the launch log carries the argv and the version, never the environment`() =
        runBlocking {
            val log = RecordingLog()
            val session = FakeProcess()
            val runtime = runtime(spawner(session), env = mapOf(SECRET_KEY to CANARY), log = log)
            runtime.start()
            runtime.running()
            session.exit(COMMAND_NOT_FOUND)
            val status = runtime.ended()
            assertTrue(log.lines.any { it.contains("--session-id=$ID") })
            assertTrue(log.lines.any { it.contains(PARSED_VERSION) })
            assertTrue(log.lines.none { it.contains(CANARY) || it.contains(SECRET_KEY) })
            assertEquals(1, log.lines.count { it.startsWith("WARN") })
            assertFalse(status.toString().contains(CANARY))
            val notice = checkNotNull(SessionNotice.of(status))
            assertFalse(notice.cause.contains(CANARY) || notice.remedy.contains(CANARY))
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `destroyNow ends the processes on the spot without a cancellation`() =
        runBlocking {
            val session = FakeProcess()
            val runtime = runtime(spawner(session))
            runtime.start()
            runtime.running()
            runtime.destroyNow()
            assertTrue(session.destroyed)
            runtime.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `events are folded into the conversation and commands reach the process`() =
        runBlocking {
            val session = FakeProcess()
            val runtime = runtime(spawner(session))
            runtime.start()
            val running = runtime.running() as SessionStatus.Running
            val init = CaptureFixtures.nonBlankLines(CaptureFixtures.textOf(CAPTURE)).first { it.contains(INIT_MARK) }
            session.emit(init)
            val folded = withTimeout(GUARD) { runtime.conversation.first { it.session != null } }
            assertEquals(CAPTURE_VERSION, folded.session?.version)

            running.commands.sendMessage("send-1", "hello")
            // A session with no initialize asks for the settings at its first system/init. That request is
            // written from the fold's own coroutine, so it may reach stdin before or after the user line sent here.
            val lines =
                List(2) {
                    checkNotNull(withContext(Dispatchers.IO) { session.nextStdinLine(GUARD.inWholeMilliseconds) })
                }
            assertTrue(lines.any { it.contains("\"subtype\":\"get_settings\"") }, "$lines")
            assertTrue(
                lines.any { it.contains("\"type\":\"user\"") && it.contains("hello") && it.contains(ID) },
                "$lines",
            )
            runtime.close()
        }

    private class NamedServer(
        override val name: String,
    ) : SdkMcpServer {
        override suspend fun handle(message: JsonObject): JsonObject? = null
    }

    private fun runtimeWith(
        session: FakeProcess,
        servers: List<SdkMcpServer>,
    ): SessionRuntime =
        SessionRuntime(
            ID,
            childOf(CoroutineScope(SupervisorJob() + Dispatchers.Default)),
            planner(spawner(session), emptyMap()),
            WORKING_DIR,
            RecordingLog(),
            versionTimeout = GUARD,
            sdkServers = servers,
        )

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `with no servers no initialize is written and the first line is the user's`() =
        runBlocking {
            val session = FakeProcess()
            val runtime = runtimeWith(session, emptyList())
            runtime.start()
            val running = runtime.running() as SessionStatus.Running
            running.commands.sendMessage("send-1", "hello")
            val first = checkNotNull(withContext(Dispatchers.IO) { session.nextStdinLine(GUARD.inWholeMilliseconds) })
            assertTrue(first.contains("\"type\":\"user\""), first)
            assertFalse(session.stdinLines().any { it.contains("\"subtype\":\"initialize\"") })
            runtime.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `with servers the first line written is initialize naming them`() =
        runBlocking {
            val session = FakeProcess()
            val runtime = runtimeWith(session, listOf(NamedServer("ide-context")))
            runtime.start()
            runtime.running()
            val first = checkNotNull(withContext(Dispatchers.IO) { session.nextStdinLine(GUARD.inWholeMilliseconds) })
            assertTrue(
                first.contains("\"subtype\":\"initialize\"") && first.contains("\"sdkMcpServers\":[\"ide-context\"]"),
                first,
            )
            runtime.close()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `the names of the servers a session declares are in its view before it runs, with no effort given`() =
        runBlocking {
            val runtime = runtimeWith(FakeProcess(), listOf(NamedServer("ide-context")))
            runtime.start()
            runtime.running()
            val operations = runtime.view.value.transcript.operations
            assertEquals(listOf("ide-context"), operations.builtInMcpServers)
            assertNull(operations.effort, "names without an effort say no effort")
            runtime.close()
            val none = runtimeWith(FakeProcess(), emptyList())
            none.start()
            none.running()
            assertEquals(emptyList<String>(), none.view.value.transcript.operations.builtInMcpServers)
            none.close()
        }

    @Test
    fun `the system clock tells the time the system does`() {
        val before = Instant.now()
        val now = SystemClock().now()
        assertFalse(now.isBefore(before))
        assertFalse(now.isAfter(Instant.now()))
    }

    private companion object {
        const val ID = "0f8fad5b-d9cb-469f-a165-70867728950e"
        const val WORKING_DIR = "/work/project"
        const val TIMEOUT_SECONDS = 30L
        val GUARD = 10.seconds
        const val VERSION = "2.1.285 (Claude Code)"
        const val PARSED_VERSION = "2.1.285"
        const val VERSION_FLAG = "--version"
        const val COMMAND_NOT_FOUND = 127
        const val NOT_FOUND = "Cannot run program \"claude\": error=2, No such file or directory"
        const val SECRET_KEY = "CLAUDE_AGENT_TEST_SECRET"
        const val CANARY = "011-canary-4f2d8c1e"
        const val CAPTURE = "01-baseline-text.ndjson"
        const val CAPTURE_VERSION = "2.1.282"
        const val INIT_MARK = "\"subtype\":\"init\""
    }
}
