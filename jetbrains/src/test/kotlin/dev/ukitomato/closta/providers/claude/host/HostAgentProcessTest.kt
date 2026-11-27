// JSON wire lines are written whole, so that what is measured can be read as sent.
@file:Suppress("MaxLineLength")

package dev.ukitomato.closta.providers.claude.host

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ElicitationAction
import dev.ukitomato.closta.presenter.view.CardRow
import dev.ukitomato.closta.presenter.view.ElicitationCard
import dev.ukitomato.closta.presenter.view.ElicitationStage
import dev.ukitomato.closta.presenter.view.HostState
import dev.ukitomato.closta.presenter.view.PresenterInput
import dev.ukitomato.closta.presenter.view.ThreadRows
import dev.ukitomato.closta.providers.claude.AgentProcess
import dev.ukitomato.closta.providers.claude.ClaudeSession
import dev.ukitomato.closta.providers.claude.mcp.ChannelProcess
import dev.ukitomato.closta.providers.claude.mcp.ScriptedServer
import dev.ukitomato.closta.providers.claude.mcp.SdkMcpServer
import dev.ukitomato.closta.providers.claude.mcp.SwallowingServer
import dev.ukitomato.closta.providers.claude.mcp.json
import dev.ukitomato.closta.providers.claude.mcp.mcpAnswer
import dev.ukitomato.closta.providers.claude.mcp.mcpRequest
import dev.ukitomato.closta.providers.claude.protocol.StdinEncoder
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import java.io.IOException
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

/**
 * The wrapper over a fake process. Waits are events (a line arrived, a job joined), bounded only as a hang
 * guard.
 */
class HostAgentProcessTest {
    private val guard = 10.seconds

    private class Run(
        val process: ChannelProcess,
        val wrapper: HostAgentProcess,
        val seen: Channel<String>,
        val job: Job,
    ) {
        suspend fun next(): String = withTimeout(10.seconds) { seen.receive() }

        suspend fun seenSoFar(): List<String> {
            job.join()
            return buildList { while (true) add(seen.tryReceive().getOrNull() ?: break) }
        }
    }

    private fun CoroutineScope.start(
        servers: List<SdkMcpServer>,
        timeout: kotlin.time.Duration = 10.seconds,
        process: ChannelProcess = ChannelProcess(),
        hooks: HostHooks = HostHooks(),
        hookTimeout: kotlin.time.Duration = 9.seconds,
    ): Run {
        val wrapper =
            HostAgentProcess(
                process,
                servers,
                hooks,
                initializeRequestId = INIT_ID,
                answerTimeout = timeout,
                hookTimeout = hookTimeout,
            )
        val seen = Channel<String>(Channel.UNLIMITED)
        val job = launch { wrapper.stdoutLines.collect { seen.send(it) } }
        return Run(process, wrapper, seen, job)
    }

    @Test
    @Timeout(TIMEOUT)
    fun `initialize is the first line written, once, naming the servers, whoever writes first`() =
        runBlocking {
            val run = start(listOf(ScriptedServer()))
            val first = withTimeout(guard) { run.process.nextWrite() }
            assertEquals(StdinEncoder.initialize(INIT_ID, listOf("ide-context")), first)
            run.wrapper.writeStdin("""{"type":"user"}""")
            assertEquals("""{"type":"user"}""", withTimeout(guard) { run.process.nextWrite() })
            run.wrapper.writeStdin("""{"type":"user","n":2}""")
            withTimeout(guard) { run.process.nextWrite() }
            assertEquals(1, run.process.written.count { it.contains("\"subtype\":\"initialize\"") })
            run.process.end()
            run.job.join()
        }

    @Test
    @Timeout(TIMEOUT)
    fun `the session's writer going first still puts initialize before its line`() =
        runBlocking {
            val process = ChannelProcess()
            val wrapper = HostAgentProcess(process, listOf(ScriptedServer()), initializeRequestId = INIT_ID)
            wrapper.writeStdin("""{"type":"user"}""")
            assertEquals(
                listOf(StdinEncoder.initialize(INIT_ID, listOf("ide-context")), """{"type":"user"}"""),
                process.written,
            )
            val job = launch { wrapper.stdoutLines.collect { } }
            process.end()
            job.join()
            assertEquals(1, process.written.count { it.contains("\"subtype\":\"initialize\"") })
        }

