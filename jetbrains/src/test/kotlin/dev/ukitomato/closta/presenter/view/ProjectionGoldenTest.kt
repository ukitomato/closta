package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.TreeChecks
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotSame
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import java.io.File

/**
 * Replays each of the fifteen captures with the host's inputs put back, projects after every input with one
 * projector, and holds every tree on the way to the webview's contract — strictly: only the protocol's vocabulary, and
 * no array an op could address — and to what a projector without a memo builds from the same state. The last
 * tree is pinned against a golden (pretty JSON) to catch drift, and a second replay with a fresh projector must
 * give an equal tree that prints the same.
 *
 * The golden is not trusted on its own: it is what the projection made. What it should be is asserted
 * independently, value by value, in `CaptureAnchorsTest`. The user texts of 05 and 12 are the recorder's
 * templates as `recorder/scenarios.mjs` has them, `{OUTSIDE}` and all: the recorder filled in a temporary path.
 *
 * Regenerate with `PRESENTER_GOLDEN_UPDATE=true` in the environment (the build declares it an input of the
 * test task, so the run is not skipped as up to date); that run fails once it has rewritten a golden.
 */
class ProjectionGoldenTest {
    private val goldens =
        Goldens(
            update = System.getenv(Goldens.ENV) == "true",
            read = { name -> resource("$GOLDEN_DIR/$name.json") },
            write = ::writeGolden,
        )

    @TestFactory
    fun `each capture projects to its golden through trees the contract accepts`(): List<DynamicTest> =
        CaptureReplay.scenarios().map { scenario ->
            DynamicTest.dynamicTest(scenario) {
                val steps = CaptureReplay.replay(scenario)
                steps.forEachIndexed { index, step ->
                    val at = "$scenario: after input $index (${step.input::class.simpleName})"
                    TreeChecks.assertContract(step.tree, at)
                    TreeChecks.assertSameAsFresh(
                        step.tree,
                        projectTree(listOf(ThreadSource(CaptureReplay.THREAD, step.conversation, step.transcript))),
                        at,
                    )
                }
                val last = steps.last().tree
                val again = CaptureReplay.finalTree(scenario)
                assertEquals(last, again, "$scenario: a fresh projector gives an equal tree")
                assertNotSame(last, again)
                val text = JsonText.pretty(last) + "\n"
                assertEquals(text, JsonText.pretty(again) + "\n", "$scenario: and it prints the same")
                assertEquals(last, JsonRead.parse(text), "$scenario: the printed tree reads back as the tree")
                goldens.check(scenario, text)
            }
        }

    private companion object {
        const val GOLDEN_DIR = "dev/ukitomato/closta/presenter/golden"

        fun writeGolden(
            name: String,
            text: String,
        ) = File("src/test/resources/$GOLDEN_DIR").apply { mkdirs() }.resolve("$name.json").writeText(text)

        fun resource(path: String): String? =
            ProjectionGoldenTest::class.java.classLoader
                .getResourceAsStream(
                    path,
                )?.use { String(it.readBytes(), Charsets.UTF_8) }
    }
}
