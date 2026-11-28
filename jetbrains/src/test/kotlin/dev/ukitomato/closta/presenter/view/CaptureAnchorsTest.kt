package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.at
import dev.ukitomato.closta.presenter.entries
import dev.ukitomato.closta.presenter.keysOf
import dev.ukitomato.closta.presenter.message
import dev.ukitomato.closta.presenter.messages
import dev.ukitomato.closta.presenter.part
import dev.ukitomato.closta.presenter.parts
import dev.ukitomato.closta.presenter.status
import dev.ukitomato.closta.presenter.str
import dev.ukitomato.closta.presenter.toolCalls
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText
import dev.ukitomato.closta.presenter.tree.JsonValue
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/**
 * What the projected captures must show, asserted value by value from what the captures and the recorder's
 * scenarios say happened — independently of the goldens, which only pin what the projection made. Ids and
 * texts are read off the `.ndjson` files and `recorder/scenarios.mjs`.
 */
class CaptureAnchorsTest {
    private fun thread(scenario: String) = CaptureReplay.finalTree(scenario).at("threads", "byId", CaptureReplay.THREAD)

    private fun keys(thread: JsonObject) = thread.keysOf("messages")

    @TestFactory
    fun `no capture leaves the thread running, but for the known gaps`(): List<DynamicTest> =
        CaptureReplay.scenarios().map { scenario ->
            DynamicTest.dynamicTest(scenario) {
                // A known gap still shows; anywhere else the thread ends at rest.
                val expected = if (scenario in STILL_RUNNING) JsonBool.TRUE else JsonBool.FALSE
                assertEquals(expected, thread(scenario)["isRunning"])
            }
        }

    @Test
    fun `01 one user message and one assistant message holding the answer`() {
        val thread = thread("01-baseline-text")
        assertEquals(listOf("send-1", "2936960e-01f3-4830-8964-67a2a1bc6cf6"), keys(thread))
        val user = thread.message("send-1")
        assertEquals("user", user.str("role"))
        assertNull(user["status"])
        assertEquals(listOf("Respond with exactly one word: pong"), user.parts().map { it.str("text") })
        val answer = thread.message("2936960e-01f3-4830-8964-67a2a1bc6cf6")
        assertEquals("assistant", answer.str("role"))
        assertEquals("complete/stop", answer.status())
        assertEquals(listOf("text" to "pong"), answer.parts().map { it.str("type") to it.str("text") })
        assertEquals("complete", answer.parts().single().status())
    }

    @Test
    fun `01 while the answer streams, its part and message run and so does the thread`() {
        val steps = CaptureReplay.replay("01-baseline-text")
        val streaming =
            steps.first { step ->
                val thread = step.tree.at("threads", "byId", CaptureReplay.THREAD)
                keys(thread).size == 2 &&
                    // 2.1.325 streams the answer as one delta; the part still runs until its content_block_stop.
                    thread.message("2936960e-01f3-4830-8964-67a2a1bc6cf6").parts().any { it.str("text") == "pong" }
            }
        val thread = streaming.tree.at("threads", "byId", CaptureReplay.THREAD)
        val answer = thread.message("2936960e-01f3-4830-8964-67a2a1bc6cf6")
        assertEquals("running", answer.status())
        assertEquals("running", answer.parts().single().status())
        assertEquals(JsonBool.TRUE, thread["isRunning"])
    }

    @Test
    fun `02 the Bash call carries its input, its result and is complete`() {
        val turn = thread("02-tool-bash-autorun").message("1733e09b-a794-4e74-b264-4e8c1feac07a")
        assertEquals(listOf("tool-call", "text"), turn.parts().map { it.str("type") })
        val bash = turn.part("toolu_01X34nTfhCcSEMxmUMvxUR78")
        assertEquals("Bash", bash.str("toolName"))
        assertEquals("echo hello-from-capture", bash.at("args").str("command"))
        assertEquals(JsonString("hello-from-capture"), bash["result"])
        assertEquals(JsonBool.FALSE, bash["isError"])
        assertEquals("complete", bash.status())
        assertEquals("complete/stop", turn.status())
    }

