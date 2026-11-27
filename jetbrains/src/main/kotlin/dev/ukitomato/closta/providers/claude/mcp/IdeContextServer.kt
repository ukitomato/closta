package dev.ukitomato.closta.providers.claude.mcp

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import dev.ukitomato.closta.core.interfaces.Diagnostic
import dev.ukitomato.closta.core.interfaces.DiagnosticSeverity
import dev.ukitomato.closta.core.interfaces.Diagnostics
import dev.ukitomato.closta.core.interfaces.IdeBridge
import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.core.interfaces.SaveResult
import dev.ukitomato.closta.providers.claude.launch.CliPaths
import dev.ukitomato.closta.providers.claude.launch.NativeCliPaths
import java.net.URI
import java.net.URISyntaxException
import java.nio.file.InvalidPathException
import java.nio.file.Paths

/** The in-process MCP servers [bridge] can back: [IdeContextServer] when any of its seams exists, else none. */
fun ideContextServers(
    bridge: IdeBridge,
    paths: CliPaths = NativeCliPaths,
): List<SdkMcpServer> = listOfNotNull(IdeContextServer(bridge, paths).takeIf { it.hasTools() })

/**
 * The server `ide-context`: what the IDE knows, for the model to ask. The CLI sees a tool as
 * `mcp__ide-context__<name>`; the server is not named `ide`, which the CLI gives a special meaning. The tools are
 * `getDiagnostics`, `getOpenEditors`, `getCurrentSelection`, `checkDocumentDirty`, `saveDocument` and `openFile`
 * (see [ToolSpecs]); `tools/list` shows only those whose seam [bridge] has.
 *
 * A refusal from a seam is an `isError` result with a fixed sentence for its kind; the host's own words are not passed
 * on. Paths the model sends are read as the CLI knows them and handed to the IDE as the IDE writes them; paths sent
 * back are the CLI's ([paths]). Nothing is logged here: what a call touched is a path or a file's text.
 */
