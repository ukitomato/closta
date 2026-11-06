package dev.ukitomato.closta.providers.claude.mcp

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import dev.ukitomato.closta.core.interfaces.Diagnostic
import dev.ukitomato.closta.core.interfaces.DiagnosticSeverity
import dev.ukitomato.closta.core.interfaces.Diagnostics
import dev.ukitomato.closta.core.interfaces.IdeBridge
import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.providers.claude.launch.CliPaths
import dev.ukitomato.closta.providers.claude.launch.NativeCliPaths
import java.net.URI
import java.net.URISyntaxException
import java.nio.file.InvalidPathException
import java.nio.file.Paths

/** The in-process MCP servers [bridge] can back: [IdeContextServer] with diagnostics, else none. */
fun ideContextServers(
    bridge: IdeBridge,
    paths: CliPaths = NativeCliPaths,
): List<SdkMcpServer> = listOfNotNull(bridge.diagnostics?.let { IdeContextServer(it, paths) })

/**
 * The server `ide-context` with one tool, `getDiagnostics`: the errors and warnings the IDE has already found, for one
 * file or for every open file. The CLI sees the tool as `mcp__ide-context__getDiagnostics`. The name
 * is not `ide`, which the CLI gives a special meaning.
 *
 * A refusal from [diagnostics] is an `isError` result with a fixed sentence for its kind; the host's own words are not
 * passed on.
 */
