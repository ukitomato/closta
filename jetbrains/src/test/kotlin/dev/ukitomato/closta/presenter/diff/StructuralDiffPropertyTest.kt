package dev.ukitomato.closta.presenter.diff

import dev.ukitomato.closta.presenter.TreeChecks
import dev.ukitomato.closta.presenter.TreeContract
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue
import dev.ukitomato.closta.presenter.tree.TreeRules
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.Random

/**
 * The differ's rules held on many trees, with the applier copied from assistant-stream ([TreeApplier]) as the
 * receiver: for each pair, the ops pass the webview's op check, turn the previous tree into the next once sent as
 * JSON text and applied, never write below a path another op wrote, change only what changed and as little of it
 * as the rules allow, keep every branch no op went into as the same object, and come out the same for the same
 * trees and for copies of them ([DiffChecks]).
 *
 * The inputs are hand-made from fixed seeds ([DiffChecks.random]), so a failure names the seed that makes it
 * again, and every run checks the same cases. Each test counts what its inputs reached and fails if a rule was not
 * met often enough, so a generator that stops making removals or middle inserts fails rather than passes on less.
 * The first draw of each case is counted by its value too: seeds that all start the same way would leave a value
 * unreached.
 */
class StructuralDiffPropertyTest {
    private val unnamedKinds = listOf("empty", "index", "constructor", "prototype")

    private fun rootDraws(): Array<String> = (1..JsonPairs.MAX_MEMBERS).map { "root draws $it members" }.toTypedArray()

    @Test
    fun `generic JSON trees and their edits round-trip through the ops`() {
        val coverage = DiffChecks.Coverage()
        val edits = DiffChecks.Coverage()
        for (case in 0 until GENERIC_CASES) {
            val seed = GENERIC_SEED + case
            val rootEdges = case % ROOT_EDGES_EVERY == 0
            val label = "generic case $case rootEdges=$rootEdges"
            DiffChecks.seeded(seed, label) {
                val (prev, next) = JsonPairs(DiffChecks.random(seed), edits).pair(rootEdges)
                DiffChecks.check(prev, next, label, coverage)
            }
        }
        coverage.assertReached(
            ENOUGH,
            "append-text",
            "set of a new key",
            "set of an object that lost a key",
            "set of an object with a key no path may name",
            "set of a string",
            "set of an array",
            "set that changes the kind",
            "set of a primitive",
            "branch kept",
            "no ops",
            "replace",
            *unnamedKinds.map { "set of an object with an unnamed key ($it)" }.toTypedArray(),
        )
        edits.assertReached(
            ENOUGH,
            "kept",
            "equal copy",
            "replaced",
            "kind changed",
            "key removed",
            "root key removed",
            "key added",
            "keys reordered",
            "string grown",
            "string shrunk",
            "string middle changed",
            "string same length",
            "string emptied",
            "array item edited",
            "array item inserted",
            "array item removed",
            *unnamedKinds.map { "unnamed key added ($it)" }.toTypedArray(),
            *unnamedKinds.map { "unnamed root key added ($it)" }.toTypedArray(),
            *rootDraws(),
        )
    }

    @Test
    fun `protocol-shaped trees under the projection's edits round-trip and stay trees the webview accepts`() {
        val coverage = DiffChecks.Coverage()
        val edits = DiffChecks.Coverage()
        for (sequence in 0 until SHAPED_SEQUENCES) {
            val seed = SHAPED_SEED + sequence
            DiffChecks.seeded(seed, "shaped sequence $sequence") {
                val trees = ShapedTrees(DiffChecks.random(seed), edits)
                var prev = trees.start()
                TreeChecks.assertContract(prev, "sequence $sequence start")
                repeat(SHAPED_STEPS) { step ->
                    val at = "shaped sequence $sequence step $step"
                    val next = trees.step(prev)
                    val applied = checkNotNull(DiffChecks.check(prev, next, at, coverage)) { "$at: a replace" }
                    // The applied tree equals the next one, so this holds the generator to the contract's shape.
                    TreeChecks.assertContract(applied, at)
                    prev = next
                }
            }
        }
        coverage.assertReached(
            ENOUGH,
            "append-text",
            "set of a new key",
            "set of an object that lost a key",
            "set of an array",
            "set of a string",
            "branch kept",
            "no ops",
        )
        edits.assertReached(
            ENOUGH,
            "message inserted in the middle",
            "part inserted in the middle",
            "text appended",
            "text rewritten",
            "status changed",
            "status dropped",
            "approval added",
            "approval resolved",
            "result added",
            "part removed",
            "sub-agent started",
            "args changed",
            "args field removed",
            "running toggled",
            "thread closed",
            "thread added",
            "message rebuilt equal",
            "nothing",
            *(1..ShapedTrees.START_MESSAGES).map { "start with $it messages" }.toTypedArray(),
        )
    }