    @Test
    @Timeout(TIMEOUT)
    fun `an mcp_message is answered with the same request_id and does not reach the session`() =
        runBlocking {
            val server = ScriptedServer()
            val run = start(listOf(server))
            run.process.nextWrite()
            run.process.emit(mcpRequest("R1", "ide-context", """{"jsonrpc":"2.0","id":7,"method":"tools/list"}"""))
            run.process.emit("after")
            val (id, answer) = mcpAnswer(withTimeout(guard) { run.process.nextWrite() })
            assertEquals("R1", id)
            assertEquals(7, answer.get("id").asInt)
            assertEquals("ok", answer.getAsJsonObject("result").get("echo").asString)
            run.process.end()
            assertEquals(listOf("after"), run.seenSoFar())
        }

    @Test
    @Timeout(TIMEOUT)
    fun `a notification is acknowledged the way the SDK does`() =
        runBlocking {
            val run = start(listOf(ScriptedServer()))
            run.process.nextWrite()
            run.process.emit(
                mcpRequest("R2", "ide-context", """{"jsonrpc":"2.0","method":"notifications/initialized"}"""),
            )
            val (id, answer) = mcpAnswer(withTimeout(guard) { run.process.nextWrite() })
            assertEquals("R2", id)
            assertEquals(0, answer.get("id").asInt)
            assertEquals(0, answer.getAsJsonObject("result").size())
            run.process.end()
            run.job.join()
        }

    @Test
    @Timeout(TIMEOUT)
    fun `other lines pass in order, byte for byte, including words in a body and a big line`() =
        runBlocking {
            val run = start(listOf(ScriptedServer()))
            val lines =
                listOf(
                    """{"type":"system","subtype":"init"}""",
                    """{"type":"assistant","message":{"content":[{"type":"text","text":"the word mcp_message and control_cancel_request"}]}}""",
                    "not json at all mcp_message",
                    """{"type":"assistant","message":{"content":[{"type":"text","text":"the word hook_callback"}]}}""",
                    """{"type":"stream_event","pad":"hook_callback ${"x".repeat(300_000)}"}""",
                    """{"type":"stream_event","pad":"${"x".repeat(300_000)}"}""",
                    """{"type":"control_cancel_request","request_id":"nobody-answers-this"}""",
                    """{"type":"control_request","request_id":"C","request":{"subtype":"can_use_tool"}}""",
                )
            lines.forEach(run.process::emit)
            run.process.end()
            assertEquals(lines, run.seenSoFar())
        }

    @Test
    @Timeout(TIMEOUT)
    fun `the response to its own initialize goes on to the session, success and error alike`() =
        runBlocking {
            val run = start(listOf(ScriptedServer()))
            val ok = response("success", INIT_ID)
            val bad = response("error", INIT_ID)
            val other = response("success", "someone-else")
            listOf(ok, bad, other).forEach(run.process::emit)
            run.process.end()
            assertEquals(listOf(ok, bad, other), run.seenSoFar())
        }

    @Test
    @Timeout(TIMEOUT)
    fun `a session over the wrapper reads the success of initialize with its commands and goes on`() =
        runBlocking {
            val process = ChannelProcess()
            val wrapper = HostAgentProcess(process, listOf(ScriptedServer()), initializeRequestId = INIT_ID)
            val withCommands =
                """{"type":"control_response","response":{"subtype":"success","request_id":"$INIT_ID","response":{"commands":[{"name":"config","description":"Set a setting by key","argumentHint":"key=value"}]}}}"""
            listOf(withCommands, """{"type":"unknown_future_line"}""").forEach(process::emit)
            process.end()
            val events = mutableListOf<AgentEvent>()
            ClaudeSession(wrapper, "s1").events.collect { events += it }
            val reply = events.filterIsInstance<AgentEvent.ControlResponse>().single()
            assertEquals(INIT_ID, reply.requestId)
            assertEquals("success", reply.subtype)
            assertTrue(reply.response.text.contains("Set a setting by key"))
            assertEquals(2, events.size, "the line after it is read as well: $events")
        }

    @Test
    @Timeout(TIMEOUT)
    fun `a slow answer does not hold back the lines after it`() =
        runBlocking {
            val gate = CompletableDeferred<Unit>()
            val run = start(listOf(ScriptedServer(gate = gate)))
            run.process.nextWrite()
            run.process.emit(mcpRequest("R3", "ide-context", """{"jsonrpc":"2.0","id":1,"method":"tools/call"}"""))
            run.process.emit("line-1")
            run.process.emit("line-2")
            assertEquals("line-1", run.next())
            assertEquals("line-2", run.next())
            assertTrue(run.process.written.none { it.contains("mcp_response") })
            gate.complete(Unit)
            assertEquals("R3", mcpAnswer(withTimeout(guard) { run.process.nextWrite() }).first)
            run.process.end()
            run.job.join()
        }