@Suppress("TooManyFunctions") // one function per JSON-RPC method and result shape
class IdeContextServer(
    private val diagnostics: Diagnostics,
    /** Where the CLI's paths and the IDE's differ (a WSL project): reads the argument, makes the uri. */
    private val paths: CliPaths = NativeCliPaths,
) : SdkMcpServer {
    override val name: String = NAME

    override suspend fun handle(message: JsonObject): JsonObject? {
        val id = message.get("id")
        val method = message.get("method")?.takeIf { it.isJsonPrimitive }?.asString
        val params = message.get("params")?.takeIf { it.isJsonObject }?.asJsonObject
        return when {
            id == null || id.isJsonNull -> null
            method == "initialize" -> JsonRpc.result(id, initializeResult(params))
            method == "tools/list" -> JsonRpc.result(id, toolList())
            method == "tools/call" -> call(id, params)
            method == "ping" -> JsonRpc.result(id, JsonObject())
            else -> JsonRpc.error(id, JsonRpc.METHOD_NOT_FOUND, "Method not found")
        }
    }

    private fun initializeResult(params: JsonObject?): JsonObject =
        JsonObject().apply {
            val asked = params?.get("protocolVersion")?.takeIf { it.isJsonPrimitive }?.asString
            addProperty("protocolVersion", if (asked in SUPPORTED_PROTOCOLS) asked else PROTOCOL)
            add("capabilities", JsonObject().apply { add("tools", JsonObject()) })
            add(
                "serverInfo",
                JsonObject().apply {
                    addProperty("name", NAME)
                    addProperty("version", VERSION)
                },
            )
        }

    private fun toolList(): JsonObject =
        JsonObject().apply {
            add(
                "tools",
                JsonArray().apply {
                    add(
                        JsonObject().apply {
                            addProperty("name", TOOL)
                            addProperty(
                                "description",
                                "Errors and warnings the IDE has already found, for one file or for every open file. " +
                                    "Only files open in the IDE have any: a file that is not open is refused. " +
                                    "line and column are 1-based.",
                            )
                            add("inputSchema", inputSchema())
                        },
                    )
                },
            )
        }

    private fun inputSchema(): JsonObject =
        JsonObject().apply {
            addProperty("type", "object")
            add(
                "properties",
                JsonObject().apply {
                    add(
                        "uri",
                        JsonObject().apply {
                            addProperty("type", "string")
                            addProperty(
                                "description",
                                "A file: URI or an absolute path of a file open in the IDE. " +
                                    "Omit it for every file open in the IDE.",
                            )
                        },
                    )
                },
            )
            addProperty("additionalProperties", false)
        }

    private suspend fun call(
        id: JsonElement,
        params: JsonObject?,
    ): JsonObject {
        val tool = params?.get("name")?.takeIf { it.isJsonPrimitive }?.asString
        if (tool != TOOL) return JsonRpc.error(id, JsonRpc.INVALID_PARAMS, "Unknown tool")
        val arguments = params?.get("arguments")
        val uri = (arguments as? JsonObject)?.get("uri")
        val path: PathArgument =
            when {
                arguments != null && !arguments.isJsonNull && !arguments.isJsonObject -> PathArgument.Bad
                uri == null || uri.isJsonNull -> PathArgument.Absent
                uri.isJsonPrimitive && uri.asJsonPrimitive.isString -> pathOf(uri.asString)
                else -> PathArgument.Bad
            }
        return JsonRpc.result(
            id,
            when (path) {
                PathArgument.Bad -> textResult("uri must be a file: URI or an absolute path", isError = true)
                PathArgument.Absent -> diagnosticsResult(null)
                is PathArgument.Path -> diagnosticsResult(path.value)
            },
        )
    }

    private suspend fun diagnosticsResult(path: String?): JsonObject =
        when (val result = diagnostics.diagnostics(path)) {
            is IdeResult.Ok -> textResult(render(result.value), isError = false)
            is IdeResult.Failed -> textResult("getDiagnostics failed: ${describe(result.kind)}", isError = true)
        }

    private sealed interface PathArgument {
        data object Absent : PathArgument

        data object Bad : PathArgument

        data class Path(
            val value: String,
        ) : PathArgument
    }

    private fun pathOf(text: String): PathArgument =
        try {
            val ide = paths.toIdeArgument(text)
            when {
                ide.startsWith("file:") -> Paths.get(URI(ide)).toString().let(PathArgument::Path)
                Paths.get(ide).isAbsolute -> PathArgument.Path(ide)
                else -> PathArgument.Bad
            }
        } catch (
            @Suppress("SwallowedException") bad: URISyntaxException,
        ) {
            PathArgument.Bad
        } catch (
            @Suppress("SwallowedException") bad: InvalidPathException,
        ) {
            PathArgument.Bad
        } catch (
            @Suppress("SwallowedException") bad: IllegalArgumentException,
        ) {
            // Paths.get(URI) rejects a URI that is not a plain file path.
            PathArgument.Bad
        }

    /** The text the model reads: files with their findings, as JSON. `[]` when there are none. */
    private fun render(found: List<Diagnostic>): String =
        JsonArray()
            .apply {
                found.groupBy(Diagnostic::path).forEach { (path, items) ->
                    add(
                        JsonObject().apply {
                            addProperty("uri", paths.toCliUri(path))
                            add("diagnostics", JsonArray().apply { items.forEach { add(entry(it)) } })
                        },
                    )
                }
            }.toString()

    private fun entry(item: Diagnostic): JsonObject =
        JsonObject().apply {
            addProperty("severity", if (item.severity == DiagnosticSeverity.ERROR) "Error" else "Warning")
            addProperty("message", item.message)
            add(
                "range",
                JsonObject().apply {
                    add("start", position(item.line, item.column))
                },
            )
            item.source?.let { addProperty("source", it) }
        }

    private fun position(
        line: Int,
        column: Int,
    ): JsonObject =
        JsonObject().apply {
            addProperty("line", line)
            addProperty("column", column)
        }

    private fun describe(kind: IdeFailureKind): String =
        when (kind) {
            IdeFailureKind.INVALID_ARGUMENT -> "the request was not valid"
            IdeFailureKind.OUTSIDE_PROJECT -> "the file is not in the project"
            IdeFailureKind.NOT_FOUND -> "the file was not found"
            IdeFailureKind.NOT_WRITABLE -> "the file is not writable"
            IdeFailureKind.OUT_OF_RANGE -> "the range is out of bounds"
            IdeFailureKind.ALREADY_EXISTS -> "it already exists"
            IdeFailureKind.UNAVAILABLE -> "the IDE has no diagnostics for it now; the file must be open in the IDE"
            IdeFailureKind.FAILED -> "the IDE could not do it"
        }

    private fun textResult(
        text: String,
        isError: Boolean,
    ): JsonObject =
        JsonObject().apply {
            add(
                "content",
                JsonArray().apply {
                    add(
                        JsonObject().apply {
                            addProperty("type", "text")
                            addProperty("text", text)
                        },
                    )
                },
            )
            addProperty("isError", isError)
        }

    companion object {
        const val NAME = "ide-context"
        const val TOOL = "getDiagnostics"
        private const val PROTOCOL = "2024-11-05"

        /** Versions in which this server's methods mean the same; any other asked version gets [PROTOCOL]. */
        private val SUPPORTED_PROTOCOLS = setOf("2024-11-05", "2025-03-26", "2025-06-18")
        private const val VERSION = "0.1.0"
    }
}