    @Test
    fun `23 each user message holds its file ahead of its words, said by name, kind, type and size and by no byte`() {
        val thread = thread("23-attachments")
        val users = keys(thread).filter { thread.message(it).str("role") == "user" }
        assertEquals(listOf("send-1", "send-2"), users)
        val picture = thread.message("send-1").parts()
        assertEquals(listOf("attachment", "text"), picture.map { it.str("type") })
        assertEquals(
            listOf("attachment-1", "image", "image/png", JsonNumber.of(73)),
            listOf("name", "kind", "mediaType").map { picture[0].str(it) } + picture[0]["size"],
        )
        val pdf = thread.message("send-2").parts()
        assertEquals(listOf("attachment", "text"), pdf.map { it.str("type") })
        assertEquals(listOf("document", "application/pdf"), listOf("kind", "mediaType").map { pdf[0].str(it) })
        // The size is the file's, as the recorder's stdin line carried it; nothing else of the file is in the tree.
        assertEquals(setOf("type", "name", "kind", "mediaType", "size"), pdf[0].keys)
        assertTrue(
            JsonText.compact(thread).let {
                "iVBORw0KGgo" !in it && "JVBERi0" !in it
            },
            "no byte of a file, in base64, is in the tree",
        )
        assertEquals(
            listOf("Red", "KIWI"),
            keys(thread).filter { it !in users }.map {
                thread
                    .message(it)
                    .parts()
                    .single { p ->
                        p.str("type") ==
                            "text"
                    }.str("text")
            },
        )
    }

    @Test
    fun `04 the Bash call allowed in advance ran without an approval`() {
        val bash = toolCalls(thread("04-tool-autorun-with-ppt-stdio")).getValue("toolu_01LbRow5QYDQFGytVgTwRfuE")
        assertEquals(JsonString("should-be-denied"), bash["result"])
        assertNull(bash["approval"])
    }

    @Test
    fun `05 the Write call carries its approval, approved, and the result`() {
        val write = toolCalls(thread("05-permission-can-use-tool")).getValue("toolu_01S2wEQGaruCBtQJHkwEwrxu")
        assertEquals("Write", write.str("toolName"))
        val approval = write.at("approval")
        assertEquals("e42c7fac-e237-4ee9-a6c1-d19579abb0f3", approval.str("id"))
        assertEquals("decision", approval.str("display"))
        assertEquals(JsonBool.TRUE, approval["approved"])
        assertNull(approval["resolution"])
        assertTrue(write.str("result")!!.startsWith("File created successfully at: "))
        assertEquals("complete", write.status())
    }

    @Test
    fun `05 while the approval waits, the call and its message wait for the user`() {
        val waiting = treeAfterRequest("05-permission-can-use-tool")
        val thread = waiting.at("threads", "byId", CaptureReplay.THREAD)
        val turn = thread.message("c810a2d1-b8af-4673-9506-fd49f92285c4")
        assertEquals("requires-action/interrupt", turn.status())
        val write = turn.part("toolu_01S2wEQGaruCBtQJHkwEwrxu")
        assertEquals("requires-action/interrupt", write.status())
        assertEquals(setOf("id", "display", "input", "suggestions"), write.at("approval").keys)
        assertEquals(JsonBool.TRUE, thread["isRunning"])
    }

    @Test
    fun `24 no message, the list the CLI last gave, four switches in order and the unknown name's notice`() {
        val thread = thread("24-mcp-management")
        assertEquals(emptyList<String>(), keys(thread))
        val servers = (thread["mcpServers"] as JsonArray).items.map { it as JsonObject }
        assertEquals(1, servers.size)
        assertEquals(
            listOf("fake-echo", "connected", "dynamic"),
            listOf("name", "status", "source").map { servers.single().str(it) },
        )
        assertEquals(JsonBool.FALSE, servers.single()["builtIn"])
        assertEquals(listOf("echo"), (servers.single()["tools"] as JsonArray).items.map { (it as JsonString).value })
        assertNull(servers.single()["error"])
        assertNull(thread["mcpServersUnreadable"])
        val switches = (thread["switches"] as JsonArray).items.map { it as JsonObject }
        // The newest first: the unknown name's refusal, then the reconnect, the turn on and the turn off.
        assertEquals(
            listOf(
                "mcp-disable" to "rejected",
                "mcp-reconnect" to "applied",
                "mcp-enable" to "applied",
                "mcp-disable" to "applied",
            ),
            switches.map { it.str("kind") to it.str("outcome") },
        )
        assertEquals("Server not found: no-such-server", switches.first().str("detail"))
        assertEquals(
            listOf("Server not found: no-such-server"),
            thread.entries("notices").map { it.str("text") },
        )
    }

