package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.RawJson
import dev.ukitomato.closta.presenter.at
import dev.ukitomato.closta.presenter.keysOf
import dev.ukitomato.closta.presenter.message
import dev.ukitomato.closta.presenter.part
import dev.ukitomato.closta.presenter.status
import dev.ukitomato.closta.presenter.str
import dev.ukitomato.closta.presenter.toolCalls
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** Approvals and questions sit on the tool call they gate; one that has none gets a part made for it. */
class ApprovalProjectionTest {
    private val options = """[{"label":"A","description":"first"},{"label":"B"},{"x":1}]"""
    private val ask = """{"questions":[{"question":"Which?","options":$options}]}"""

    private fun approvalOf(part: JsonObject): JsonObject = part.at("approval")

    @Test
    fun `an approval with no tool call named gets a part of its own at the end of the last assistant message`() {
        val session = Session()
        session.send("s1", "go")
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.text("I will write.")),
            Lines.request("r1", "Write", null, """{"file_path":"/x"}"""),
        )
        val turn = session.thread.message("c1")
        assertEquals(listOf("m1:0", "approval:r1"), turn.keysOf("parts"))
        val derived = turn.part("approval:r1")
        assertEquals("tool-call", derived.str("type"))
        assertEquals("approval:r1", derived.str("toolCallId"))
        assertEquals("Write", derived.str("toolName"))
        assertEquals(JsonObject.of("file_path" to JsonString("/x")), derived["args"])
        assertEquals("""{"file_path":"/x"}""", derived.str("argsText"))
        assertEquals("requires-action/interrupt", derived.status())
        assertEquals("requires-action/interrupt", turn.status())
        assertEquals(setOf("id", "display", "input"), approvalOf(derived).keys)

        session.decide(ApprovalDecision.Deny("r1"))
        assertEquals(JsonBool.FALSE, approvalOf(session.thread.message("c1").part("approval:r1"))["approved"])
        assertEquals("running", session.thread.message("c1").status())
        session.events(Lines.result("c1"))
        assertEquals(
            "incomplete/cancelled",
            session.thread
                .message("c1")
                .part("approval:r1")
                .status(),
            "its turn ended without the call",
        )
    }

    @Test
    fun `an approval that arrives before its tool call moves onto the call when the call shows up`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.text("Writing.")),
            Lines.request("r1", "Write", "toolu_1", """{"file_path":"/x"}"""),
        )
        val derived = session.thread.message("c1").part("toolu_1")
        assertEquals("Write", derived.str("toolName"))
        assertEquals("r1", approvalOf(derived).str("id"))
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_1", "Write", """{"file_path":"/x","content":"hi"}""")),
        )
        val turn = session.thread.message("c1")
        assertEquals(listOf("m1:0", "toolu_1"), turn.keysOf("parts"), "one part for the call, where the call is")
        val real = turn.part("toolu_1")
        assertEquals("r1", approvalOf(real).str("id"))
        assertEquals(JsonString("hi"), real.at("args")["content"])
        assertEquals("requires-action/interrupt", real.status())
    }

    @Test
    fun `an approval before any assistant message gets a message of its own until one arrives`() {
        val session = Session()
        session.send("s1", "go")
        session.events(Lines.request("r1", "Bash", null))
        assertEquals(listOf("s1", "approval:r1"), session.thread.keysOf("messages"))
        val own = session.thread.message("approval:r1")
        assertEquals("assistant", own.str("role"))
        assertEquals("requires-action/interrupt", own.status())
        assertEquals("Bash", toolCalls(own).values.single().str("toolName"))
        session.decide(ApprovalDecision.Allow("r1"))
        assertEquals("complete/unknown", session.thread.message("approval:r1").status())
        session.turn("c1")
        assertEquals(listOf("s1", "c1"), session.thread.keysOf("messages"))
        assertEquals(listOf("approval:r1"), session.thread.message("c1").keysOf("parts"))
    }

    @Test
    fun `a request without a tool name shows an unknown tool`() {
        val session = Session()
        session.turn("c1")
        session.input(
            PresenterInput.Event(
                AgentEvent.ControlRequest("r1", RawJson("not json")),
            ),
        )
        val derived = session.thread.message("c1").part("approval:r1")
        assertEquals("unknown", derived.str("toolName"))
        assertEquals(JsonObject.EMPTY, derived["args"])
        assertEquals("not json", derived.str("argsText"), "the request as it came, the only account of the call")
        assertEquals(
            "requires-action/interrupt",
            derived.status(),
            "an unreadable request is still one the CLI waits on",
        )
    }

    @Test
    fun `two requests for one missing call make one part, showing the latest`() {
        val session = Session()
        session.turn("c1")
        session.events(Lines.assistant("m1", Lines.text("x")), Lines.request("r1", "Bash", "toolu_9"))
        session.decide(ApprovalDecision.Allow("r1"))
        session.events(Lines.request("r2", "Bash", "toolu_9"))
        val turn = session.thread.message("c1")
        assertEquals(listOf("m1:0", "toolu_9"), turn.keysOf("parts"))
        assertEquals("r2", approvalOf(turn.part("toolu_9")).str("id"))
    }

    @Test
    fun `a call asked twice shows the latest request`() {
        val session = Session()
        session.turn("c1")
        session.events(Lines.assistant("m1", Lines.toolUse("toolu_1", "Bash")), Lines.request("r1", "Bash", "toolu_1"))
        session.decide(ApprovalDecision.Deny("r1"))
        session.events(Lines.request("r2", "Bash", "toolu_1"))
        val call = session.thread.message("c1").part("toolu_1")
        assertEquals("r2", approvalOf(call).str("id"))
        assertEquals("requires-action/interrupt", call.status())
    }

    @Test
    fun `a derived part goes to the last assistant message, not an earlier turn's`() {
        val session = Session()
        session.send("s1", "one")
        session.turn("c1")
        session.events(Lines.assistant("m1", Lines.text("first")), Lines.result("c1"))
        session.send("s2", "two")
        session.turn("c2")
        session.events(Lines.request("r1", "Bash", null))
        assertEquals(listOf("m1:0"), session.thread.message("c1").keysOf("parts"))
        assertEquals(listOf("approval:r1"), session.thread.message("c2").keysOf("parts"))
    }

    @Test
    fun `a failed resume result discards a pending approval while the turn goes on`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_1", "Write")),
            Lines.request("r1", "Write", "toolu_1"),
        )
        val before = session.transcript
        session.events(Lines.result(null, isError = true, text = "boom"))
        assertTrue(
            session.transcript === before,
            "the transcript has nothing to do with it; only core's pending changed",
        )
        val call = session.thread.message("c1").part("toolu_1")
        assertEquals("cancelled", approvalOf(call).str("resolution"))
        assertEquals("running", call.status(), "its turn is still open")
        assertEquals("running", session.thread.message("c1").status())
    }

    @Test
    fun `a call asked twice shows the request still waiting over a later one already answered`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_1", "Bash")),
            Lines.request("r1", "Bash", "toolu_1"),
            Lines.request("r2", "Bash", "toolu_1"),
        )
        assertEquals("r2", approvalOf(session.thread.message("c1").part("toolu_1")).str("id"), "both wait: the latest")
        session.decide(ApprovalDecision.Allow("r2"))
        val call = session.thread.message("c1").part("toolu_1")
        assertEquals("r1", approvalOf(call).str("id"), "the one still waiting")
        assertEquals("requires-action/interrupt", call.status())
        session.decide(ApprovalDecision.Allow("r1"))
        assertEquals("r2", approvalOf(session.thread.message("c1").part("toolu_1")).str("id"), "none waits: the latest")
    }

    @Test
    fun `a derived part stays in the message its request arrived in`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.text("first")),
            Lines.request("r1", "Bash", null),
            Lines.result("c1"),
        )
        session.send("s2", "two")
        session.turn("c2")
        session.events(Lines.assistant("m2", Lines.text("second")))
        assertEquals(listOf("m1:0", "approval:r1"), session.thread.message("c1").keysOf("parts"))
        assertEquals(listOf("m2:0"), session.thread.message("c2").keysOf("parts"))
    }

    @Test
    fun `a request that arrived before any assistant message goes to the last one once there are some`() {
        val session = Session()
        session.send("s1", "go")
        session.events(Lines.request("r1", "Bash", null))
        session.turn("c1")
        session.events(Lines.assistant("m1", Lines.text("first")), Lines.result("c1"))
        session.send("s2", "two")
        session.turn("c2")
        assertEquals(listOf("m1:0"), session.thread.message("c1").keysOf("parts"))
        assertEquals(listOf("approval:r1"), session.thread.message("c2").keysOf("parts"))
    }

    @Test
    fun `an approval-only message keeps its node while nothing it shows changes`() {
        val session = Session()
        session.send("s1", "go")
        session.events(Lines.request("r1", "Bash", null))
        val before = session.thread.message("approval:r1")
        session.events(Lines.queued("c1"))
        assertTrue(before === session.thread.message("approval:r1"), "core's turns changed, the message did not")
    }

    @Test
    fun `an answer after the CLI stopped waiting changes nothing`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_1", "Write")),
            Lines.request("r1", "Write", "toolu_1"),
            Lines.result("c1"),
        )
        val before = session.transcript
        session.decide(ApprovalDecision.Allow("r1"))
        assertTrue(session.transcript === before)
        assertEquals("cancelled", approvalOf(session.thread.message("c1").part("toolu_1")).str("resolution"))
    }

    @Test
    fun `a request asked again while core holds it shows what it asks now`() {
        val session = Session()
        session.turn("c1")
        val which = """{"questions":[{"question":"Which?","options":[{"label":"A"}]}]}"""
        val whichOne = """{"questions":[{"question":"Which one?","options":[{"label":"A"}]}]}"""
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_q", "AskUserQuestion")),
            Lines.request("r1", "AskUserQuestion", "toolu_q", which),
        )
        val held = session.conversation.pendingApprovals
        session.events(Lines.request("r1", "AskUserQuestion", "toolu_q", whichOne))
        assertTrue(held === session.conversation.pendingApprovals, "core did not enqueue it again")
        assertEquals("Which one?", approvalOf(session.thread.message("c1").part("toolu_q")).str("prompt"))
    }

    @Test
    fun `an approval-only message shows the request discarded when a failed result releases it`() {
        val session = Session()
        session.send("s1", "go")
        session.events(Lines.request("r1", "Bash", null))
        assertEquals("requires-action/interrupt", session.thread.message("approval:r1").status())
        val before = session.transcript
        session.events(Lines.result(null, isError = true, text = "boom"))
        assertTrue(session.transcript === before, "only core's pending changed")
        val own = session.thread.message("approval:r1")
        assertEquals("complete/unknown", own.status())
        assertEquals("cancelled", approvalOf(own.part("approval:r1")).str("resolution"))
    }

    @Test
    fun `a pending request the tree cannot show does not keep the thread running`() {
        val session = Session()
        session.events(Lines.request("", "Bash", null))
        assertEquals(1, session.conversation.pendingApprovals.size, "core holds it")
        assertEquals(emptyList<String>(), session.thread.keysOf("messages"))
        assertEquals(JsonBool.FALSE, session.thread["isRunning"])
    }

    @Test
    fun `an approval the turn's result discarded shows as cancelled`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_1", "Write")),
            Lines.request("r1", "Write", "toolu_1"),
        )
        session.events(Lines.result("c1", isError = true, text = "interrupted"))
        val call = session.thread.message("c1").part("toolu_1")
        assertEquals("cancelled", approvalOf(call).str("resolution"))
        assertNull(approvalOf(call)["approved"])
        assertEquals("incomplete/cancelled", call.status(), "its turn ended and it never ran")
        assertEquals("incomplete/error", session.thread.message("c1").status())
    }

    @Test
    fun `a question shows its first question's prompt and every option with a label`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_q", "AskUserQuestion", ask)),
            Lines.request("r1", "AskUserQuestion", "toolu_q", ask),
        )
        val approval = approvalOf(session.thread.message("c1").part("toolu_q"))
        assertEquals("select", approval.str("display"))
        assertEquals("Which?", approval.str("prompt"))
        assertEquals(
            listOf(
                JsonObject.of(
                    "id" to JsonString("A"),
                    "kind" to JsonString("answer"),
                    "label" to JsonString("A"),
                    "description" to JsonString("first"),
                ),
                JsonObject.of("id" to JsonString("B"), "kind" to JsonString("answer"), "label" to JsonString("B")),
            ),
            (approval["options"] as JsonArray).items,
        )
    }

    @Test
    fun `a question whose request does not say what it asks reads it from its tool call`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_q", "AskUserQuestion", ask)),
            Lines.request("r1", "AskUserQuestion", "toolu_q"),
        )
        val approval = approvalOf(session.thread.message("c1").part("toolu_q"))
        assertEquals("select", approval.str("display"))
        assertEquals("Which?", approval.str("prompt"))
        assertEquals(listOf("A", "B"), (approval["options"] as JsonArray).items.map { (it as JsonObject).str("id") })
    }

    @Test
    fun `a question with no options to read anywhere shows as a decision with its text, and still settles as one`() {
        val session = Session()
        session.turn("c1")
        val noOptions = """{"questions":[{"question":"Which?","options":[{"x":1}]}]}"""
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_q", "AskUserQuestion", noOptions)),
            Lines.request("r1", "AskUserQuestion", "toolu_q", noOptions),
        )
        val approval = approvalOf(session.thread.message("c1").part("toolu_q"))
        assertEquals(
            mapOf("id" to JsonString("r1"), "display" to JsonString("decision"), "prompt" to JsonString("Which?")),
            approval.entries.filter { it.key !in setOf("input", "questions") }.associate { it.key to it.value },
        )
        // The question is still listed, with the options it has: none.
        val listed = (approval["questions"] as JsonArray).items.single() as JsonObject
        assertEquals(JsonString("q1"), listed["id"])
        assertEquals(JsonArray.EMPTY, listed["options"])
        session.decide(ApprovalDecision.Allow("r1"), elapsedMs = 0)
        assertEquals(
            "cancelled",
            approvalOf(session.thread.message("c1").part("toolu_q")).str("resolution"),
            "an immediate allow of a question is no answer",
        )
    }

    @Test
    fun `options that share a label get ids of their own`() {
        val session = Session()
        session.turn("c1")
        val labels = """[{"label":"A"},{"label":"A","description":"again"},{"label":"A"},{"label":"A~2"}]"""
        val shared = """{"questions":[{"question":"Which?","options":$labels}]}"""
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_q", "AskUserQuestion", shared)),
            Lines.request("r1", "AskUserQuestion", "toolu_q", shared),
        )
        val options =
            (approvalOf(session.thread.message("c1").part("toolu_q"))["options"] as JsonArray).items.map {
                it as JsonObject
            }
        assertEquals(listOf("A", "A~2", "A~3", "A~2~2"), options.map { it.str("id") })
        assertEquals(listOf("A", "A", "A", "A~2"), options.map { it.str("label") })
    }

    @Test
    fun `the host's answer shows as the approval mapping says`() {
        fun outcome(
            tool: String,
            decision: (String) -> ApprovalDecision,
            elapsedMs: Long,
        ): Pair<String, String?> {
            val session = Session()
            session.turn("c1")
            session.events(Lines.assistant("m1", Lines.toolUse("toolu_1", tool)), Lines.request("r1", tool, "toolu_1"))
            session.decide(decision("r1"), elapsedMs)
            val approval = approvalOf(session.thread.message("c1").part("toolu_1"))
            return (approval["approved"]?.let { (it as JsonBool).value.toString() } ?: "-") to
                approval.str("resolution")
        }
        val allow = { id: String -> ApprovalDecision.Allow(id) }
        val deny = { id: String -> ApprovalDecision.Deny(id) }
        val answered = { id: String -> ApprovalDecision.Answered(id) }
        val afk = { id: String -> ApprovalDecision.AfkTimeout(id) }
        assertEquals("true" to null, outcome("Write", allow, 0))
        assertEquals("true" to null, outcome("Write", allow, 5_000))
        assertEquals("false" to null, outcome("Write", deny, 5_000))
        assertEquals("true" to null, outcome("Write", answered, 5_000))
        assertEquals("-" to "expired", outcome("Write", afk, 5_000))
        assertEquals("-" to "cancelled", outcome("AskUserQuestion", allow, 0))
        assertEquals(
            "-" to "cancelled",
            outcome("AskUserQuestion", allow, 5_000),
            "held or not, an allow without answers is no answer",
        )
        assertEquals("false" to null, outcome("AskUserQuestion", deny, 0))
        assertEquals("true" to null, outcome("AskUserQuestion", answered, 0))
        assertEquals("-" to "expired", outcome("AskUserQuestion", afk, 5_000))
    }

    @Test
    fun `an answer to a request nobody asked changes nothing`() {
        val session = Session()
        session.turn("c1")
        val before = session.transcript
        session.decide(ApprovalDecision.Allow("nobody"))
        assertEquals(before, session.transcript)
    }

    @Test
    fun `an approval waiting on a sub-agent's call makes its turn wait too`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("agent", "Agent")),
            Lines.taskStarted("task-1", "agent"),
            Lines.assistant("m2", Lines.toolUse("write", "Write"), parent = "agent"),
            Lines.request("r1", "Write", "write", agentId = "task-1"),
        )
        val turn = session.thread.message("c1")
        assertEquals("requires-action/interrupt", turn.status())
        assertEquals("running", turn.part("agent").status())
        assertEquals(
            "requires-action/interrupt",
            turn
                .part("agent")
                .message("m2")
                .part("write")
                .status(),
        )
    }

    private fun JsonObject.items(key: String): List<JsonObject> =
        (this[key] as JsonArray).items.map { it as JsonObject }

    @Test
    fun `the CLI's suggestions show by kind, detail and destination, each with the id of its place`() {
        val session = Session()
        session.turn("c1")
        val offered =
            """[{"type":"setMode","mode":"acceptEdits","destination":"session"},""" +
                """{"kind":"no type here"},""" +
                """{"type":"addDirectories","directories":["/a","/b"],"destination":"projectSettings"},""" +
                """{"type":"addRules","rules":[{"toolName":"Bash"}]}]"""
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_1", "Write", """{"file_path":"/x"}""")),
            Lines.request("r1", "Write", "toolu_1", """{"file_path":"/x"}""", suggestions = offered),
        )
        val approval = approvalOf(session.thread.message("c1").part("toolu_1"))
        val suggestions = approval.items("suggestions")
        assertEquals(listOf("s1", "s3", "s4"), suggestions.map { it.str("id") }, "ids by place in the CLI's list")
        assertEquals(listOf("setMode", "addDirectories", "addRules"), suggestions.map { it.str("kind") })
        assertEquals(listOf("acceptEdits", "/a\n/b", ""), suggestions.map { it.str("detail") })
        assertEquals(listOf("session", "projectSettings", null), suggestions.map { it.str("destination") })
        assertEquals(setOf("id", "kind", "detail"), suggestions.last().keys, "no destination when the CLI gave none")
        assertEquals(JsonObject.of("file_path" to JsonString("/x")), approval["input"])
    }

    @Test
    fun `a request without suggestions or with an input that is not an object shows neither`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_1", "Bash")),
            Lines.request("r1", "Bash", "toolu_1", "[1,2]"),
        )
        val approval = approvalOf(session.thread.message("c1").part("toolu_1"))
        assertNull(approval["suggestions"])
        assertNull(approval["input"])
    }

    @Test
    fun `two questions are both listed with their own ids, and the first is still the prompt and options`() {
        val session = Session()
        session.turn("c1")
        val two =
            """{"questions":[""" +
                """{"question":"A or B?","multiSelect":false,""" +
                """"options":[{"label":"A","description":"first"},{"label":"B"}]},""" +
                """{"question":"X or Y?","multiSelect":true,"options":[{"label":"X"},{"label":"X"}]}]}"""
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_q", "AskUserQuestion", two)),
            Lines.request("r1", "AskUserQuestion", "toolu_q", two),
        )
        val approval = approvalOf(session.thread.message("c1").part("toolu_q"))
        assertEquals("A or B?", approval.str("prompt"))
        assertEquals(listOf("A", "B"), approval.items("options").map { it.str("id") })
        val questions = approval.items("questions")
        assertEquals(listOf("q1", "q2"), questions.map { it.str("id") })
        assertEquals(listOf("A or B?", "X or Y?"), questions.map { it.str("prompt") })
        assertEquals(listOf(JsonBool.FALSE, JsonBool.TRUE), questions.map { it["multiSelect"] })
        assertEquals(listOf("A", "B"), questions[0].items("options").map { it.str("id") })
        assertEquals("first", questions[0].items("options")[0].str("description"))
        assertEquals(listOf("X", "X~2"), questions[1].items("options").map { it.str("id") }, "unique within a question")
        assertEquals(setOf("id", "label"), questions[0].items("options")[1].keys)
    }

    @Test
    fun `the questions come from the call's own input when the request names none`() {
        val session = Session()
        session.turn("c1")
        val two =
            """{"questions":[{"question":"One?","options":[{"label":"A"}]},""" +
                """{"question":"Two?","options":[{"label":"B"}]}]}"""
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_q", "AskUserQuestion", two)),
            Lines.request("r1", "AskUserQuestion", "toolu_q"),
        )
        val approval = approvalOf(session.thread.message("c1").part("toolu_q"))
        assertEquals(listOf("q1", "q2"), approval.items("questions").map { it.str("id") })
        assertEquals("One?", approval.str("prompt"))
    }

    @Test
    fun `an approval that is not a question has no questions`() {
        val session = Session()
        session.turn("c1")
        session.events(
            Lines.assistant("m1", Lines.toolUse("toolu_1", "Bash")),
            Lines.request("r1", "Bash", "toolu_1", ask),
        )
        assertNull(approvalOf(session.thread.message("c1").part("toolu_1"))["questions"])
    }
}
