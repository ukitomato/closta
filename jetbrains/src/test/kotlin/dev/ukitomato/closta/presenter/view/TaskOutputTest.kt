package dev.ukitomato.closta.presenter.view

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** `get_task_output`: no capture holds it, so the answers are made by hand from the SDK's type. */
class TaskOutputTest {
    private fun HostState.with(input: PresenterInput) = next(input)

    private fun HostState.ops() = transcript.operations

    private fun HostState.ask(
        id: String,
        task: String,
    ) = with(PresenterInput.ControlRequested(id, ControlKind.TASK_OUTPUT, task))

    private fun HostState.answer(
        id: String,
        output: String,
        total: Long = output.length.toLong(),
        truncated: Boolean = false,
    ) = with(
        PresenterInput.Event(
            Lines.controlOk(
                id,
                """{"output":${Lines.quote(output)},"total_bytes":$total,"truncated":$truncated}""",
            ),
        ),
    )

    @Test
    fun `type only - the answer reads as the text, the size and whether it is the tail`() {
        val state =
            HostState()
                .ask(
                    "o1",
                    "t1",
                ).answer("o1", "line\u001B[31m red\u001B[0m", total = 9000, truncated = true)
        val output = state.ops().output!!
        assertEquals(TaskOutputRecord("t1", "line red", 9000, true, null), output)
        assertNull(state.ops().outputAsk)
    }

    @Test
    fun `type only - an answer with no size or flag reads, taking the text's own length and not truncated`() {
        val state =
            HostState().ask("o1", "t1").with(PresenterInput.Event(Lines.controlOk("o1", """{"output":"héllo"}""")))
        assertEquals(TaskOutputRecord("t1", "héllo", 6, false, null), state.ops().output)
    }

    @Test
    fun `type only - a refusal is kept with the CLI's sentence for the task asked`() {
        val state = HostState().ask("o1", "t1").with(PresenterInput.Event(Lines.controlError("o1", "Unknown task")))
        assertEquals(TaskOutputRecord("t1", "", 0, false, "Unknown task"), state.ops().output)
        assertNull(state.ops().outputAsk)
    }

    @Test
    fun `type only - an answer that does not read ends the wait and keeps the last output`() {
        val state =
            HostState()
                .ask("o1", "t1")
                .answer("o1", "first")
                .ask("o2", "t1")
                .with(PresenterInput.Event(Lines.controlOk("o2", """{"total_bytes":3}""")))
        assertEquals("first", state.ops().output!!.text)
        assertNull(state.ops().outputAsk)
    }

    @Test
    fun `type only - a request replaces the one before and a late answer to the first changes nothing`() {
        val second = HostState().ask("oA", "t1").ask("oB", "t1")
        assertEquals("oB" to "t1", second.ops().outputAsk)
        val late = second.answer("oA", "from A")
        assertSame(second.transcript, late.transcript)
        assertEquals("oB" to "t1", late.ops().outputAsk)
        assertNull(late.ops().output)
        val answered = late.answer("oB", "from B")
        assertEquals("from B", answered.ops().output!!.text)
        assertNull(answered.ops().outputAsk)
    }

    @Test
    fun `type only - an answer after it was answered, or an id nobody asked with, changes nothing`() {
        val done = HostState().ask("o1", "t1").answer("o1", "x")
        assertSame(done.transcript, done.answer("o1", "again").transcript)
        assertSame(done.transcript, done.answer("zzz", "other").transcript)
    }

    @Test
    fun `type only - a request id already asked is not recorded again`() {
        val state = HostState().ask("o1", "t1").ask("o1", "t2")
        assertEquals("o1" to "t1", state.ops().outputAsk)
    }

    @Test
    fun `type only - a request that could not be written is not waited for and its answer changes nothing`() {
        val failed = HostState().ask("o1", "t1").with(PresenterInput.ControlSendFailed("o1"))
        assertNull(failed.ops().outputAsk)
        assertSame(failed.transcript, failed.answer("o1", "x").transcript)
        val other = HostState().ask("o1", "t1").with(PresenterInput.ControlSendFailed("o9"))
        assertEquals("o1" to "t1", other.ops().outputAsk)
    }

    @Test
    fun `type only - a new CLI empties the ask and the output`() {
        val state = HostState().ask("o1", "t1").answer("o1", "x").ask("o2", "t1")
        val launched = state.with(PresenterInput.Launched(null))
        assertNull(launched.ops().outputAsk)
        assertNull(launched.ops().output)
        assertSame(launched.transcript, launched.answer("o2", "late").transcript)
    }

    @Test
    fun `type only - asking for another task, or after a refusal, forgets the output that was there`() {
        val read = HostState().ask("o1", "t1").answer("o1", "x")
        assertEquals(
            "x",
            read
                .ask("o2", "t1")
                .ops()
                .output!!
                .text,
        )
        assertNull(read.ask("o2", "t2").ops().output)
        val refused = HostState().ask("o1", "t1").with(PresenterInput.Event(Lines.controlError("o1", "gone")))
        assertNull(refused.ask("o2", "t1").ops().output)
    }

    @Test
    fun `type only - the record's text shows only the task and the length`() {
        val text = TaskOutputRecord("t1", "secret words", 12, false, null).toString()
        assertTrue("t1" in text && "12" in text)
        assertFalse("secret" in text)
    }

    @Test
    fun `type only - the clock asks only when nothing is out, asks once more after the task ends, and stops`() {
        assertEquals(OutputPoll.WAIT, outputPoll(asking = true, live = true, lastAsked = false, failed = false))
        assertEquals(OutputPoll.ASK, outputPoll(asking = false, live = true, lastAsked = false, failed = false))
        assertEquals(OutputPoll.WAIT, outputPoll(asking = true, live = false, lastAsked = false, failed = false))
        assertEquals(OutputPoll.ASK_LAST, outputPoll(asking = false, live = false, lastAsked = false, failed = false))
        assertEquals(OutputPoll.WAIT, outputPoll(asking = true, live = false, lastAsked = true, failed = false))
        assertEquals(OutputPoll.STOP, outputPoll(asking = false, live = false, lastAsked = true, failed = false))
        assertEquals(OutputPoll.STOP, outputPoll(asking = false, live = true, lastAsked = false, failed = true))
    }
}
