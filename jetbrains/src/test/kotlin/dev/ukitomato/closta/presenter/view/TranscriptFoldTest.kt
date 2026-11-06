package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.RawJson
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import org.junit.jupiter.api.assertDoesNotThrow
import org.junit.jupiter.api.assertThrows

/** The transcript fold: pure, never throwing, and an input it has no use for changes nothing at all. */
class TranscriptFoldTest {
    private fun started(): HostState =
        listOf(Lines.queued("c1"), Lines.started("c1")).fold(HostState()) { state, event -> state.with(event) }

    private fun HostState.with(event: AgentEvent): HostState = next(PresenterInput.Event(event))

    /** The transcript came through as the same object: the fold changed nothing. */
    private fun assertUnchanged(
        before: HostState,
        after: HostState,
        message: String = "",
    ) = assertSame(before.transcript, after.transcript, message)

    @Test
    fun `content whose RawJson cannot be read changes nothing`() {
        val before = started().with(Lines.assistant("m1", Lines.toolUse("toolu_1", "Bash")))
        val broken =
            listOf(
                AgentEvent.StreamEvent("se", "s", RawJson("{not json")),
                AgentEvent.StreamEvent("se", "s", RawJson("[]")),
                AgentEvent.StreamEvent(
                    "se",
                    "s",
                    RawJson("""{"type":"content_block_delta","index":"0","delta":{"type":"text_delta","text":"x"}}"""),
                ),
                AgentEvent.Assistant("a", "s", "t", "r", RawJson("{\"id\":")),
                AgentEvent.Assistant("a", "s", "t", "r", RawJson("""{"id":7,"content":[]}""")),
                AgentEvent.Assistant("a", "s", "t", "r", RawJson("""{"id":"m2","content":{}}""")),
                AgentEvent.User("u", "s", "t", RawJson("nope")),
                AgentEvent.User("u", "s", "t", RawJson("""{"content":[{"type":"tool_result","tool_use_id":5}]}""")),
                AgentEvent.UnknownKind("future", RawJson("{}")),
                AgentEvent.BrokenLine("{", "malformed"),
            )
        for (event in broken) assertUnchanged(before, before.with(event), "$event")
    }

    // task_started, task_progress and background_tasks_changed feed the running list (RunningTasksTest), so they are
    // not here.
    private val contentless =
        setOf(
            AgentEvent.SystemStatus::class,
            AgentEvent.RateLimitEvent::class,
            AgentEvent.SystemTaskNotification::class,
            AgentEvent.SystemTaskUpdated::class,
            AgentEvent.SystemThinkingTokens::class,
        )

    @Test
    fun `lines that carry no content change nothing`() {
        val before = started()
        for (event in CaptureReplay.inputs("10-background-task").mapNotNull { (it as? PresenterInput.Event)?.event }) {
            if (event::class in contentless) {
                assertUnchanged(before, before.with(event), event.toString())
            }
        }
        assertUnchanged(before, before.with(Lines.started("c1")), "a repeated started changes nothing")
        assertUnchanged(before, before.with(AgentEvent.CommandLifecycle("l", "s", "c1", "completed")))
    }

    private fun HostState.commands() = transcript.commands

    @Test
    fun `the initialize response gives the commands with their sentences, and system init alone only their names`() {
        val named = HostState().with(Lines.init(slashCommands = """["config","context",7,""]"""))
        assertEquals(
            SlashCommands(listOf(SlashCommandRecord("config", ""), SlashCommandRecord("context", ""))),
            named.commands(),
        )
        val body =
            """{"commands":[{"name":"config","description":"Set a setting by key","argumentHint":"key=value"},""" +
                """{"name":"x"},{"description":"nameless"}]}"""
        val detailed = named.with(Lines.initialized(body))
        assertEquals(
            SlashCommands(
                listOf(SlashCommandRecord("config", "Set a setting by key", "key=value"), SlashCommandRecord("x", "")),
                detailed = true,
            ),
            detailed.commands(),
        )
        // The names a later system/init gives never replace the sentences.
        val later = detailed.with(Lines.init(slashCommands = """["other"]"""))
        assertSame(detailed.transcript, later.transcript)
        // An initialize response read first is not replaced by a names-only list either.
        val first = HostState().with(Lines.initialized(body)).with(Lines.init(slashCommands = """["other"]"""))
        assertEquals(detailed.commands(), first.commands())
    }