    @Test
    @Timeout(TIMEOUT)
    fun `a missed deadline and a thrown exception are both answered as JSON-RPC errors`() =
        runBlocking {
            val never = ScriptedServer(name = "slow", gate = CompletableDeferred())
            val broken = ScriptedServer(name = "broken", failure = IOException("SECRET-CANARY"))
            val run = start(listOf(never, broken), timeout = 50.milliseconds)
            run.process.nextWrite()
            run.process.emit(mcpRequest("R4", "slow", """{"jsonrpc":"2.0","id":4,"method":"tools/call"}"""))
            run.process.emit(mcpRequest("R5", "broken", """{"jsonrpc":"2.0","id":5,"method":"tools/call"}"""))
            val answers = (1..2).map { mcpAnswer(withTimeout(guard) { run.process.nextWrite() }) }.toMap()
            answers.values.forEach { assertEquals(-32603, it.getAsJsonObject("error").get("code").asInt) }
            assertEquals(4, answers.getValue("R4").get("id").asInt)
            assertFalse(run.process.written.any { it.contains("SECRET-CANARY") })
            run.process.end()
            run.job.join()
        }

    @Test
    @Timeout(TIMEOUT)
    fun `a CancellationException of the server's own, or an Error, is answered as a JSON-RPC error`() =
        runBlocking {
            val cancelled = ScriptedServer(name = "own", failure = CancellationException("SECRET-CANARY"))
            val error = ScriptedServer(name = "error", failure = LinkageError("SECRET-CANARY"))
            val run = start(listOf(cancelled, error))
            run.process.nextWrite()
            run.process.emit(mcpRequest("R10", "own", """{"jsonrpc":"2.0","id":10,"method":"tools/call"}"""))
            run.process.emit(mcpRequest("R11", "error", """{"jsonrpc":"2.0","id":11,"method":"tools/call"}"""))
            val answers = (1..2).map { mcpAnswer(withTimeout(guard) { run.process.nextWrite() }) }.toMap()
            answers.values.forEach { assertEquals(-32603, it.getAsJsonObject("error").get("code").asInt) }
            assertEquals(10, answers.getValue("R10").get("id").asInt)
            assertEquals(11, answers.getValue("R11").get("id").asInt)
            assertFalse(run.process.written.any { it.contains("SECRET-CANARY") })
            run.process.end()
            run.job.join()
        }

    @Test
    @Timeout(TIMEOUT)
    fun `a cancel from outside wins over a CancellationException the server throws in answer`() =
        runBlocking {
            val gate = CompletableDeferred<Unit>()
            val server = SwallowingServer(gate = gate)
            val run = start(listOf(server))
            run.process.nextWrite()
            run.process.emit(mcpRequest("R12", "ide-context", """{"jsonrpc":"2.0","id":1,"method":"tools/call"}"""))
            withTimeout(guard) { server.started.await() }
            run.process.emit("""{"type":"control_cancel_request","request_id":"R12"}""")
            run.process.end()
            run.seenSoFar()
            assertEquals(1, run.process.written.size, "only initialize was written: ${run.process.written}")
        }

    @Test
    @Timeout(TIMEOUT)
    fun `a server it does not know is answered with an error`() =
        runBlocking {
            val run = start(listOf(ScriptedServer()))
            run.process.nextWrite()
            run.process.emit(mcpRequest("R6", "ide", """{"jsonrpc":"2.0","id":9,"method":"ping"}"""))
            val (_, answer) = mcpAnswer(withTimeout(guard) { run.process.nextWrite() })
            assertEquals(9, answer.get("id").asInt)
            assertEquals(-32601, answer.getAsJsonObject("error").get("code").asInt)
            run.process.end()
            run.job.join()
        }

