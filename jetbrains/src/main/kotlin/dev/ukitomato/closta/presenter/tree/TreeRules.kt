package dev.ukitomato.closta.presenter.tree

/**
 * The rules of the protocol that hold for any tree, whatever it shows: how deep it may nest, which keys
 * may not appear in it, and what a key of a collection may be. The webview rejects a snapshot that breaks one
 * of them as a whole, so the presenter checks values against them before they go in.
 */
object TreeRules {
    /**
     * How deep the tree may nest: the objects and arrays on its deepest branch, the root being 1 (the
     * webview's `MAX_DEPTH`). The renderer in the webview recurses, so the contract caps it.
     */
    const val MAX_DEPTH: Int = 256

    private val INDEX = Regex("^(0|[1-9][0-9]*)$")
    private val UNSAFE_SEGMENTS = setOf("__proto__", "constructor", "prototype")

    /**
     * Whether [key] can name an entity in a collection: an op addresses the entity through its key, so the key
     * must be a path segment — not empty, not read as an array index, not one that reaches a prototype.
     */
    fun isKey(key: String): Boolean = key.isNotEmpty() && !INDEX.matches(key) && key !in UNSAFE_SEGMENTS

    /**
     * Keys that reach the prototype once the webview copies or merges a value: `__proto__`, and `constructor`
     * holding an object with a `prototype` key. `JSON.parse` keeps both as own keys, so they would
     * arrive intact.
     */
    fun isUnsafeMember(
        key: String,
        value: JsonValue,
    ): Boolean = key == "__proto__" || (key == "constructor" && value is JsonObject && value.containsKey("prototype"))

    /**
     * Whether [value] can go where [room] levels are left (`MAX_DEPTH` minus the level of the node that holds
     * it): no more than [room] objects and arrays on any branch, no unsafe member anywhere inside, and no number
     * that is not finite as a double — `JSON.parse` reads `1e999` as `Infinity`, which the webview's check refuses.
     * Any other primitive fits. The walk keeps its own stack and stops at the first value that does not fit.
     */
    fun fits(
        value: JsonValue,
        room: Int,
    ): Boolean {
        val pending = ArrayDeque<Pair<JsonValue, Int>>()
        pending.addLast(value to 1)
        while (pending.isNotEmpty()) {
            val (next, level) = pending.removeLast()
            val children = childrenOf(next)
            val unsafe = next is JsonObject && next.entries.any { (key, member) -> isUnsafeMember(key, member) }
            val tooDeep = children != null && level > room
            val infinite = next is JsonNumber && !next.text.toDouble().isFinite()
            if (unsafe || tooDeep || infinite) return false
            children?.forEach { pending.addLast(it to level + 1) }
        }
        return true
    }

    /** The members or items of an object or array; null for a primitive, which takes no level. */
    private fun childrenOf(value: JsonValue): Collection<JsonValue>? =
        when (value) {
            is JsonObject -> value.values
            is JsonArray -> value.items
            else -> null
        }
}
