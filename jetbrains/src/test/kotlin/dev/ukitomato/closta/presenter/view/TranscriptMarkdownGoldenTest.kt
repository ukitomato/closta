package dev.ukitomato.closta.presenter.view

import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import java.io.File

/**
 * Five captures exported to Markdown and held to their goldens (`src/test/resources/export`): a Bash call that ran at
 * once, a sub-agent, files sent with a message, a `/clear` between turns, a `/compact`. Regenerate with
 * `EXPORT_GOLDEN_UPDATE=true` in the environment; that run fails once it has rewritten a golden.
 */
class TranscriptMarkdownGoldenTest {
    private val goldens =
        Goldens(
            update = System.getenv(ENV) == "true",
            read = { name -> resource("$DIR/$name.md") },
            write = ::writeGolden,
            env = ENV,
            how = "regenerate with `$ENV=true ./gradlew test --tests '*TranscriptMarkdownGoldenTest'`, then run again",
        )

    @TestFactory
    fun `each capture exports to its golden`(): List<DynamicTest> =
        SCENARIOS.map { scenario ->
            DynamicTest.dynamicTest(scenario) {
                val transcript = CaptureReplay.replay(scenario).last().transcript
                goldens.check(scenario, transcriptMarkdown(transcript, EXPORT_HEADER, ENGLISH_EXPORT_WORDS))
            }
        }

    private companion object {
        const val ENV = "EXPORT_GOLDEN_UPDATE"
        const val DIR = "export"
        val SCENARIOS =
            listOf("02-tool-bash-autorun", "08-subagent-task", "23-attachments", "41-clear-reset", "21-compact")

        fun writeGolden(
            name: String,
            text: String,
        ) = File("src/test/resources/$DIR").apply { mkdirs() }.resolve("$name.md").writeText(text)

        fun resource(path: String): String? =
            TranscriptMarkdownGoldenTest::class.java.classLoader
                .getResourceAsStream(path)
                ?.use { String(it.readBytes(), Charsets.UTF_8) }
    }
}
