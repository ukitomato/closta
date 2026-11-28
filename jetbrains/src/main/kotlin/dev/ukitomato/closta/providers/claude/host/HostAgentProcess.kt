package dev.ukitomato.closta.providers.claude.host

import com.google.gson.JsonObject
import com.google.gson.JsonParseException
import com.google.gson.JsonParser
import dev.ukitomato.closta.providers.claude.AgentProcess
import dev.ukitomato.closta.providers.claude.mcp.JsonRpc
import dev.ukitomato.closta.providers.claude.mcp.SdkMcpServer
import dev.ukitomato.closta.providers.claude.protocol.StdinEncoder
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.channels.ProducerScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import java.io.IOException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

/**
 * Wraps every launched `claude` process, whether or not there is anything to answer for, so the host can answer for
 * in-process MCP [servers] and for the hooks of [hooks] on the same stdio. To `ClaudeSession` it looks like any
 * [AgentProcess]; to the CLI it is the host the SDK would be.
 *
 *  1. Before the first write of any kind, it writes `initialize` (declaring the servers' names in `sdkMcpServers` and
 *     the hooks in `hooks`, both empty for a session with neither) once, under the write lock, whichever of the
 *     session's writer and the stdout reader gets there first.
 *  2. A `control_request` of subtype `mcp_message` or `hook_callback` is taken off stdout and answered on a coroutine
 *     of its own, so the reader goes on to the next line while a slow server or hook thinks. The answer is a
 *     `control_response` with the same `request_id`. An MCP answer has a deadline ([answerTimeout]); a deadline, or a
 *     failure of the server (an exception, or any `Throwable` but a `VirtualMachineError`, a `CancellationException`
 *     of its own included), is answered as a JSON-RPC error. A hook answer has its own ([hookTimeout]), and a
 *     deadline or a failure is an empty success, so the CLI's action goes on; an id the hooks do not know is an
 *     error. Either way the CLI is never left waiting. A `control_cancel_request` for a request still being answered
 *     stops that answer and writes nothing; one for any other request goes on to the session, as it did before.
 *  3. The response to the wrapper's own `initialize` goes on to the session like any other line, success or error: the
 *     fold turns an error into a note, and a success carries the slash commands the presenter shows. Before it goes,
 *     each `control_request` listed in its `pending_elicitation_requests` goes on first, as if it had just arrived;
 *     the same request arriving again as a line of its own is the fold's to recognise.
 *  4. Every other line goes on in arrival order, the same string byte for byte. Telling lines apart costs a substring
 *     check on every line and a JSON parse only on those that name `mcp_message`, `hook_callback` or
 *     `control_cancel_request`, or that are the answer to `initialize` listing pending requests, so the heavy
 *     `stream_event` path is not parsed. A line that merely mentions those words in its body, or does not parse, is
 *     passed on.
 *
 * The answering coroutines belong to the collection of [stdoutLines] (a `channelFlow`): when the session stops
 * collecting, or [destroy] runs, they are cancelled, and nothing is written after [destroy]. stderr is drained by the
 * wrapped process and is not touched here. Writes go through one lock so the session's lines and the answers do not
 * interleave.
 */