    @TestFactory
    fun `06 and 07 send nothing, so the thread stays empty`(): List<DynamicTest> =
        listOf("06-context-usage", "07-set-model-and-mode").map { scenario ->
            DynamicTest.dynamicTest(scenario) { assertEquals(emptyList<String>(), keys(thread(scenario))) }
        }

    @Test
    fun `08 the Agent call nests the sub-agent's prompt and its Read call with the result`() {
        val agent =
            thread(
                "08-subagent-task",
            ).message("af32f5b7-baa9-4f58-9196-5136eec2573d").part("toolu_01S4aVxTAg6iR87daCuzkwZQ")
        assertEquals("Agent", agent.str("toolName"))
        assertEquals("complete", agent.status())
        assertEquals(
            listOf("1121d477-e599-43de-941d-542c6139a2c4", "msg_011CScrubbed7qAAAm1qY1rq"),
            agent.keysOf("messages"),
        )
        val prompt = agent.message("1121d477-e599-43de-941d-542c6139a2c4")
        assertEquals("user", prompt.str("role"))
        assertTrue(
            prompt
                .parts()
                .single()
                .str("text")!!
                .let { it.startsWith("Read the file ") && it.contains("/cwd/NOTES.md") },
        )
        val reply = agent.message("msg_011CScrubbed7qAAAm1qY1rq")
        assertEquals("assistant", reply.str("role"))
        assertNull(reply["status"], "a sub-agent's message has no status")
        val read = reply.part("toolu_011Yw3MDkf6a4P4rzGqAqbyP")
        assertEquals("Read", read.str("toolName"))
        assertTrue(read.str("result")!!.startsWith("1\t# NOTES"))
        assertTrue((agent["result"] as JsonArray).items.isNotEmpty(), "the hand-back is the Agent call's result")
    }

    @Test
    fun `08 while the sub-agent works, the Agent call runs`() {
        val steps = CaptureReplay.replay("08-subagent-task")
        val working = steps.first { (it.input as? PresenterInput.Event)?.event is AgentEvent.SystemTaskStarted }
        val agent = toolCalls(working.tree).getValue("toolu_01S4aVxTAg6iR87daCuzkwZQ")
        assertEquals("running", agent.status())
    }

    @TestFactory
    fun `no sub-agent's call shows as cut off before its result arrives`(): List<DynamicTest> =
        CaptureReplay.scenarios().map { scenario ->
            DynamicTest.dynamicTest(scenario) { assertNoCallCutOff(CaptureReplay.replay(scenario), scenario, null) }
        }

    @Test
    fun `19 under an older CLI, the call the interrupt killed shows cut off, and stays so after its result`() {
        // Lines an older CLI (2.1.282) sent; the current version makes no such call (see the test after this).
        val scenario = "19-interrupt-background"
        val steps = CaptureReplay.replay(scenario, file = CaptureFixtures.legacyExcerpt(scenario))
        // The interrupt killed the background agent and its Bash (task_updated killed at the excerpt's line 20,
        // task_notification stopped), so the call shows incomplete with no result until the rejection arrives at
        // line 28 as its result (an error) — it stays incomplete. How the tree should tell an interrupt from a
        // rejection is still open.
        assertNoCallCutOff(steps, scenario, Cut("toolu_01JQzJgds9jxAZS6KpB3yPYh", fromLine = 20))
    }

    @Test
    fun `19 the sub-agent's Bash the CLI blocked is complete with its error, and the killed Agent call is cut off`() {
        // 2.1.325 blocks the sub-agent's foreground `sleep 60 && …` before it runs, so the interrupt kills only the
        // agent: its call ends incomplete, and the Bash ends with the CLI's error as its result.
        val calls = toolCalls(thread("19-interrupt-background"))
        val agent = calls.getValue("toolu_01BiqomDJ1sVovYfssAzASCx")
        assertTrue(agent.status()!!.startsWith("incomplete"), agent.status())
        val bash = toolCalls(agent).getValue("toolu_01FAgiPzfH8134p6bKg7pKXJ")
        assertEquals("complete", bash.status())
        assertEquals(JsonBool.TRUE, bash["isError"])
    }

