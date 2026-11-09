package dev.ukitomato.closta.providers.claude

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.fold
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.TestFactory

/**
 * Feeds each of the fifteen captures through [ClaudeSession]'s real read path
 * (process → UNLIMITED channel → codec → `events`) and folds the result, then pins it against the
 * **direct** codec fold (`CaptureFixtures.readCapture(...).fold(...)`) — the same fold
 * `ConversationFoldGoldenTest` anchors to its golden. Matching the direct fold therefore matches that
 * golden through the whole transport path.
 */
class ClaudeSessionGoldenTest {
    @TestFactory
    fun `each capture folds through ClaudeSession to the codec golden`(): List<DynamicTest> =
        CaptureFixtures
            .manifest()
            .scenarios
            .map { it.scenario }
            .sorted()
            .map { scenario ->
                DynamicTest.dynamicTest(scenario) {
                    val viaSession =
                        runBlocking {
                            // withTimeout is a safety net: a straight replay always completes, so a hang means a
                            // pump defect — fail with a diagnostic instead of hanging the build (best-practice v1 #2).
                            withTimeout(TIMEOUT_MS) {
                                val session =
                                    ClaudeSession(
                                        FakeAgentProcess(straightReplay(rawLines("$scenario.ndjson"))),
                                        SESSION_ID,
                                    )
                                val events = mutableListOf<AgentEvent>()
                                session.events.collect { events += it }
                                events.fold(ConversationState(), ::fold)
                            }
                        }
                    val direct = CaptureFixtures.readCapture("$scenario.ndjson").fold(ConversationState(), ::fold)
                    assertEquals(direct, viaSession) {
                        "$scenario: the fold through ClaudeSession does not match the codec's direct fold"
                    }
                }
            }

    private fun rawLines(capture: String): List<String> = CaptureFixtures.nonBlankLines(CaptureFixtures.textOf(capture))

    private companion object {
        const val SESSION_ID = "test-session"
        const val TIMEOUT_MS = 30_000L
    }
}
