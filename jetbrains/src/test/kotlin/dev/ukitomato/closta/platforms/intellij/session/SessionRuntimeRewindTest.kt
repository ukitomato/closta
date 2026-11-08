package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.interfaces.SavedSessions
import dev.ukitomato.closta.presenter.view.Role
import dev.ukitomato.closta.providers.claude.history.CutCapture
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
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import kotlin.time.Duration.Companion.seconds

/**
 * A session that rewinds a saved one, on the record capture 27 saved: the CLI is started on a new id with the
 * point to cut at, the conversation put back stops before the line rewound to, and a record without the point is a
 * failure that starts no process.
 */
class SessionRuntimeRewindTest {
    @TempDir
    lateinit var config: Path

    private val log = RecordingLog()

    private fun planner(spawner: ProcessSpawner) =
        object : SessionLaunchPlanner {
            override suspend fun plan(
                sessionId: String,
                workingDirectory: String?,
            ) = SessionLaunch(spawner, ClaudeLaunchSpec(sessionId = sessionId, cwd = workingDirectory))
        }

    private fun childOf(parent: CoroutineScope) =
        CoroutineScope(parent.coroutineContext + SupervisorJob(parent.coroutineContext.job))

    private fun spawner() =
        FakeSpawner { argv ->
            if (argv.last() == "--version") FakeProcess.finished("2.1.282 (Claude Code)\n") else FakeProcess()
        }

    private fun runtime(
        spawner: ProcessSpawner,
        parent: CoroutineScope,
        rewindBefore: String,
        withRecord: Boolean = true,
    ) = SessionRuntime(
        ID,
        childOf(parent),
        planner(spawner),
        WORKING_DIR,
        log,
        versionTimeout = GUARD,
        opening = SessionOpening.Fork(CutCapture.sessionId, rewindBefore = rewindBefore),
        saved = if (withRecord) CutCapture.reader(config, WORKING_DIR, Dispatchers.Unconfined) else null,
    )

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a rewound fork starts the CLI with the cut point, and puts back only what came before the line`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val spawner = spawner()
            val runtime = runtime(spawner, parent, CutCapture.secondUserUuid)
            runtime.start()
            withTimeout(GUARD) { runtime.status.first { it is SessionStatus.Running } }

            val argv = spawner.calls.map { it.argv }.last { it.last() != "--version" }
            val at = argv.indexOf("--resume=${CutCapture.sessionId}")
            assertEquals(
                listOf(
                    "--resume=${CutCapture.sessionId}",
                    "--fork-session",
                    "--session-id=$ID",
                    "--resume-session-at=${CutCapture.secondParentUuid}",
                ),
                argv.subList(at, at + 4),
            )
            val transcript = runtime.view.value.transcript
            val restored = checkNotNull(transcript.restored)
            assertEquals(2, restored.count, "the first turn: what was said and the answer, not the second turn")
            assertEquals(
                listOf(Role.USER, Role.ASSISTANT),
                transcript.messages.order.map { transcript.messages[it]!!.role },
            )
            runtime.close()
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a line with no point to cut at is a failure that starts no process, whatever is the reason`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            // The first thing said has no line before it; the id of no line is not in the record; no record at all.
            val cases =
                listOf(
                    "the first line" to Triple(CutCapture.firstUserUuid, true, 0),
                    "a line that is not there" to Triple("00000000-0000-4000-8000-000000000999", true, 0),
                    "no record" to Triple(CutCapture.secondUserUuid, false, 0),
                )
            for ((name, case) in cases) {
                val spawner = spawner()
                val runtime = runtime(spawner, parent, case.first, withRecord = case.second)
                runtime.start()

                val failed =
                    withTimeout(GUARD) { runtime.status.first { it is SessionStatus.Failed } } as SessionStatus.Failed

                assertEquals(SessionFailure.RewindPointMissing, failed.failure, name)
                assertEquals(0, spawner.calls.size, "$name: nothing was spawned, not even the version probe")
            }
            assertTrue("Resume a Saved Conversation" in SessionFailure.RewindPointMissing.remedy)
            parent.cancel()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a line that the read cannot stop before leaves the history unrestored and says so, the session goes on`() =
        runBlocking {
            val parent = CoroutineScope(SupervisorJob() + Dispatchers.Default)
            val real = CutCapture.reader(config, WORKING_DIR, Dispatchers.Unconfined)
            // The cut point is found (a line in the record), but the read stops before another line, which is not.
            val saved =
                object : SavedSessions by real {
                    override suspend fun read(
                        sessionId: String,
                        stopBefore: String,
                    ) = real.read(sessionId, "00000000-0000-4000-8000-000000000999")
                }
            val runtime =
                SessionRuntime(
                    ID,
                    childOf(parent),
                    planner(spawner()),
                    WORKING_DIR,
                    log,
                    versionTimeout = GUARD,
                    opening = SessionOpening.Fork(CutCapture.sessionId, rewindBefore = CutCapture.secondUserUuid),
                    saved = saved,
                )
            runtime.start()
            withTimeout(GUARD) { runtime.status.first { it is SessionStatus.Running } }

            assertTrue(runtime.view.value.transcript.historyUnavailable)
            assertEquals(null, runtime.view.value.transcript.restored)
            runtime.close()
            parent.cancel()
        }

    @Test
    fun `a rewind needs a line to rewind to`() {
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException::class.java) {
            SessionOpening.Fork("s", rewindBefore = " ")
        }
        assertEquals(null, SessionOpening.Fork("s").rewindBefore)
        assertTrue(SessionOpening.Fork("s") == SessionOpening.Fork("s", null))
    }

    private companion object {
        const val ID = "0f8fad5b-d9cb-469f-a165-70867728950e"
        const val WORKING_DIR = "/work/project"
        const val TIMEOUT_SECONDS = 30L
        val GUARD = 10.seconds
    }
}