    private fun assertNoCallCutOff(
        steps: List<CaptureReplay.Step>,
        scenario: String,
        cut: Cut?,
    ) {
        var line = 0
        // A call the CLI refused on its own is shown refused (incomplete) from the refusal until its result comes:
        // it is not a call something cut off.
        val refused =
            steps
                .mapNotNull {
                    ((it.input as? PresenterInput.Event)?.event as? AgentEvent.SystemPermissionDenied)
                        ?.toolUseId
                }.toSet()
        for ((index, step) in steps.withIndex()) {
            if (step.input is PresenterInput.Event) line++
            val nested =
                toolCalls(step.tree).values.flatMap { call ->
                    (call["messages"] as? JsonObject)?.let { toolCalls(it).values }.orEmpty()
                }
            // The known gap is let through only from the capture's line where the interrupt took effect.
            val exempt = cut?.takeIf { line >= it.fromLine }?.callId
            for (call in nested.filter {
                it["result"] == null &&
                    it.str("toolCallId") != exempt &&
                    it.str("toolCallId") !in refused
            }) {
                assertFalse(
                    call.status()!!.startsWith("incomplete"),
                    "$scenario #$index: ${call.str("toolCallId")} is ${call.status()}",
                )
            }
        }
        // The known gap still shows: the call the interrupt killed ends incomplete.
        cut?.callId?.let { id ->
            val end = steps.last().tree
            val call =
                toolCalls(end)
                    .values
                    .flatMap { (it["messages"] as? JsonObject)?.let { inner -> toolCalls(inner).values }.orEmpty() }
                    .single { it.str("toolCallId") == id }
            assertTrue(call.status()!!.startsWith("incomplete"), "$scenario: $id is ${call.status()}")
        }
    }

    @Test
    fun `10 and 11 the sub-agent's second run shows its call running until the result`() {
        // 10: lines an older CLI (2.1.282) sent; the current version makes no second run in 10. 11 still has one.
        for ((scenario, read, file) in listOf(
            Triple(
                "10-background-task",
                "toolu_01TLAR4CsrnQ4L8vCyxGTJXg",
                CaptureFixtures.legacyExcerpt("10-background-task"),
            ),
            Triple("11-background-followup", "toolu_015a6ZhgFQhMA7NgEDjGokyi", "11-background-followup.ndjson"),
        )) {
            val seen =
                CaptureReplay
                    .replay(scenario, file = file)
                    .mapNotNull { toolCalls(it.tree)[read]?.status() }
                    .distinct()
            assertEquals(listOf("running", "complete"), seen, scenario)
        }
    }

    @Test
    fun `09 two Agent calls of one message each nest their own sub-agent`() {
        val calls = toolCalls(thread("09-parallel-subagents"))
        val first = calls.getValue("toolu_01E79HHrgMyadV8MCS46uqpP")
        val second = calls.getValue("toolu_013HREkWuoSa8wpsKe2fduA1")
        assertEquals(listOf("user", "assistant"), first.messages().map { it.str("role") })
        assertEquals(listOf("user", "assistant"), second.messages().map { it.str("role") })
        assertTrue(toolCalls(first).getValue("toolu_01VKkb2wZN3mNsdhYJMXgaAG").str("result")!!.startsWith("1\t# NOTES"))
        assertTrue(
            toolCalls(second).getValue("toolu_019BKjQdHjgkQak6Coft7SBJ").str("result")!!.startsWith("1\t# GUIDE"),
        )
        assertFalse(
            "toolu_019BKjQdHjgkQak6Coft7SBJ" in toolCalls(first),
            "each sub-agent's calls stay under its own call",
        )
    }

    @Test
    fun `10 one turn message, then a message the CLI said on its own`() {
        val thread = thread("10-background-task")
        assertEquals(
            listOf("send-1", "d4fed6c0-ab40-495c-9ef9-ef10a67ccae1", "msg_011CScrubbed4itd4JRxk33t"),
            keys(thread),
        )
        assertEquals(listOf("user", "assistant", "assistant"), thread.messages().map { it.str("role") })
        assertEquals(listOf(null, "complete/stop", "complete/stop"), thread.messages().map { it.status() })
        assertTrue(thread.message("msg_011CScrubbed4itd4JRxk33t").parts().any { it.str("text")!!.contains("bg-done") })
    }

