package dev.ukitomato.closta.presenter.view

import com.google.gson.JsonObject
import com.google.gson.JsonPrimitive
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import dev.ukitomato.closta.providers.claude.synthetic.StreamScript
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** What the line of a running Bash command or subagent offers: moving it to the background. */
class BackgroundOfferTest {
    private fun HostState.line(json: String) = next(PresenterInput.Event(StreamJsonCodec.decode(json)))

    private fun turn() =
        HostState()
            .next(PresenterInput.UserSent("u1", "go", uuid = "c1"))
            .next(PresenterInput.Event(Lines.queued("c1")))
            .next(PresenterInput.Event(Lines.started("c1")))

    private fun HostState.lines(script: StreamScript) = script.lines.fold(this) { state, json -> state.line(json) }

    private fun HostState.offerOf(
        toolUseId: String,
        live: Boolean = true,
    ): BackgroundOffer? =
        ThreadRows()
            .of(transcript, conversation, live)
            .filterIsInstance<ToolRow>()
            .firstOrNull { it.toolUseId == toolUseId }
            ?.background

    private fun primitive(value: Any) = if (value is Boolean) JsonPrimitive(value) else JsonPrimitive(value.toString())

    private fun call(
        id: String,
        name: String,
        vararg fields: Pair<String, Any>,
    ) = StreamScript().apply {
        val input = JsonObject()
        fields.forEach { (key, value) -> input.add(key, primitive(value)) }
        assistant("m-$id", listOf(StreamScript.toolUse(id, name, input)))
    }

    private fun started(
        taskId: String,
        toolUseId: String,
        backgrounded: Boolean,
    ) = """{"type":"system","subtype":"task_started","task_id":"$taskId","tool_use_id":"$toolUseId",""" +
        """"description":"d","task_type":"local_bash","is_backgrounded":$backgrounded,""" +
        """"uuid":"u-$taskId","session_id":"s"}"""

    private fun changed(vararg taskIds: String) =
        """{"type":"system","subtype":"background_tasks_changed","tasks":[""" +
            taskIds.joinToString(",") { """{"task_id":"$it","task_type":"local_bash","description":"d"}""" } +
            """],"uuid":"u-ch","session_id":"s"}"""

    private fun updated(
        taskId: String,
        patch: String,
    ) = """{"type":"system","subtype":"task_updated","task_id":"$taskId","patch":$patch,""" +
        """"uuid":"u-up-$taskId","session_id":"s"}"""

    private fun toolRowsIn(steps: List<CaptureReplay.Step>) =
        steps.map { step ->
            ThreadRows().of(step.transcript, step.conversation).filterIsInstance<ToolRow>()
        }

    @Test
    fun `02 a Bash line is offered before its result and not after`() {
        val steps = CaptureReplay.replay("02-tool-bash-autorun")
        val resultAt =
            steps.indexOfFirst { step ->
                step.transcript.messages
                    .values()
                    .flatMap { it.parts.values() }
                    .filterIsInstance<ToolCallRecord>()
                    .any { it.result != null }
            }
        val rows = toolRowsIn(steps)
        assertTrue(resultAt > 0)
        assertEquals(BackgroundOffer(BackgroundPhase.OFFER), rows[resultAt - 1].single().background)
        assertNull(rows[resultAt].single().background)
        assertNull(rows.last().single().background)
    }

    @Test
    fun `10 a call that runs in the background from the start is never offered`() {
        val rows = toolRowsIn(CaptureReplay.replay("10-background-task")).flatten()
        assertTrue(rows.any { it.toolName in AGENT_TOOLS })
        assertTrue(rows.all { it.background == null })
    }

    @Test
    fun `19 a task the background list holds is not offered`() {
        val rows = toolRowsIn(CaptureReplay.replay("19-interrupt-background")).flatten()
        assertTrue(rows.any { it.toolName in AGENT_TOOLS })
        assertTrue(rows.all { it.background == null })
    }

