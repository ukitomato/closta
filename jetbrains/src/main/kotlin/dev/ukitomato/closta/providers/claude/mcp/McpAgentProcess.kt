package dev.ukitomato.closta.providers.claude.mcp

import com.google.gson.JsonObject
import com.google.gson.JsonParseException
import com.google.gson.JsonParser
import dev.ukitomato.closta.providers.claude.AgentProcess
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
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

/**
 * Wraps a launched `claude` process so the host can answer for in-process MCP [servers] on the same stdio.
 * To `ClaudeSession` it looks like any [AgentProcess]; to the CLI it is the host the SDK would be.
 *
 *  1. Before the first write of any kind, it writes `initialize` (declaring the servers' names in `sdkMcpServers`)
 *     once, under the write lock, whichever of the session's writer and the stdout reader gets there first.
 *  2. A `control_request` of subtype `mcp_message` is taken off stdout and answered on a coroutine of its own, so the
 *     reader goes on to the next line while a slow server thinks. The answer is a `control_response` with the same
 *     `request_id`. It has a deadline ([answerTimeout]); a deadline, or a failure of the server (an exception, or any
 *     `Throwable` but a `VirtualMachineError`, a `CancellationException` of its own included), is answered as a
 *     JSON-RPC error, so the CLI is never left waiting. A `control_cancel_request` for a request still being answered
 *     stops that answer and writes nothing; one for any other request goes on to the session, as it did before.
 *  3. The response to the wrapper's own `initialize` goes on to the session like any other line, success or error: the
 *     fold turns an error into a note, and a success carries the slash commands the presenter shows.
 *  4. Every other line goes on in arrival order, the same string byte for byte. Telling lines apart costs a substring
 *     check on every line and a JSON parse only on those that name `mcp_message` or `control_cancel_request`, so the
 *     heavy `stream_event` path is not parsed. A line that merely mentions those words in its body, or does not parse,
 *     is passed on.
 *
 * The answering coroutines belong to the collection of [stdoutLines] (a `channelFlow`): when the session stops
 * collecting, or [destroy] runs, they are cancelled, and nothing is written after [destroy]. stderr is drained by the
 * wrapped process and is not touched here. Writes go through one lock so the session's lines and the answers do not
 * interleave.
 */
@Suppress("TooManyFunctions", "ReturnCount") // one wrapper: line routing, answering and lifetime belong together
class McpAgentProcess(
    private val inner: AgentProcess,
    private val servers: List<SdkMcpServer>,
    private val initializeRequestId: String = "mcp-init-" + UUID.randomUUID(),
    private val answerTimeout: Duration = DEFAULT_ANSWER_TIMEOUT,
) : AgentProcess {
    private val writeLock = Mutex()
    private var initialized = false

    @Volatile
    private var closed = false
    private val pending = ConcurrentHashMap<String, Job>()

    override val stdoutLines: Flow<String> =
        channelFlow {
            try {
                writeLock.withLock { initializeOnce() }
                inner.stdoutLines.collect { line -> if (!intercept(line, this)) send(line) }
            } finally {
                cancelPending()
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
        inner.writeStdin(StdinEncoder.initialize(initializeRequestId, servers.map(SdkMcpServer::name)))
    }

    private fun cancelPending() {
        pending.values.forEach { it.cancel() }
        pending.clear()
    }

    /** True when [line] was ours and is taken off the stream. */
    private fun intercept(
        line: String,
        scope: ProducerScope<String>,
    ): Boolean {
        val mayBeOurs = MCP_MESSAGE in line || CANCEL_REQUEST in line
        val parsed = if (mayBeOurs) parseObject(line) else null
        return parsed != null && take(parsed, scope)
    }

    private fun take(
        line: JsonObject,
        scope: CoroutineScope,
    ): Boolean =
        when (line.string("type")) {
            "control_request" -> takeMcpMessage(line, scope)
            "control_cancel_request" -> takeCancel(line)
            else -> false
        }

    private fun takeMcpMessage(
        line: JsonObject,
        scope: CoroutineScope,
    ): Boolean {
        val request = line.obj("request")
        val requestId = line.string("request_id")
        if (request == null || requestId == null || request.string("subtype") != MCP_MESSAGE) return false
        val serverName = request.string("server_name")
        val message = request.obj("message")
        val job = scope.launch(start = CoroutineStart.LAZY) { answer(requestId, serverName, message) }
        pending[requestId] = job
        job.invokeOnCompletion { pending.remove(requestId, job) }
        job.start()
        return true
    }

    private fun takeCancel(line: JsonObject): Boolean {
        val job = line.string("request_id")?.let { pending.remove(it) } ?: return false
        job.cancel()
        return true
    }

    private suspend fun answer(
        requestId: String,
        serverName: String?,
        message: JsonObject?,
    ) {
        val reply = reply(serverName, message)
        if (closed) return
        try {
            writeLock.withLock {
                // The lock may have been waited for a long time; a cancelled answer must not write after it.
                currentCoroutineContext().ensureActive()
                if (closed) return
                initializeOnce()
                inner.writeStdin(StdinEncoder.mcpResponse(requestId, reply.toString()))
            }
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (
            @Suppress("TooGenericExceptionCaught", "SwallowedException") failure: Exception,
        ) {
            // The process is gone or its stdin is closed: nobody is waiting for this answer any more.
        }
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
        const val CANCEL_REQUEST = "control_cancel_request"
        val DEFAULT_ANSWER_TIMEOUT = 10.seconds
    }
}
