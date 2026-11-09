package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.TreeChecks
import dev.ukitomato.closta.presenter.at
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * What the transcript and the tree keep of the MCP servers: the list the CLI gave (capture 24 and lines made by
 * hand for what the capture did not record), the refusals of a switch, the sentences that are made safe, and the two
 * columns of waiting requests that must not push each other out. Every secret in the tests is an obvious made-up mark.
 */
class McpRecordsTest {
    private val projector = TreeProjector()

    private fun HostState.ops() = transcript.operations

    private fun HostState.request(
        id: String,
        kind: ControlKind,
        value: String? = null,
    ) = next(PresenterInput.ControlRequested(id, kind, value))

    private fun HostState.answer(
        id: String,
        servers: String,
    ) = next(PresenterInput.Event(Lines.controlOk(id, """{"mcpServers":$servers}""")))

    private fun thread(state: HostState): JsonObject {
        val tree = projector.project(listOf(state.source(CaptureReplay.THREAD)))
        TreeChecks.assertContract(tree, "the tree with MCP servers")
        return tree.at("threads", "byId", CaptureReplay.THREAD)
    }

    private fun servers(state: HostState): List<JsonObject> =
        (thread(state)["mcpServers"] as JsonArray).items.map { it as JsonObject }

    private fun replayed(scenario: String): HostState =
        CaptureReplay.inputs(scenario).fold(HostState()) { state, input -> state.next(input) }

    @Test
    fun `24 the last answer holds the server by name, state, source and tool names, and none of its configuration`() {
        val state = replayed("24-mcp-management")
        val listed = state.ops().mcpServers.orEmpty()
        assertEquals(listOf(McpServerRecord("fake-echo", "connected", "dynamic", listOf("echo"), null)), listed)
        assertFalse(state.ops().mcpUnreadable)
        val tree = JsonText.compact(thread(state))
        // The capture's config holds a URL (an obvious made-up port): neither the record nor the tree carries it.
        for (leak in listOf("localhost", "39039", "\"config\":", "\"url\":", "serverInfo")) {
            assertFalse(leak in tree, "the tree has no $leak")
            assertFalse(leak in state.ops().toString(), "the records have no $leak")
        }
        assertEquals(
            listOf("fake-echo" to "connected"),
            servers(state).map { (it["name"] as JsonString).value to (it["status"] as JsonString).value },
        )
    }

    @Test
    fun `24 the switches in order, three applied and the unknown name rejected with the CLIs sentence`() {
        val switches = replayed("24-mcp-management").ops().switches
        assertEquals(
            listOf(SwitchKind.MCP_DISABLE, SwitchKind.MCP_ENABLE, SwitchKind.MCP_RECONNECT, SwitchKind.MCP_DISABLE),
            switches.map { it.kind },
        )
        assertEquals(listOf("fake-echo", "fake-echo", "fake-echo", "no-such-server"), switches.map { it.value })
        assertEquals(
            listOf(SwitchOutcome.APPLIED, SwitchOutcome.APPLIED, SwitchOutcome.APPLIED, SwitchOutcome.REJECTED),
            switches.map { it.outcome },
        )
        assertEquals("Server not found: no-such-server", switches.last().detail)
    }

    @Test
    fun `a state the host does not know reads as unknown, a nameless server is left out, and tools are names only`() {
        val state =
            HostState()
                .request("m1", ControlKind.MCP_STATUS)
                .answer(
                    "m1",
                    """[
                    {"name":"a","status":"sleeping","scope":"project","tools":[{"name":"t1","description":"D","annotations":{"x":1}},{"x":2}]},
                    {"status":"connected"},
                    {"name":"b","status":"needs-auth","source":"user","scope":"project"}
                    ]""",
                )
        assertEquals(
            listOf(
                McpServerRecord("a", "unknown", "project", listOf("t1"), null),
                McpServerRecord("b", "needs-auth", "user", emptyList(), null),
            ),
            state.ops().mcpServers,
        )
        val tree = JsonText.compact(thread(state))
        assertFalse("\"D\"" in tree || "annotations" in tree, "a tool's description and annotations are not read")
    }

