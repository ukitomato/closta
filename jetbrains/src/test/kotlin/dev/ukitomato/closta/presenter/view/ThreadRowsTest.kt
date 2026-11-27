package dev.ukitomato.closta.presenter.view

import com.google.gson.JsonParser
import dev.ukitomato.closta.platforms.intellij.session.SessionView
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import dev.ukitomato.closta.providers.claude.synthetic.StreamScript
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import com.google.gson.JsonArray as GsonArray
import com.google.gson.JsonObject as GsonObject

class ThreadRowsTest {
    /** One turn as the CLI frames it: queued and started, [script]'s lines, the result, completed. */
    private fun fold(
        prompt: String,
        script: StreamScript,
        from: SessionView = SessionView(),
    ): SessionView {
        val command = "c-$prompt"
        val open =
            StreamScript().apply {
                lifecycle(command, "queued")
                lifecycle(command, "started")
            }
        val close =
            StreamScript().apply {
                result("done")
                lifecycle(command, "completed")
            }
        return (open.lines + script.lines + close.lines).fold(
            from.sent(PresenterInput.UserSent("u-$prompt", prompt, uuid = command)),
        ) { view, line -> view.event(PresenterInput.Event(StreamJsonCodec.decode(line))) }
    }

    private fun input(vararg pairs: Pair<String, String>) =
        GsonObject().apply { pairs.forEach { (key, value) -> addProperty(key, value) } }

    /** Each tool call in a message of its own, answered before the next, as the CLI sends them. */
    private fun tools(vararg calls: Pair<String, GsonObject>): StreamScript =
        StreamScript().apply {
            calls.forEachIndexed { index, (name, input) ->
                assistant("m$index", listOf(StreamScript.toolUse("t$index", name, input)))
                toolResult("t$index", "ok")
            }
        }

    @Test
    fun userMessageIsOneAskRowWithItsAttachments() {
        val transcript = CaptureReplay.replay("23-attachments").last().transcript
        val asks = ThreadRows().of(transcript).filterIsInstance<AskRow>()
        val sent =
            transcript.messages
                .values()
                .filter { it.role == Role.USER }
                .map { message -> message.parts.values().filterIsInstance<AttachmentRecord>() }
        assertEquals(sent.size, asks.size)
        assertEquals(sent, asks.map { it.attachments })
        assertTrue(asks.any { it.attachments.isNotEmpty() })
    }

    /**
     * The lines 2.1.319 writes for send [command] when logged out: no stream events, an assistant line with no
     * request_id that names its error, an error result, and the command cancelled.
     */
    private fun signedOut(
        command: String,
        from: SessionView = SessionView(),
    ): SessionView {
        fun lifecycle(state: String) =
            """{"type":"command_lifecycle","uuid":"l-$state","session_id":"s","command_uuid":"$command",""" +
                """"state":"$state"}"""
        val lines =
            listOf(
                lifecycle("queued"),
                lifecycle("started"),
                """{"type":"assistant","message":{"id":"m-$command","model":"<synthetic>","role":"assistant",""" +
                    """"type":"message","content":[{"type":"text","text":"$NOT_LOGGED_IN"}]},""" +
                    """"parent_tool_use_id":null,"session_id":"s","uuid":"a-$command","timestamp":"t",""" +
                    """"user_message_uuid":"$command","error":"authentication_failed","is_api_error_message":true}""",
                StreamScript().apply { result(NOT_LOGGED_IN) }.lines.single().let {
                    val result = JsonParser.parseString(it).asJsonObject
                    result.addProperty("is_error", true)
                    result.addProperty("user_message_uuid", command)
                    result.toString()
                },
                lifecycle("cancelled"),
            )
        return lines.fold(from.sent(PresenterInput.UserSent("u-$command", "hi", uuid = command))) { view, line ->
            view.event(PresenterInput.Event(StreamJsonCodec.decode(line)))
        }
    }

    @Test
    fun aReplyTheCliMadeItselfIsShownAsTextWithASignInRowAfterIt() {
        val rows = ThreadRows().of(signedOut("c1").transcript)
        assertEquals(listOf(NOT_LOGGED_IN), rows.filterIsInstance<TextRow>().map { it.markdown })
        // Right after the reply that says so, and once: the `/login` it names cannot be run from here.
        val signIn = rows.filterIsInstance<SignInRow>().single()
        assertEquals(rows.indexOfFirst { it is TextRow } + 1, rows.indexOf(signIn))
    }

    @Test
    fun theSignInRowGoesOnceAReplyComesFromTheModel() {
        // 2.1.319 reads the credentials again on the next send, so the session goes on after signing in.
        val twice = signedOut("c2", signedOut("c1"))
        assertEquals(1, ThreadRows().of(twice.transcript).filterIsInstance<SignInRow>().size, "only the last")

        val after = fold("again", StreamScript().apply { assistant("m2", listOf(StreamScript.text("ok"))) }, twice)
        assertTrue(ThreadRows().of(after.transcript).none { it is SignInRow })
    }

    @Test
    fun readOnlyToolsInARowFoldIntoOneExploredRow() {
        val view =
            fold(
                "look",
                tools(
                    "Read" to input("file_path" to "/a/A.kt"),
                    "Grep" to input("pattern" to "login"),
                    "Read" to input("file_path" to "/a/B.kt"),
                ),
            )
        val rows = ThreadRows().of(view.transcript)
        val explored = rows.filterIsInstance<ExploredRow>()
        assertEquals(1, explored.size)
        assertEquals(3, explored.single().lines.size)
        assertTrue(rows.none { it is ToolRow })
    }

