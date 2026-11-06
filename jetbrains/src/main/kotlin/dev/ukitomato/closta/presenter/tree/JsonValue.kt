package dev.ukitomato.closta.presenter.tree

import java.util.Collections

/**
 * One value of the state tree the webview receives, which is plain JSON.
 *
 * The presenter keeps its own JSON type rather than Gson's because the tree is handed on node by node: an
 * untouched branch of the next tree is the same object as in the previous one, and whatever compares the two
 * (the differ) may skip it by identity. That only holds if nothing can change a node after it was built, and
 * Gson's elements are mutable. These values are immutable — the collections they hand out are read-only views —
 * and compare structurally, so "same object" means "same value" and two trees built apart from the same inputs
 * are equal.
 *
 * Writing and equality recurse. The depth they meet is bounded: a value read from the CLI by
 * [JsonRead.NESTING_LIMIT], and the tree the projection builds by [TreeRules.MAX_DEPTH].
 */
sealed interface JsonValue

/**
 * A JSON object. Members keep the order they were put in, which is the order the writer prints, so a tree
 * prints the same way every time; equality ignores that order, as JSON does.
 */
class JsonObject private constructor(
    private val members: Map<String, JsonValue>,
) : JsonValue {
    val size: Int get() = members.size
    val keys: Set<String> get() = members.keys
    val entries: Set<Map.Entry<String, JsonValue>> get() = members.entries
    val values: Collection<JsonValue> get() = members.values

    operator fun get(key: String): JsonValue? = members[key]

    fun containsKey(key: String): Boolean = key in members

    override fun equals(other: Any?): Boolean = other is JsonObject && members == other.members

    override fun hashCode(): Int = members.hashCode()

    override fun toString(): String = JsonText.compact(this)

    /** Collects members in order; a key put twice keeps its first place and its last value. */
    class Builder {
        private val members = LinkedHashMap<String, JsonValue>()

        fun put(
            key: String,
            value: JsonValue,
        ): Builder = apply { members[key] = value }

        fun build(): JsonObject =
            if (members.isEmpty()) EMPTY else JsonObject(Collections.unmodifiableMap(LinkedHashMap(members)))
    }

    companion object {
        val EMPTY: JsonObject = JsonObject(emptyMap())

        fun of(vararg members: Pair<String, JsonValue>): JsonObject {
            val builder = Builder()
            members.forEach { (key, value) -> builder.put(key, value) }
            return builder.build()
        }
    }
}

/** A JSON array. The items are copied on the way in, so the caller's list cannot change it later. */
class JsonArray(
    items: List<JsonValue>,
) : JsonValue {
    val items: List<JsonValue> = Collections.unmodifiableList(ArrayList(items))

    override fun equals(other: Any?): Boolean = other is JsonArray && items == other.items

    override fun hashCode(): Int = items.hashCode()

    override fun toString(): String = JsonText.compact(this)

    companion object {
        val EMPTY: JsonArray = JsonArray(emptyList())
    }
}

data class JsonString(
    val value: String,
) : JsonValue {
    override fun toString(): String = JsonText.compact(this)
}

/**
 * A JSON number, kept as the text it was read or written as. Converting to a double would round large
 * integers and turn `1.0` into `1`, so a tool's argument would not print back the way the CLI sent it; the
 * text is checked against the JSON number grammar instead, so it always prints as valid JSON.
 */
class JsonNumber(
    val text: String,
) : JsonValue {
    init {
        require(GRAMMAR.matches(text)) { "not a JSON number: $text" }
    }

    override fun equals(other: Any?): Boolean = other is JsonNumber && text == other.text

    override fun hashCode(): Int = text.hashCode()

    override fun toString(): String = text

    companion object {
        private val GRAMMAR = Regex("""-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?""")

        fun of(value: Long): JsonNumber = JsonNumber(value.toString())
    }
}

class JsonBool private constructor(
    val value: Boolean,
) : JsonValue {
    override fun toString(): String = value.toString()

    companion object {
        val TRUE: JsonBool = JsonBool(true)
        val FALSE: JsonBool = JsonBool(false)

        fun of(value: Boolean): JsonBool = if (value) TRUE else FALSE
    }
}

data object JsonNull : JsonValue {
    override fun toString(): String = "null"
}
