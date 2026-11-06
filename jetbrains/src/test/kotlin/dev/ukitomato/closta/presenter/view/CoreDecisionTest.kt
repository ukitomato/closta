package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ApprovalKind
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.PendingApproval
import dev.ukitomato.closta.presenter.keysOf
import dev.ukitomato.closta.presenter.message
import dev.ukitomato.closta.presenter.status
import dev.ukitomato.closta.presenter.tree.JsonBool
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Where content goes follows what core decided about the same input, not a copy of core's rule. */
class CoreDecisionTest {
    @Test
    fun `a second result for a turn core already closed ends the open resume`() {
        val session = Session()
        session.send("s1", "go")
        session.turn("cmdX")
        session.events(Lines.assistant("m1", Lines.text("done")), Lines.result("cmdX"))
        session.events(Lines.assistant("msg_r", Lines.text("and one more thing")))
        assertEquals("running", session.thread.message("msg_r").status())
        session.events(Lines.result("cmdX"))
        assertEquals(1, session.conversation.spontaneousResumeCount, "core closed nothing and counted a resume")
        assertEquals("complete/stop", session.thread.message("msg_r").status())
        assertEquals(JsonBool.FALSE, session.thread["isRunning"])
    }

    @Test
    fun `a result that closes the current turn stops routing content to it`() {
        val session = Session()
        session.turn("c1")
        session.events(Lines.result("c1"), Lines.assistant("m9", Lines.text("on my own")))
        assertEquals(listOf("c1", "m9"), session.thread.keysOf("messages"))
        assertEquals(emptyList<String>(), session.thread.message("c1").keysOf("parts"))
    }

    @Test
    fun `a result for an earlier turn leaves the turn that started after it receiving content`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.text("one")),
            Lines.queued("c2"),
            Lines.started("c2"),
            Lines.result("c1"),
        )
        session.events(Lines.assistant("m2", Lines.text("two")))
        assertEquals(listOf("c1", "c2"), session.thread.keysOf("messages"), "no resume opened")
        assertEquals(listOf("m2:0"), session.thread.message("c2").keysOf("parts"))
        assertEquals("running", session.thread.message("c2").status())
    }

    @Test
    fun `a request is a question when core holds it as one, and keeps its kind when core holds nothing for it`() {
        val question = Lines.request("r1", "AskUserQuestion", null)
        val asked = HostState().next(PresenterInput.Event(question))
        assertTrue(asked.transcript.approvals["r1"]!!.ask, "core's kind for it is ASK")
        val bare =
            foldTranscript(Transcript(), PresenterInput.Event(question), ConversationState(), ConversationState())
        assertFalse(bare.approvals["r1"]!!.ask, "nothing from core: not a question")
        val again =
            foldTranscript(asked.transcript, PresenterInput.Event(question), asked.conversation, ConversationState())
        assertTrue(again.approvals["r1"]!!.ask, "nothing from core this time: the record keeps its kind")
        val plain = ConversationState(pendingApprovals = listOf(PendingApproval("r1", ApprovalKind.APPROVAL)))
        val told = foldTranscript(Transcript(), PresenterInput.Event(question), ConversationState(), plain)
        assertFalse(told.approvals["r1"]!!.ask, "core says it is not a question, whatever the tool name")
    }

    @Test
    fun `the thread runs from a send until core opens a turn for it`() {
        val session = Session()
        session.send("s1", "one")
        session.send("s2", "two")
        session.events(Lines.queued("c1"))
        assertEquals(JsonBool.TRUE, session.thread["isRunning"])
        session.events(Lines.started("c1"), Lines.result("c1"))
        assertEquals(JsonBool.TRUE, session.thread["isRunning"], "one send is not taken yet")
        session.events(Lines.queued("c2"), Lines.started("c2"), Lines.result("c2"))
        assertEquals(JsonBool.FALSE, session.thread["isRunning"])
    }
}