    @Test
    fun `10 a resume runs the thread while it speaks, and the thread rests between`() {
        val steps = CaptureReplay.replay("10-background-task")
        val afterTurn = steps.indexOfFirst { (it.input as? PresenterInput.Event)?.event is AgentEvent.Result }
        assertEquals(JsonBool.FALSE, steps[afterTurn].tree.at("threads", "byId", CaptureReplay.THREAD)["isRunning"])
        val speaking =
            steps.first { step ->
                val thread = step.tree.at("threads", "byId", CaptureReplay.THREAD)
                "msg_011CScrubbed4itd4JRxk33t" in keys(thread)
            }
        val thread = speaking.tree.at("threads", "byId", CaptureReplay.THREAD)
        assertEquals(JsonBool.TRUE, thread["isRunning"])
        assertEquals("running", thread.message("msg_011CScrubbed4itd4JRxk33t").status())
    }

    @Test
    fun `11 two user turns, the second message where it was sent, then the resumes`() {
        val thread = thread("11-background-followup")
        assertEquals(
            listOf(
                "send-1",
                "137ae7e8-71d8-4325-b5d7-bf495b3391a3",
                "send-2",
                "e489ee2b-236d-4061-bfa3-d0ec69fa8fd2",
                "msg_011CScrubbedFYeqBLKGzXCB",
                "msg_011CScrubbedr1ANx1S2QoGc",
            ),
            keys(thread),
        )
        assertEquals(
            "While that runs: respond with exactly one character: 4 (what is 2+2)",
            thread
                .message("send-2")
                .parts()
                .single()
                .str("text"),
        )
        assertEquals(listOf("4"), thread.message("e489ee2b-236d-4061-bfa3-d0ec69fa8fd2").parts().map { it.str("text") })
        val blocked = toolCalls(thread).getValue("toolu_01X5tmhWyS8HbdJ4eDYH7bQo")
        assertEquals(JsonBool.TRUE, blocked["isError"])
    }

    @Test
    fun `11 between the second send and the CLI taking it, the thread runs`() {
        val steps = CaptureReplay.replay("11-background-followup")
        val sent = steps.single { (it.input as? PresenterInput.UserSent)?.messageId == "send-2" }
        assertEquals(JsonBool.TRUE, sent.tree.at("threads", "byId", CaptureReplay.THREAD)["isRunning"])
        val before = steps[steps.indexOf(sent) - 1]
        assertEquals(JsonBool.FALSE, before.tree.at("threads", "byId", CaptureReplay.THREAD)["isRunning"])
    }

    @Test
    fun `12 the sub-agent's Write call carries the approval, nested under the Agent call`() {
        val agent =
            thread(
                "12-subagent-permission",
            ).message("2214261d-c819-490e-ade3-07249b64d3f0").part("toolu_01Ugvt3iFFuXLnUxzD8HQaim")
        val write = agent.message("msg_011CScrubbedFy3MF3W4Zv3W").part("toolu_01EQdLNPPVwHuZQYn15Hjf5G")
        assertEquals("8ede2c03-477c-4eeb-8df6-49eb8b5e8eda", write.at("approval").str("id"))
        assertEquals(JsonBool.TRUE, write.at("approval")["approved"])
        assertNull(agent["approval"], "the approval sits on the call it gates, not on the Agent call")
    }

    @Test
    fun `12 while the sub-agent's approval waits, the turn waits for the user`() {
        val thread = treeAfterRequest("12-subagent-permission").at("threads", "byId", CaptureReplay.THREAD)
        val turn = thread.message("2214261d-c819-490e-ade3-07249b64d3f0")
        assertEquals("requires-action/interrupt", turn.status())
        val agent = turn.part("toolu_01Ugvt3iFFuXLnUxzD8HQaim")
        assertEquals("running", agent.status())
        assertEquals("requires-action/interrupt", toolCalls(agent).getValue("toolu_01EQdLNPPVwHuZQYn15Hjf5G").status())
    }

    private fun question(scenario: String): JsonObject {
        val calls = toolCalls(thread(scenario)).values.filter { it.str("toolName") == "AskUserQuestion" }
        return calls.single()
    }

