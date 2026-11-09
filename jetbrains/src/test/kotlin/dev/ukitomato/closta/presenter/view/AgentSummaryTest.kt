package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.RawJson
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class AgentSummaryTest {
    @Test
    fun aSubAgentRowSaysWhatItDoesAndHowManyToolsItCalled() {
        val transcript = CaptureReplay.replay("08-subagent-task").last().transcript
        val agent = ThreadRows().of(transcript).filterIsInstance<ToolRow>().single { it.toolName == "Agent" }
        assertEquals(AgentSummary("Read NOTES.md and summarize", 1, durationMs = 3705), agent.agent)
    }

    @Test
    fun anotherToolHasNoSummary() {
        val call =
            ToolCallRecord("t1", "Bash", input = JsonObject.of("command" to JsonString("ls")))
        assertNull(agentSummary(call))
    }

    @Test
    fun anAgentWithoutADescriptionStillCountsItsTools() {
        assertEquals(AgentSummary(null, 0), agentSummary(ToolCallRecord("t1", "Task")))
    }

    @Test
    fun theDurationComesFromTheAgentsResultAndOnlyFromANumber() {
        val call = ToolCallRecord("t1", "Agent", result = ToolResult(null, false, durationMs = 1200))
        assertEquals(1200L, agentSummary(call)?.durationMs)
        assertNull(toolResultDuration(JsonObject.of("totalDurationMs" to JsonString("soon"))))
        assertNull(toolResultDuration(JsonString("Error: no")))
        assertNull(toolResultDuration(null))
    }

    @Test
    fun onlyASubAgentsCallTakesADuration() {
        val transcript = CaptureReplay.replay("08-subagent-task").last().transcript
        val read = "toolu_017AYaBDFQPgf2trBHtoP1HN"
        val line =
            AgentEvent.User(
                uuid = "u-late",
                sessionId = "s",
                timestamp = "t",
                message =
                    RawJson(
                        """{"role":"user","content":[{"type":"tool_result","tool_use_id":"$read","content":"x"}]}""",
                    ),
                toolUseResult = RawJson("""{"totalDurationMs":5}"""),
            )
        val folded = foldUser(transcript, line)
        assertNull(calls(folded.messages.values()).single { it.toolUseId == read }.result?.durationMs)
    }

    private fun calls(messages: List<MessageRecord>): List<ToolCallRecord> =
        messages.flatMap { message ->
            message.parts
                .values()
                .filterIsInstance<ToolCallRecord>()
                .flatMap { listOf(it) + calls(it.messages.values()) }
        }
}
