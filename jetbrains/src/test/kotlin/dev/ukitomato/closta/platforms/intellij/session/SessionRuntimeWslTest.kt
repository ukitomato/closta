package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.providers.claude.launch.ClaudeLaunchSpec
import dev.ukitomato.closta.providers.claude.launch.ProcessSpawner
import dev.ukitomato.closta.providers.claude.launch.WslLocation
import dev.ukitomato.closta.providers.claude.launch.WslRunner
import dev.ukitomato.closta.providers.claude.launch.WslSpawner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import kotlin.time.Duration.Companion.seconds

/** A 127 from a launch in WSL is the distribution's own failure, not the IDE's PATH. */
class SessionRuntimeWslTest {
    private val guard = 10.seconds

    private fun runtime(spawner: ProcessSpawner): SessionRuntime {
        val planner =
            object : SessionLaunchPlanner {
                override suspend fun plan(
                    sessionId: String,
                    workingDirectory: String?,
                ) = SessionLaunch(spawner, ClaudeLaunchSpec(sessionId = sessionId, cwd = workingDirectory))
            }
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        return SessionRuntime(ID, scope, planner, null, RecordingLog(), versionTimeout = guard)
    }

    // A WSL spawner over a fake runner: the version check and the session each get the process [answer] makes.
    private fun wsl(answer: (List<String>) -> Process): WslSpawner =
        WslSpawner(WslLocation("Ubuntu", "/home/u/p")) {
            WslRunner { args, _, _, _ -> answer(args) }
        }

    private fun isVersionCheck(argv: List<String>) = argv.last() == "--version"

    private suspend fun SessionRuntime.failure() =
        withTimeout(guard) { status.first { it is SessionStatus.Failed } } as SessionStatus.Failed

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a 127 from the conversation in WSL names the distribution, and not the IDE's PATH`() =
        runBlocking {
            val session = FakeProcess()
            val runtime =
                runtime(
                    wsl { argv ->
                        if (isVersionCheck(argv)) FakeProcess.finished("2.1.285\n") else session
                    },
                )
            runtime.start()
            withTimeout(guard) { runtime.status.first { it is SessionStatus.Running } }
            session.exit(CODE_NOT_FOUND)
            val failed = runtime.failure()
            assertEquals(SessionStatus.Failed(SessionFailure.WslCommandNotFound("Ubuntu")), failed)
            assertFalse(failed.failure.remedy.contains("PATH it was started with")) { failed.failure.remedy }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a 127 from the version check in WSL is the same failure`() =
        runBlocking {
            val runtime = runtime(wsl { FakeProcess.finished("", CODE_NOT_FOUND) })
            runtime.start()
            assertEquals(SessionStatus.Failed(SessionFailure.WslCommandNotFound("Ubuntu")), runtime.failure())
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a 127 from a launch that is not in WSL stays the IDE's PATH failure, in both places`() =
        runBlocking {
            val session = FakeProcess()
            val conversation =
                runtime(
                    FakeSpawner { argv ->
                        if (isVersionCheck(argv)) FakeProcess.finished("2.1.285\n") else session
                    },
                )
            conversation.start()
            withTimeout(guard) { conversation.status.first { it is SessionStatus.Running } }
            session.exit(CODE_NOT_FOUND)
            assertEquals(SessionStatus.Failed(SessionFailure.CommandNotFound), conversation.failure())

            val check = runtime(FakeSpawner { FakeProcess.finished("", CODE_NOT_FOUND) })
            check.start()
            assertEquals(SessionStatus.Failed(SessionFailure.CommandNotFound), check.failure())
        }

    private companion object {
        const val ID = "0f8fad5b-d9cb-469f-a165-70867728950e"
        const val TIMEOUT_SECONDS = 30L
        const val CODE_NOT_FOUND = 127
    }
}
