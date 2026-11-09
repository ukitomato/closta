// Ported from assistant-stream 0.3.46 (https://github.com/assistant-ui/assistant-ui),
// Copyright (c) 2026 AgentbaseAI Inc., MIT License. The full notice is in the repository's NOTICE file.
package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonNull
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue

/**
 * A Kotlin copy of the applier the webview keeps its tree in: `GorpStreamAccumulator` of assistant-stream 0.3.46
 * (`dist/core/gorp/GorpStreamAccumulator.js`, with `assertSafePathSegment` from `changeTree.js`), in its strict
 * mode — the default, and what the webview uses. It is a copy for the tests that keeps the JavaScript's steps, so
 * ops can be shown to turn one tree into another without Node; `TreeApplierTest` shows the copy agrees with the
 * original on the sync fixtures.
 *
 * Each op rebuilds the objects and arrays along its path and nothing else, so a branch the op does not go into is
 * the same object afterwards. On the way down, a missing node or a null becomes an empty object; a segment may
 * enter an array only as a canonical non-negative integer no greater than the length (the length itself
 * appends); `append-text` needs a string where it ends. Where the original throws, this throws [Refused].
 *
 * The ops are read in their wire form (`{"type","path","value"}`), the form the original receives, so a test can
 * apply what the differ writes after it went through JSON text. They are taken to have passed the webview's `checkOps`,
 * as the webview's do before they reach the original; on others this copy and the original part ways — the
 * original puts `undefined` where a `set` has no value, and turns a value of `append-text` that is not a string
 * into one and appends it, where this throws.
 */
object TreeApplier {
    /** The original throws here: the op does not fit the tree it is applied to. */
    class Refused(
        message: String,
    ) : IllegalStateException(message)

    private val unsafeSegments = setOf("__proto__", "constructor", "prototype")

    // The keys `Number(key)` reads as an integer that `String()` writes back the same way, without the negative
    // ones, which the original refuses next. Everything else that would go into an array throws there as well.
    private val canonicalIndex = Regex("^(0|[1-9][0-9]*)$")

    /** `append`: [ops] applied to [tree] one after another. */
    fun apply(
        tree: JsonValue,
        ops: List<JsonValue>,
    ): JsonValue = ops.fold(tree, ::applyOne)

    private fun applyOne(
        state: JsonValue,
        raw: JsonValue,
    ): JsonValue {
        val op = raw as JsonObject
        val path = (op["path"] as JsonArray).items.map { (it as JsonString).value }
        val value = requireNotNull(op["value"]) { "an op the webview's checkOp would refuse: $op" }
        return when (val type = (op["type"] as? JsonString)?.value) {
            "set" -> updatePath(state, path) { value }
            "append-text" ->
                updatePath(state, path) { current ->
                    if (current !is JsonString) throw Refused("Expected string at path [${path.joinToString(", ")}]")
                    JsonString(current.value + (value as JsonString).value)
                }
            else -> throw Refused("Invalid operation type: $type")
        }
    }

    private sealed interface Frame

    private class InObject(
        val node: JsonObject,
        val key: String,
    ) : Frame

    private class InArray(
        val node: JsonArray,
        val index: Int,
    ) : Frame

    // null stands for JavaScript's undefined: what a missing key or position reads as.
    private fun updatePath(
        state: JsonValue,
        path: List<String>,
        updater: (JsonValue?) -> JsonValue,
    ): JsonValue {
        if (path.isEmpty()) return updater(state)
        val frames = ArrayList<Frame>()
        var current: JsonValue? = state
        for ((depth, key) in path.withIndex()) {
            if (current == null || current === JsonNull) current = JsonObject.EMPTY
            if (current !is JsonObject && current !is JsonArray) {
                throw Refused("Invalid path: [${path.drop(depth).joinToString(", ")}]")
            }
            if (key in unsafeSegments) throw Refused("Unsafe gorp path segment: $key")
            current =
                if (current is JsonArray) {
                    val index = index(key, current, path.drop(depth))
                    frames.add(InArray(current, index))
                    current.items.getOrNull(index)
                } else {
                    val node = current as JsonObject
                    frames.add(InObject(node, key))
                    node[key]
                }
        }
        var updated = updater(current)
        for (frame in frames.asReversed()) {
            updated =
                when (frame) {
                    is InArray -> {
                        val items = ArrayList(frame.node.items)
                        if (frame.index == items.size) items.add(updated) else items[frame.index] = updated
                        JsonArray(items)
                    }
                    is InObject -> {
                        val builder = JsonObject.Builder()
                        frame.node.entries.forEach { (key, member) -> builder.put(key, member) }
                        builder.put(frame.key, updated).build()
                    }
                }
        }
        return updated
    }

    private fun index(
        key: String,
        array: JsonArray,
        rest: List<String>,
    ): Int {
        val index =
            key.takeIf(canonicalIndex::matches)?.toIntOrNull()
                ?: throw Refused("Expected array index at [${rest.joinToString(", ")}]")
        if (index > array.items.size) throw Refused("Insert array index out of bounds")
        return index
    }
}
