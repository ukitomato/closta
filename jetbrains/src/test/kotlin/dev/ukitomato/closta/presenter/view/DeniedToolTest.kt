package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.platforms.intellij.thread.deniedText
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * `system/permission_denied` (captures 44 and 10): the CLI refused a call on its own, and its line says so. Also
 * `system/informational`, which no capture carries: those rows are made by hand and say so in their names.
 */
class DeniedToolTest {
    private fun inputsOf(scenario: String) = CaptureReplay.inputs(scenario, uuids = true)

    private fun run(inputs: List<PresenterInput>): Transcript =
        inputs.fold(HostState()) { state, input -> state.next(input) }.transcript

    private fun calls(messages: Keyed<MessageRecord>): List<ToolCallRecord> =
        messages.values().flatMap { message ->
            message.parts
                .values()
                .filterIsInstance<ToolCallRecord>()
                .flatMap { listOf(it) + calls(it.messages) }
        }

    private fun denial(inputs: List<PresenterInput>) =
        inputs
            .map { (it as? PresenterInput.Event)?.event }
            .filterIsInstance<AgentEvent.SystemPermissionDenied>()
            .single()

    @Test
    fun `the Bash call 44 refused is a denied line with the reason type mode`() {
        val transcript = run(inputsOf("44-permission-denied"))
        val bash = calls(transcript.messages).single { it.toolName == "Bash" }
        val line =
            ThreadRows()
                .of(transcript)
                .filterIsInstance<ToolRow>()
                .single { it.toolName == "Bash" }
                .line

        assertAll(
            { assertEquals("mode", bash.denied?.reasonType) },
            { assertEquals(ToolLineState.DENIED, line.state) },
            { assertEquals(bash.denied, line.denial) },
        )
    }

    @Test
    fun `the refusal is kept when it comes before the line it refuses, and put on the line when it is made`() {
        val inputs = inputsOf("44-permission-denied")
        val denied = inputs.first { ((it as? PresenterInput.Event)?.event) is AgentEvent.SystemPermissionDenied }
        val early = run(listOf(denied) + (inputs - denied))
        val rows = ThreadRows().of(early).filterIsInstance<ToolRow>()

        assertAll(
            { assertEquals(ToolLineState.DENIED, rows.single { it.toolName == "Bash" }.line.state) },
            { assertTrue(early.denials.isEmpty(), "what was waiting for its line is spent: ${early.denials}") },
        )
    }

    @Test
    fun `a sub-agent's refused call in 10 is marked too, and the other calls are not`() {
        val transcript = run(inputsOf("10-background-task"))
        val all = calls(transcript.messages)
        val denied = all.filter { it.denied != null }

        assertAll(
            { assertEquals(listOf("Monitor"), denied.map { it.toolName }) },
            { assertEquals("subcommandResults", denied.single().denied?.reasonType) },
            { assertTrue(all.size > denied.size) },
        )
    }

    @Test
    fun `a refusal of a call nobody drew leaves the transcript with it waiting and no row`() {
        val ghost = denied("toolu_ghost", "mode", null)
        val transcript = run(listOf(PresenterInput.Event(ghost)))

        assertAll(
            { assertEquals(Denial("mode", null), transcript.denials[Keys.ofCliId("toolu_ghost")]) },
            { assertTrue(ThreadRows().of(transcript).isEmpty()) },
        )
    }

    @Test
    fun `a refusal said twice marks the call once`() {
        val inputs = inputsOf("44-permission-denied")
        val event = denial(inputs)
        val again = run(inputs + PresenterInput.Event(event))
        val bash = calls(again.messages).single { it.toolName == "Bash" }

        assertEquals(Denial(event.decisionReasonType, event.decisionReason), bash.denied)
    }

    @Test
    fun `the words for a refusal are the reason first, then the kind in our words`() {
        assertAll(
            { assertEquals("Denied without asking in this permission mode", deniedText(Denial("mode", null))) },
            { assertEquals("Denied by a rule", deniedText(Denial("rule", null))) },
            { assertEquals("Denied by the automatic check", deniedText(Denial("classifier", null))) },
            { assertEquals("asyncAgent", deniedText(Denial("asyncAgent", null))) },
            { assertEquals("Not on the list — Denied by a rule", deniedText(Denial("rule", "Not on the list"))) },
            { assertEquals("Denied without asking", deniedText(Denial(null, null))) },
            { assertEquals("Denied without asking", deniedText(null)) },
        )
    }

    @Test
    fun `type only - an informational line of level info makes no row`() {
        assertTrue(ThreadRows().of(run(listOf(informational("info")))).none { it is NoticeRow })
    }

    @Test
    fun `type only - the levels notice, suggestion and warning make rows, and an unknown level is a notice`() {
        val levels =
            listOf("notice", "suggestion", "warning", "something-new").map { level ->
                ThreadRows()
                    .of(run(listOf(informational(level))))
                    .filterIsInstance<NoticeRow>()
                    .single()
                    .level
            }

        assertEquals(
            listOf(NoticeLevel.NOTICE, NoticeLevel.SUGGESTION, NoticeLevel.WARNING, NoticeLevel.NOTICE),
            levels,
        )
    }

    @Test
    fun `type only - a warning that prevents continuation says the CLI stopped, others do not`() {
        fun stopped(prevent: Boolean?) =
            ThreadRows()
                .of(run(listOf(informational("warning", prevent))))
                .filterIsInstance<NoticeRow>()
                .single()
                .stopped

        assertAll(
            { assertEquals(true, stopped(true)) },
            { assertEquals(false, stopped(false)) },
            { assertEquals(false, stopped(null)) },
        )
    }

    @Test
    fun `type only - two informational lines are two rows with their words`() {
        val rows =
            ThreadRows()
                .of(run(listOf(informational("notice", content = "one"), informational("warning", content = "two"))))
                .filterIsInstance<NoticeRow>()

        assertAll(
            { assertEquals(listOf("one", "two"), rows.map { it.content }) },
            { assertEquals(2, rows.map { it.key }.distinct().size) },
            { assertNotNull(rows.firstOrNull()) },
        )
    }

    private fun denied(
        toolUseId: String,
        type: String?,
        reason: String?,
    ) = AgentEvent.SystemPermissionDenied(
        uuid = "u-$toolUseId",
        sessionId = "s",
        toolName = "Bash",
        toolUseId = toolUseId,
        decisionReasonType = type,
        decisionReason = reason,
        message = "denied",
    )

    private var count = 0

    private fun informational(
        level: String,
        prevent: Boolean? = null,
        content: String = "words",
    ) = PresenterInput.Event(
        AgentEvent.SystemInformational(
            uuid = "info-${count++}",
            sessionId = "s",
            content = content,
            level = level,
            preventContinuation = prevent,
        ),
    )
}
