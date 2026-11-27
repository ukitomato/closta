package dev.ukitomato.closta.providers.claude.mcp

import com.google.gson.JsonArray
import com.google.gson.JsonObject

/** One tool as `tools/list` shows it: its name, what it does and cannot do, and the shape of its input. */
internal class ToolSpec(
    val name: String,
    private val description: String,
    private val properties: Map<String, JsonObject> = emptyMap(),
    private val required: List<String> = emptyList(),
    private val readOnly: Boolean = false,
) {
    fun toJson(): JsonObject =
        JsonObject().apply {
            addProperty("name", name)
            addProperty("description", description)
            add(
                "inputSchema",
                JsonObject().apply {
                    addProperty("type", "object")
                    add("properties", JsonObject().apply { properties.forEach { (key, value) -> add(key, value) } })
                    if (required.isNotEmpty()) add("required", JsonArray().apply { required.forEach(::add) })
                    addProperty("additionalProperties", false)
                },
            )
            if (readOnly) add("annotations", JsonObject().apply { addProperty("readOnlyHint", true) })
        }
}

/** The tools of `ide-context`. Descriptions are what the model reads, so they say what each tool cannot do. */
internal object ToolSpecs {
    const val DIAGNOSTICS = "getDiagnostics"
    const val OPEN_EDITORS = "getOpenEditors"
    const val SELECTION = "getCurrentSelection"
    const val CHECK_DIRTY = "checkDocumentDirty"
    const val SAVE = "saveDocument"
    const val OPEN_FILE = "openFile"

    const val URI = "uri"
    const val LINE = "line"

    private fun string(description: String): JsonObject =
        JsonObject().apply {
            addProperty("type", "string")
            addProperty("description", description)
        }

    private val fileArgument = string("A file: URI or an absolute path of a file.")

    val diagnostics =
        ToolSpec(
            DIAGNOSTICS,
            "Errors and warnings the IDE has already found, for one file or for every open file. " +
                "Only files open in the IDE have any: a file that is not open is refused. " +
                "line and column are 1-based.",
            mapOf(
                URI to
                    string(
                        "A file: URI or an absolute path of a file open in the IDE. " +
                            "Omit it for every file open in the IDE.",
                    ),
            ),
        )

    val openEditors =
        ToolSpec(
            OPEN_EDITORS,
            "The files open in the IDE's editor tabs, in tab order, at most 100: each with its path, whether it is " +
                "the tab in front (active) and whether it has changes not yet saved to disk (modified). " +
                "Tabs that are not files, such as a chat, are not listed.",
            readOnly = true,
        )

    val selection =
        ToolSpec(
            SELECTION,
            "The text selected in the IDE's frontmost text editor: path, startLine and endLine (1-based, " +
                "inclusive) and text, cut at 64 KiB with truncated true. " +
                "{\"selection\":null} when nothing is selected.",
            readOnly = true,
        )

    val checkDirty =
        ToolSpec(
            CHECK_DIRTY,
            "Whether a file open in the IDE has changes not yet saved to disk: open and modified. " +
                "A file that is not open in the IDE answers open false; it is not an error.",
            mapOf(URI to fileArgument),
            listOf(URI),
            readOnly = true,
        )

    val save =
        ToolSpec(
            SAVE,
            "Saves a file open in the IDE to disk when it has unsaved changes. result is saved, not_modified, " +
                "not_open (a file that is not open in the IDE has nothing to save) or failed. " +
                "Refuses a file outside the project.",
            mapOf(URI to fileArgument),
            listOf(URI),
        )

    val openFile =
        ToolSpec(
            OPEN_FILE,
            "Opens a file in an editor tab of the IDE, at a line when given, without moving the keyboard focus " +
                "from where the user is typing. Refuses a file outside the project and a file that does not exist.",
            mapOf(
                URI to fileArgument,
                LINE to
                    JsonObject().apply {
                        addProperty("type", "integer")
                        addProperty("minimum", 1)
                        addProperty("description", "The line to show, 1-based.")
                    },
            ),
            listOf(URI),
        )
}
