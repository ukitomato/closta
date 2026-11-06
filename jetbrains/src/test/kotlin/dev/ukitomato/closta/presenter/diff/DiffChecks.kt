package dev.ukitomato.closta.presenter.diff

import dev.ukitomato.closta.presenter.TreeApplier
import dev.ukitomato.closta.presenter.TreeContract
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText
import dev.ukitomato.closta.presenter.tree.JsonValue
import dev.ukitomato.closta.presenter.tree.TreeRules
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.fail
import org.opentest4j.AssertionFailedError
import java.util.Random
import java.util.SplittableRandom
import java.util.TreeMap

/**
 * What every diff of two trees is held to in the tests, whatever made the trees: the ops pass the webview's op
 * check and, sent as JSON text and applied by [TreeApplier], give the next tree, which the receiver's check along
 * the ops' paths (`checkPatched`) accepts; no op's path is a prefix of another's; every op changes what it
 * targets, and as little as the rules allow (an object is set whole only when it lost a key or gained one no path
 * may name, a string only when it did not just grow at its end); every branch of the previous tree no op went
 * into is the same object after applying; and the same trees, or copies of them, give the same ops.
 *
 * The round trip compares values, and JSON objects compare without their key order. The applier puts a new key
 * at the end of its object, so the webview's tree can hold the keys of an object in another order than the
 * projected tree does; nothing reads that order (the order of entities is the `order` array's).
 */
object DiffChecks {
    /** How often each kind of op and outcome came up, so a test can show its inputs reach every rule. */
    class Coverage {
        val counts = TreeMap<String, Int>()

        fun count(
            kind: String,
            times: Int = 1,
        ) {
            if (times > 0) counts.merge(kind, times, Int::plus)
        }

        operator fun get(kind: String): Int = counts[kind] ?: 0

        /** Fails unless each of [kinds] came up at least [atLeast] times. */
        fun assertReached(
            atLeast: Int,
            vararg kinds: String,
        ) {
            val short = kinds.filter { this[it] < atLeast }
            assertTrue(short.isEmpty()) { "came up fewer than $atLeast times: $short in $counts" }
        }
    }

    private val index = Regex("^(0|[1-9][0-9]*)$")

    /** Which kind of key no path may hold [key] is — `empty`, `index`, `constructor`, `prototype` — or null. */
    fun unnamedKind(key: String): String? =
        when {
            TreeRules.isKey(key) -> null
            key.isEmpty() -> "empty"
            index.matches(key) -> "index"
            else -> key
        }

    /**
     * The random source of the case [seed]. `java.util.Random` started from consecutive seeds draws nearly the
     * same first values, so the seed is mixed first; the same seed still makes the same case.
     */
    fun random(seed: Long): Random = Random(SplittableRandom(seed).nextLong())

    /**
     * Diffs [prev] and [next] and holds the result to everything above; returns the tree the ops left, or null
     * when the diff is [Diff.Replace] (which it checks was the only way).
     */
    fun check(
        prev: JsonObject,
        next: JsonObject,
        at: String,
        coverage: Coverage = Coverage(),
    ): JsonObject? {
        val diff = structuralDiff(prev, next)
        assertDeterministic(diff, prev, next, at)
        if (diff !is Diff.Ops) {
            assertReplaceNeeded(prev, next, at)
            coverage.count("replace")
            return null
        }
        val ops = diff.ops
        if (ops.isEmpty()) coverage.count("no ops")
        val wire = JsonArray(ops.map(Op::toJson))
        val issue = TreeContract.checkOps(wire)
        assertNull(issue) { "$at: the webview refuses the ops: $issue in $wire" }
        val sent =
            checkNotNull(JsonRead.parse(JsonText.compact(wire)) as? JsonArray) { "$at: the ops do not read back" }
        val applied = TreeApplier.apply(prev, sent.items)
        assertEquals(next, applied) { "$at: applying $wire to $prev" }
        // The receiver checks the tree along each op's path after the whole patch. Only ops under "threads" are
        // looked at, so for a tree not in the protocol's shape this checks nothing.
        val patched = TreeContract.checkPatched(applied, sent.items)
        assertNull(patched) { "$at: the receiver takes the patch back: $patched after $wire" }
        assertPrefixFree(ops, at)
        ops.forEach { assertTargets(it, prev, next, at, coverage) }
        coverage.count("branch kept", assertKept(prev, applied, ops.map(Op::path), at))
        return applied as JsonObject
    }

    private fun assertDeterministic(
        diff: Diff,
        prev: JsonObject,
        next: JsonObject,
        at: String,
    ) {
        val again = structuralDiff(prev, next)
        val copied = structuralDiff(deepCopy(prev) as JsonObject, deepCopy(next) as JsonObject)
        assertEquals(text(diff), text(again)) { "$at: the same trees gave other ops" }
        assertEquals(text(diff), text(copied)) { "$at: copies of the trees gave other ops" }
    }

    private fun text(diff: Diff): String =
        when (diff) {
            is Diff.Ops -> JsonText.compact(JsonArray(diff.ops.map(Op::toJson)))
            Diff.Replace -> "replace"
        }

    private fun assertReplaceNeeded(
        prev: JsonObject,
        next: JsonObject,
        at: String,
    ) {
        val lost = prev.keys.any { it !in next.keys }
        val unnamed = next.keys.any { !TreeRules.isKey(it) }
        assertTrue(prev != next && (lost || unnamed)) { "$at: a replace where ops would do: $prev -> $next" }
    }