    @Test
    fun `13 the question shows its prompt and options, and was cancelled unanswered`() {
        val ask = question("13-ask-timeout")
        val approval = ask.at("approval")
        assertEquals("83bc36d7-6561-4c72-b33f-019b65e4903e", approval.str("id"))
        assertEquals("select", approval.str("display"))
        assertEquals("AとBどちらがいいですか？", approval.str("prompt"))
        val options = (approval["options"] as JsonArray).items.map { it as JsonObject }
        assertEquals(listOf("A", "B"), options.map { it.str("id") })
        assertEquals(listOf("answer", "answer"), options.map { it.str("kind") })
        assertEquals(listOf("Aを選択します", "Bを選択します"), options.map { it.str("description") })
        assertEquals("cancelled", approval.str("resolution"))
        assertNull(approval["approved"])
        assertEquals(JsonString("The user did not answer the questions."), ask["result"])
    }

    @Test
    fun `14 the question was answered`() {
        val ask = question("14-ask-answers-updatedinput")
        assertEquals(JsonBool.TRUE, ask.at("approval")["approved"])
        assertNull(ask.at("approval")["resolution"])
        assertTrue(ask.str("result")!!.startsWith("Your questions have been answered"))
    }

    @Test
    fun `15 the away report is no answer, and the CLI answers it with an error`() {
        val ask = question("15-ask-afktimeout-updatedinput")
        assertEquals("cancelled", ask.at("approval").str("resolution"))
        assertNull(ask.at("approval")["approved"])
        // 2.1.325 answers the away report with this error rather than with the expiry.
        assertTrue(
            ask.str("result")!!.startsWith(
                "The app reported that nobody answered this question, but Claude Code did not accept the report",
            ),
            ask.str("result"),
        )
    }

    @Test
    fun `01 and 16 show the session the CLI started, the mode 16's status changed, and the total`() {
        val first = thread("01-baseline-text")
        assertEquals("claude-opus-5-5", first.at("session").str("model"))
        assertEquals("default", first.at("session").str("permissionMode"))
        assertEquals("2.1.325", first.at("session").str("version"))
        assertEquals(JsonNumber("0.12213600000000001"), first.at("usage")["costUsd"])
        val accepting = thread("16-permission-suggestion-accept")
        assertEquals("acceptEdits", accepting.at("session").str("permissionMode"), "its system/status said so")
        assertEquals(JsonNumber("0.1513491"), accepting.at("usage")["costUsd"])
    }

    @Test
    fun `03 offers its initialize commands with their sentences, and 01 those of its commands_changed`() {
        val detailed = (thread("03-initialize-handshake")["commands"] as JsonArray).items.map { it as JsonObject }
        assertEquals(59, detailed.size)
        val config = detailed.single { it.str("name") == "config" }
        assertEquals("Set a setting by key", config.str("description"))
        assertEquals("key=value", config.str("argumentHint"))
        assertTrue(detailed.all { it.str("description")!!.isNotEmpty() || it.str("name") != "config" })
        val names = (thread("01-baseline-text")["commands"] as JsonArray).items.map { it as JsonObject }
        assertEquals(59, names.size)
        val design = names.first()
        assertEquals("design", design.str("name"))
        assertEquals("Grant or revoke Claude agent access to your Design projects", design.str("description"))
        assertEquals("consent | revoke", design.str("argumentHint"))
    }

    @Test
    fun `03 offers the models of its initialize response, with the levels each takes, and 06 the context usage`() {
        val models = (thread("03-initialize-handshake")["models"] as JsonArray).items.map { it as JsonObject }
        assertEquals(
            listOf("default", "opus", "claude-opus-5", "sonnet"),
            models.take(4).map { it.str("value") },
        )
        assertEquals("claude-opus-5-5", models.first().str("resolvedModel"))
        assertEquals(JsonBool.TRUE, models.first()["supportsEffort"])
        assertEquals(4, (models.first()["supportedEffortLevels"] as JsonArray).items.size)
        assertNull(
            models.single { it.str("value") == "claude-haiku-4-5-20251001" }["supportsEffort"],
            "Haiku 4.5 takes no effort",
        )
        val context = thread("06-context-usage").at("context")
        assertEquals(JsonNumber("11645"), context["totalTokens"])
        assertEquals(JsonNumber("1000000"), context["maxTokens"])
        assertEquals(JsonNumber("1"), context["percentage"])
        assertEquals(JsonNumber("967000"), context["autoCompactThreshold"])
    }