    @Test
    @Timeout(TIMEOUT)
    fun `a cancel for a request being answered stops it and is not passed on, one for another request is`() =
        runBlocking {
            val gate = CompletableDeferred<Unit>()
            val server = ScriptedServer(gate = gate)
            val run = start(listOf(server))
            run.process.nextWrite()
            val stranger = """{"type":"control_cancel_request","request_id":"unknown"}"""
            run.process.emit(mcpRequest("R7", "ide-context", """{"jsonrpc":"2.0","id":1,"method":"tools/call"}"""))
            withTimeout(guard) { server.started.await() }
            run.process.emit("""{"type":"control_cancel_request","request_id":"R7"}""")
            run.process.emit(stranger)
            // Let the server go on whether or not it was stopped: a missed cancel would now write its answer, and
            // joining the collection waits for every answer coroutine to finish, so the count below sees it.
            gate.complete(Unit)
            run.process.end()
            assertEquals(listOf(stranger), run.seenSoFar())
            assertEquals(1, server.asked.size, "the server was asked")
            assertEquals(1, run.process.written.size, "only initialize was written: ${run.process.written}")
        }

    @Test
    @Timeout(TIMEOUT)
    fun `after destroy a finishing answer writes nothing and destroy reaches the process`() =
        runBlocking {
            val gate = CompletableDeferred<Unit>()
            val run = start(listOf(ScriptedServer(gate = gate)))
            run.process.nextWrite()
            run.process.emit(mcpRequest("R8", "ide-context", """{"jsonrpc":"2.0","id":1,"method":"tools/call"}"""))
            run.process.emit("barrier")
            assertEquals("barrier", run.next())
            run.wrapper.destroy()
            gate.complete(Unit)
            run.process.end()
            // Joining waits for the answer coroutine, so a write that could still happen has happened by now.
            run.job.join()
            assertTrue(run.process.destroyed)
            assertEquals(1, run.process.written.size, "only initialize was written: ${run.process.written}")
        }

    @Test
    @Timeout(TIMEOUT)
    fun `destroyForcibly reaches the process inside, as a forced kill and not a destroy`() =
        runBlocking {
            val process = ChannelProcess()
            val wrapper = HostAgentProcess(process, listOf(ScriptedServer()), initializeRequestId = INIT_ID)
            wrapper.destroyForcibly()
            assertEquals(1, process.forceKills.get())
            assertFalse(process.destroyed, "a forced kill is not the plain destroy")
        }

    @Test
    @Timeout(TIMEOUT)
    fun `a process whose stdin is already closed still has its lines read to the end`() =
        runBlocking {
            val process = ChannelProcess()
            val closed =
                object : AgentProcess by process {
                    override suspend fun writeStdin(line: String) = throw IOException("stdin is closed")
                }
            val wrapper = HostAgentProcess(closed, emptyList(), initializeRequestId = INIT_ID)
            process.emit("last words")
            process.end()
            val seen = mutableListOf<String>()
            wrapper.stdoutLines.collect { seen += it }
            assertEquals(listOf("last words"), seen)
        }