    @Test
    fun `the answer is cut at 100 servers and 64 tools each`() {
        val tools = (1..70).joinToString(",") { """{"name":"t$it"}""" }
        val many = (1..120).joinToString(",") { """{"name":"s$it","status":"connected","tools":[$tools]}""" }
        val state = HostState().request("m1", ControlKind.MCP_STATUS).answer("m1", "[$many]")
        val listed = state.ops().mcpServers.orEmpty()
        assertEquals(100, listed.size)
        assertEquals(64, listed.first().tools.size)
    }

    @Test
    fun `a secret in the configuration or the headers or the env never reaches a record, a tree or a log line`() {
        val mark = "SECRET-MARK-0001"
        val body =
            """[{"name":"s","status":"connected","source":"dynamic",
            |"config":{"type":"http","url":"https://host.example/mcp?token=$mark","headers":{"Authorization":"Bearer $mark"},
            |"command":"run-$mark","args":["--key=$mark"],"env":{"KEY":"$mark"}},
            |"serverInfo":{"name":"$mark","version":"1"}}]
            """.trimMargin()
        val state = HostState().request("m1", ControlKind.MCP_STATUS).answer("m1", body)
        assertFalse(mark in state.ops().toString())
        assertFalse(mark in JsonText.compact(thread(state)))
        assertEquals(1, state.ops().mcpServers?.size)
    }

    @Test
    fun `an error sentence is the first line, 200 characters, its URLs without userinfo and query`() {
        val secret = "SECRET-MARK-0002"
        val long = "x".repeat(300)
        val error =
            "Failed to connect to https://user:$secret@host.example/mcp?token=$secret#frag now\n" +
                "second line $secret\n$long"
        val state =
            HostState()
                .request("m1", ControlKind.MCP_STATUS)
                .answer("m1", """[{"name":"s","status":"failed","error":${Lines.quote(error)}}]""")
        val sentence =
            state
                .ops()
                .mcpServers!!
                .single()
                .error!!
        assertEquals("Failed to connect to https://host.example/mcp now", sentence)
        assertFalse(secret in JsonText.compact(thread(state)))
        val cut =
            HostState()
                .request(
                    "m1",
                    ControlKind.MCP_STATUS,
                ).answer("m1", """[{"name":"s","status":"failed","error":${Lines.quote(long)}}]""")
        assertEquals(
            200,
            cut
                .ops()
                .mcpServers!!
                .single()
                .error!!
                .length,
        )
    }

    @Test
    fun `a URL cleaned before the cut cannot leave the front of a secret`() {
        val secret = "SECRET-MARK-0003"
        val padding = "p".repeat(180)
        val sentence = mcpSentence("$padding https://u:$secret@h.example/a?k=$secret")
        assertFalse("SECRET" in sentence, sentence)
        assertEquals("$padding https://h.example/a", sentence)
    }

    @Test
    fun `a switch refusal about an MCP server is cut at 200, a model refusal keeps its 500`() {
        val long = "y".repeat(450)
        val state =
            HostState()
                .request("a", ControlKind.MCP_DISABLE, "s")
                .request("b", ControlKind.MODEL, "opus")
                .next(PresenterInput.Event(Lines.controlError("a", long)))
                .next(PresenterInput.Event(Lines.controlError("b", long)))
        val details = state.ops().switches.associate { it.kind to it.detail!! }
        assertEquals(200, details.getValue(SwitchKind.MCP_DISABLE).length)
        assertEquals(450, details.getValue(SwitchKind.MODEL).length)
    }

    @Test
    fun `a control error's notice is made as an MCP sentence whatever the request was`() {
        val secret = "SECRET-MARK-0004"
        val state =
            HostState()
                .request("a", ControlKind.MODEL, "opus")
                .next(PresenterInput.Event(Lines.controlError("a", "no https://u:$secret@h.example/x?q=$secret\nmore")))
        val notice = (thread(state).at("notices", "byId")["notice-1"] as JsonObject)["text"] as JsonString
        assertEquals("no https://h.example/x", notice.value)
    }

