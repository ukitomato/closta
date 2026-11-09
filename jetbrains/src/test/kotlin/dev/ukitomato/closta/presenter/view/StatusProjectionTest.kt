package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.Turn
import dev.ukitomato.closta.core.models.TurnPhase
import dev.ukitomato.closta.presenter.at
import dev.ukitomato.closta.presenter.keysOf
import dev.ukitomato.closta.presenter.message
import dev.ukitomato.closta.presenter.messages
import dev.ukitomato.closta.presenter.part
import dev.ukitomato.closta.presenter.parts
import dev.ukitomato.closta.presenter.status
import dev.ukitomato.closta.presenter.str
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test

/** Statuses are read from core when the tree is built; these are the paths the captures miss. */
class StatusProjectionTest {
    private fun JsonObject.error(): String? = (this["status"] as? JsonObject)?.str("error")

    @Test
    fun `a failed turn ends incomplete with its result as the error`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.text("partial")),
            Lines.result("c1", isError = true, text = "API Error: 529"),
        )
        val turn = session.thread.message("c1")
        assertEquals("incomplete/error", turn.status())
        assertEquals("API Error: 529", turn.error())
        assertEquals(JsonBool.FALSE, session.thread["isRunning"])
    }

    @Test
    fun `a failure that says nothing has no error`() {
        val session = Session()
        session.turn("c1")
        session.events(Lines.result("c1", isError = true, text = ""))
        val status = session.thread.message("c1").at("status")
        assertEquals(setOf("type", "reason"), status.keys)
        assertEquals("incomplete/error", session.thread.message("c1").status())
    }

    @Test
    fun `a sub-agent asking after its parent's turn ended makes that message wait, and the thread run`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("agent", "Agent")),
            Lines.taskStarted("task-1", "agent"),
            Lines.result("c1"),
            Lines.assistant("m2", Lines.toolUse("write", "Write"), parent = "agent"),
            Lines.request("r1", "Write", "write", agentId = "task-1"),
        )
        assertEquals("requires-action/interrupt", session.thread.message("c1").status())
        val nested =
            session.thread
                .message("c1")
                .part("agent")
                .message("m2")
        assertEquals("requires-action/interrupt", nested.part("write").status())
        assertNull(nested["status"], "a sub-agent's message has none, even while it waits")
        assertEquals(JsonBool.TRUE, session.thread["isRunning"])
        session.decide(ApprovalDecision.Allow("r1"))
        assertEquals("complete/stop", session.thread.message("c1").status())
        assertEquals(JsonBool.FALSE, session.thread["isRunning"])
    }

    @Test
    fun `a resume whose result leaves a request pending still waits for the user`() {
        val session = Session()
        session.events(
            Lines.assistant("m9", Lines.toolUse("toolu_9", "Bash")),
            Lines.request("r9", "Bash", "toolu_9"),
            Lines.result(null),
        )
        assertEquals(
            1,
            session.conversation.pendingApprovals.size,
            "a successful resume result does not discard the request",
        )
        assertEquals("requires-action/interrupt", session.thread.message("m9").status())
        assertEquals(JsonBool.TRUE, session.thread["isRunning"])
        session.decide(ApprovalDecision.Allow("r9"))
        assertEquals("complete/stop", session.thread.message("m9").status())
        assertEquals(JsonBool.FALSE, session.thread["isRunning"])
    }

    @Test
    fun `a part still streaming when its turn ends was cut off`() {
        val session = Session()
        session.turn("c1")
        session.events(Lines.messageStart("m1"), Lines.blockStart(0, Lines.text("")), Lines.textDelta(0, "Hel"))
        assertEquals(
            "running",
            session.thread
                .message("c1")
                .part("m1:0")
                .status(),
        )
        session.events(Lines.result("c1"))
        assertEquals(
            "incomplete/cancelled",
            session.thread
                .message("c1")
                .part("m1:0")
                .status(),
        )
        assertEquals(
            "Hel",
            session.thread
                .message("c1")
                .part("m1:0")
                .str("text"),
        )
        assertEquals("complete/stop", session.thread.message("c1").status())
    }

    @Test
    fun `a stopped stream is complete even while its turn runs`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.messageStart("m1"),
            Lines.blockStart(0, Lines.thinking("")),
            Lines.thinkingDelta(0, "hmm"),
            Lines.blockStop(0),
        )
        val part = session.thread.message("c1").part("m1:0")
        assertEquals("reasoning", part.str("type"))
        assertEquals("hmm", part.str("text"))
        assertEquals("complete", part.status())
        assertEquals("running", session.thread.message("c1").status())
    }

    @Test
    fun `a tool call left without a result when its turn ends was cut off, one that runs is running`() {
        val session = Session()
        session.turn("c1")
        session.events(Lines.assistant("m1", Lines.toolUse("toolu_1", "Bash")))
        assertEquals(
            "running",
            session.thread
                .message("c1")
                .part("toolu_1")
                .status(),
        )
        session.events(Lines.result("c1"))
        assertEquals(
            "incomplete/cancelled",
            session.thread
                .message("c1")
                .part("toolu_1")
                .status(),
        )
    }

    @Test
    fun `a task decides its call's status over the call's result, and a failed task is an error`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("agent", "Agent")),
            Lines.taskStarted("task-1", "agent"),
            Lines.user("u1", Lines.toolResult("agent", "\"Async agent launched\"")),
        )
        assertEquals(
            "running",
            session.thread
                .message("c1")
                .part("agent")
                .status(),
            "launched is not done",
        )
        session.events(Lines.taskNotification("task-1", "agent", "failed"))
        val agent = session.thread.message("c1").part("agent")
        assertEquals("incomplete/error", agent.status())
        assertEquals("failed", agent.error())
        session.events(Lines.result("c1"))
        assertEquals(
            "incomplete/error",
            session.thread
                .message("c1")
                .part("agent")
                .status(),
            "the task's end outlives the turn",
        )
    }

    @Test
    fun `a sub-agent's calls run after the turn ends, and after its task says complete`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("agent", "Agent")),
            Lines.taskStarted("task-1", "agent"),
            Lines.result("c1"),
            Lines.assistant("m2", Lines.toolUse("bash", "Bash"), parent = "agent"),
        )
        val agent = session.thread.message("c1").part("agent")
        assertEquals("running", agent.message("m2").part("bash").status())
        // A re-sent task_started after the notification leaves core's task complete while the sub-agent works on.
        session.events(Lines.taskNotification("task-1", "agent", "completed"), Lines.taskStarted("task-1", "agent"))
        session.events(Lines.assistant("m3", Lines.toolUse("read", "Read"), parent = "agent"))
        val done = session.thread.message("c1").part("agent")
        assertEquals("complete", done.status())
        assertEquals("running", done.message("m2").part("bash").status(), "no result yet, and nothing cut it off")
        assertEquals("running", done.message("m3").part("read").status())
        session.events(Lines.user("u1", Lines.toolResult("read", "\"ok\""), parent = "agent"))
        assertEquals(
            "complete",
            session.thread
                .message("c1")
                .part("agent")
                .message("m3")
                .part("read")
                .status(),
        )
    }

    @Test
    fun `a sub-agent's call without a result is cut off when the call that started it failed or was cut off`() {
        val failed = Session()
        failed.turn("c1")
        failed.events(
            Lines.assistant("m1", Lines.toolUse("agent", "Agent")),
            Lines.taskStarted("task-1", "agent"),
            Lines.assistant("m2", Lines.toolUse("bash", "Bash"), parent = "agent"),
            Lines.assistant("m2", Lines.toolUse("read", "Read"), parent = "agent"),
            Lines.user("u1", Lines.toolResult("read", "\"ok\""), parent = "agent"),
            Lines.taskNotification("task-1", "agent", "failed"),
        )
        val agent = failed.thread.message("c1").part("agent")
        assertEquals("incomplete/error", agent.status())
        assertEquals("incomplete/cancelled", agent.message("m2").part("bash").status())
        assertEquals("complete", agent.message("m2").part("read").status(), "a call with its result is complete")

        val cut = Session()
        cut.turn("c1")
        cut.events(
            Lines.assistant("m1", Lines.toolUse("agent", "Agent")),
            Lines.assistant("m2", Lines.toolUse("bash", "Bash"), parent = "agent"),
            Lines.assistant("m2", Lines.text("thinking aloud"), parent = "agent"),
        )
        assertEquals(
            "running",
            cut.thread
                .message("c1")
                .part("agent")
                .message("m2")
                .part("bash")
                .status(),
        )
        cut.events(Lines.result("c1", isError = true, text = "interrupted"))
        val cutAgent = cut.thread.message("c1").part("agent")
        assertEquals("incomplete/cancelled", cutAgent.status(), "no task, no result, and its turn ended")
        assertEquals("incomplete/cancelled", cutAgent.message("m2").part("bash").status())
        assertEquals("complete", cutAgent.message("m2").part("m2:1").status(), "nested text was made finished")
    }

    @Test
    fun `a spontaneous resume that fails ends incomplete with its result as the error`() {
        val session = Session()
        session.events(Lines.messageStart("m9"), Lines.blockStart(0, Lines.text("")), Lines.textDelta(0, "Back."))
        assertEquals(listOf("m9"), session.thread.keysOf("messages"))
        assertEquals("running", session.thread.message("m9").status())
        assertEquals(JsonBool.TRUE, session.thread["isRunning"])
        session.events(Lines.blockStop(0), Lines.result(null, isError = true, text = "overloaded"))
        assertEquals("incomplete/error", session.thread.message("m9").status())
        assertEquals("overloaded", session.thread.message("m9").error())
        assertEquals(JsonBool.FALSE, session.thread["isRunning"])
    }

    @Test
    fun `content after a resume ended opens the next resume`() {
        val session = Session()
        session.events(
            Lines.assistant("m1", Lines.text("one")),
            Lines.result(null),
            Lines.assistant("m2", Lines.text("two")),
        )
        assertEquals(listOf("m1", "m2"), session.thread.keysOf("messages"))
        assertEquals(listOf("complete/stop", "running"), session.thread.messages().map { it.status() })
    }

    @Test
    fun `a resume that runs a tool spans two Anthropic messages and is one message`() {
        val session = Session()
        session.events(
            Lines.messageStart("m1"),
            Lines.blockStart(0, Lines.toolUse("toolu_1", "Read")),
            Lines.assistant("m1", Lines.toolUse("toolu_1", "Read", """{"file_path":"/f"}""")),
            Lines.messageStop(),
            Lines.user("u1", Lines.toolResult("toolu_1", "\"text\"")),
            Lines.messageStart("m2"),
            Lines.assistant("m2", Lines.text("Read it.")),
        )
        assertEquals(listOf("m1"), session.thread.keysOf("messages"))
        assertEquals(listOf("toolu_1", "m2:0"), session.thread.message("m1").keysOf("parts"))
        session.events(Lines.result(null))
        assertEquals("complete/stop", session.thread.message("m1").status())
    }

    @Test
    fun `the thread runs from a send until the CLI's result, and stays running for a send it never took`() {
        val session = Session()
        assertEquals(JsonBool.FALSE, session.thread["isRunning"])
        session.send("s1", "hi")
        assertEquals(JsonBool.TRUE, session.thread["isRunning"], "sent, not yet taken")
        session.events(Lines.queued("c1"))
        assertEquals(JsonBool.TRUE, session.thread["isRunning"], "queued")
        assertEquals(listOf("s1"), session.thread.keysOf("messages"), "a queued turn has no message yet")
        session.events(Lines.started("c1"), Lines.result("c1"))
        assertEquals(JsonBool.FALSE, session.thread["isRunning"])
        session.send("s2", "again")
        assertEquals(JsonBool.TRUE, session.thread["isRunning"])
    }

    @Test
    fun `a turn core does not know shows as complete for an unknown reason`() {
        // A transcript that saw a turn start that this core state never saw: the caller passed another conversation.
        val transcript =
            foldTranscript(
                Transcript(),
                PresenterInput.Event(Lines.started("c1")),
                ConversationState(),
                ConversationState(),
            )
        val tree = projectTree(listOf(ThreadSource("t1", ConversationState(), transcript)))
        assertEquals("complete/unknown", tree.at("threads", "byId", "t1").message("c1").status())
        val open = ConversationState(turns = listOf(Turn("c1", TurnPhase.OPEN)))
        assertEquals(
            "running",
            projectTree(
                listOf(ThreadSource("t1", open, transcript)),
            ).at("threads", "byId", "t1").message("c1").status(),
        )
    }

    @Test
    fun `a block of a type this version does not know is a part of that type alone`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", """{"type":"redacted_thinking","data":"x"}"""),
            Lines.assistant("m1", """{"type":"tool-call","id":"x"}"""),
            Lines.assistant("m1", """{"data":"no type"}"""),
        )
        val parts = session.thread.message("c1").parts()
        assertEquals(listOf("redacted_thinking", "unknown", "unknown"), parts.map { it.str("type") })
        assertEquals(listOf(setOf("type")), parts.map { it.keys }.distinct())
    }

    @Test
    fun `user parts have no status, assistant parts do`() {
        val session = Session()
        session.send("s1", "hi")
        session.turn("c1")
        session.events(Lines.assistant("m1", Lines.text("yo")))
        assertNull(session.thread.message("s1").part("s1:0")["status"])
        assertEquals(
            "complete",
            session.thread
                .message("c1")
                .part("m1:0")
                .status(),
        )
        assertEquals(JsonString("hi"), session.thread.message("s1").part("s1:0")["text"])
    }

    private fun JsonObject.collection(key: String): JsonObject = this[key] as JsonObject

    @Test
    fun `a thread has no session or usage until the CLI starts one, then its model, mode, cwd and version`() {
        val session = Session()
        assertNull(session.thread["session"])
        assertNull(session.thread["usage"], "no session, so no total to show")
        session.events(Lines.init(model = "claude-sonnet-5-5", mode = "default", cwd = "/work"))
        val shown = session.thread.at("session")
        assertEquals(setOf("model", "permissionMode", "cwd", "version"), shown.keys)
        assertEquals("claude-sonnet-5-5", shown.str("model"))
        assertEquals("default", shown.str("permissionMode"))
        assertEquals("/work", shown.str("cwd"))
        assertEquals("2.1.282", shown.str("version"))
        assertEquals(JsonNumber("0.0"), session.thread.at("usage")["costUsd"], "a total of nothing is still shown")
    }

    @Test
    fun `a status that changes only the permission mode shows in the tree`() {
        val session = Session()
        session.events(Lines.init(mode = "default"))
        val before = session.thread.at("session")
        session.events(Lines.status("acceptEdits"))
        val after = session.thread.at("session")
        assertEquals("acceptEdits", after.str("permissionMode"))
        assertEquals(before.str("model"), after.str("model"))
        assertEquals("default", before.str("permissionMode"), "the node it replaced is untouched")
    }

    @Test
    fun `a result that changes only the total shows the new total`() {
        val session = Session()
        session.events(Lines.init())
        session.turn("c1")
        session.events(Lines.result("c1", cost = 0.0123))
        assertEquals(JsonNumber("0.0123"), session.thread.at("usage")["costUsd"])
        session.turn("c2")
        session.events(Lines.result("c2", cost = 0.00001))
        assertEquals(JsonNumber("1.0E-5"), session.thread.at("usage")["costUsd"])
        session.turn("c3")
        session.events(Lines.result("c3", cost = 12.5))
        assertEquals(JsonNumber("12.5"), session.thread.at("usage")["costUsd"])
    }

    @Test
    fun `a result that changes only the total, with the turns and the transcript as they were, shows the new total`() {
        val session = Session()
        session.events(Lines.init())
        session.turn("c1")
        session.events(Lines.result("c1", cost = 0.01))
        val turns = session.conversation.turns
        val transcript = session.transcript
        // One the CLI sends after its turn closed: core adds it to the total and to nothing else.
        session.events(Lines.result("c1", cost = 0.02))
        assertSame(turns, session.conversation.turns, "the turns are the same list, so only the total can tell")
        assertSame(transcript, session.transcript, "and so is the transcript")
        assertEquals(JsonNumber("0.02"), session.thread.at("usage")["costUsd"])
    }

    @Test
    fun `a notice shows with its kind and the request it answers, and the next notice is added after it`() {
        val session = Session()
        assertNull(session.thread["notices"], "none while there is none")
        session.events(Lines.controlError("req-9", "mode not allowed"))
        val first = session.thread.at("notices", "byId", "notice-1")
        assertEquals(setOf("id", "kind", "text", "requestId"), first.keys)
        assertEquals("control-error", first.str("kind"))
        assertEquals("mode not allowed", first.str("text"))
        assertEquals("req-9", first.str("requestId"))
        session.events(Lines.controlError("req-10", "model unknown"))
        val notices = session.thread.collection("notices")
        assertEquals(listOf("notice-1", "notice-2"), session.thread.keysOf("notices"))
        assertEquals("req-10", notices.at("byId", "notice-2").str("requestId"))
        assertEquals(first, notices.at("byId", "notice-1"), "the first is as it was")
    }

    @Test
    fun `a failed result raises an error notice without a request`() {
        val session = Session()
        session.turn("c1")
        session.events(Lines.result("c1", isError = true, text = "API Error: 529"))
        val notice = session.thread.at("notices", "byId", "notice-1")
        assertEquals("error", notice.str("kind"))
        assertEquals("API Error: 529", notice.str("text"))
        assertNull(notice["requestId"])
    }

    @Test
    fun `a task shows what started it and how it stands, and the tool call has the same key`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("agent", "Agent")),
            Lines.taskStarted("task-1", "agent", background = true),
        )
        val running = session.thread.at("tasks", "byId", "task-1")
        assertEquals(
            setOf("id", "toolCallId", "background", "status"),
            running.keys.filterTo(HashSet()) {
                it !=
                    "agentType"
            },
        )
        assertEquals("agent", running.str("toolCallId"))
        assertEquals(JsonBool.TRUE, running["background"])
        assertEquals("running", running.str("status"))
        // The key names a part: the tool call is there under it.
        assertEquals(
            "agent",
            session.thread
                .message("c1")
                .part("agent")
                .str("toolCallId"),
        )
        session.events(Lines.taskNotification("task-1", "agent", "completed"))
        assertEquals("complete", session.thread.at("tasks", "byId", "task-1").str("status"))
        assertEquals(listOf("task-1"), session.thread.keysOf("tasks"))
    }

    @Test
    fun `a task that failed is incomplete, with the reason core kept`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("agent", "Agent")),
            Lines.taskStarted("task-1", "agent"),
            Lines.taskNotification("task-1", "agent", "failed"),
        )
        val task = session.thread.at("tasks", "byId", "task-1")
        assertEquals("incomplete", task.str("status"))
        assertEquals(JsonBool.FALSE, task["background"])
        assertEquals(
            session.conversation.tasks
                .single()
                .incompleteReason,
            task.str("reason"),
        )
    }
}