    @Test
    fun `03 says the permission mode of its initialize response, and 19 the one it was started with`() {
        assertEquals("default", thread("03-initialize-handshake").str("startPermissionMode"))
        assertEquals("acceptEdits", thread("19-interrupt-background").str("startPermissionMode"))
    }

    @Test
    fun `28 says the effort and the model of the CLI's last settings, and keeps its effort switches`() {
        val thread = thread("28-effort-live")
        // The last settings, after effortLevel null, are the model's own default (high), not the start's medium.
        assertEquals("high", thread.str("effort"))
        assertEquals("claude-sonnet-4-6", thread.str("appliedModel"))
        val switches = (thread["switches"] as JsonArray).items.map { it as JsonObject }
        assertEquals(listOf("effort"), switches.map { it.str("kind") }.distinct())
        assertEquals(listOf("applied"), switches.map { it.str("outcome") }.distinct())
    }

    @TestFactory
    fun `every capture with an initialize response has its mode on the thread`(): List<DynamicTest> {
        val withInitialize = CaptureReplay.scenarios().filter { thread(it)["models"] != null }
        // Counted: were the filter to match none, no test would run and none would fail.
        assertEquals(38, withInitialize.size, "38 captures carry an initialize response")
        return withInitialize.map { scenario ->
            DynamicTest.dynamicTest(scenario) {
                // Every response carries the mode: 19 was started in acceptEdits, 29 in plan, 37 in auto, 44 in
                // dontAsk, the rest in default.
                val expected =
                    when (scenario) {
                        "19-interrupt-background" -> "acceptEdits"
                        "29-exit-plan-mode" -> "plan"
                        "37-plan-auto" -> "auto"
                        "44-permission-denied" -> "dontAsk"
                        else -> "default"
                    }
                assertEquals(expected, thread(scenario).str("startPermissionMode"))
            }
        }
    }

    @Test
    fun `07 lists the ten switches newest first with the refused one's sentence, 10 sums its tokens, 21 compacts`() {
        val switches = (thread("07-set-model-and-mode")["switches"] as JsonArray).items.map { it as JsonObject }
        assertEquals((10 downTo 1).map { JsonNumber(it.toString()) }, switches.map { it["seq"] })
        val refused = switches.single { it.str("outcome") == "rejected" }
        assertEquals("mode", refused.str("kind"))
        assertEquals("bypassPermissions", refused.str("value"))
        assertTrue(refused.str("detail")!!.startsWith("Cannot set permission mode to bypassPermissions"))
        val usage = thread("10-background-task").at("usage")
        assertEquals(JsonNumber("0.21946859999999999"), usage["costUsd"])
        assertEquals(JsonNumber("1519"), usage["outputTokens"], "the last result's, not 256 + 1519")
        val compaction = (thread("21-compact")["compactions"] as JsonArray).items.single() as JsonObject
        assertEquals("manual", compaction.str("trigger"))
        assertEquals(JsonNumber("21819"), compaction["preTokens"])
        assertEquals(JsonNumber("3447"), compaction["postTokens"])
        assertEquals(JsonBool.FALSE, thread("21-compact")["compacting"], "it ended")
        // While the CLI compacts the tree says so, and says it is over after (the key is always there).
        val flags =
            CaptureReplay.replay("21-compact").map { it.tree.at("threads", "byId", CaptureReplay.THREAD)["compacting"] }
        val runs =
            flags.fold(emptyList<JsonValue?>()) { seen, flag ->
                if (seen.lastOrNull() ==
                    flag
                ) {
                    seen
                } else {
                    seen + flag
                }
            }
        assertEquals(listOf(JsonBool.FALSE, JsonBool.TRUE, JsonBool.FALSE), runs)
    }

    @Test
    fun `07 has no init, so no session and no total, and one notice for the refused mode`() {
        val thread = thread("07-set-model-and-mode")
        assertNull(thread["session"])
        assertNull(thread["usage"])
        assertEquals(listOf("notice-1"), thread.keysOf("notices"))
        val notice = thread.at("notices", "byId", "notice-1")
        assertEquals("control-error", notice.str("kind"))
        assertEquals("07-set-model-and-mode-req-8", notice.str("requestId"))
        assertTrue(notice.str("text")!!.startsWith("Cannot set permission mode to bypassPermissions"))
    }