    @Test
    fun `type only - a running Bash and a running subagent are offered, any other tool and a streaming call are not`() {
        val state =
            turn()
                .lines(call("b", "Bash", "command" to "sleep 9"))
                .lines(call("a", "Agent", "prompt" to "work"))
                .lines(call("t", "Task", "prompt" to "work"))
                .lines(call("r", "Read", "file_path" to "x"))
        val offer = BackgroundOffer(BackgroundPhase.OFFER)
        assertEquals(listOf(offer, offer, offer, null), listOf("b", "a", "t", "r").map { state.offerOf(it) })
        assertNull(state.offerOf("b", live = false), "a CLI that is not running cannot move anything")
    }

    @Test
    fun `type only - a call that asks to run in the background is not offered`() {
        val state = turn().lines(call("b", "Bash", "command" to "sleep 9", "run_in_background" to true))
        assertNull(state.offerOf("b"))
        val explicit = turn().lines(call("c", "Bash", "command" to "sleep 9", "run_in_background" to false))
        assertEquals(BackgroundOffer(BackgroundPhase.OFFER), explicit.offerOf("c"))
    }

    @Test
    fun `type only - a task in the background list removes the button, and one that left it brings none back`() {
        val state = turn().lines(call("b", "Bash", "command" to "sleep 9")).line(started("k1", "b", false))
        assertEquals(BackgroundOffer(BackgroundPhase.OFFER), state.offerOf("b"), "a foreground task is no news")
        val listed = state.line(changed("k1"))
        assertNull(listed.offerOf("b"))
    }

    @Test
    fun `type only - a task_updated that moves the task to the background removes the button`() {
        val state = turn().lines(call("b", "Bash", "command" to "sleep 9")).line(started("k1", "b", false))
        val moved = state.line(updated("k1", """{"is_backgrounded":true}"""))
        assertNull(moved.offerOf("b"))
        assertEquals(setOf("k1"), moved.transcript.background.backgrounded)
    }

    @Test
    fun `type only - a task_updated without is_backgrounded changes nothing`() {
        val state = turn().lines(call("b", "Bash", "command" to "sleep 9")).line(started("k1", "b", false))
        val same =
            state
                .line(
                    updated("k1", """{"status":"running"}"""),
                ).line(updated("k1", """{"is_backgrounded":false}"""))
        assertEquals(BackgroundOffer(BackgroundPhase.OFFER), same.offerOf("b"))
        assertTrue(
            same.transcript.background.backgrounded
                .isEmpty(),
        )
    }

    @Test
    fun `type only - a task_updated for a task the call never started is remembered and offers nothing`() {
        val state =
            turn()
                .lines(
                    call("b", "Bash", "command" to "sleep 9"),
                ).line(updated("zz", """{"is_backgrounded":true}"""))
        assertEquals(BackgroundOffer(BackgroundPhase.OFFER), state.offerOf("b"))
    }

    @Test
    fun `type only - the answer to the request is waited for, and an error shows the CLI's words`() {
        val running = turn().lines(call("b", "Bash", "command" to "sleep 9"))
        val asked = running.next(PresenterInput.ControlRequested("r1", ControlKind.BACKGROUND, "b"))
        assertEquals(BackgroundOffer(BackgroundPhase.WAITING), asked.offerOf("b"))
        assertEquals(
            BackgroundOffer(BackgroundPhase.WAITING),
            asked.next(PresenterInput.Event(Lines.controlOk("r1"))).offerOf("b"),
        )
        val refused = asked.next(PresenterInput.Event(Lines.controlError("r1", "No such task")))
        assertEquals(BackgroundOffer(BackgroundPhase.FAILED, "No such task"), refused.offerOf("b"))
        val again = refused.next(PresenterInput.ControlRequested("r2", ControlKind.BACKGROUND, "b"))
        assertEquals(BackgroundOffer(BackgroundPhase.WAITING), again.offerOf("b"))
    }

