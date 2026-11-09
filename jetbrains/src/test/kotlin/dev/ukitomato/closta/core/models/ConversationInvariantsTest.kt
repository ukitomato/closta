package dev.ukitomato.closta.core.models

import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory

/**
 * At the end of every capture the folded state satisfies four invariants:
 * every turn is closed, the approval queue is empty, no task is still running, and
 * no question is left pending. Together these are the machine evidence that the approval machine did not
 * leave the conversation frozen — an unanswered `control_request` at the end would hang the CLI forever.
 */
class ConversationInvariantsTest {
    @TestFactory
    fun `every capture ends satisfying the conversation invariants`(): List<DynamicTest> =
        allScenarios().map { scenario ->
            DynamicTest.dynamicTest(scenario) {
                val end = CaptureFixtures.readCapture("$scenario.ndjson").fold(ConversationState(), ::fold)
                assertAll(
                    {
                        // A known gap still shows: the turn whose result the codec does not place stays open.
                        assertEquals(
                            scenario !in TURN_LEFT_OPEN,
                            end.turns.all { it.phase == TurnPhase.CLOSED },
                            "$scenario: every turn is closed at the end (expected: ${scenario !in TURN_LEFT_OPEN})",
                        )
                    },
                    {
                        assertTrue(
                            end.pendingApprovals.none { it.kind == ApprovalKind.APPROVAL },
                            "$scenario: the approval queue is empty at the end",
                        )
                    },
                    {
                        assertTrue(
                            end.tasks.none { it.status == TaskStatus.RUNNING },
                            "$scenario: no task is still running at the end",
                        )
                    },
                    {
                        assertTrue(
                            end.pendingApprovals.none { it.kind == ApprovalKind.ASK },
                            "$scenario: no question is left pending at the end",
                        )
                    },
                )
            }
        }

    private companion object {
        /**
         * The captures whose last turn the fold leaves open: those whose `result` line the codec does not place
         * (CaptureFixtures.KNOWN_UNPLACED), so the turn it closes stays open. Empty now that
         * /compact's result is placed.
         */
        val TURN_LEFT_OPEN = CaptureFixtures.KNOWN_UNPLACED.filterValues { "result" in it }.keys

        fun allScenarios(): List<String> =
            CaptureFixtures
                .manifest()
                .scenarios
                .map { it.scenario }
                .sorted()
    }
}
