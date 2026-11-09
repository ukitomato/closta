// JSON wire lines are written whole, so that what is measured can be read as sent.
@file:Suppress("MaxLineLength")

package dev.ukitomato.closta.providers.claude.mcp

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import dev.ukitomato.closta.providers.claude.AgentProcess
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger

/** A process whose stdout the test feeds line by line and whose stdin writes it can read, with no OS process. */
class ChannelProcess : AgentProcess {
    private val out = Channel<String>(Channel.UNLIMITED)
    private val writes = Channel<String>(Channel.UNLIMITED)

    val written = CopyOnWriteArrayList<String>()

    @Volatile
    var destroyed = false
        private set

    override val stdoutLines: Flow<String> = flow { for (line in out) emit(line) }

    override suspend fun writeStdin(line: String) {
        written += line
        writes.trySend(line)
    }

    override suspend fun awaitExit(): Int = 0

    override fun destroy() {
        destroyed = true
    }

    /** How many times [destroyForcibly] was called; it is counted apart from [destroy]. */
    val forceKills = AtomicInteger()

    override fun destroyForcibly() {
        forceKills.incrementAndGet()
    }

    fun emit(line: String) {
        out.trySend(line)
    }

    fun end() {
        out.close()
    }

    /** The next line written to stdin, in order. */
    suspend fun nextWrite(): String = writes.receive()
}

/** A server whose answer waits on [gate], records what it was asked, and can be made to fail. */
class ScriptedServer(
    override val name: String = "ide-context",
    private val gate: CompletableDeferred<Unit>? = null,
    private val failure: Throwable? = null,
) : SdkMcpServer {
    val asked = CopyOnWriteArrayList<JsonObject>()

    /** Completes when the first message reaches the server. */
    val started = CompletableDeferred<Unit>()

    override suspend fun handle(message: JsonObject): JsonObject? {
        asked += message
        started.complete(Unit)
        gate?.await()
        failure?.let { throw it }
        val id = message.get("id") ?: return null
        return JsonRpc.result(id, JsonObject().apply { addProperty("echo", "ok") })
    }
}

/** A server that turns a cancellation of its answer into a CancellationException of its own. */
class SwallowingServer(
    override val name: String = "ide-context",
    private val gate: CompletableDeferred<Unit>,
) : SdkMcpServer {
    val started = CompletableDeferred<Unit>()

    override suspend fun handle(message: JsonObject): JsonObject? {
        started.complete(Unit)
        try {
            gate.await()
        } catch (
            @Suppress("SwallowedException") cancelled: kotlinx.coroutines.CancellationException,
        ) {
            throw kotlinx.coroutines.CancellationException("a different one")
        }
        return null
    }
}

fun mcpRequest(
    requestId: String,
    server: String,
    message: String,
): String =
    """{"type":"control_request","request_id":"$requestId","request":{"subtype":"mcp_message","server_name":"$server","message":$message}}"""

fun json(text: String): JsonObject = JsonParser.parseString(text).asJsonObject

/** The `mcp_response` inside a written control_response, and the request_id it answers. */
fun mcpAnswer(line: String): Pair<String, JsonObject> {
    val response = json(line).getAsJsonObject("response")
    return response.get("request_id").asString to response.getAsJsonObject("response").getAsJsonObject("mcp_response")
}
