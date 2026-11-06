package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.providers.claude.launch.ClaudeLaunchSpec
import dev.ukitomato.closta.providers.claude.launch.NativeProcessSpawner
import dev.ukitomato.closta.providers.claude.launch.ProcessSpawner
import dev.ukitomato.closta.providers.claude.launch.WorkingDirectoryMissingException
import dev.ukitomato.closta.providers.claude.launch.WslLocation
import dev.ukitomato.closta.providers.claude.launch.WslUnavailableException
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException
import java.nio.file.Path

/** The choice between the native launch and the WSL one, and what a WSL project reads its records from. */
class WslLaunchingTest {
    private val spec = ClaudeLaunchSpec("s1", cwd = "/work", env = mapOf("ANTHROPIC_API_KEY" to "test-secret-value"))
    private val plain = SessionLaunch(NativeProcessSpawner, spec)
    private val inner =
        object : SessionLaunchPlanner {
            override suspend fun plan(
                sessionId: String,
                workingDirectory: String?,
            ): SessionLaunch = plain
        }
    private val wslSpawner = ProcessSpawner { _, _, _ -> error("not spawned") }
    private val infos = mutableListOf<String>()
    private val warns = mutableListOf<String>()
    private val log =
        object : SessionLog {
            override fun info(message: String) {
                infos += message
            }

            override fun warn(message: String) {
                warns += message
            }
        }
    private val location = WslLocation("Ubuntu", "/home/u/p")

    @Test
    fun `a project outside WSL keeps the launch it was planned with, and logs nothing`() =
        runBlocking {
            val launch = WslAwarePlanner(inner, null, { wslSpawner }, log).plan("s1", "/work")
            assertSame(plain, launch)
            assertTrue(infos.isEmpty())
        }

    @Test
    fun `a WSL project keeps the planned spec and gets the WSL spawner`() =
        runBlocking {
            val asked = mutableListOf<WslLocation>()
            val launch =
                WslAwarePlanner(inner, location, {
                    asked += it
                    wslSpawner
                }, log).plan("s1", "/work")
            assertSame(spec, launch.spec)
            assertSame(wslSpawner, launch.spawner)
            assertEquals(listOf(location), asked)
        }

    @Test
    fun `one line says it starts in WSL, without the folder, and no line holds an environment value`() =
        runBlocking {
            WslAwarePlanner(inner, location, { wslSpawner }, log).plan("s1", "/work")
            assertEquals(1, infos.size)
            // The folder is a path with the user's name in it: the log names the distribution only.
            assertEquals("claude session s1: launching in WSL Ubuntu", infos.single())
            assertFalse((infos + warns).any { it.contains("test-secret-value") })
        }

    @Test
    fun `outside WSL the records are read as before`() {
        val native = Path.of("/h/.claude")
        val source = recordSource("/work/p", null, native) { error("not asked") }
        assertEquals(native, source.configDir())
        assertEquals("/work/p", source.workingDirectory)
        assertTrue(source.resolveLinks)
    }

    @Test
    fun `in WSL the records are read from the distribution by the Linux path, which is not resolved`() {
        val unc = Path.of("/unc/ubuntu/.claude")
        val asked = mutableListOf<WslLocation>()
        val source =
            recordSource("\\\\wsl.localhost\\Ubuntu\\home\\u\\p", location, Path.of("/h/.claude")) {
                asked += it
                unc
            }
        assertTrue(asked.isEmpty()) // nothing is asked until the place is needed
        assertEquals(unc, source.configDir())
        assertEquals(listOf(location), asked)
        assertEquals("/home/u/p", source.workingDirectory)
        assertFalse(source.resolveLinks)
        assertNull(recordSource(null, location, Path.of("/x")) { null }.configDir())
    }

    @Test
    fun `a WSL launch that cannot be made is its own failure, and the other failures stay as they were`() {
        val wsl =
            SessionFailure.launchFailed(
                WslUnavailableException("WSL distribution Ubuntu was not found", "Ubuntu"),
            )
        assertEquals(SessionFailure.WslUnavailable("Ubuntu", "WSL distribution Ubuntu was not found"), wsl)
        assertTrue(wsl.cause.contains("WSL distribution Ubuntu was not found"))
        assertTrue(wsl.remedy.contains("wsl -d Ubuntu")) { wsl.remedy }
        assertFalse(wsl.remedy.contains("<")) { wsl.remedy }
        assertEquals(
            SessionFailure.WorkingDirectoryMissing("/gone"),
            SessionFailure.launchFailed(WorkingDirectoryMissingException("/gone", IOException("x"))),
        )
        assertEquals(SessionFailure.LaunchFailed("boom"), SessionFailure.launchFailed(IOException("boom")))
    }
}
