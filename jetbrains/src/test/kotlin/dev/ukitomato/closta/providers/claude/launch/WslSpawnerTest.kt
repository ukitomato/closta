package dev.ukitomato.closta.providers.claude.launch

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** What the WSL spawner decides about a launch, with a runner that only remembers. */
class WslSpawnerTest {
    private class Started(
        val args: List<String>,
        val env: Map<String, String>,
        val directory: String,
        val options: WslOptions,
    )

    private val started = mutableListOf<Started>()
    private val process = ScriptedProcess()

    private val runner =
        WslRunner { args, env, directory, options ->
            started += Started(args, env, directory, options)
            process
        }

    private val installed = mapOf("Ubuntu" to runner)
    private val location = WslLocation("ubuntu", "/home/u/p")

    private fun spawner(distros: Map<String, WslRunner> = installed) =
        WslSpawner(location) { name -> distroNamed(name, distros.entries) { it.key }?.value }

    @Test
    fun `the arguments and the environment go through as they are, in the Linux folder, by login shell and interop`() {
        val env = mapOf("ANTHROPIC_API_KEY" to "test-secret-value")
        val result = spawner().spawn(listOf("claude", "-p"), env, "\\\\wsl.localhost\\UBUNTU\\home\\u\\p\\wt")
        assertSame(process, result)
        val only = started.single()
        assertEquals(listOf("claude", "-p"), only.args)
        assertEquals(env, only.env)
        assertEquals("/home/u/p/wt", only.directory)
        assertEquals(WslOptions.CLI, only.options)
        assertTrue(only.options.loginShell)
        assertTrue(only.options.envViaInterop)
    }

    @Test
    fun `no working folder runs in the location's own folder`() {
        spawner().spawn(listOf("claude"), emptyMap(), null)
        assertEquals("/home/u/p", started.single().directory)
    }

    @Test
    fun `a distribution is found without regard to case`() {
        assertSame(runner, distroNamed("UBUNTU", installed.entries) { it.key }?.value)
        assertNull(distroNamed("Debian", installed.entries) { it.key })
    }

    @Test
    fun `a distribution that is not installed names itself in the failure`() {
        val failure =
            assertThrows(
                WslUnavailableException::class.java,
            ) { spawner(emptyMap()).spawn(listOf("claude"), emptyMap(), null) }
        assertTrue(failure.message!!.contains("ubuntu")) { failure.message!! }
        assertEquals("ubuntu", failure.distro)
        assertTrue(started.isEmpty())
    }

    @Test
    fun `a working folder in another distribution is not started`() {
        assertThrows(WslUnavailableException::class.java) {
            spawner().spawn(listOf("claude"), emptyMap(), "\\\\wsl.localhost\\Debian\\home\\u")
        }
        assertTrue(started.isEmpty())
    }

    @Test
    fun `the spawner's string form names the distribution and holds no environment value`() {
        spawner().spawn(listOf("claude"), mapOf("K" to "test-secret-value"), null)
        val text = spawner().toString()
        assertTrue(text.contains("ubuntu"))
        assertFalse(text.contains("test-secret-value"))
        assertNotNull(started.single().env["K"])
    }
}