    @Test
    fun `a response that is an error, or has no commands, or the same commands again changes nothing`() {
        val detailed = HostState().with(Lines.initialized("""{"commands":[{"name":"config","description":"d"}]}"""))
        assertUnchanged(detailed, detailed.with(Lines.controlError("init-1", "refused")))
        assertUnchanged(detailed, detailed.with(Lines.initialized("{}")))
        assertUnchanged(detailed, detailed.with(Lines.initialized("""{"commands":"nope"}""")))
        assertUnchanged(
            detailed,
            detailed.with(Lines.initialized("""{"commands":[{"name":"config","description":"d"}]}""")),
        )
        val empty = HostState()
        assertUnchanged(empty, empty.with(Lines.init(slashCommands = "{}")))
        assertUnchanged(empty, empty.with(Lines.init()), "an init with no commands")
    }

    @Test
    fun `the answers of the host to the webview are the last one only`() {
        val first = FileSearchRecord("c1", "App", listOf("a/App.kt"), truncated = false)
        val second = FileSearchRecord("c2", "Ap", emptyList(), truncated = false, failure = ComposerFailure.UNAVAILABLE)
        val searched = HostState().next(PresenterInput.FilesFound(first)).next(PresenterInput.FilesFound(second))
        assertEquals(second, searched.transcript.fileSearch)
        val place = SelectionRecord("c3", SelectionAnswer.Selected("a/App.kt", 3, 5))
        val none = SelectionRecord("c4", SelectionAnswer.NoSelection)
        val chosen = searched.next(PresenterInput.SelectionCaptured(place)).next(PresenterInput.SelectionCaptured(none))
        assertEquals(none, chosen.transcript.selection)
        assertEquals(second, chosen.transcript.fileSearch, "the two answers are kept apart")
        val written = ApplyRecord("c5", ApplyAnswer.Written("a/App.kt", 3, 5, undoable = true))
        val busy = ApplyRecord("c6", ApplyAnswer.Failed(ComposerFailure.BUSY))
        val applied = chosen.next(PresenterInput.CodeApplied(written)).next(PresenterInput.CodeApplied(busy))
        assertEquals(busy, applied.transcript.applied)
        assertEquals(none, applied.transcript.selection, "an apply does not touch the selection")
        assertEquals(chosen.conversation, applied.conversation, "core's state does not change")
    }

    @Test
    fun `an empty text delta changes nothing, so a stream of empty frames rebuilds nothing`() {
        val streaming = started().with(Lines.messageStart("m1")).with(Lines.blockStart(0, Lines.text("")))
        assertUnchanged(streaming, streaming.with(Lines.textDelta(0, "")))
        assertUnchanged(streaming, streaming.with(Lines.jsonDelta(0, "")))
        assertUnchanged(streaming, streaming.with(Lines.textDelta(5, "x")), "a block that never started")
    }

    @Test
    fun `the finished text is the authority over what streamed`() {
        val streamed =
            started()
                .with(Lines.messageStart("m1"))
                .with(Lines.blockStart(0, Lines.text("")))
                .with(Lines.textDelta(0, "Hello wrold"))
        val finished = streamed.with(Lines.assistant("m1", Lines.text("Hello world")))
        val part = finished.transcript.messages["c1"]!!.parts["m1:0"] as TextRecord
        assertEquals("Hello world", part.text)
        assertTrue(part.streaming, "the stream has not said it stopped")
        val next = finished.with(Lines.assistant("m1", Lines.text("More.")))
        assertEquals(
            listOf("m1:0", "m1:1"),
            next.transcript.messages["c1"]!!
                .parts.order,
            "each line carries the next block",
        )
    }

    @Test
    fun `a delta after its block stopped changes nothing`() {
        val stopped =
            started()
                .with(Lines.messageStart("m1"))
                .with(Lines.blockStart(0, Lines.text("")))
                .with(Lines.textDelta(0, "Hi"))
                .with(Lines.blockStop(0))
                .with(Lines.blockStart(1, Lines.toolUse("toolu_1", "Bash")))
                .with(Lines.jsonDelta(1, "{}"))
                .with(Lines.blockStop(1))
        assertUnchanged(stopped, stopped.with(Lines.textDelta(0, " there")))
        assertUnchanged(stopped, stopped.with(Lines.jsonDelta(1, "{}")))
        assertUnchanged(stopped, stopped.with(Lines.blockStop(0)), "stopping it again")
    }