@Suppress("TooManyFunctions") // one function per JSON-RPC method, tool and result shape
class IdeContextServer(
    private val bridge: IdeBridge,
    /** Where the CLI's paths and the IDE's differ (a WSL project): reads the argument, makes the uri. */
    private val paths: CliPaths = NativeCliPaths,
) : SdkMcpServer {
    override val name: String = NAME

    /** Whether any seam is there to back a tool. */
    fun hasTools(): Boolean = specs().isNotEmpty()

    // The tools the host can back, in the order they are listed.
    private fun specs(): List<ToolSpec> =
        listOfNotNull(
            ToolSpecs.diagnostics.takeIf { bridge.diagnostics != null },
            ToolSpecs.openEditors.takeIf { bridge.openEditors != null },
            ToolSpecs.selection.takeIf { bridge.editorSelections != null },
            ToolSpecs.checkDirty.takeIf { bridge.unsavedDocuments != null },
            ToolSpecs.save.takeIf { bridge.unsavedDocuments != null },
            ToolSpecs.openFile.takeIf { bridge.editorOpening != null },
        )

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
        JsonObject().apply { add("tools", JsonArray().apply { specs().forEach { add(it.toJson()) } }) }

    private suspend fun call(
        id: JsonElement,
        params: JsonObject?,
    ): JsonObject {
        val tool = params?.get("name")?.takeIf { it.isJsonPrimitive }?.asString
        val arguments = params?.get("arguments")
        val result = if (specs().any { it.name == tool }) run(checkNotNull(tool), arguments) else null
        return if (result == null) {
            JsonRpc.error(id, JsonRpc.INVALID_PARAMS, "Unknown tool")
        } else {
            JsonRpc.result(id, result)
        }
    }

    private suspend fun run(
        tool: String,
        arguments: JsonElement?,
    ): JsonObject? =
        when (tool) {
            ToolSpecs.DIAGNOSTICS -> diagnosticsTool(arguments)
            ToolSpecs.OPEN_EDITORS -> withoutArguments(arguments) { openEditorsTool() }
            ToolSpecs.SELECTION -> withoutArguments(arguments) { selectionTool() }
            ToolSpecs.CHECK_DIRTY -> withFile(arguments, inside = false) { checkDirtyTool(it) }
            ToolSpecs.SAVE -> withFile(arguments, inside = true) { saveTool(it) }
            ToolSpecs.OPEN_FILE ->
                withFile(
                    arguments,
                    inside = true,
                    extra = setOf(ToolSpecs.LINE),
                ) { openFileTool(it) }
            else -> null
        }

    // getDiagnostics keeps its first shape: the uri is optional and other keys are not looked at.
    private suspend fun diagnosticsTool(arguments: JsonElement?): JsonObject {
        val diagnostics = checkNotNull(bridge.diagnostics)
        val uri = (arguments as? JsonObject)?.get(ToolSpecs.URI)
        val path: PathArgument =
            when {
                arguments != null && !arguments.isJsonNull && !arguments.isJsonObject -> PathArgument.Bad
                uri == null || uri.isJsonNull -> PathArgument.Absent
                uri.isJsonPrimitive && uri.asJsonPrimitive.isString -> pathOf(uri.asString)
                else -> PathArgument.Bad
            }
        return when (path) {
            PathArgument.Bad -> textResult("uri must be a file: URI or an absolute path", isError = true)
            PathArgument.Absent -> diagnosticsResult(diagnostics, null)
            is PathArgument.Path -> diagnosticsResult(diagnostics, path.value)
        }
    }

    private suspend fun diagnosticsResult(
        diagnostics: Diagnostics,
        path: String?,
    ): JsonObject =
        when (val result = diagnostics.diagnostics(path)) {
            is IdeResult.Ok -> textResult(render(result.value), isError = false)
            is IdeResult.Failed -> failed(ToolSpecs.DIAGNOSTICS, result.kind)
        }

    private suspend fun withoutArguments(
        arguments: JsonElement?,
        then: suspend () -> JsonObject,
    ): JsonObject =
        when (val checked = argumentsOf(arguments, emptySet())) {
            is Arguments.Refused -> textResult(checked.text, isError = true)
            is Arguments.Given -> then()
        }

    // [inside] refuses a file outside the project before the seam is asked; [extra] names the other arguments allowed.
    private suspend fun withFile(
        arguments: JsonElement?,
        inside: Boolean,
        extra: Set<String> = emptySet(),
        then: suspend (FileCall) -> JsonObject,
    ): JsonObject {
        val checked = argumentsOf(arguments, extra + ToolSpecs.URI)
        val uri = (checked as? Arguments.Given)?.values?.get(ToolSpecs.URI)
        val path: PathArgument =
            if (uri != null &&
                uri.isJsonPrimitive &&
                uri.asJsonPrimitive.isString
            ) {
                pathOf(uri.asString)
            } else {
                PathArgument.Bad
            }
        return when {
            checked is Arguments.Refused -> textResult(checked.text, isError = true)
            path !is PathArgument.Path -> textResult("uri is required: a file: URI or an absolute path", isError = true)
            inside && !insideProject(path.value) -> textResult(OUTSIDE_PROJECT, isError = true)
            else -> then(FileCall(path.value, (checked as Arguments.Given).values))
        }
    }

    private class FileCall(
        val path: String,
        val arguments: JsonObject,
    )

    private sealed interface Arguments {
        data class Given(
            val values: JsonObject,
        ) : Arguments

        data class Refused(
            val text: String,
        ) : Arguments
    }

    private fun argumentsOf(
        arguments: JsonElement?,
        allowed: Set<String>,
    ): Arguments =
        when {
            arguments == null || arguments.isJsonNull -> Arguments.Given(JsonObject())
            !arguments.isJsonObject -> Arguments.Refused("arguments must be an object")
            arguments.asJsonObject.keySet().any { it !in allowed } -> Arguments.Refused("unknown argument")
            else -> Arguments.Given(arguments.asJsonObject)
        }

    private suspend fun openEditorsTool(): JsonObject =
        when (val result = checkNotNull(bridge.openEditors).list()) {
            is IdeResult.Failed -> failed(ToolSpecs.OPEN_EDITORS, result.kind)
            is IdeResult.Ok ->
                jsonResult(
                    JsonObject().apply {
                        add(
                            "editors",
                            JsonArray().apply {
                                result.value.take(MAX_EDITORS).forEach { editor ->
                                    add(
                                        JsonObject().apply {
                                            addProperty("path", paths.toCli(editor.path))
                                            addProperty("active", editor.active)
                                            addProperty("modified", editor.modified)
                                        },
                                    )
                                }
                            },
                        )
                        if (result.value.size > MAX_EDITORS) addProperty("truncated", true)
                    },
                )
        }

    private suspend fun selectionTool(): JsonObject =
        when (val result = checkNotNull(bridge.editorSelections).current()) {
            is IdeResult.Failed -> failed(ToolSpecs.SELECTION, result.kind)
            is IdeResult.Ok ->
                jsonResult(
                    JsonObject().apply {
                        val selected = result.value
                        if (selected == null) {
                            add("selection", JsonNull.INSTANCE)
                        } else {
                            val text = cutAt(selected.text, MAX_SELECTION_BYTES)
                            addProperty("path", paths.toCli(absolute(selected.path)))
                            addProperty("startLine", selected.startLine)
                            addProperty("endLine", selected.endLine)
                            addProperty("text", text)
                            if (text.length < selected.text.length) addProperty("truncated", true)
                        }
                    },
                )
        }

    // The selection names a file in the project relative to it; the CLI is told the whole path.
    private fun absolute(path: String): String {
        val base = bridge.projectBasePath()
        return when {
            base == null || ABSOLUTE.containsMatchIn(path) -> path
            else -> base.trimEnd('/', '\\') + (if ('\\' in base) '\\' else '/') + path
        }
    }

    private suspend fun checkDirtyTool(call: FileCall): JsonObject {
        val modified = checkNotNull(bridge.unsavedDocuments).isModified(call.path)
        return jsonResult(
            JsonObject().apply {
                addProperty("path", paths.toCli(call.path))
                addProperty("open", modified != null)
                addProperty("modified", modified == true)
            },
        )
    }

    private suspend fun saveTool(call: FileCall): JsonObject {
        val result = checkNotNull(bridge.unsavedDocuments).saveIfModified(call.path)
        return jsonResult(
            JsonObject().apply {
                addProperty("path", paths.toCli(call.path))
                addProperty(
                    "result",
                    when (result) {
                        SaveResult.SAVED -> "saved"
                        SaveResult.NOT_MODIFIED -> "not_modified"
                        SaveResult.NOT_OPEN -> "not_open"
                        SaveResult.FAILED -> "failed"
                    },
                )
            },
        )
    }

    private suspend fun openFileTool(call: FileCall): JsonObject {
        val line = call.arguments.get(ToolSpecs.LINE)
        val asked: Int? =
            when {
                line == null || line.isJsonNull -> null
                line.isJsonPrimitive && line.asJsonPrimitive.isNumber -> wholeLine(line)
                else -> INVALID_LINE
            }
        return when {
            asked == INVALID_LINE -> textResult("line must be a whole number, 1 or more", isError = true)
            else ->
                when (val result = checkNotNull(bridge.editorOpening).open(call.path, asked)) {
                    is IdeResult.Failed -> failed(ToolSpecs.OPEN_FILE, result.kind)
                    is IdeResult.Ok ->
                        jsonResult(
                            JsonObject().apply {
                                addProperty("path", paths.toCli(call.path))
                                addProperty("opened", true)
                            },
                        )
                }
        }
    }

    private fun wholeLine(line: JsonElement): Int =
        try {
            line.asBigDecimal.intValueExact().takeIf { it >= 1 } ?: INVALID_LINE
        } catch (
            @Suppress("SwallowedException") fraction: ArithmeticException,
        ) {
            INVALID_LINE
        }

    // The path is the IDE's; the project's folder is the IDE's too. `..` steps are folded before the comparison.
    private fun insideProject(path: String): Boolean {
        val base = bridge.projectBasePath() ?: return false
        return try {
            Paths.get(path).normalize().startsWith(Paths.get(base).normalize())
        } catch (
            @Suppress("SwallowedException") bad: InvalidPathException,
        ) {
            false
        }
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

    private fun failed(
        tool: String,
        kind: IdeFailureKind,
    ): JsonObject = textResult("$tool failed: ${describe(kind, tool)}", isError = true)

    private fun jsonResult(body: JsonObject): JsonObject = textResult(body.toString(), isError = false)

    private fun describe(
        kind: IdeFailureKind,
        tool: String,
    ): String =
        when (kind) {
            IdeFailureKind.INVALID_ARGUMENT -> "the request was not valid"
            IdeFailureKind.OUTSIDE_PROJECT -> "the file is not in the project"
            IdeFailureKind.NOT_FOUND -> "the file was not found"
            IdeFailureKind.NOT_WRITABLE -> "the file is not writable"
            IdeFailureKind.OUT_OF_RANGE -> "the range is out of bounds"
            IdeFailureKind.ALREADY_EXISTS -> "it already exists"
            IdeFailureKind.UNAVAILABLE ->
                if (tool == ToolSpecs.DIAGNOSTICS) {
                    "the IDE has no diagnostics for it now; the file must be open in the IDE"
                } else {
                    "the IDE cannot do it now"
                }
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
        private const val OUTSIDE_PROJECT = "the file is not in the project"
        private const val INVALID_LINE = -1
        private const val MAX_EDITORS = 100
        private const val MAX_SELECTION_BYTES = 64 * 1024

        // A Unix path, a UNC path, or a path with a drive letter.
        private val ABSOLUTE = Regex("^(/|\\\\\\\\|[A-Za-z]:[\\\\/])")
        private const val PROTOCOL = "2024-11-05"

        /** Versions in which this server's methods mean the same; any other asked version gets [PROTOCOL]. */
        private val SUPPORTED_PROTOCOLS = setOf("2024-11-05", "2025-03-26", "2025-06-18")
        private const val VERSION = "0.1.0"
    }
}

/** [text] cut to at most [limit] UTF-8 bytes, never in the middle of a character. */
private fun cutAt(
    text: String,
    limit: Int,
): String {
    val bytes = text.toByteArray(Charsets.UTF_8)
    if (bytes.size <= limit) return text
    var end = limit
    while (end > 0 && (bytes[end].toInt() and CONTINUATION_MASK) == CONTINUATION) end--
    return String(bytes, 0, end, Charsets.UTF_8)
}

private const val CONTINUATION_MASK = 0xC0
private const val CONTINUATION = 0x80
