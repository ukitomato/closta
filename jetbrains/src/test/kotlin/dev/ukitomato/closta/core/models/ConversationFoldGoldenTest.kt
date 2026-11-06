package dev.ukitomato.closta.core.models

import com.google.gson.GsonBuilder
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory
import java.io.File

/**
 * Folds each of the fifteen captures event by event and pins the final [ConversationState] — including
 * `pendingApprovals` — against a golden JSON, and folds each twice to show the fold is
 * deterministic. The goldens are kept as core-models test resources.
 *
 * The golden is not trusted on its own. A golden the implementation both produces and checks would
 * only prove the fold agrees with itself, so the goldens here are generated from the fold *and then
 * anchored by independent, hand-known values* asserted elsewhere — the final session cost
 * (`SessionCostTest`), the turn open/close counts (`TurnBoundaryTest`), the init idempotence
 * (`InitIdempotenceTest`), the task lifecycle (`TaskLifecycleTest`), and — for the approval fields —
 * the fold/queue/attribution/resolution/invariant tests (`ApprovalFoldTest`, `ApprovalQueueTest`,
 * `SubagentApprovalTest`, `AskResolutionTest`, `ConversationInvariantsTest`). This test guards against
 * drift; those anchor its baseline.
 *
 * Regenerate the goldens with `FOLD_GOLDEN_UPDATE=true` in the environment (Gradle forwards it to the
 * test JVM); a run without it asserts.
 */
class ConversationFoldGoldenTest {
    @TestFactory
    fun `each capture folds to its golden, twice the same`(): List<DynamicTest> =
        goldenScenarios().map { scenario ->
            DynamicTest.dynamicTest(scenario) {
                val once = foldCapture(scenario)
                val twice = foldCapture(scenario)
                assertEquals(once, twice, "$scenario: folding twice must give the same state")

                val actual = GOLDEN_JSON.toJson(once)
                if (UPDATE) {
                    writeGolden(scenario, actual)
                } else {
                    assertEquals(readGolden(scenario), actual, "$scenario: folded state drifted from golden")
                }
            }
        }

    private companion object {
        const val GOLDEN_DIR = "dev/ukitomato/closta/core/models/golden"

        val UPDATE: Boolean =
            System.getenv("FOLD_GOLDEN_UPDATE") == "true" || System.getProperty("foldGolden.update") == "true"

        val GOLDEN_JSON = GsonBuilder().setPrettyPrinting().serializeNulls().create()

        fun goldenScenarios(): List<String> =
            CaptureFixtures
                .manifest()
                .scenarios
                .map { it.scenario }
                .sorted()

        fun foldCapture(scenario: String): ConversationState =
            CaptureFixtures.readCapture("$scenario.ndjson").fold(ConversationState(), ::fold)

        fun readGolden(scenario: String): String {
            val resource = "$GOLDEN_DIR/$scenario.json"
            val stream =
                checkNotNull(ConversationFoldGoldenTest::class.java.classLoader.getResourceAsStream(resource)) {
                    "golden `$resource` is not on the test classpath — regenerate with -DfoldGolden.update=true"
                }
            return stream.use { String(it.readBytes(), Charsets.UTF_8) }
        }

        fun writeGolden(
            scenario: String,
            json: String,
        ) {
            val dir = File("src/test/resources/$GOLDEN_DIR")
            dir.mkdirs()
            File(dir, "$scenario.json").writeText(json)
        }
    }
}