    @Test
    fun `an error answer or a request that could not be written marks the list unreadable and keeps the last one`() {
        val listed =
            HostState()
                .request("m1", ControlKind.MCP_STATUS)
                .answer("m1", """[{"name":"s","status":"connected"}]""")
        val failed =
            listed
                .request(
                    "m2",
                    ControlKind.MCP_STATUS,
                ).next(PresenterInput.Event(Lines.controlError("m2", "boom")))
        assertTrue(failed.ops().mcpUnreadable)
        assertEquals(listed.ops().mcpServers, failed.ops().mcpServers)
        assertEquals(JsonBool.TRUE, thread(failed)["mcpServersUnreadable"])
        assertEquals(1, servers(failed).size)
        val unsent = listed.request("m3", ControlKind.MCP_STATUS).next(PresenterInput.ControlSendFailed("m3"))
        assertTrue(unsent.ops().mcpUnreadable)
        assertTrue(unsent.ops().mcpWaiting.isEmpty())
        assertEquals(listed.ops().mcpServers, unsent.ops().mcpServers)
        // A body that is no list is not an answer to read either.
        val odd =
            listed
                .request(
                    "m4",
                    ControlKind.MCP_STATUS,
                ).next(PresenterInput.Event(Lines.controlOk("m4", """{"x":1}""")))
        assertTrue(odd.ops().mcpUnreadable)
        // The next list that can be read clears it.
        val again = failed.request("m5", ControlKind.MCP_STATUS).answer("m5", """[]""")
        assertFalse(again.ops().mcpUnreadable)
        assertNull(thread(again)["mcpServersUnreadable"])
        assertEquals(emptyList<McpServerRecord>(), again.ops().mcpServers)
        assertEquals(JsonArray.EMPTY, thread(again)["mcpServers"])
    }

    @Test
    fun `the tree has no list before the first answer`() {
        assertNull(thread(HostState())["mcpServers"])
        assertNull(thread(HostState().request("m1", ControlKind.MCP_STATUS))["mcpServers"])
    }

    @Test
    fun `usage requests and list requests wait in their own columns and do not push each other out`() {
        var state = HostState()
        state = state.request("c0", ControlKind.CONTEXT)
        for (n in 1..MAX_WAITING + 2) state = state.request("m$n", ControlKind.MCP_STATUS)
        assertEquals(listOf("c0"), state.ops().waiting)
        assertEquals((3..MAX_WAITING + 2).map { "m$it" }, state.ops().mcpWaiting)
        var other = HostState()
        other = other.request("m0", ControlKind.MCP_STATUS)
        for (n in 1..MAX_WAITING + 2) other = other.request("c$n", ControlKind.CONTEXT)
        assertEquals(listOf("m0"), other.ops().mcpWaiting)
        // The same id twice is one wait.
        assertEquals(listOf("m0"), other.request("m0", ControlKind.MCP_STATUS).ops().mcpWaiting)
        assertSame(other.transcript.operations, other.request("m0", ControlKind.MCP_STATUS).transcript.operations)
    }

    @Test
    fun `asking for the list, and its answer, leave every message node the same object`() {
        val base =
            HostState()
                .next(PresenterInput.UserSent("send-1", "hello"))
                .next(PresenterInput.Event(Lines.queued("cmd-1")))
                .next(PresenterInput.Event(Lines.started("cmd-1")))
        val before = projector.project(listOf(base.source(CaptureReplay.THREAD)))
        val asked = base.request("m1", ControlKind.MCP_STATUS)
        val waiting = projector.project(listOf(asked.source(CaptureReplay.THREAD)))
        assertSame(
            before.at("threads", "byId", CaptureReplay.THREAD, "messages"),
            waiting.at("threads", "byId", CaptureReplay.THREAD, "messages"),
        )
        assertSame(before, waiting, "a request alone shows nothing new")
        val answered = asked.answer("m1", """[{"name":"s","status":"connected"}]""")
        val after = projector.project(listOf(answered.source(CaptureReplay.THREAD)))
        assertSame(
            before.at("threads", "byId", CaptureReplay.THREAD, "messages"),
            after.at("threads", "byId", CaptureReplay.THREAD, "messages"),
        )
    }