    @Test
    fun `type only - a request that could not be written fails with the fixed sentence`() {
        val asked =
            turn()
                .lines(call("b", "Bash", "command" to "sleep 9"))
                .next(PresenterInput.ControlRequested("r1", ControlKind.BACKGROUND, "b"))
        val failed = asked.next(PresenterInput.ControlSendFailed("r1"))
        assertEquals(BackgroundOffer(BackgroundPhase.FAILED, REQUEST_NOT_SENT), failed.offerOf("b"))
    }

    @Test
    fun `type only - a result ends the wait and the button`() {
        val asked =
            turn()
                .lines(call("b", "Bash", "command" to "sleep 9"))
                .next(PresenterInput.ControlRequested("r1", ControlKind.BACKGROUND, "b"))
        val done = asked.lines(StreamScript().apply { toolResult("b", "Command running in background") })
        assertNull(done.offerOf("b"))
    }

    @Test
    fun `type only - a request for all of them has no line to mark`() {
        val asked =
            turn()
                .lines(call("b", "Bash", "command" to "sleep 9"))
                .next(PresenterInput.ControlRequested("r1", ControlKind.BACKGROUND, null))
        assertEquals(BackgroundOffer(BackgroundPhase.OFFER), asked.offerOf("b"))
        assertTrue(
            asked.transcript.operations.backgroundAsks
                .isEmpty(),
        )
    }

    @Test
    fun `an offer says its phase and never the CLI's words in a log`() {
        assertEquals("BackgroundOffer(FAILED)", BackgroundOffer(BackgroundPhase.FAILED, "secret").toString())
    }

    @Test
    fun `type only - the composer can send all to the background only while a call runs in front`() {
        val none = turn()
        assertFalse(composerState(none.conversation, none.transcript).canBackground)
        val running = none.lines(call("b", "Bash", "command" to "sleep 9"))
        assertTrue(composerState(running.conversation, running.transcript).canBackground)
        val listed = running.line(started("k1", "b", false)).line(changed("k1"))
        assertFalse(composerState(listed.conversation, listed.transcript).canBackground)
        val read = none.lines(call("r", "Read", "file_path" to "x"))
        assertFalse(composerState(read.conversation, read.transcript).canBackground)
    }

    @Test
    fun `type only - a call waiting for an approval is not offered until it is answered`() {
        val waiting =
            turn()
                .lines(call("b", "Bash", "command" to "sleep 9"))
                .next(PresenterInput.Event(Lines.request("q1", "Bash", "b")))
        assertNull(waiting.offerOf("b"))
        assertFalse(composerState(waiting.conversation, waiting.transcript).canBackground)
    }

    @Test
    fun `type only - a success that says nothing was moved clears the wait and the offer returns`() {
        val asked =
            turn()
                .lines(call("b", "Bash", "command" to "sleep 9"))
                .next(PresenterInput.ControlRequested("r1", ControlKind.BACKGROUND, "b"))
        val notMoved = asked.next(PresenterInput.Event(Lines.controlOk("r1", "false")))
        assertEquals(BackgroundOffer(BackgroundPhase.OFFER), notMoved.offerOf("b"))
        val objectForm = asked.next(PresenterInput.Event(Lines.controlOk("r1", """{"backgrounded":false}""")))
        assertEquals(BackgroundOffer(BackgroundPhase.OFFER), objectForm.offerOf("b"))
        val moved = asked.next(PresenterInput.Event(Lines.controlOk("r1", "true")))
        assertEquals(BackgroundOffer(BackgroundPhase.WAITING), moved.offerOf("b"))
    }

    @Test
    fun `type only - send all follows the same rule as the lines, and a CLI that is not up cannot`() {
        val running = turn().lines(call("b", "Bash", "command" to "sleep 9"))
        assertTrue(canBackground(running.transcript, running.conversation, live = true))
        assertFalse(canBackground(running.transcript, running.conversation, live = false))
    }
}
