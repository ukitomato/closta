package dev.ukitomato.closta.presenter.diff

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNull
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue
import dev.ukitomato.closta.presenter.tree.TreeRules
import java.util.Random

/**
 * Pairs of JSON trees that know nothing of the protocol: a random tree, and an edit of it the way a projector would
 * make one — most branches kept as the same objects, some rebuilt equal, some changed. Keys come from a small
 * alphabet so that edits meet the same keys again, and it includes keys no path may hold (empty, array indices,
 * `constructor`, `prototype`, each kind as likely as the others); strings come from a pool that shares prefixes,
 * with surrogate pairs, so that growing, shrinking and rewriting meet each other. The trees hold no member the
 * webview refuses (`__proto__`, a `constructor` holding a `prototype`), since the differ is only asked about trees
 * it accepts.
 *
 * [edits] counts what the edits did, by kind, and only where the value came out changed in that way — a branch
 * chosen that left the value as it was counts nothing — so a test can show the pairs reach each change. It also
 * counts the first draw of each pair (how many members the root gets), so a test can show the cases spread over
 * every value of it.
 */
class JsonPairs(
    private val random: Random,
    private val edits: DiffChecks.Coverage,
) {
    private val keys = listOf("a", "b", "c", "d", "text", "order", "byId", "01", "-1", "x y", "m1:0")
    private val unnamed = listOf("", "0", "1", "12", "constructor", "prototype")
    private val unnamedByKind = unnamed.groupBy { checkNotNull(DiffChecks.unnamedKind(it)) { it } }.values.toList()
    private val strings = listOf("", "a", "ab", "abc", "hello", "hello world", "x😀", "a\uD83D", "日本")
    private val suffixes = listOf("b", "c", " more", "😀", "\uDE00", "語", "\n")

    private fun chance(percent: Int): Boolean = random.nextInt(PERCENT) < percent

    private fun <T> pick(items: List<T>): T = items[random.nextInt(items.size)]

    // A kind first, then a key of it, so that each kind comes up as often as the others.
    private fun unnamedKey(): String = pick(pick(unnamedByKind))

    private fun key(unnamedPercent: Int = UNNAMED_KEY): String =
        if (chance(unnamedPercent)) unnamedKey() else pick(keys)

    /**
     * A pair of roots. The root's keys are path segments and stay so, unless [rootEdges] lets the edit remove one
     * or add one no path may name — the two changes only a snapshot can make.
     */
    fun pair(rootEdges: Boolean): Pair<JsonObject, JsonObject> {
        val members = random.nextInt(MAX_MEMBERS) + 1
        edits.count("root draws $members members")
        val prev = obj(MAX_LEVEL, root = true, members = members)
        val next =
            when {
                chance(SAME_ROOT) -> prev.also { edits.count("same root") }
                else -> editRoot(prev, rootEdges)
            }
        return prev to next
    }

    private fun editRoot(
        prev: JsonObject,
        rootEdges: Boolean,
    ): JsonObject {
        val edited = editObject(prev, MAX_LEVEL, removals = rootEdges && chance(ROOT_REMOVAL), root = true)
        val key = unnamedKey()
        val member = value(MAX_LEVEL - 1)
        val unnamedAdded = rootEdges && chance(ROOT_UNNAMED) && !edited.containsKey(key)
        if (!unnamedAdded || TreeRules.isUnsafeMember(key, member)) return edited
        edits.count("unnamed root key added (${DiffChecks.unnamedKind(key)})")
        return withMember(edited, key, member)
    }

    fun value(level: Int): JsonValue {
        val roll = random.nextInt(PERCENT)
        return when {
            level > 0 && roll < OBJECT -> obj(level, root = false)
            level > 0 && roll < ARRAY -> JsonArray(List(random.nextInt(MAX_ITEMS)) { value(level - 1) })
            roll < STRING -> JsonString(pick(strings))
            roll < NUMBER -> JsonNumber.of(random.nextInt(NUMBERS).toLong())
            roll < BOOL -> JsonBool.of(random.nextBoolean())
            else -> JsonNull
        }
    }

    private fun obj(
        level: Int,
        root: Boolean,
        members: Int = random.nextInt(MAX_MEMBERS),
    ): JsonObject {
        val builder = JsonObject.Builder()
        repeat(members) {
            val key = if (root) pick(keys) else key()
            val member = value(level - 1)
            if (!TreeRules.isUnsafeMember(key, member)) builder.put(key, member)
        }
        return builder.build()
    }

    /** An edit of [prev]: the same object, an equal copy, another value, or a change inside it. */
    fun edit(
        prev: JsonValue,
        level: Int,
    ): JsonValue {
        val roll = random.nextInt(PERCENT)
        return when {
            roll < KEEP -> prev.also { edits.count("kept") }
            roll < COPY -> DiffChecks.deepCopy(prev).also { if (it !== prev) edits.count("equal copy") }
            roll < REPLACE -> replaced(prev, level)
            else -> editInside(prev, level)
        }
    }

    // Another value in place of [prev]: counted when it differs, and apart when its kind differs too.
    private fun replaced(
        prev: JsonValue,
        level: Int,
    ): JsonValue {
        val next = value(level)
        if (next != prev) edits.count("replaced")
        if (next::class != prev::class) edits.count("kind changed")
        return next
    }

    private fun editInside(
        prev: JsonValue,
        level: Int,
    ): JsonValue =
        when (prev) {
            is JsonObject -> editObject(prev, level, removals = true, root = false)
            is JsonArray -> editArray(prev, level)
            is JsonString -> editString(prev.value)
            is JsonNumber -> JsonNumber.of(prev.text.toLong() + 1).also { edits.count("number changed") }
            is JsonBool -> JsonBool.of(!prev.value).also { edits.count("bool flipped") }
            JsonNull -> replaced(prev, level)
        }

    private fun editObject(
        prev: JsonObject,
        level: Int,
        removals: Boolean,
        root: Boolean,
    ): JsonObject {
        val members = LinkedHashMap<String, JsonValue>()
        for ((key, member) in prev.entries) {
            when {
                removals && chance(REMOVE_KEY) -> {
                    edits.count("key removed")
                    if (root) edits.count("root key removed")
                }
                else -> members[key] = edit(member, level - 1)
            }
        }
        repeat(if (chance(ADD_KEYS)) random.nextInt(MAX_ADDED) + 1 else 0) { addKey(prev, members, level, root) }
        val order = members.keys.toMutableList()
        if (chance(REORDER)) {
            order.shuffle(random)
            if (order != members.keys.toList()) edits.count("keys reordered")
        }
        val builder = JsonObject.Builder()
        for (key in order) {
            val member = members.getValue(key)
            if (!TreeRules.isUnsafeMember(key, member)) builder.put(key, member)
        }
        return builder.build()
    }

    // Adds a key [prev] did not have to [members], counted by whether a path may name it.
    private fun addKey(
        prev: JsonObject,
        members: MutableMap<String, JsonValue>,
        level: Int,
        root: Boolean,
    ) {
        val key = if (root) pick(keys) else key(UNNAMED_KEY * ADDED_UNNAMED_FACTOR)
        val member = value(level - 1)
        if (prev.containsKey(key) || key in members || TreeRules.isUnsafeMember(key, member)) return
        val kind = DiffChecks.unnamedKind(key)
        edits.count(if (kind == null) "key added" else "unnamed key added ($kind)")
        members[key] = member
    }

    private fun editArray(
        prev: JsonArray,
        level: Int,
    ): JsonArray {
        val items = ArrayList(prev.items)
        when {
            items.isNotEmpty() && chance(HALF) -> {
                val at = random.nextInt(items.size)
                val old = items[at]
                items[at] = edit(old, level - 1)
                if (items[at] != old) edits.count("array item edited")
            }
            items.isNotEmpty() && chance(HALF) -> {
                items.removeAt(random.nextInt(items.size))
                edits.count("array item removed")
            }
            else -> {
                items.add(random.nextInt(items.size + 1), value(level - 1))
                edits.count("array item inserted")
            }
        }
        return JsonArray(items)
    }

    private fun editString(prev: String): JsonString {
        val kinds = listOf("grown", "shrunk", "middle changed", "same length", "emptied", "other string", "grown twice")
        val kind = pick(kinds)
        val next =
            when (kind) {
                "grown" -> prev + pick(suffixes)
                "grown twice" -> prev + pick(suffixes) + pick(suffixes)
                "shrunk" -> prev.dropLast(random.nextInt(prev.length + 1))
                "middle changed" -> if (prev.isEmpty()) "m" else changeOne(prev)
                "same length" -> prev.map { if (it == 'z') 'y' else 'z' }.joinToString("")
                "emptied" -> ""
                else -> pick(strings)
            }
        if (changedAs(kind, prev, next)) edits.count("string $kind")
        return JsonString(next)
    }

    // Whether [next] differs from [prev] in the way [kind] names.
    private fun changedAs(
        kind: String,
        prev: String,
        next: String,
    ): Boolean =
        when (kind) {
            "grown", "grown twice" -> next.length > prev.length && next.startsWith(prev)
            "shrunk" -> next.length < prev.length
            "middle changed", "same length" -> next.length == prev.length && next != prev
            else -> next != prev
        }

    private fun changeOne(text: String): String {
        val chars = text.toCharArray()
        chars[random.nextInt(chars.size)] = '#'
        return String(chars)
    }

    private fun withMember(
        node: JsonObject,
        key: String,
        value: JsonValue,
    ): JsonObject {
        val builder = JsonObject.Builder()
        node.entries.forEach { (name, member) -> builder.put(name, member) }
        return builder.put(key, value).build()
    }

    companion object {
        /** The most members [pair] gives a root: it draws one to this many. */
        const val MAX_MEMBERS = 4

        private const val PERCENT = 100
        private const val HALF = 50
        private const val MAX_LEVEL = 5
        private const val MAX_ITEMS = 3
        private const val MAX_ADDED = 2
        private const val NUMBERS = 5

        // value(): cumulative percentages of each kind.
        private const val OBJECT = 40
        private const val ARRAY = 50
        private const val STRING = 75
        private const val NUMBER = 85
        private const val BOOL = 93

        // edit(): cumulative percentages.
        private const val KEEP = 35
        private const val COPY = 42
        private const val REPLACE = 50

        private const val UNNAMED_KEY = 10

        // A key added to an object that is not the root comes out of several rare draws in a row, so it is drawn
        // from the keys no path may name this many times as often, for each kind of them to come up.
        private const val ADDED_UNNAMED_FACTOR = 4
        private const val SAME_ROOT = 5
        private const val ROOT_REMOVAL = 30
        private const val ROOT_UNNAMED = 20
        private const val REMOVE_KEY = 8
        private const val ADD_KEYS = 20
        private const val REORDER = 5
    }
}