    @Test
    fun `the projection's comparison ignores the requests waiting and sees a new list or a failure`() {
        val base = HostState().request("c0", ControlKind.CONTEXT)
        val asked = base.request("m1", ControlKind.MCP_STATUS)
        assertTrue(Context(base.conversation, base.transcript).sameAs(Context(asked.conversation, asked.transcript)))
        val listed = asked.answer("m1", """[{"name":"s","status":"connected"}]""")
        assertFalse(
            Context(asked.conversation, asked.transcript).sameAs(Context(listed.conversation, listed.transcript)),
        )
        val unreadable = asked.next(PresenterInput.ControlSendFailed("m1"))
        assertFalse(
            Context(
                asked.conversation,
                asked.transcript,
            ).sameAs(Context(unreadable.conversation, unreadable.transcript)),
        )
    }

    private fun listedWith(
        status: String,
        name: String = "fake-echo",
    ) = HostState()
        .request("m1", ControlKind.MCP_STATUS)
        .answer(
            "m1",
            """[{"name":"$name","status":"$status","tools":[{"name":"echo"}],"error":"old failure"},
            |{"name":"other","status":"connected"}]
            """.trimMargin(),
        )

    private fun HostState.pressed(
        kind: ControlKind,
        id: String = "s1",
        name: String = "fake-echo",
    ) = request(id, kind, name)

    private fun HostState.ended(
        id: String = "s1",
        ok: Boolean = true,
    ) = next(PresenterInput.Event(if (ok) Lines.controlOk(id) else Lines.controlError(id, "no")))

    @Test
    fun `a turn off that is applied writes disabled into the last list, without tools or sentence, until a new list`() {
        val applied = listedWith("connected").pressed(ControlKind.MCP_DISABLE).ended()
        val written = applied.ops().mcpServers!!
        assertEquals(McpServerRecord("fake-echo", "disabled", "", emptyList(), null), written.first())
        assertEquals("connected", written.last().status, "another server is left as it was")
        assertEquals("disabled", (servers(applied).first()["status"] as JsonString).value)
        // The CLI's own list that comes after replaces what was written.
        val again =
            applied
                .request(
                    "m2",
                    ControlKind.MCP_STATUS,
                ).answer("m2", """[{"name":"fake-echo","status":"disabled"}]""")
        assertEquals(
            "disabled",
            again
                .ops()
                .mcpServers!!
                .single()
                .status,
        )
    }

    @Test
    fun `a turn on that is applied makes a disabled server connecting, and leaves one that is not disabled`() {
        val on = listedWith("disabled").pressed(ControlKind.MCP_ENABLE).ended()
        assertEquals(McpServerRecord("fake-echo", "pending", "", emptyList(), null), on.ops().mcpServers!!.first())
        val already = listedWith("connected").pressed(ControlKind.MCP_ENABLE).ended()
        assertEquals(listedWith("connected").ops().mcpServers, already.ops().mcpServers)
    }

