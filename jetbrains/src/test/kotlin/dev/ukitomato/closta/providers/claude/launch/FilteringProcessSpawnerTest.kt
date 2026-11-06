package dev.ukitomato.closta.providers.claude.launch

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.io.path.createTempDirectory

/**
 * The inherited environment of a Bedrock launch: the keys [BedrockLaunch.INHERITED_KEYS_TO_DROP] names are
 * removed from it, everything else stays, and the launch's own env wins. The last two tests start a real `sh`, the same
 * way `ProcessAgentProcessTest` does.
 */
class FilteringProcessSpawnerTest {
    private fun inherited() =
        mutableMapOf(
            "PATH" to "/usr/bin",
            "HTTPS_PROXY" to "http://proxy.example:8080",
            "ANTHROPIC_BEDROCK_BASE_URL" to "https://bedrock.vpce.example",
            "AWS_DEFAULT_REGION" to "eu-west-1",
            "AWS_ACCESS_KEY_ID" to "AKIA_INHERITED",
        ).apply { BedrockLaunch.INHERITED_KEYS_TO_DROP.forEach { put(it, "inherited-$it") } }

    @Test
    fun `the dropped keys go and the rest stays`() {
        val environment = inherited()

        overlayEnvironment(environment, BedrockLaunch.INHERITED_KEYS_TO_DROP, emptyMap())

        BedrockLaunch.INHERITED_KEYS_TO_DROP.forEach { assertFalse(environment.containsKey(it)) { "kept $it" } }
        assertEquals("/usr/bin", environment["PATH"])
        assertEquals("http://proxy.example:8080", environment["HTTPS_PROXY"])
        assertEquals("https://bedrock.vpce.example", environment["ANTHROPIC_BEDROCK_BASE_URL"])
        assertEquals("eu-west-1", environment["AWS_DEFAULT_REGION"])
    }

    @Test
    fun `the launch's env wins over what was inherited`() {
        val environment = inherited()

        overlayEnvironment(
            environment,
            BedrockLaunch.INHERITED_KEYS_TO_DROP,
            mapOf("AWS_ACCESS_KEY_ID" to "AKIA_INJECTED", "AWS_PROFILE" to "set-by-the-launch"),
        )

        assertEquals("AKIA_INJECTED", environment["AWS_ACCESS_KEY_ID"])
        // A key the launch sets itself is the launch's, even when the inherited one of that name was dropped.
        assertEquals("set-by-the-launch", environment["AWS_PROFILE"])
    }

    @Test
    fun `a real process does not inherit a dropped key`() {
        val dropped = setOf("HOME")
        val printed = printenv(FilteringProcessSpawner(dropped), mapOf("FILTER_TEST_MARK" to "on"))
        assertFalse(printed.any { it.startsWith("HOME=") }) { "HOME was inherited: $printed" }
        assertTrue(printed.contains("FILTER_TEST_MARK=on")) { "the launch's env is missing: $printed" }
        assertTrue(printed.any { it.startsWith("PATH=") }) { "PATH should still be inherited: $printed" }
    }

    @Test
    fun `the native spawner still inherits it`() {
        val printed = printenv(NativeProcessSpawner, emptyMap())
        assertTrue(printed.any { it.startsWith("HOME=") }) { "HOME should be inherited: $printed" }
    }

    @Test
    fun `both native spawners name a working folder that is not there, and only then`() {
        val folder = createTempDirectory("spawner-test").toFile()
        val missing = File(folder, "gone").path
        try {
            listOf(NativeProcessSpawner, FilteringProcessSpawner(emptySet())).forEach { spawner ->
                val named =
                    assertThrows(WorkingDirectoryMissingException::class.java) {
                        spawner.spawn(listOf("no-such-program-053"), emptyMap(), missing)
                    }
                assertEquals(missing, named.path)
                // The folder is there, or none was given: the program is what is missing; the failure is plain.
                listOf(folder.path, null).forEach { dir ->
                    val plain =
                        assertThrows(IOException::class.java) {
                            spawner.spawn(listOf("no-such-program-053"), emptyMap(), dir)
                        }
                    assertFalse(plain is WorkingDirectoryMissingException) { "$spawner $dir" }
                }
            }
        } finally {
            folder.delete()
        }
    }

    private fun printenv(
        spawner: ProcessSpawner,
        env: Map<String, String>,
    ): List<String> {
        val process = spawner.spawn(listOf("sh", "-c", "printenv"), env, null)
        val lines = process.inputStream.bufferedReader().readLines()
        assertTrue(process.waitFor(WAIT_SECONDS, TimeUnit.SECONDS))
        return lines
    }

    private companion object {
        const val WAIT_SECONDS = 10L
    }
}
