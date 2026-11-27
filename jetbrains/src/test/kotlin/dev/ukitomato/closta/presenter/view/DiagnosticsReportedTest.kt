package dev.ukitomato.closta.presenter.view

import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** The errors Claude was told about after an edit are marked on the edit's line (no capture carries them). */
class DiagnosticsReportedTest {
    private val inputs = CaptureReplay.inputs("17-edit-approval", uuids = true)

    private fun run(list: List<PresenterInput>): Transcript =
        list.fold(HostState()) { state, input -> state.next(input) }.transcript

    private fun edit(transcript: Transcript): ToolCallRecord =
        transcript.messages
            .values()
            .flatMap { it.parts.values().filterIsInstance<ToolCallRecord>() }
            .single { it.toolName == "Edit" }

    private fun reported(toolUseId: String) =
        PresenterInput.DiagnosticsReported(toolUseId, 2, listOf("12:5 Unresolved reference", "13:1 Type mismatch"))

    @Test
    fun `type only - the report is marked on the edit's line`() {
        val id = edit(run(inputs)).toolUseId
        val transcript = run(inputs + reported(id))
        val line =
            ThreadRows()
                .of(transcript)
                .filterIsInstance<ToolRow>()
                .single { it.toolName == "Edit" }
                .line

        assertAll(
            { assertEquals(2, edit(transcript).reportedErrors?.count) },
            { assertEquals(listOf("12:5 Unresolved reference", "13:1 Type mismatch"), line.reported?.lines) },
        )
    }

    @Test
    fun `type only - a report for an id with no line changes nothing and waits for the line`() {
        val id = edit(run(inputs)).toolUseId
        val unknown = run(inputs + reported("toolu_nobody"))
        assertNull(edit(unknown).reportedErrors)

        val early = run(listOf(reported(id)) + inputs)
        assertAll(
            { assertEquals(2, edit(early).reportedErrors?.count) },
            { assertTrue(early.reports.isEmpty(), "what was waiting is spent: ${early.reports}") },
        )
    }
}