    @Test
    fun `a block whose snapshot came before its stream is not written twice`() {
        val streamed =
            started()
                .with(Lines.assistant("m1", Lines.text("Hello")))
                .with(Lines.assistant("m1", Lines.toolUse("toolu_1", "Bash", """{"a":1}""")))
                .with(Lines.messageStart("m1"))
                .with(Lines.blockStart(0, Lines.text("")))
                .with(Lines.textDelta(0, "Hel"))
                .with(Lines.textDelta(0, "lo"))
                .with(Lines.blockStart(1, Lines.toolUse("toolu_1", "Bash")))
                .with(Lines.jsonDelta(1, "{\"a\":1}"))
        val parts = streamed.transcript.messages["c1"]!!.parts
        assertEquals("Hello", (parts["m1:0"] as TextRecord).text)
        assertEquals("{\"a\":1}", (parts["toolu_1"] as ToolCallRecord).argsText)
    }

    @Test
    fun `stream frames that claim a sub-agent are left alone`() {
        val before = started()
        val claimed =
            AgentEvent.StreamEvent(
                "se",
                "s",
                RawJson("""{"type":"message_start","message":{"id":"m1"}}"""),
                parentToolUseId = "agent",
            )
        assertUnchanged(before, before.with(claimed))
    }

    @Test
    fun `a sub-agent's line for a call that is not there is left out`() {
        val before = started()
        assertUnchanged(before, before.with(Lines.assistant("m2", Lines.text("orphan"), parent = "nobody")))
        assertUnchanged(before, before.with(Lines.user("u1", "\"prompt\"", parent = "nobody")))
        assertUnchanged(before, before.with(Lines.user("u1", Lines.toolResult("nobody", "\"x\""))))
    }

    @Test
    fun `a sub-agent's prompt as a plain string, or as text blocks, is a nested user message`() {
        val withAgent = started().with(Lines.assistant("m1", Lines.toolUse("agent", "Agent")))
        val plain = withAgent.with(Lines.user("u1", "\"Read it\"", parent = "agent"))
        val call = plain.transcript.messages["c1"]!!.parts["agent"] as ToolCallRecord
        assertEquals(listOf("u1"), call.messages.order)
        assertEquals("Read it", (call.messages["u1"]!!.parts["u1:0"] as TextRecord).text)
        val blocks =
            withAgent.with(
                Lines.user("u2", """[{"type":"image"},{"type":"text","text":"Look"}]""", parent = "agent"),
            )
        val nested = (blocks.transcript.messages["c1"]!!.parts["agent"] as ToolCallRecord).messages["u2"]!!
        assertEquals(listOf("u2:1"), nested.parts.order)
        assertUnchanged(
            withAgent,
            withAgent.with(Lines.user("u3", "\"the user's own words\"")),
            "the host already has the user's words",
        )
    }

    @Test
    fun `a repeated request is asked afresh, an empty request id is not recorded`() {
        val asked = started().with(Lines.request("r1", "Bash", "toolu_1"))
        val decided = asked.next(PresenterInput.Decided(ApprovalDecision.Allow("r1"), 5))
        assertEquals(ApprovalOutcome.APPROVED, decided.transcript.approvals["r1"]!!.outcome)
        val again = decided.with(Lines.request("r1", "Bash", "toolu_1"))
        assertEquals(null, again.transcript.approvals["r1"]!!.outcome)
        assertUnchanged(
            asked,
            asked.with(Lines.request("r1", "Bash", "toolu_1")),
            "the same request again changes nothing",
        )
        assertUnchanged(asked, asked.with(Lines.request("", "Bash", "toolu_1")))
    }