    @Test
    fun `a root that loses a key or gains one no path may name gives a replace, and only then`() {
        val coverage = DiffChecks.Coverage()
        val edits = DiffChecks.Coverage()
        var replaces = 0
        for (case in 0 until ROOT_CASES) {
            val seed = ROOT_SEED + case
            val label = "root case $case"
            DiffChecks.seeded(seed, label) {
                val (prev, next) = JsonPairs(DiffChecks.random(seed), edits).pair(rootEdges = true)
                val lost = prev.keys.any { it !in next.keys }
                val unnamed = next.keys.any { !TreeRules.isKey(it) }
                val replace = DiffChecks.check(prev, next, label, coverage) == null
                assertEquals(prev != next && (lost || unnamed), replace) { "$label: $prev -> $next" }
                if (replace) replaces++
            }
        }
        assertTrue(replaces >= ENOUGH) { "only $replaces replaces in $ROOT_CASES cases" }
        coverage.assertReached(ENOUGH, "no ops")
        edits.assertReached(
            ENOUGH,
            "root key removed",
            *unnamedKinds.map { "unnamed root key added ($it)" }.toTypedArray(),
            *rootDraws(),
        )
    }

    @Test
    fun `trees as deep as MAX_DEPTH give ops the webview accepts`() {
        val coverage = DiffChecks.Coverage()
        val draws = DiffChecks.Coverage()
        for (case in 0 until DEEP_CASES) {
            val seed = DEEP_SEED + case
            val label = "deep case $case"
            DiffChecks.seeded(seed, label) {
                val random = DiffChecks.random(seed)
                val depth = TreeRules.MAX_DEPTH - random.nextInt(DEEP_SPREAD)
                draws.count("depth $depth")
                val prev = chain(depth, "a")
                val level = random.nextInt(depth - 1) + 2
                val next = changeAt(prev, level) { node -> deepEdit(node, depth - level + 1, random) }
                assertNull(TreeContract.checkJson(next, TreeRules.MAX_DEPTH, "next")) { "$label: too deep" }
                assertEquals(depth, depthOf(next), "$label: the edit keeps the depth")
                DiffChecks.check(prev, next, label, coverage)
            }
        }
        coverage.assertReached(ENOUGH, "append-text", "set of a new key", "set of an object that lost a key")
        draws.assertReached(ENOUGH, *(0 until DEEP_SPREAD).map { "depth ${TreeRules.MAX_DEPTH - it}" }.toTypedArray())
    }

    // An object [depth] levels deep, each level holding one key "k", and the last one "leaf" with [leaf].
    private fun chain(
        depth: Int,
        leaf: String,
    ): JsonObject {
        var node = JsonObject.of("leaf" to JsonString(leaf))
        repeat(depth - 1) { node = JsonObject.of("k" to node) }
        return node
    }

    // [node] with [change] made to the node [level] levels down (the root is 1).
    private fun changeAt(
        node: JsonObject,
        level: Int,
        change: (JsonObject) -> JsonObject,
    ): JsonObject {
        if (level == 1) return change(node)
        val below = changeAt(node["k"] as JsonObject, level - 1, change)
        return JsonObject.of("k" to below)
    }

    // An edit of a node [room] levels deep that leaves it as deep: the leaf at the bottom grows, a key is added
    // holding a chain that fills the levels below, or the node loses its key for another.
    private fun deepEdit(
        node: JsonObject,
        room: Int,
        random: Random,
    ): JsonObject =
        when (random.nextInt(DEEP_EDITS)) {
            0 -> chain(room, "ab")
            1 ->
                JsonObject
                    .Builder()
                    .put(node.keys.single(), node.values.single())
                    .put("x", filler(room - 1))
                    .build()
            else -> JsonObject.of("other" to filler(room - 1))
        }

    private fun filler(room: Int): JsonValue = if (room == 0) JsonString("b") else chain(room, "b")

    private fun depthOf(value: JsonValue): Int =
        if (value is JsonObject) 1 + (value.values.maxOfOrNull(::depthOf) ?: 0) else 0

    private companion object {
        const val ENOUGH = 10
        const val GENERIC_SEED = 24_000L
        const val GENERIC_CASES = 3_000
        const val ROOT_EDGES_EVERY = 4
        const val SHAPED_SEED = 24_100_000L
        const val SHAPED_SEQUENCES = 120
        const val SHAPED_STEPS = 20
        const val ROOT_SEED = 24_200_000L
        const val ROOT_CASES = 600
        const val DEEP_SEED = 24_300_000L
        const val DEEP_CASES = 60
        const val DEEP_SPREAD = 3
        const val DEEP_EDITS = 3
    }
}