    @Test
    fun `08 and 10 show their tasks, the sub-agent's with the call that started it and 10's in the background`() {
        val sub = thread("08-subagent-task").at("tasks", "byId", "a592487ec976885dc")
        assertEquals("toolu_01S4aVxTAg6iR87daCuzkwZQ", sub.str("toolCallId"))
        assertEquals("Explore", sub.str("agentType"))
        assertEquals(JsonBool.FALSE, sub["background"])
        assertEquals("complete", sub.str("status"))
        val background = thread("10-background-task")
        // The sub-agent and its Bash in the background, then the sub-agent's own foreground Bash (`until grep`).
        assertEquals(listOf("a40aca0599667cba4", "b9eajvrtk", "bho6ze5ur"), background.keysOf("tasks"))
        assertEquals(
            listOf(JsonBool.TRUE, JsonBool.TRUE, JsonBool.FALSE),
            background.entries("tasks").map { it["background"] },
        )
    }

    @Test
    fun `16 offers its two suggestions, the first setting the mode, and 18 asks two questions`() {
        val call = toolCalls(thread("16-permission-suggestion-accept")).values.first { it.containsKey("approval") }
        val offered = (call.at("approval")["suggestions"] as JsonArray).items.map { it as JsonObject }
        assertEquals(listOf("s1", "s2"), offered.map { it.str("id") })
        assertEquals(listOf("setMode", "addDirectories"), offered.map { it.str("kind") })
        assertEquals("acceptEdits", offered[0].str("detail"))
        assertEquals(listOf("session", "session"), offered.map { it.str("destination") })
        val ask = question("18-ask-multi-question").at("approval")
        val questions = (ask["questions"] as JsonArray).items.map { it as JsonObject }
        assertEquals(listOf("q1", "q2"), questions.map { it.str("id") })
        assertEquals(listOf("AとBどちらがいいですか？", "XとYどちらにしますか？"), questions.map { it.str("prompt") })
        assertEquals("AとBどちらがいいですか？", ask.str("prompt"), "the first question is still the prompt")
        assertEquals(listOf("A", "B"), (ask["options"] as JsonArray).items.map { (it as JsonObject).str("id") })
    }

    @Test
    fun `16 shows the suggestions its answer passed on, and the captured answer alone shows none`() {
        val scenario = "16-permission-suggestion-accept"
        val captured = toolCalls(thread(scenario)).values.first { it.containsKey("approval") }.at("approval")
        assertNull(captured["acceptedSuggestions"], "the replayed answer carries only the decision")
        val answering =
            CaptureReplay.inputs(scenario).map { input ->
                if (input is PresenterInput.Decided) {
                    input.copy(
                        passedOn = PassedOn(acceptedSuggestions = listOf("s1", "s2")),
                    )
                } else {
                    input
                }
            }
        val state = answering.fold(HostState()) { host, input -> host.next(input) }
        val tree = projectTree(listOf(state.source(CaptureReplay.THREAD)))
        val calls = toolCalls(tree.at("threads", "byId", CaptureReplay.THREAD))
        val approval = calls.values.first { it.containsKey("approval") }.at("approval")
        assertEquals(JsonArray(listOf(JsonString("s1"), JsonString("s2"))), approval["acceptedSuggestions"])
        assertNull(approval["updatedInput"])
        assertNull(approval["failure"])
        assertNull(approval["failures"])
    }

    private fun treeAfterRequest(scenario: String): JsonObject =
        CaptureReplay
            .replay(
                scenario,
            ).first { (it.input as? PresenterInput.Event)?.event is AgentEvent.ControlRequest }
            .tree

    private companion object {
        /**
         * The captures where the fold leaves the thread running at the end: those whose `result` line the codec
         * does not place (CaptureFixtures.KNOWN_UNPLACED), so the turn it closes stays open. Empty now.
         */
        val STILL_RUNNING = CaptureFixtures.KNOWN_UNPLACED.filterValues { "result" in it }.keys

        /** A sub-agent's call that shows cut off from the capture's line [fromLine] on. */
        class Cut(
            val callId: String,
            val fromLine: Int,
        )
    }
}
