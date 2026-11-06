package dev.ukitomato.closta.core.models

import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * `system/init` arrives many times per session and must only (re)establish [SessionInfo], never reset
 * the turns/tasks/usage built up so far.
 *
 * Positive evidence comes first from a direct fold — an init applied to an already-populated state
 * keeps everything but the session — and then from the two captures where init actually repeats
 * (10 ×3, 11 ×4), plus capture 03 (handshake, init ×1) to show a single init folds without breaking.
 */
class InitIdempotenceTest {
    @Test
    fun `an init applied to a populated state replaces only the session`() {
        val populated =
            ConversationState(
                turns = listOf(Turn("cmd-1", TurnPhase.CLOSED)),
                usage = Usage(sessionCostUsd = 0.5),
                tasks =
                    listOf(
                        Task(
                            taskId = "t1",
                            parentToolUseId = "tool-1",
                            subagentType = "Explore",
                            isBackgrounded = false,
                            spawnDepth = 1,
                            status = TaskStatus.RUNNING,
                        ),
                    ),
                thinkingEstimate = 1234L,
                spontaneousResumeCount = 2,
            )

        val after = fold(populated, secondInit())

        assertAll(
            { assertNotNull(after.session, "the second init establishes the session") },
            { assertEquals("second-model", after.session?.model) },
            { assertEquals(populated.turns, after.turns, "turns survive a re-init") },
            { assertEquals(populated.usage, after.usage, "usage survives a re-init") },
            { assertEquals(populated.tasks, after.tasks, "tasks survive a re-init") },
            { assertEquals(populated.thinkingEstimate, after.thinkingEstimate, "thinking estimate survives") },
            { assertEquals(populated.spontaneousResumeCount, after.spontaneousResumeCount, "resume count survives") },
        )
    }

    @Test
    fun `captures whose init repeats keep the state they accumulated`() {
        val ten = foldCapture("10-background-task.ndjson")
        val eleven = foldCapture("11-background-followup.ndjson")

        assertAll(
            { assertNotNull(ten.session, "10: session established") },
            { assertEquals(1, ten.turns.size, "10: the turn survived the later inits") },
            { assertTrue(ten.usage.sessionCostUsd > 0.0, "10: cost survived the later inits") },
            { assertTrue(ten.tasks.isNotEmpty(), "10: tasks survived the later inits") },
            { assertNotNull(eleven.session, "11: session established") },
            { assertEquals(2, eleven.turns.size, "11: both turns survived the later inits") },
            { assertTrue(eleven.usage.sessionCostUsd > 0.0, "11: cost survived the later inits") },
        )
    }

    @Test
    fun `the handshake capture folds without breaking`() {
        val three = foldCapture("03-initialize-handshake.ndjson")

        assertAll(
            { assertNotNull(three.session, "03: the single init established the session") },
            { assertEquals(1, three.turns.size, "03: one turn") },
            { assertEquals(TurnPhase.CLOSED, three.turns.single().phase, "03: the turn closed on its result") },
        )
    }

    private companion object {
        fun foldCapture(file: String): ConversationState =
            CaptureFixtures.readCapture(file).fold(ConversationState(), ::fold)

        fun secondInit(): AgentEvent.SystemInit =
            AgentEvent.SystemInit(
                uuid = "u",
                sessionId = "s2",
                cwd = "/repo",
                model = "second-model",
                permissionMode = "default",
                apiKeySource = "none",
                claudeCodeVersion = "2.1.282",
                outputStyle = "text",
                viewMode = "normal",
                scratchpadPath = "/tmp",
                messagingSocketPath = "/tmp/sock",
                fastModeState = "off",
                tools = RawJson("[]"),
                mcpServers = RawJson("[]"),
                slashCommands = RawJson("[]"),
                terminalSlashCommands = RawJson("[]"),
                agents = RawJson("[]"),
                skills = RawJson("[]"),
                plugins = RawJson("[]"),
                capabilities = RawJson("{}"),
                memoryPaths = RawJson("[]"),
                analyticsDisabled = false,
                productFeedbackDisabled = false,
                perTurnEffortActive = false,
            )
    }
}