@Suppress("TooManyFunctions", "ReturnCount", "LongParameterList") // one wrapper: routing, answering and lifetime
class HostAgentProcess(
    private val inner: AgentProcess,
    private val servers: List<SdkMcpServer>,
    private val hooks: HostHooks = HostHooks(),
    private val initializeRequestId: String = "mcp-init-" + UUID.randomUUID(),
    private val answerTimeout: Duration = DEFAULT_ANSWER_TIMEOUT,
    private val hookTimeout: Duration = DEFAULT_HOOK_TIMEOUT,
    private val log: (String) -> Unit = {},
) : AgentProcess {
    private val writeLock = Mutex()
    private var initialized = false

    @Volatile
    private var closed = false
    private val pending = ConcurrentHashMap<String, Job>()

    override val stdoutLines: Flow<String> =
        channelFlow {
            try {
                startUp()
                inner.stdoutLines.collect { line -> if (!intercept(line, this)) send(line) }
            } finally {
                cancelPending()
            }
        }

    // A process that is already gone cannot be written to; what it says, and how it ended, still reach the session.
    private suspend fun startUp() {
        try {
            writeLock.withLock { initializeOnce() }
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("SwallowedException") failure: IOException,
        ) {
            // The reader goes on; the session's own writes fail the same way and say so.
        }
    }

    override suspend fun writeStdin(line: String) {
        writeLock.withLock {
            initializeOnce()
            inner.writeStdin(line)
        }
    }

    override suspend fun awaitExit(): Int = inner.awaitExit()

    override fun destroy() {
        closed = true
        cancelPending()
        inner.destroy()
    }

    override fun destroyForcibly() {
        closed = true
        cancelPending()
        inner.destroyForcibly()
    }

    private suspend fun initializeOnce() {
        if (initialized) return
        initialized = true
        inner.writeStdin(
            StdinEncoder.initialize(initializeRequestId, servers.map(SdkMcpServer::name), hooks.declarations),
        )
    }

    private fun cancelPending() {
        pending.values.forEach { it.cancel() }
        pending.clear()
    }

    /** True when [line] was ours and is taken off the stream. */
    private suspend fun intercept(
        line: String,
        scope: ProducerScope<String>,
    ): Boolean {
        if (PENDING_ELICITATIONS in line && initializeRequestId in line) releasePending(line, scope)
        val mayBeOurs = MCP_MESSAGE in line || HOOK_CALLBACK in line || CANCEL_REQUEST in line
        val parsed = if (mayBeOurs) parseObject(line) else null
        return parsed != null && take(parsed, scope)
    }

    /** The requests the answer to `initialize` lists go to the session ahead of the answer itself. */
    private suspend fun releasePending(
        line: String,
        scope: ProducerScope<String>,
    ) {
        val answer = parseObject(line)?.obj("response")
        if (answer == null || answer.string("request_id") != initializeRequestId) return
        val listed = answer.obj("response")?.get(PENDING_ELICITATIONS)
        if (listed == null || !listed.isJsonArray) return
        listed.asJsonArray.filter { it.isJsonObject }.forEach { scope.send(it.toString()) }
    }

    private fun take(
        line: JsonObject,
        scope: CoroutineScope,
    ): Boolean =
        when (line.string("type")) {
            "control_request" -> takeRequest(line, scope)
            "control_cancel_request" -> takeCancel(line)
            else -> false
        }

    private fun takeRequest(
        line: JsonObject,
        scope: CoroutineScope,
    ): Boolean {
        val request = line.obj("request")
        val requestId = line.string("request_id")
        if (request == null || requestId == null) return false
        val work = workFor(requestId, request) ?: return false
        val job = scope.launch(start = CoroutineStart.LAZY) { write(work()) }
        pending[requestId] = job
        job.invokeOnCompletion { pending.remove(requestId, job) }
        job.start()
        return true
    }

    private fun workFor(
        requestId: String,
        request: JsonObject,
    ): (suspend () -> String)? =
        when (request.string("subtype")) {
            MCP_MESSAGE -> suspend { mcpAnswer(requestId, request.string("server_name"), request.obj("message")) }
            HOOK_CALLBACK -> hookWork(requestId, request)
            else -> null
        }

    private fun hookWork(
        requestId: String,
        request: JsonObject,
    ): (suspend () -> String)? {
        // A callback with no id is one nobody can know: it is answered, so the CLI does not wait out its deadline.
        val callbackId = request.string("callback_id") ?: return suspend { unknownHook(requestId) }
        val input = request.obj("input") ?: JsonObject()
        return suspend { hookAnswer(requestId, callbackId, input, request.string("tool_use_id")) }
    }

    private fun takeCancel(line: JsonObject): Boolean {
        val job = line.string("request_id")?.let { pending.remove(it) } ?: return false
        job.cancel()
        return true
    }

    private suspend fun mcpAnswer(
        requestId: String,
        serverName: String?,
        message: JsonObject?,
    ): String = StdinEncoder.mcpResponse(requestId, reply(serverName, message).toString())

    private suspend fun write(line: String) {
        if (closed) return
        try {
            writeLock.withLock {
                // The lock may have been waited for a long time; a cancelled answer must not write after it.
                currentCoroutineContext().ensureActive()
                if (closed) return
                initializeOnce()
                inner.writeStdin(line)
            }
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught", "SwallowedException") failure: Exception,
        ) {
            // The process is gone or its stdin is closed: nobody is waiting for this answer any more.
        }
    }

    private fun unknownHook(requestId: String) = StdinEncoder.controlError(requestId, UNKNOWN_HOOK)

    private suspend fun hookAnswer(
        requestId: String,
        callbackId: String,
        input: JsonObject,
        toolUseId: String?,
    ): String =
        try {
            val answer = withTimeout(hookTimeout) { hooks.answerer?.answer(callbackId, input, toolUseId) }
            if (answer == null) {
                unknownHook(requestId)
            } else {
                StdinEncoder.hookResponse(requestId, answer.toString())
            }
        } catch (
            @Suppress("SwallowedException") timeout: TimeoutCancellationException,
        ) {
            StdinEncoder.hookResponse(requestId, "{}")
        } catch (
            @Suppress("SwallowedException") cancel: CancellationException,
        ) {
            // Cancelled from outside: stop. A hook that threw a CancellationException of its own has failed.
            currentCoroutineContext().ensureActive()
            StdinEncoder.hookResponse(requestId, "{}")
        } catch (fatal: VirtualMachineError) {
            throw fatal
        } catch (
            @Suppress("TooGenericExceptionCaught", "SwallowedException") failure: Throwable,
        ) {
            // A failing hook must not stop the CLI's action, and its words are not ours to vouch for, so only its type.
            log("hook failed (${failure.javaClass.name})")
            StdinEncoder.hookResponse(requestId, "{}")
        }

    private suspend fun reply(
        serverName: String?,
        message: JsonObject?,
    ): JsonObject {
        val id = message?.get("id")
        val server = servers.firstOrNull { it.name == serverName }
        return when {
            message == null -> JsonRpc.error(null, JsonRpc.INVALID_PARAMS, "mcp_message carries no message")
            server == null -> JsonRpc.error(id, JsonRpc.METHOD_NOT_FOUND, "unknown MCP server")
            else -> ask(server, message) ?: JsonRpc.acknowledgement()
        }
    }

    private suspend fun ask(
        server: SdkMcpServer,
        message: JsonObject,
    ): JsonObject? =
        try {
            withTimeout(answerTimeout) { server.handle(message) }
        } catch (
            @Suppress("SwallowedException") timeout: TimeoutCancellationException,
        ) {
            JsonRpc.error(message.get("id"), JsonRpc.INTERNAL_ERROR, "the server did not answer in time")
        } catch (
            @Suppress("SwallowedException") cancel: CancellationException,
        ) {
            // Cancelled from outside (a cancel request, destroy, the collector going away): stop. A server that threw
            // a CancellationException of its own while this answer is still wanted has failed like any other.
            currentCoroutineContext().ensureActive()
            failed(message)
        } catch (fatal: VirtualMachineError) {
            throw fatal
        } catch (
            @Suppress("TooGenericExceptionCaught", "SwallowedException") failure: Throwable,
        ) {
            // The failure's own words are not ours to vouch for: a fixed sentence goes back.
            failed(message)
        }

    private fun failed(message: JsonObject): JsonObject =
        JsonRpc.error(message.get("id"), JsonRpc.INTERNAL_ERROR, "the server failed")

    private fun parseObject(line: String): JsonObject? =
        try {
            JsonParser.parseString(line).takeIf { it.isJsonObject }?.asJsonObject
        } catch (
            @Suppress("SwallowedException") notJson: JsonParseException,
        ) {
            null
        }

    private fun JsonObject.string(key: String): String? =
        get(key)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString

    private fun JsonObject.obj(key: String): JsonObject? = get(key)?.takeIf { it.isJsonObject }?.asJsonObject

    private companion object {
        const val MCP_MESSAGE = "mcp_message"
        const val HOOK_CALLBACK = "hook_callback"
        const val UNKNOWN_HOOK = "unknown hook callback"
        const val PENDING_ELICITATIONS = "pending_elicitation_requests"
        const val CANCEL_REQUEST = "control_cancel_request"
        val DEFAULT_ANSWER_TIMEOUT = 10.seconds
        val DEFAULT_HOOK_TIMEOUT = 9.seconds
    }
}
