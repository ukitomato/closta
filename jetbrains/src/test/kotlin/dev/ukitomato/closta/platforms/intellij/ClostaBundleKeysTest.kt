package dev.ukitomato.closta.platforms.intellij

import dev.ukitomato.closta.presenter.view.EFFORT_LEVELS
import dev.ukitomato.closta.presenter.view.MCP_STATUSES
import dev.ukitomato.closta.presenter.view.PERMISSION_MODES
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File
import java.util.Properties

class ClostaBundleKeysTest {
    private fun load(name: String): Properties =
        Properties().apply {
            val loader = ClostaBundleKeysTest::class.java.classLoader
            val stream = checkNotNull(loader.getResourceAsStream("messages/$name")) { "$name is missing" }
            stream.reader(Charsets.UTF_8).use(::load)
        }

    private val english = load("ClostaBundle.properties")
    private val japanese = load("ClostaBundle_ja.properties")

    private fun Properties.keyNames(): Set<String> = stringPropertyNames()

    private val parameter = Regex("""\{(\d+)[^}]*}""")

    private fun parametersOf(value: String): Set<String> =
        parameter.findAll(value.replace("''", "")).map { it.groupValues[1] }.toSet()

    @Test
    fun bothLanguagesHaveTheSameKeys() {
        assertEquals(emptySet<String>(), english.keyNames() - japanese.keyNames(), "keys with no Japanese words")
        assertEquals(
            emptySet<String>(),
            japanese.keyNames() - english.keyNames(),
            "Japanese keys with no English words",
        )
    }

    @Test
    fun bothLanguagesTakeTheSameParameters() {
        english.keyNames().forEach { key ->
            assertEquals(
                parametersOf(english.getProperty(key)),
                parametersOf(japanese.getProperty(key)),
                key,
            )
        }
    }

    @Test
    fun noWordsAreEmpty() {
        english.keyNames().forEach { key ->
            assertTrue(english.getProperty(key).isNotBlank(), key)
            assertTrue(japanese.getProperty(key).isNotBlank(), key)
        }
    }

    // MessageFormat drops a lone apostrophe, and everything after it up to the next one, from a value it formats.
    @Test
    fun anApostropheInAValueWithParametersIsDoubled() {
        listOf(english, japanese).forEach { words ->
            words.keyNames().forEach { key ->
                val value = words.getProperty(key)
                if (parametersOf(value).isNotEmpty()) {
                    assertTrue(!value.replace("''", "").contains('\''), "$key: write '' for an apostrophe")
                }
            }
        }
    }

    // The IDE reads a lone & as a mnemonic and drops it. Written as \\& in the file, it is read as \& and shown as &.
    @Test
    fun anAmpersandIsEscaped() {
        val lone = Regex("""(^|[^\\])&""")
        listOf(english, japanese).forEach { words ->
            words.keyNames().forEach { key ->
                assertTrue(!lone.containsMatchIn(words.getProperty(key)), "$key: write \\\\& for &")
            }
        }
    }

    @Test
    fun everyPresenterValueHasWords() {
        val needed =
            MCP_STATUSES.map { "mcp.status.$it" } +
                listOf("wait.question", "wait.plan", "wait.permission", "wait.permission.subject", "wait.other") +
                listOf("rewind.refused.running", "rewind.refused.unknown", "rewind.refused.nothingAfter") +
                PERMISSION_MODES.flatMap { listOf("composer.mode.$it", "composer.mode.$it.short") } +
                EFFORT_LEVELS.map { "composer.effort.$it" } +
                listOf("on", "off", "tip.on", "tip.off", "busy.running", "busy.switching", "failed.on", "failed.off")
                    .map { "composer.sandbox.$it" } +
                listOf(
                    "turn",
                    "notApplied",
                    "notOff",
                    "notConfirmed",
                    "notStarted",
                ).map { "composer.sandbox.reason.$it" }
        assertEquals(emptyList<String>(), needed.filter { it !in english.keyNames() })
        assertEquals(emptyList<String>(), needed.filter { it !in japanese.keyNames() })
    }

    // Every key the code names with ClostaBundle.message("…") is in the bundle. Keys built at run time (such as
    // "mcp.status.$status") are checked where they are built.
    @Test
    fun everyKeyTheCodeNamesIsInTheBundle() {
        val call = Regex("""ClostaBundle\.message\(\s*"([^"$]+)"""")
        val sources = File("src/main/kotlin").walkTopDown().filter { it.isFile && it.extension == "kt" }
        val named = sources.flatMap { file -> call.findAll(file.readText()).map { it.groupValues[1] } }.toSet()
        assertTrue(named.isNotEmpty())
        assertEquals(emptySet<String>(), named - english.keyNames())
    }
}