    @Test
    fun `a reconnect, a refusal, a failed send, a name the list lacks and no list at all write nothing`() {
        val base = listedWith("failed")
        assertEquals(
            base.ops().mcpServers,
            base
                .pressed(ControlKind.MCP_RECONNECT)
                .ended()
                .ops()
                .mcpServers,
        )
        assertEquals(
            base.ops().mcpServers,
            base
                .pressed(ControlKind.MCP_DISABLE)
                .ended(ok = false)
                .ops()
                .mcpServers,
        )
        val unsent = base.pressed(ControlKind.MCP_DISABLE).next(PresenterInput.ControlSendFailed("s1"))
        assertEquals(base.ops().mcpServers, unsent.ops().mcpServers)
        assertEquals(
            base.ops().mcpServers,
            base
                .pressed(ControlKind.MCP_DISABLE, name = "gone")
                .ended()
                .ops()
                .mcpServers,
        )
        assertNull(
            HostState()
                .pressed(ControlKind.MCP_DISABLE)
                .ended()
                .ops()
                .mcpServers,
        )
        // An end seen twice writes once: a late error for an applied switch changes nothing.
        val twice = base.pressed(ControlKind.MCP_DISABLE).ended().ended(ok = false)
        assertEquals(
            "disabled",
            twice
                .ops()
                .mcpServers!!
                .first()
                .status,
        )
    }

    @Test
    fun `a userinfo that holds a raw slash, question mark or hash is gone from the sentence, whatever it holds`() {
        val secret = "SECRET-MARK-0005"
        for (url in listOf(
            "https://user:pa/ss$secret@host.example/x",
            "https://u:p?w$secret@h.example/x",
            "https://u:p#w$secret@h.example/x",
        )) {
            val sentence = mcpSentence("cannot reach $url now")
            assertFalse("SECRET" in sentence, sentence)
            assertTrue(sentence.startsWith("cannot reach https://"), sentence)
        }
        assertEquals("cannot reach https://h.example/x now", mcpSentence("cannot reach https://u:p?w@h.example/x now"))
    }

    @Test
    fun `an empty source falls back to the scope`() {
        val state =
            HostState()
                .request("m1", ControlKind.MCP_STATUS)
                .answer(
                    "m1",
                    """[{"name":"a","status":"connected","source":"","scope":"project"},
                    |{"name":"b","status":"connected","source":""}]
                    """.trimMargin(),
                )
        assertEquals(listOf("project", ""), state.ops().mcpServers!!.map { it.source })
    }

    @Test
    fun `a server is built in when the CLI says sdk or when its name is one the session declared`() {
        val declared =
            HostState().next(PresenterInput.Launched(null, listOf("ide-context")))
        val state =
            declared
                .request("m1", ControlKind.MCP_STATUS)
                .answer(
                    "m1",
                    """[{"name":"ide-context","status":"connected"},{"name":"other","status":"connected","source":"sdk"},
                    |{"name":"user-one","status":"connected","source":"user"}]
                    """.trimMargin(),
                )
        assertEquals(listOf(true, true, false), servers(state).map { (it["builtIn"] as JsonBool).value })
        assertEquals(listOf("ide-context"), state.ops().builtInMcpServers)
        assertNull(thread(declared)["effort"], "names without an effort say no effort")
    }

    @Test
    fun `an MCP switch is pending until the CLI answers, and a switch answered once is not changed again`() {
        val asked = HostState().request("a", ControlKind.MCP_ENABLE, "s")
        assertEquals(
            SwitchOutcome.PENDING,
            asked
                .ops()
                .switches
                .single()
                .outcome,
        )
        val applied = asked.next(PresenterInput.Event(Lines.controlOk("a")))
        assertEquals(
            SwitchOutcome.APPLIED,
            applied
                .ops()
                .switches
                .single()
                .outcome,
        )
        val late = applied.next(PresenterInput.Event(Lines.controlError("a", "late")))
        assertEquals(
            SwitchOutcome.APPLIED,
            late
                .ops()
                .switches
                .single()
                .outcome,
        )
        val failed =
            HostState()
                .request(
                    "b",
                    ControlKind.MCP_RECONNECT,
                    "s",
                ).next(PresenterInput.ControlSendFailed("b"))
        assertEquals(
            SwitchOutcome.FAILED,
            failed
                .ops()
                .switches
                .single()
                .outcome,
        )
        assertEquals(
            "mcp-reconnect",
            thread(failed)
                .let {
                    ((it["switches"] as JsonArray).items.single() as JsonObject)["kind"]
                }.let { (it as JsonString).value },
        )
    }
}