    @Test
    fun `a tool call's id is its key, even when the stream and the snapshot disagree on the name`() {
        val transcript =
            started()
                .with(Lines.messageStart("m1"))
                .with(Lines.blockStart(0, Lines.toolUse("toolu_1", "Bash")))
                .with(Lines.jsonDelta(0, "{\"a\":1}"))
                .with(Lines.assistant("m1", Lines.toolUse("toolu_1", "Other", """{"a":1}""")))
        val call = transcript.transcript.messages["c1"]!!.parts["toolu_1"] as ToolCallRecord
        assertEquals("Bash", call.toolName)
        assertEquals("{\"a\":1}", call.argsText)
        assertEquals(
            listOf("toolu_1"),
            transcript.transcript.messages["c1"]!!
                .parts.order,
        )
    }

    @Test
    fun `a sub-agent's prompt claims its key next to the sub-agent's other messages`() {
        val state =
            started()
                .with(Lines.assistant("m1", Lines.toolUse("agent", "Agent")))
                .with(Lines.assistant("u1", Lines.text("an assistant message with the same id"), parent = "agent"))
                .with(Lines.user("u1", "\"the prompt\"", parent = "agent"))
        val nested = (state.transcript.messages["c1"]!!.parts["agent"] as ToolCallRecord).messages
        assertEquals(listOf("u1", "u1~2"), nested.order)
        assertEquals(listOf(Role.ASSISTANT, Role.USER), nested.values().map { it.role })
        assertEquals(listOf("u1~2:0"), nested["u1~2"]!!.parts.order)
    }

    @Test
    fun `the routing a transcript hands out cannot be changed through a cast`() {
        val routing =
            started()
                .with(Lines.messageStart("m1"))
                .with(Lines.blockStart(0, Lines.toolUse("agent", "Agent")))
                .with(Lines.assistant("m1", Lines.toolUse("agent", "Agent")))
                .with(Lines.assistant("m2", Lines.toolUse("bash", "Bash"), parent = "agent"))
                .transcript.routing

        @Suppress("UNCHECKED_CAST")
        val attempts: List<() -> Unit> =
            listOf(
                { (routing.turns as MutableMap<String, String>)["x"] = "y" },
                { (routing.anthropic as MutableMap<String, AnthropicRoute>).clear() },
                { (routing.tools as MutableMap<String, List<String>>).clear() },
                { (routing.tools.getValue("bash") as MutableList<String>).add("x") },
                { (routing.anthropic.getValue("m1").streamed as MutableMap<Int, String>).clear() },
                { (routing.anthropic.getValue("m2").location as MutableList<String>).add("x") },
            )
        for (attempt in attempts) {
            val refused = assertThrows<RuntimeException> { attempt() }
            assertTrue(refused is UnsupportedOperationException || refused is ClassCastException, "$refused")
        }
        assertEquals(listOf("c1", "agent", "m2"), routing.tools["bash"])
    }

    @TestFactory
    fun `the fold never throws on damaged lines from the captures`(): List<DynamicTest> =
        CaptureReplay.scenarios().map { scenario ->
            DynamicTest.dynamicTest(scenario) {
                var state = HostState()
                for (input in CaptureReplay.inputs(scenario)) {
                    for (damaged in damage(input)) {
                        assertDoesNotThrow { state.next(damaged) }
                    }
                    state = state.next(input)
                }
            }
        }

    // The same line with its JSON cut short, its strings swapped for numbers, and its arrays emptied.
    private fun damage(input: PresenterInput): List<PresenterInput> {
        val event = (input as? PresenterInput.Event)?.event
        val raw =
            when (event) {
                is AgentEvent.StreamEvent -> event.event.text
                is AgentEvent.Assistant -> event.message.text
                is AgentEvent.User -> event.message.text
                is AgentEvent.ControlRequest -> event.request.text
                else -> null
            }
        if (event == null || raw == null) return emptyList()
        val variants =
            listOf(
                raw.take(raw.length / 2),
                raw.replace(Regex("\"[a-z_]+\":\"[^\"]*\""), "\"x\":1"),
                raw.replace(Regex("\\[[^\\[\\]]*]"), "[]"),
            )
        return variants.map { text ->
            PresenterInput.Event(
                when (event) {
                    is AgentEvent.StreamEvent -> event.copy(event = RawJson(text))
                    is AgentEvent.Assistant -> event.copy(message = RawJson(text))
                    is AgentEvent.User -> event.copy(message = RawJson(text))
                    is AgentEvent.ControlRequest -> event.copy(request = RawJson(text))
                    else -> event
                },
            )
        }
    }
}