    @Test
    fun aSingleReadStaysAToolRow() {
        val rows = ThreadRows().of(fold("look", tools("Read" to input("file_path" to "/a/A.kt"))).transcript)
        assertTrue(rows.none { it is ExploredRow })
        assertEquals("Read", rows.filterIsInstance<ToolRow>().single().toolName)
    }

    @Test
    fun todoWriteIsATodoRow() {
        val todos =
            GsonObject().apply {
                add(
                    "todos",
                    GsonArray().apply {
                        add(input("content" to "方針を決める", "status" to "completed", "activeForm" to "決めている"))
                        add(input("content" to "テストを足す", "status" to "in_progress", "activeForm" to "足している"))
                    },
                )
            }
        val rows = ThreadRows().of(fold("plan", tools("TodoWrite" to todos)).transcript)
        val todo = rows.filterIsInstance<TodoRow>().single()
        assertEquals(
            listOf(TodoItem("方針を決める", "completed"), TodoItem("テストを足す", "in_progress")),
            todo.items,
        )
        assertTrue(rows.none { it is ToolRow })
    }

    @Test
    fun subagentMessagesAreNotRows() {
        val transcript = CaptureReplay.replay("08-subagent-task").last().transcript
        val rows = ThreadRows().of(transcript)
        assertTrue(rows.filterIsInstance<ToolRow>().all { it.depth == 0 })
        assertTrue(rows.filterIsInstance<ExploredRow>().all { it.depth == 0 })
        assertEquals(1, rows.filterIsInstance<ToolRow>().count { it.toolName == "Agent" || it.toolName == "Task" })
    }

    @Test
    fun unchangedMessagesKeepTheirRowObjects() {
        val first =
            fold(
                "one",
                StreamScript().apply { assistant("a1", listOf(StreamScript.text("最初の返事"))) },
            )
        val second =
            fold(
                "two",
                StreamScript().apply { streamText("a2", "二つ目の返事", 4) },
                first,
            )
        val rows = ThreadRows()
        val before = rows.of(second.transcript)
        val grown = fold("three", StreamScript().apply { streamText("a3", "三つ目", 4) }, second)
        val after = rows.of(grown.transcript)
        before.forEachIndexed { index, row -> assertSame(row, after[index]) }
        assertTrue(after.size > before.size)
    }

    @Test
    fun anAskRowIsReusedWhileItsExtraStateIsTheSameAndRemadeWhenItChanges() {
        val view = fold("one", StreamScript().apply { assistant("a1", listOf(StreamScript.text("返事"))) })
        var extra: Any? = "idle"
        val rows = ThreadRows(messageExtra = { if (it.role == Role.USER) extra else null })
        val first = rows.of(view.transcript).filterIsInstance<AskRow>().single()
        assertSame(first, rows.of(view.transcript).filterIsInstance<AskRow>().single(), "same extra, same row")
        extra = "idle"
        assertSame(first, rows.of(view.transcript).filterIsInstance<AskRow>().single(), "an equal extra, same row")
        extra = "cancellable"
        val remade = rows.of(view.transcript).filterIsInstance<AskRow>().single()
        assertTrue(first !== remade, "another extra, a new row")
        assertEquals(first, remade)
    }

    @Test
    fun aToolRowIsReusedWhileItsExtraStateIsTheSameAndRemadeWhenItChanges() {
        val view = fold("one", tools("Bash" to input("command" to "sleep 9")))
        var extra: Any? = "none"
        val rows = ThreadRows(partExtra = { if (it is ToolCallRecord) extra else null })
        val first = rows.of(view.transcript).filterIsInstance<ToolRow>().single()
        assertSame(first, rows.of(view.transcript).filterIsInstance<ToolRow>().single(), "same extra, same row")
        extra = "none"
        assertSame(first, rows.of(view.transcript).filterIsInstance<ToolRow>().single(), "an equal extra, same row")
        extra = "offered"
        val remade = rows.of(view.transcript).filterIsInstance<ToolRow>().single()
        assertTrue(first !== remade, "another extra, a new row")
        assertEquals(first, remade)
        assertSame(remade, rows.of(view.transcript).filterIsInstance<ToolRow>().single())
    }

    @Test
    fun anAskRowIsTheSameObjectWhileItsWithdrawalIsUnchangedAndRemadeWhenItChanges() {
        val queued =
            HostState()
                .next(PresenterInput.UserSent("ka", "one", uuid = "a"))
                .next(PresenterInput.Event(Lines.queued("a")))
                .next(PresenterInput.Event(Lines.started("a")))
                .next(PresenterInput.UserSent("kb", "two", uuid = "b"))
                .next(PresenterInput.Event(Lines.queued("b")))
        val rows = ThreadRows()

        fun asks(state: HostState) = rows.of(state.transcript, state.conversation).filterIsInstance<AskRow>()
        val first = asks(queued)
        assertEquals(AskCancel(CancelPhase.OFFER), first[1].cancel)
        val again = asks(queued.next(PresenterInput.Event(Lines.queued("zz"))))
        assertSame(first[0], again[0])
        assertSame(first[1], again[1], "the same withdrawal state, the same row")
        val waiting = asks(queued.next(PresenterInput.ControlRequested("r1", ControlKind.CANCEL_QUEUED, "b")))
        assertSame(first[0], waiting[0])
        assertTrue(first[1] !== waiting[1], "another withdrawal state, a new row")
        assertEquals(AskCancel(CancelPhase.WAITING), waiting[1].cancel)
    }

    private companion object {
        const val NOT_LOGGED_IN = "Not logged in · Please run /login"
    }
}
