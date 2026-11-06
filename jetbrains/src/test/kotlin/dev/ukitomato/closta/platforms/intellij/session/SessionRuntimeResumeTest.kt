package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.models.SavedSessionSummary
import dev.ukitomato.closta.core.models.SavedTranscript
import dev.ukitomato.closta.presenter.view.Role
import dev.ukitomato.closta.providers.claude.FakeSavedSessions
import dev.ukitomato.closta.providers.claude.history.CapturedTranscript
import dev.ukitomato.closta.providers.claude.launch.ClaudeLaunchSpec
import dev.ukitomato.closta.providers.claude.launch.ProcessSpawner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.job
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import java.io.IOException
import kotlin.time.Duration.Companion.seconds

/**
 * A session that resumes a saved one, over the fake processes of [SessionRuntimeTest]: the arguments it starts
 * the CLI with, and the earlier conversation put back from the record, once, before anything the CLI says. The record
 * is
 * the one capture 22 holds and the stdout is its second CLI's.
 */
class SessionRuntimeResumeTest {
    private val resumed = CapturedTranscript.sessionId

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
            if (argv.last() ==
                "--version"
            ) {
                FakeProcess.finished("2.1.282 (Claude Code)\n")
            } else {
                session
            }
        }

    private fun runtime(
        spawner: ProcessSpawner,
        parent: CoroutineScope,
        resume: String? = resumed,
        saved: FakeSavedSessions? = FakeSavedSessions(transcripts = mapOf(resumed to CapturedTranscript.read())),
        log: SessionLog = RecordingLog(),
    ) = SessionRuntime(
        resume ?: ID,
        childOf(parent),
        planner(spawner),
        WORKING_DIR,
        log,
        versionTimeout = GUARD,
        effort = "high",
        opening = resume?.let { SessionOpening.Resume(it) } ?: SessionOpening.New,
        saved = saved,
    )

    private suspend fun SessionRuntime.running() = withTimeout(GUARD) { status.first { it is SessionStatus.Running } }

    private suspend fun SessionRuntime.settled() = withTimeout(GUARD) { status.first { it !is SessionStatus.Starting } }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a resumed session starts the CLI with --resume of its id and no --session-id`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val spawner = spawner(FakeProcess())
            val runtime = runtime(spawner, parent)
            runtime.start()
            runtime.running()

            val argv = spawner.calls.map { it.argv }.last { it.last() != "--version" }
            assertTrue("--resume=$resumed" in argv, argv.toString())
            assertTrue(argv.none { it.startsWith("--session-id") }, argv.toString())
            assertEquals(listOf("--effort", "high"), argv.zipWithNext().first { it.first == "--effort" }.toList())
            assertEquals(resumed, runtime.id)
            runtime.close()
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a session that is not resumed starts as it did, with its own id, and reads no record`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val spawner = spawner(FakeProcess())
            val saved = FakeSavedSessions()
            val runtime = runtime(spawner, parent, resume = null, saved = saved)
            runtime.start()
            runtime.running()

            val argv = spawner.calls.map { it.argv }.last { it.last() != "--version" }
            assertTrue("--session-id=$ID" in argv, argv.toString())
            assertTrue(argv.none { it.startsWith("--resume") }, argv.toString())
            assertEquals(emptyList<String>(), saved.reads, "a new session has no record to read")
            assertNull(runtime.view.value.transcript.restored)
            assertFalse(runtime.view.value.transcript.historyUnavailable)
            runtime.close()
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `the earlier conversation is in the view before what the CLI says, and what it says comes after`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess()
            // The CLI has said its turn before the host reads the first line of it: the record is still folded first.
            CapturedTranscript.secondStdout.forEach(process::emit)
            val saved = FakeSavedSessions(transcripts = mapOf(resumed to CapturedTranscript.read()))
            val runtime = runtime(spawner(process), parent, saved = saved)
            runtime.start()
            runtime.running()
            withTimeout(GUARD) { runtime.view.first { it.transcript.messages.size == 3 } }

            val transcript = runtime.view.value.transcript
            val restored = checkNotNull(transcript.restored)
            assertEquals(listOf(resumed), saved.reads, "read once, for the session resumed")
            assertEquals(2, restored.count, "the user's words and what the assistant answered")
            assertFalse(restored.partly)
            val keys = transcript.messages.order
            assertEquals(restored.until, keys[restored.count - 1], "the mark is the last message put back")
            assertEquals(
                listOf(Role.USER, Role.ASSISTANT, Role.ASSISTANT),
                keys.map { transcript.messages[it]!!.role },
                "the new turn is after what was put back",
            )
            runtime.close()
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a start that fails puts nothing back, and says what it said before`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val saved = FakeSavedSessions(transcripts = mapOf(resumed to CapturedTranscript.read()))
            val failing =
                FakeSpawner { argv ->
                    if (argv.last() ==
                        "--version"
                    ) {
                        FakeProcess.finished("2.1.282 (Claude Code)\n")
                    } else {
                        throw IOException("no claude")
                    }
                }
            val runtime = runtime(failing, parent, saved = saved)
            runtime.start()

            val ended = runtime.settled()

            assertInstanceOf(SessionStatus.Failed::class.java, ended)
            assertEquals(emptyList<String>(), saved.reads, "no record is read for a process that did not start")
            assertNull(runtime.view.value.transcript.restored)
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a record that cannot be read is said in the view and the session goes on without it`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val log = RecordingLog()
            val saved = FakeSavedSessions().apply { readFailure = IOException("the user's words 4711") }
            val runtime = runtime(spawner(FakeProcess()), parent, saved = saved, log = log)
            runtime.start()

            assertInstanceOf(SessionStatus.Running::class.java, runtime.running())

            val transcript = runtime.view.value.transcript
            assertTrue(transcript.historyUnavailable)
            assertNull(transcript.restored)
            assertTrue(log.lines.any { it.startsWith("WARN") && "IOException" in it }, log.lines.toString())
            assertTrue(
                log.lines.none { "4711" in it },
                "the failure's message may carry the record: only its type is logged",
            )
            runtime.close()
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a resumed session with nowhere to read the record from is a record that cannot be read`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val runtime = runtime(spawner(FakeProcess()), parent, saved = null)
            runtime.start()
            runtime.running()

            assertTrue(runtime.view.value.transcript.historyUnavailable)
            runtime.close()
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `the id of a resumed session is the one the user lines to the CLI carry`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess()
            val runtime = runtime(spawner(process), parent)
            runtime.start()
            val running = runtime.running() as SessionStatus.Running

            running.commands.sendMessage("send-1", "go on")

            val line = checkNotNull(process.nextStdinLine(GUARD.inWholeMilliseconds))
            assertTrue("\"session_id\":\"$resumed\"" in line, "the CLI's session id is the id of the session: $line")
            runtime.close()
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a record put back in more than the limit says how much was left out`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val whole = CapturedTranscript.read()
            val saved =
                FakeSavedSessions(
                    transcripts =
                        mapOf(
                            resumed to SavedTranscript(whole.events, whole.skipped, dropped = 7),
                        ),
                )
            val runtime = runtime(spawner(FakeProcess()), parent, saved = saved)
            runtime.start()
            runtime.running()

            assertTrue(checkNotNull(runtime.view.value.transcript.restored).partly)
            runtime.close()
            parent.cancel()
        }

    @Test
    fun `a runtime cannot hold an id that is not the one it resumes`() {
        val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        try {
            assertThrows(IllegalArgumentException::class.java) {
                SessionRuntime(
                    ID,
                    childOf(parent),
                    planner(spawner(FakeProcess())),
                    WORKING_DIR,
                    RecordingLog(),
                    opening = SessionOpening.Resume(resumed),
                )
            }
            // The same id is what a resumed session is made with, and a new session has none to match.
            SessionRuntime(
                resumed,
                childOf(parent),
                planner(spawner(FakeProcess())),
                WORKING_DIR,
                RecordingLog(),
                opening = SessionOpening.Resume(resumed),
            )
            SessionRuntime(ID, childOf(parent), planner(spawner(FakeProcess())), WORKING_DIR, RecordingLog())
        } finally {
            parent.cancel()
        }
    }

    private fun forkRuntime(
        spawner: ProcessSpawner,
        parent: CoroutineScope,
        saved: FakeSavedSessions = FakeSavedSessions(transcripts = mapOf(resumed to CapturedTranscript.read())),
    ) = SessionRuntime(
        ID,
        childOf(parent),
        planner(spawner),
        WORKING_DIR,
        RecordingLog(),
        versionTimeout = GUARD,
        opening = SessionOpening.Fork(resumed),
        saved = saved,
    )

    // The second CLI's stdout of the capture, its system/init first, with the session id it says: the capture's own.
    private fun initLines(says: String) = CapturedTranscript.secondStdout.map { it.replace(resumed, says) }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a fork starts the CLI with the three flags in order, under a new id, and puts the old record back`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess()
            val spawner = spawner(process)
            val saved = FakeSavedSessions(transcripts = mapOf(resumed to CapturedTranscript.read()))
            val runtime = forkRuntime(spawner, parent, saved)
            runtime.start()
            runtime.running()

            val argv = spawner.calls.map { it.argv }.last { it.last() != "--version" }
            val at = argv.indexOf("--resume=$resumed")
            assertEquals(listOf("--resume=$resumed", "--fork-session", "--session-id=$ID"), argv.subList(at, at + 3))
            assertEquals(ID, runtime.id)
            assertTrue(ID != resumed)
            assertEquals(listOf(resumed), saved.reads, "the record of the session forked is the one put back")
            assertEquals(2, checkNotNull(runtime.view.value.transcript.restored).count)
            runtime.close()
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a fork whose first init says another id fails before the init is folded`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess()
            initLines(says = resumed).forEach(process::emit)
            val runtime = forkRuntime(spawner(process), parent)
            runtime.start()

            val failed =
                withTimeout(GUARD) { runtime.status.first { it is SessionStatus.Failed } } as SessionStatus.Failed

            assertEquals(SessionFailure.ForkIdMismatch, failed.failure)
            assertEquals("The CLI did not open the fork under the id the plugin gave it.", failed.failure.cause)
            assertEquals(
                "Open the saved conversation with Open, or use Restart Session.",
                failed.failure.remedy,
            )
            assertTrue(process.destroyed, "the process is closed as for any failure")
            assertNull(runtime.conversation.value.session, "the init was not folded: no session id of the CLI's own")
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a fork whose init says the id the plugin gave stays running`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess()
            initLines(says = ID).forEach(process::emit)
            val runtime = forkRuntime(spawner(process), parent)
            runtime.start()
            runtime.running()
            // The capture's turn message reaches the view before its system/init is folded, so wait on the init itself.
            val folded = withTimeout(GUARD) { runtime.conversation.first { it.session != null } }.session

            assertTrue(runtime.status.value is SessionStatus.Running, runtime.status.value.toString())
            assertEquals(ID, folded?.sessionId, "the init was folded")
            runtime.close()
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a resume whose init says another id is not checked, only a fork is`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess()
            initLines(says = ID).forEach(process::emit)
            val runtime = runtime(spawner(process), parent)
            runtime.start()
            runtime.running()
            withTimeout(GUARD) { runtime.view.first { it.transcript.messages.size == 3 } }

            assertTrue(runtime.status.value is SessionStatus.Running, runtime.status.value.toString())
            runtime.close()
            parent.cancel()
        }

    @Test
    fun `a fork needs a session to fork`() {
        val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        try {
            assertThrows(IllegalArgumentException::class.java) {
                SessionOpening.Fork("")
            }
        } finally {
            parent.cancel()
        }
    }

    private fun listing() =
        FakeSavedSessions(
            listed =
                listOf(
                    SavedSessionSummary(OTHER, "Explain the build", 1_000, 10),
                    SavedSessionSummary(resumed, "The one resumed", 900, 10),
                ),
        )

    private fun SessionRuntime.listedIds() =
        view.value.transcript.savedSessions
            ?.map { it.id }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `the list of saved sessions can be asked of a session that is still starting`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            // Never started: it is Starting, and has no commands.
            val runtime = runtime(spawner(FakeProcess()), parent, resume = null, saved = listing())

            runtime.listSaved()

            assertTrue(runtime.status.value is SessionStatus.Starting)
            assertEquals(listOf(OTHER, resumed), runtime.listedIds())
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `the list of saved sessions can be asked of a session that failed to start, to pick another from`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val failing =
                FakeSpawner { argv ->
                    if (argv.last() ==
                        "--version"
                    ) {
                        FakeProcess.finished("2.1.282 (Claude Code)\n")
                    } else {
                        throw IOException("no claude")
                    }
                }
            val runtime = runtime(failing, parent, saved = listing())
            runtime.start()
            assertInstanceOf(SessionStatus.Failed::class.java, runtime.settled())

            runtime.listSaved()

            assertEquals(listOf(OTHER, resumed), runtime.listedIds())
            assertEquals(
                listOf(OTHER to false, resumed to true),
                runtime.view.value.transcript.savedSessions!!
                    .map { it.id to it.current },
                "the session the runtime is marks its own row as the current one",
            )
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a session that ended can be asked too, and one that was closed writes nothing`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val process = FakeProcess()
            val runtime = runtime(spawner(process), parent, saved = listing())
            runtime.start()
            runtime.running()
            process.exit(0)
            withTimeout(GUARD) { runtime.status.first { it is SessionStatus.Ended } }

            runtime.listSaved()
            assertEquals(listOf(OTHER, resumed), runtime.listedIds())

            val closed = runtime(spawner(FakeProcess()), parent, resume = null, saved = listing())
            closed.close()
            closed.listSaved()
            assertNull(
                closed.listedIds(),
                "a closed session's view is no one's: a restart closes it before the new one is bound",
            )
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a list that is cancelled before it comes back is not written to the view`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val gate = kotlinx.coroutines.CompletableDeferred<Unit>()
            val slow =
                object : dev.ukitomato.closta.core.interfaces.SavedSessions by listing() {
                    override suspend fun list(): List<SavedSessionSummary> {
                        gate.await()
                        return listing().list()
                    }
                }
            val runtime =
                SessionRuntime(
                    ID,
                    childOf(parent),
                    planner(spawner(FakeProcess())),
                    WORKING_DIR,
                    RecordingLog(),
                    saved = slow,
                )

            val asking = parent.launch { runtime.listSaved() }
            delay(50)
            asking.cancel()
            gate.complete(Unit)
            asking.join()

            assertNull(runtime.listedIds(), "the asker went: what comes back is not written")
            parent.cancel()
        }

    private companion object {
        const val OTHER = "22222222-2222-4222-8222-222222222222"
        const val ID = "0f8fad5b-d9cb-469f-a165-70867728950e"
        const val WORKING_DIR = "/work/project"
        const val TIMEOUT_SECONDS = 30L
        val GUARD = 10.seconds
    }
}
