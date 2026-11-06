package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString

// What the MCP console shows, kept next to the operations: the servers the CLI last listed (`mcp_status`) and the
// sentence of a refusal. The answer is read for a name, a state, where the server comes from, the names of its tools
// and a sentence; the `config` (a URL, headers, a command, args, env: what may hold a secret) and `serverInfo` are
// never read, so nothing of them can reach a record, a tree or a log.

/**
 * One MCP server as the CLI listed it. [status] is one of [MCP_STATUSES] or [MCP_UNKNOWN]; [source] is the CLI's
 * `source`, else its `scope`, else empty (capture 24: both are `dynamic`); [error] is a sentence already made safe by
 * [mcpSentence].
 */
data class McpServerRecord(
    val name: String,
    val status: String,
    val source: String,
    val tools: List<String>,
    val error: String?,
)

/** The states `McpServerStatus` names (sdk.d.ts 0.3.302), as the CLI writes them. */
val MCP_STATUSES: List<String> = listOf("connected", "failed", "needs-auth", "pending", "disabled")

/** What a state the host does not know reads as. */
const val MCP_UNKNOWN = "unknown"

/** The `source` that is the host's own in-process server (`sdk`, sdk.d.ts: "only the host can register one"). */
const val MCP_SOURCE_SDK = "sdk"

/** The most servers kept of one answer. */
const val MAX_MCP_SERVERS = 100

/** The most tool names kept of one server. */
const val MAX_MCP_TOOLS = 64

/** The longest an MCP sentence is, in characters. */
const val MAX_MCP_SENTENCE_CHARS = 200

/** Whether [this] is the host's own in-process server: the CLI says `sdk`, or it is a name the host declared. */
internal fun McpServerRecord.isBuiltIn(declared: List<String>): Boolean = source == MCP_SOURCE_SDK || name in declared

/**
 * What the CLI's answer to `mcp_status` says, or null when it is not an answer to read (no `mcpServers` array). A
 * server with no name is left out; a state the host does not know is [MCP_UNKNOWN].
 */
internal fun mcpServersOf(body: JsonObject?): List<McpServerRecord>? {
    val servers = body?.array("mcpServers")?.items ?: return null
    return servers
        .mapNotNull { item ->
            val fields = item as? JsonObject
            val name = fields?.string("name")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
            McpServerRecord(
                name = name,
                status = fields.string("status")?.takeIf { it in MCP_STATUSES } ?: MCP_UNKNOWN,
                source = fields.string("source")?.takeIf { it.isNotEmpty() } ?: fields.string("scope").orEmpty(),
                tools =
                    fields
                        .array("tools")
                        ?.items
                        .orEmpty()
                        .mapNotNull { (it as? JsonObject)?.string("name")?.takeIf(String::isNotEmpty) }
                        .take(MAX_MCP_TOOLS),
                error = fields.string("error")?.let(::mcpSentence)?.takeIf { it.isNotEmpty() },
            )
        }.take(MAX_MCP_SERVERS)
}

private val URL_IN_TEXT = Regex("""[A-Za-z][A-Za-z0-9+.\-]*://[^\s"'<>)\]]*""")

/**
 * A sentence of an MCP failure made safe to show and keep: the first line only, each URL in it without its userinfo
 * (what stands before an `@` in the authority) and without its query and fragment (what stands after the first `?` or
 * `#`: where a token may be), and then at most [MAX_MCP_SENTENCE_CHARS] characters. The URLs are cleaned before the
 * cut, so a cut cannot leave the front of a secret that the cleaning would have recognised by its end. One function
 * for every sentence that comes from the CLI's errors: the list's `error`, a refusal of a switch, and a control
 * error's notice.
 */
fun mcpSentence(text: String): String {
    val firstLine =
        text
            .trim()
            .lineSequence()
            .firstOrNull()
            .orEmpty()
    return URL_IN_TEXT.replace(firstLine) { cleanUrl(it.value) }.take(MAX_MCP_SENTENCE_CHARS)
}

