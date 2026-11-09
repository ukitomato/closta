package dev.ukitomato.closta.presenter.diff

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNull
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue
import java.util.Collections

/**
 * One change to the tree the webview holds, in the two kinds the protocol allows and the applier in
 * assistant-stream knows: put a value at a path, or append text to the string at a path.
 *
 * Only [structuralDiff] makes them. An op written by hand beside the domain code can be left out while the state
 * is right — a change that never reaches the screen — and nothing that looks at the state shows why. With the
 * differ as the only source, every op follows from two trees, and a test scans `src/main` for the type strings and
 * these constructors outside this package. The classes are not data classes so that there is no `copy` to make a
 * new op out of an old one elsewhere.
 *
 * [path] goes from the root through object keys only. The differ never puts an array position or a key the
 * webview refuses as a segment into it.
 *
 * What goes over the wire is [toJson]. [toString] names the kind, the path and the size of the value and never the
 * value: the values come from the CLI, and a line that logs an op must not carry them. The path is written as a JSON
 * array of strings with the line separators and bidirectional controls escaped as well ([LogText]), so a segment the
 * CLI chose (a tool input's key, an id) cannot end the line, forge another one, or reorder what a viewer shows.
 */
sealed class Op(
    path: List<String>,
) {
    val path: List<String> = Collections.unmodifiableList(ArrayList(path))

    /** The op as it goes over the wire: `{"type":…,"path":[…],"value":…}`, the shape the webview's `checkOp` reads. */
    abstract fun toJson(): JsonObject

    protected fun pathText(): String = LogText.path(path)

    protected fun wire(
        type: String,
        value: JsonValue,
    ): JsonObject =
        JsonObject.of(
            "type" to JsonString(type),
            "path" to JsonArray(path.map(::JsonString)),
            "value" to value,
        )

    /** Puts [value] at [path], replacing whatever was there, and whatever was under it. */
    class Set internal constructor(
        path: List<String>,
        val value: JsonValue,
    ) : Op(path) {
        override fun toJson(): JsonObject = wire("set", value)

        override fun equals(other: Any?): Boolean = other is Set && path == other.path && value == other.value

        override fun hashCode(): Int = path.hashCode() * HASH_PRIME + value.hashCode()

        override fun toString(): String = "set ${pathText()} ${sizeOf(value)}"
    }

    /** Appends [text] to the string at [path]; the receiver fails the patch if no string is there. */
    class AppendText internal constructor(
        path: List<String>,
        val text: String,
    ) : Op(path) {
        override fun toJson(): JsonObject = wire("append-text", JsonString(text))

        override fun equals(other: Any?): Boolean = other is AppendText && path == other.path && text == other.text

        override fun hashCode(): Int = path.hashCode() * HASH_PRIME + text.hashCode()

        override fun toString(): String = "append-text ${pathText()} ${text.length} chars"
    }

    private companion object {
        const val HASH_PRIME = 31

        fun sizeOf(value: JsonValue): String =
            when (value) {
                is JsonObject -> "object(${value.size})"
                is JsonArray -> "array(${value.items.size})"
                is JsonString -> "string(${value.value.length})"
                is JsonNumber -> "number"
                is JsonBool -> "boolean"
                JsonNull -> "null"
            }
    }
}