    private fun hookRequest(
        requestId: String,
        callbackId: String = "closta-before-file-tool",
        toolUseId: String? = "toolu_1",
    ) = """{"type":"control_request","request_id":"$requestId","request":{"subtype":"hook_callback",""" +
        """"callback_id":"$callbackId","input":{"hook_event_name":"PreToolUse","tool_name":"Edit"}""" +
        (if (toolUseId == null) "" else ""","tool_use_id":"$toolUseId"""") + "}}"

    private fun hooksWith(answerer: HookAnswerer) = HostHooks(listOf(BEFORE_FILE_TOOL), answerer)

    private fun answerOf(line: String) = json(line).getAsJsonObject("response")

    @Test
    @Timeout(TIMEOUT)
    fun `type only - a hook_callback is taken off the stream and answered with the same request_id`() =
        runBlocking {
            val seenByAnswerer = mutableListOf<Triple<String, String, String?>>()
            val hooks =
                hooksWith { callbackId, input, toolUseId ->
                    seenByAnswerer += Triple(callbackId, input.get("tool_name").asString, toolUseId)
                    json("""{"continue":true}""")
                }
            val run = start(listOf(ScriptedServer()), hooks = hooks)
            run.process.nextWrite()
            run.process.emit(hookRequest("H1"))
            run.process.emit("after")
            val answer = answerOf(withTimeout(guard) { run.process.nextWrite() })
            assertEquals("success", answer.get("subtype").asString)
            assertEquals("H1", answer.get("request_id").asString)
            assertEquals("""{"continue":true}""", answer.getAsJsonObject("response").toString())
            assertEquals(listOf(Triple("closta-before-file-tool", "Edit", "toolu_1")), seenByAnswerer)
            run.process.end()
            assertEquals(listOf("after"), run.seenSoFar())
        }

    @Test
    @Timeout(TIMEOUT)
    fun `type only - an id nobody knows is an error, a thrown exception is an empty success`() =
        runBlocking {
            val hooks =
                hooksWith { callbackId, _, _ ->
                    when (callbackId) {
                        "known" -> throw IOException("SECRET-CANARY")
                        else -> null
                    }
                }
            val run = start(listOf(ScriptedServer()), hooks = hooks)
            run.process.nextWrite()
            run.process.emit(hookRequest("H2", callbackId = "stranger"))
            val unknown = answerOf(withTimeout(guard) { run.process.nextWrite() })
            assertEquals("error", unknown.get("subtype").asString)
            assertEquals("H2", unknown.get("request_id").asString)
            assertEquals("unknown hook callback", unknown.get("error").asString)
            run.process.emit(hookRequest("H3", callbackId = "known"))
            val failed = answerOf(withTimeout(guard) { run.process.nextWrite() })
            assertEquals("success", failed.get("subtype").asString)
            assertEquals("H3", failed.get("request_id").asString)
            assertEquals(0, failed.getAsJsonObject("response").size())
            assertFalse(run.process.written.any { it.contains("SECRET-CANARY") })
            run.process.end()
            run.job.join()
        }

    @Test
    @Timeout(TIMEOUT)
    fun `type only - with no answerer at all every hook_callback is an unknown id`() =
        runBlocking {
            val run = start(listOf(ScriptedServer()))
            run.process.nextWrite()
            run.process.emit(hookRequest("H4"))
            val answer = answerOf(withTimeout(guard) { run.process.nextWrite() })
            assertEquals("error", answer.get("subtype").asString)
            run.process.end()
            run.job.join()
        }

    @Test
    @Timeout(TIMEOUT)
    fun `type only - a hook that misses its deadline is answered with an empty success`() =
        runBlocking {
            val hooks = hooksWith { _, _, _ -> CompletableDeferred<Unit>().await().let { null } }
            val run = start(listOf(ScriptedServer()), hooks = hooks, hookTimeout = 50.milliseconds)
            run.process.nextWrite()
            run.process.emit(hookRequest("H5"))
            val answer = answerOf(withTimeout(guard) { run.process.nextWrite() })
            assertEquals("success", answer.get("subtype").asString)
            assertEquals("H5", answer.get("request_id").asString)
            assertEquals(0, answer.getAsJsonObject("response").size())
            run.process.end()
            run.job.join()
        }

    @Test
    @Timeout(TIMEOUT)
    fun `type only - a withdrawn hook_callback writes nothing and the withdrawal is not passed on`() =
        runBlocking {
            val gate = CompletableDeferred<Unit>()
            val started = CompletableDeferred<Unit>()
            val hooks =
                hooksWith { _, _, _ ->
                    started.complete(Unit)
                    gate.await()
                    json("{}")
                }
            val run = start(listOf(ScriptedServer()), hooks = hooks)
            run.process.nextWrite()
            run.process.emit(hookRequest("H6"))
            withTimeout(guard) { started.await() }
            run.process.emit("""{"type":"control_cancel_request","request_id":"H6"}""")
            gate.complete(Unit)
            run.process.end()
            assertEquals(emptyList<String>(), run.seenSoFar())
            assertEquals(1, run.process.written.size, "only initialize was written: ${run.process.written}")
        }

    @Test
    @Timeout(TIMEOUT)
    fun `type only - a stuck hook does not hold back the answers behind it`() =
        runBlocking {
            val gate = CompletableDeferred<Unit>()
            val hooks =
                hooksWith { callbackId, _, _ ->
                    if (callbackId == "slow") gate.await()
                    json("""{"who":"$callbackId"}""")
                }
            val run = start(listOf(ScriptedServer()), hooks = hooks)
            run.process.nextWrite()
            run.process.emit(hookRequest("H7", callbackId = "slow"))
            run.process.emit(hookRequest("H8", callbackId = "second"))
            run.process.emit(hookRequest("H9", callbackId = "third"))
            val first = answerOf(withTimeout(guard) { run.process.nextWrite() })
            val second = answerOf(withTimeout(guard) { run.process.nextWrite() })
            assertEquals(setOf("H8", "H9"), setOf(first.get("request_id").asString, second.get("request_id").asString))
            gate.complete(Unit)
            assertEquals("H7", answerOf(withTimeout(guard) { run.process.nextWrite() }).get("request_id").asString)
            run.process.end()
            run.job.join()
        }

    @Test
    @Timeout(TIMEOUT)
    fun `type only - with no servers initialize names none and an mcp_message is answered with an error`() =
        runBlocking {
            val run = start(emptyList())
            val first = withTimeout(guard) { run.process.nextWrite() }
            assertEquals(StdinEncoder.initialize(INIT_ID), first)
            assertTrue(first.contains("\"sdkMcpServers\":[]"), first)
            run.process.emit(mcpRequest("R20", "ide-context", """{"jsonrpc":"2.0","id":2,"method":"ping"}"""))
            val (id, answer) = mcpAnswer(withTimeout(guard) { run.process.nextWrite() })
            assertEquals("R20", id)
            assertEquals(-32601, answer.getAsJsonObject("error").get("code").asInt)
            run.process.end()
            run.job.join()
        }

    @Test
    @Timeout(TIMEOUT)
    fun `initialize declares the hooks it was given`() =
        runBlocking {
            val run = start(listOf(ScriptedServer()), hooks = HostHooks(listOf(BEFORE_FILE_TOOL, AFTER_EDIT)))
            val first = withTimeout(guard) { run.process.nextWrite() }
            assertEquals(
                StdinEncoder.initialize(INIT_ID, listOf("ide-context"), listOf(BEFORE_FILE_TOOL, AFTER_EDIT)),
                first,
            )
            run.process.end()
            run.job.join()
        }

    private fun elicitationRequest(id: String) =
        """{"type":"control_request","request_id":"$id","request":{"subtype":"elicitation",""" +
            """"mcp_server_name":"files","message":"Name the file","mode":"form",""" +
            """"requested_schema":{"type":"object","properties":{"name":{"type":"string"}}}}}"""

    private fun initializeAnswer(pending: String) =
        """{"type":"control_response","response":{"subtype":"success","request_id":"$INIT_ID",""" +
            """"response":{"commands":[],"pending_elicitation_requests":[$pending]}}}"""

    @Test
    @Timeout(TIMEOUT)
    fun `type only - an elicitation listed in the initialize answer and sent live is one card`() =
        runBlocking {
            val process = ChannelProcess()
            val wrapper = HostAgentProcess(process, emptyList(), initializeRequestId = INIT_ID)
            val request = elicitationRequest("r9")
            listOf(initializeAnswer(request), request).forEach(process::emit)
            process.end()
            val events = mutableListOf<AgentEvent>()
            ClaudeSession(wrapper, "s1").events.collect { events += it }
            val asked = events.filterIsInstance<AgentEvent.Elicitation>()
            assertEquals(listOf("r9", "r9"), asked.map { it.requestId })
            assertTrue(
                events.indexOfFirst { it is AgentEvent.Elicitation } <
                    events.indexOfFirst { it is AgentEvent.ControlResponse },
                "the listed request comes before the answer that listed it: $events",
            )
            val state = events.fold(HostState()) { held, event -> held.next(PresenterInput.Event(event)) }
            assertEquals(listOf("r9"), state.conversation.pendingApprovals.map { it.requestId })
            assertEquals(1, state.cards().size)
        }

    @Test
    @Timeout(TIMEOUT)
    fun `type only - the same elicitation arriving late after it was answered is not a new card`() =
        runBlocking {
            val process = ChannelProcess()
            val wrapper = HostAgentProcess(process, emptyList(), initializeRequestId = INIT_ID)
            val request = elicitationRequest("r9")
            listOf(initializeAnswer(request)).forEach(process::emit)
            process.end()
            val events = mutableListOf<AgentEvent>()
            ClaudeSession(wrapper, "s1").events.collect { events += it }
            val listed = events.fold(HostState()) { held, event -> held.next(PresenterInput.Event(event)) }
            val answered = listed.next(PresenterInput.ElicitationDecided("r9", ElicitationAction.ACCEPT, "{}"))
            val late = answered.next(PresenterInput.Event(events.filterIsInstance<AgentEvent.Elicitation>().single()))
            assertEquals(emptyList<String>(), late.conversation.pendingApprovals.map { it.requestId })
            assertEquals(0, late.cards().count { it.stage == ElicitationStage.WAITING })
        }

    private fun HostState.cards(): List<ElicitationCard> =
        ThreadRows()
            .of(transcript, conversation)
            .filterIsInstance<CardRow>()
            .map { it.card }
            .filterIsInstance<ElicitationCard>()

    private fun response(
        subtype: String,
        requestId: String,
    ) = """{"type":"control_response","response":{"subtype":"$subtype","request_id":"$requestId","response":{}}}"""

    private companion object {
        const val INIT_ID = "init-1"
        const val TIMEOUT = 30L
    }
}