    private fun assertPrefixFree(
        ops: List<Op>,
        at: String,
    ) {
        for ((i, first) in ops.withIndex()) {
            for ((j, second) in ops.withIndex()) {
                if (i != j &&
                    second.path.size >= first.path.size &&
                    second.path.subList(0, first.path.size) == first.path
                ) {
                    fail("$at: op $j goes where op $i already wrote: $first, $second")
                }
            }
        }
    }

    /** The value at [path] through objects only; null where there is none. */
    fun valueAt(
        root: JsonValue,
        path: List<String>,
    ): JsonValue? = path.fold(root as JsonValue?) { node, key -> (node as? JsonObject)?.get(key) }

    private fun assertTargets(
        op: Op,
        prev: JsonObject,
        next: JsonObject,
        at: String,
        coverage: Coverage,
    ) {
        assertTrue(op.path.isNotEmpty() && op.path.all(TreeRules::isKey)) { "$at: a segment no op may hold: $op" }
        val old = valueAt(prev, op.path)
        val new = valueAt(next, op.path)
        when (op) {
            is Op.AppendText -> {
                assertTrue(old is JsonString && op.text.isNotEmpty()) { "$at: append-text where no string was: $op" }
                assertEquals(new, JsonString((old as JsonString).value + op.text)) { "$at: $op" }
                coverage.count("append-text")
            }
            is Op.Set -> {
                assertEquals(new, op.value) { "$at: the set does not put the next value: $op" }
                assertNotEquals(old, op.value) { "$at: a set of what was there: $op" }
                val kind = setKind(old, op.value, at)
                coverage.count("set $kind")
                if (kind == UNNAMED_SET) {
                    (op.value as JsonObject).keys.mapNotNull(::unnamedKind).toSet().forEach {
                        coverage.count("set of an object with an unnamed key ($it)")
                    }
                }
            }
        }
    }

    private const val UNNAMED_SET = "of an object with a key no path may name"

    // Why the differ set this value rather than going further, failing where it could have gone further.
    private fun setKind(
        old: JsonValue?,
        new: JsonValue,
        at: String,
    ): String =
        when {
            old == null -> "of a new key"
            old is JsonObject && new is JsonObject ->
                when {
                    !new.keys.containsAll(old.keys) -> "of an object that lost a key"
                    !new.keys.all(TreeRules::isKey) -> UNNAMED_SET
                    else -> fail("$at: an object set whole that could have been walked: $old -> $new")
                }
            old is JsonString && new is JsonString -> {
                val grew = new.value.length > old.value.length && new.value.startsWith(old.value)
                assertTrue(!grew) { "$at: a set of a string that only grew: $old -> $new" }
                "of a string"
            }
            old is JsonArray && new is JsonArray -> "of an array"
            old::class != new::class -> "that changes the kind"
            else -> "of a primitive"
        }

    /**
     * Walks [prev] and the tree [applied] together: a branch that no path of [paths] enters must be the same
     * object in both, and the failure names the path where it is not. Returns how many such branches it saw.
     */
    fun assertKept(
        prev: JsonValue,
        applied: JsonValue,
        paths: List<List<String>>,
        at: String,
    ): Int = Kept(at).walk(prev, applied, paths, emptyList())

    private class Kept(
        val at: String,
    ) {
        fun walk(
            prev: JsonValue,
            applied: JsonValue,
            paths: List<List<String>>,
            path: List<String>,
        ): Int =
            when {
                paths.isEmpty() -> {
                    assertSame(prev, applied) { "$at: the branch at $path, which no op went into, is a new object" }
                    1
                }
                // An op wrote this node, or goes through something that is not an object: nothing below is kept.
                paths.any { it.size == path.size } || prev !is JsonObject -> 0
                else ->
                    (prev as JsonObject).entries.sumOf { (key, child) ->
                        walk(child, (applied as JsonObject)[key]!!, paths.filter { it[path.size] == key }, path + key)
                    }
            }
    }

    /** An equal value with no object in common with [value], down to the strings and numbers. */
    fun deepCopy(value: JsonValue): JsonValue =
        when (value) {
            is JsonObject -> {
                val builder = JsonObject.Builder()
                value.entries.forEach { (key, member) -> builder.put(key, deepCopy(member)) }
                builder.build()
            }
            is JsonArray -> JsonArray(value.items.map(::deepCopy))
            is JsonString -> JsonString(String(value.value.toCharArray()))
            is JsonNumber -> JsonNumber(value.text)
            else -> value
        }

    /**
     * Runs [body] for the case [seed], described by [label], so that a failure says which seed to run again. A
     * failed assertion is thrown again with the seed and label before its message, keeping its expected and actual
     * values so the comparison still shows; an exception — the applier refusing the ops, a cast meeting another
     * kind of value — is wrapped the same way. Other errors pass through.
     */
    @Suppress("TooGenericExceptionCaught")
    fun <T> seeded(
        seed: Long,
        label: String,
        body: () -> T,
    ): T =
        try {
            body()
        } catch (failure: AssertionFailedError) {
            val message = "seed $seed ($label): ${failure.message}"
            throw if (failure.isExpectedDefined || failure.isActualDefined) {
                AssertionFailedError(message, failure.expected, failure.actual, failure)
            } else {
                AssertionFailedError(message, failure)
            }
        } catch (failure: Exception) {
            throw AssertionFailedError("seed $seed ($label): $failure", failure)
        }
}