// The userinfo goes first: what stands after the scheme up to the last `@` of the URL's whole lexical
// token, whatever it holds (a userinfo may carry a raw `/`, `?` or `#`, so the authority cannot be
// found by those). Then the query and fragment: what stands after the first `?` or `#` of what is
// left. A URL that has an `@` only in its path or query loses its host as well: the cleaning errs on
// the side of showing less.
private fun cleanUrl(url: String): String {
    val schemeEnd = url.indexOf("://") + "://".length
    val rest = url.substring(schemeEnd).substringAfterLast('@')
    val queryAt = rest.indexOfFirst { it == '?' || it == '#' }.takeIf { it >= 0 } ?: rest.length
    return url.substring(0, schemeEnd) + rest.substring(0, queryAt)
}

/** The servers of an answer, as the tree spells them; [declared] are the host's own in-process servers' names. */
internal fun mcpServersNode(
    servers: List<McpServerRecord>,
    declared: List<String>,
): JsonArray =
    JsonArray(
        servers.map { server ->
            val node =
                JsonObject
                    .Builder()
                    .put("name", JsonString(server.name))
                    .put("status", JsonString(server.status))
                    .put("source", JsonString(server.source))
                    .put("builtIn", JsonBool.of(server.isBuiltIn(declared)))
                    .put("tools", JsonArray(server.tools.map(::JsonString)))
            server.error?.let { node.put("error", JsonString(it)) }
            node.build()
        },
    )

/** The answer to a status request: a list replaces the last one; an error, or a body that is no list, keeps it. */
internal fun OperationRecords.mcpAnswered(
    id: String,
    event: AgentEvent.ControlResponse,
): OperationRecords {
    val body = (JsonRead.parse(event.response.text) as? JsonObject)?.obj("response")
    val read = if (event.subtype == "success") mcpServersOf(body) else null
    return if (read == null) {
        copy(mcpWaiting = mcpWaiting - id, mcpUnreadable = true)
    } else {
        copy(mcpWaiting = mcpWaiting - id, mcpServers = read, mcpUnreadable = false)
    }
}

/** A switch of an MCP server asked for and not answered yet: the request's value is the server's name. */
internal fun OperationRecords.mcpSwitch(
    input: PresenterInput.ControlRequested,
    kind: SwitchKind,
): SwitchRecord = SwitchRecord(input.requestId, seq + 1, kind, input.value.orEmpty())

// The list comes with an answer and is replaced; the flag is there only while the last ask was not read.
internal fun putMcp(
    node: JsonObject.Builder,
    extras: ThreadExtras,
) {
    extras.mcpServers?.let { node.put("mcpServers", it) }
    if (extras.mcpServersUnreadable) node.put("mcpServersUnreadable", JsonBool.TRUE)
}

/**
 * What an applied switch of an MCP server does to the last list, until the list asked for again comes: the host
 * wrote the state the CLI measured after the same request (capture 24: disabled after a turn off, connected after a
 * turn on), so the screen does not go back to the state before the press. A turn off makes the server `disabled`,
 * without its tools and its sentence; a turn on makes a `disabled` one `pending` (connecting; the list asked for again
 * says the rest).
 * A reconnect, a name the list does not have, and a list not yet answered change nothing. Only an applied switch is
 * written: a refusal or a failure leaves the state where it was.
 */
internal fun OperationRecords.mcpSwitchApplied(record: SwitchRecord): OperationRecords {
    val listed = mcpServers ?: return this
    val written =
        listed.map { server ->
            when {
                server.name != record.value -> server
                record.kind == SwitchKind.MCP_DISABLE ->
                    server.copy(
                        status = "disabled",
                        tools = emptyList(),
                        error = null,
                    )
                record.kind == SwitchKind.MCP_ENABLE && server.status == "disabled" ->
                    server.copy(status = "pending", tools = emptyList(), error = null)
                else -> server
            }
        }
    return if (written == listed) this else copy(mcpServers = written)
}
