package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNull
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonValue
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import org.junit.jupiter.api.assertThrows

/**
 * Shows [TreeApplier] agrees with the applier in assistant-stream on the sync fixtures, which the real applier
 * replays in the original TypeScript tests: every patch the receiver applied gives the tree the fixture expects, and
 * every patch whose application failed there fails here too — by throwing, or by leaving a tree the webview's check
 * rejects, the two ways the receiver takes a patch back. The rest pins the strict rules one by one.
 */
class TreeApplierTest {
    private fun json(text: String): JsonValue = checkNotNull(JsonRead.parse(text)) { text }

    private fun apply(
        tree: String,
        vararg op: String,
    ): JsonValue = TreeApplier.apply(json(tree), op.map(::json))

    private fun fails(
        tree: String,
        vararg op: String,
    ): String = assertThrows<TreeApplier.Refused> { apply(tree, *op) }.message!!

    @TestFactory
    fun `the sync fixtures replay, applied patches give the expected trees and failed ones fail`(): List<DynamicTest> =
        ProtocolFixtures.cases("sync.json").map { case ->
            DynamicTest.dynamicTest(case.str("name")!!) { replay(case) }
        }

    @Test
    fun `the eight failed applications fail the way the receiver failed them`() {
        val failures = ProtocolFixtures.cases("sync.json").flatMap(::replay)
        val ways = failures.map { it.substringBefore(" (") }
        assertEquals(listOf("throws", "throws") + List(6) { "checkTree" }, ways, failures.toString())
        assertTrue(failures.drop(2).all { "(bad-tree at" in it }, failures.toString())
    }

    @Test
    fun `the sync fixtures hold patches of every kind the applier sees`() {
        // Exact counts, so a loader that drops cases fails here rather than passing on fewer.
        val outcomes =
            ProtocolFixtures
                .cases("sync.json")
                .flatMap { (it["steps"] as JsonArray).items }
                .map { (it as JsonObject)["expect"] as JsonObject }
                .filter { it.str("outcome") == "apply" || it.str("reason") == "apply-failed" }
                .groupingBy { it.str("outcome") }
                .eachCount()
        assertEquals(mapOf("apply" to 11, "resync" to 8), outcomes)
    }

    /** Replays one case from its snapshots; says how each step that failed in the real applier failed here. */
    private fun replay(case: JsonObject): List<String> {
        val failures = ArrayList<String>()
        var tree: JsonValue? = null
        for ((index, item) in (case["steps"] as JsonArray).items.withIndex()) {
            val step = item as JsonObject
            val expect = step["expect"] as JsonObject
            val input = step["input"] as? JsonObject
            when {
                expect.str("outcome") == "replace" -> tree = input!!["tree"]
                expect.str("outcome") == "apply" -> {
                    val ops = (input!!["ops"] as JsonArray).items
                    assertNull(TreeContract.checkOps(input["ops"]), "step $index: the ops pass checkOps")
                    tree = TreeApplier.apply(tree!!, ops)
                    assertNull(TreeContract.checkPatched(tree, ops), "step $index: the tree passes checkPatched")
                }
                expect.str("reason") == "apply-failed" -> {
                    val ops = (input!!["ops"] as JsonArray).items
                    failures += "${failure(tree!!, ops, expect, index)}: ${case.str("name")} / step $index"
                }
            }
            // A failed application leaves the tree as it was before the patch, which is what the fixture holds.
            expect["tree"]?.let { assertEquals(it, tree, "step $index: the tree after the step") }
        }
        return failures
    }

    // The receiver found these broken with checkPatched, and the fixture holds where: the copy must say the same,
    // and the whole-tree check must agree that the tree is broken.
    private fun failure(
        tree: JsonValue,
        ops: List<JsonValue>,
        expect: JsonObject,
        index: Int,
    ): String {
        val applied =
            try {
                TreeApplier.apply(tree, ops)
            } catch (refused: TreeApplier.Refused) {
                return "throws (${refused.message})"
            }
        val issue = TreeContract.checkTree(applied)
        assertNotNull(issue, "step $index: the real applier's patch failed, so the tree it leaves here must not pass")
        val expected = expect["issue"] as JsonObject
        val patched = TreeContract.checkPatched(applied, ops)
        assertEquals(
            TreeContract.Issue(expected.str("code")!!, expected.str("at")!!),
            patched,
            "step $index: checkPatched",
        )
        return "checkTree (${issue!!.code} at ${issue.at})"
    }

    @Test
    fun `an op rebuilds only its path, every other branch stays the same object`() {
        val before = json("""{"a":{"x":{"deep":1}},"b":{"y":[1,2]},"c":"text"}""") as JsonObject
        val after =
            TreeApplier.apply(
                before,
                listOf(json("""{"type":"set","path":["a","z"],"value":2}""")),
            ) as JsonObject
        assertSame(before["b"], after["b"])
        assertSame(before["c"], after["c"])
        assertSame(before.at("a")["x"], after.at("a")["x"])
        assertEquals(json("""{"a":{"x":{"deep":1},"z":2},"b":{"y":[1,2]},"c":"text"}"""), after)
        assertEquals(json("""{"a":{"x":{"deep":1}},"b":{"y":[1,2]},"c":"text"}"""), before, "the tree before is kept")
    }

    @Test
    fun `set and append-text in order, each on the tree the one before left`() {
        val after =
            apply(
                """{"t":"ab"}""",
                """{"type":"append-text","path":["t"],"value":"c"}""",
                """{"type":"append-text","path":["t"],"value":"d"}""",
                """{"type":"set","path":["u"],"value":{"v":null}}""",
                """{"type":"set","path":["u","v"],"value":"w"}""",
            )
        assertEquals(json("""{"t":"abcd","u":{"v":"w"}}"""), after)
    }

    @Test
    fun `missing nodes and nulls on the way become empty objects`() {
        assertEquals(json("""{"a":{"b":{"c":1}}}"""), apply("{}", """{"type":"set","path":["a","b","c"],"value":1}"""))
        assertEquals(
            json("""{"a":{"b":1}}"""),
            apply("""{"a":null}""", """{"type":"set","path":["a","b"],"value":1}"""),
        )
        val fromNull = TreeApplier.apply(JsonNull, listOf(json("""{"type":"set","path":["a"],"value":1}""")))
        assertEquals(JsonObject.of("a" to JsonNumber.of(1)), fromNull)
    }

    @Test
    fun `an array is entered only by a canonical index up to its length`() {
        val tree = """{"a":[10,11]}"""
        assertEquals(json("""{"a":[10,9]}"""), apply(tree, """{"type":"set","path":["a","1"],"value":9}"""))
        assertEquals(json("""{"a":[10,11,9]}"""), apply(tree, """{"type":"set","path":["a","2"],"value":9}"""))
        assertEquals(
            json("""{"a":[{"k":1},11]}"""),
            apply("""{"a":[{},11]}""", """{"type":"set","path":["a","0","k"],"value":1}"""),
        )
        assertTrue("out of bounds" in fails(tree, """{"type":"set","path":["a","3"],"value":9}"""))
        for (key in listOf("next", "01", "-1", "1.0", "", " 1", "1e0", "99999999999")) {
            assertTrue("array index" in fails(tree, """{"type":"set","path":["a","$key"],"value":9}"""), key)
        }
    }

    @Test
    fun `append-text needs a string where it ends`() {
        assertEquals(
            json("""{"t":"ab"}"""),
            apply("""{"t":"a"}""", """{"type":"append-text","path":["t"],"value":"b"}"""),
        )
        for (tree in listOf("""{"t":1}""", """{"t":null}""", """{"t":{}}""", """{"t":[]}""", """{"t":true}""", "{}")) {
            assertTrue("Expected string" in fails(tree, """{"type":"append-text","path":["t"],"value":"b"}"""), tree)
        }
    }

    @Test
    fun `a path through a primitive, an unsafe segment or an unknown op throws`() {
        for (tree in listOf("""{"a":"x"}""", """{"a":1}""", """{"a":true}""")) {
            assertTrue("Invalid path" in fails(tree, """{"type":"set","path":["a","b"],"value":1}"""), tree)
        }
        for (segment in listOf("__proto__", "constructor", "prototype")) {
            assertTrue("Unsafe" in fails("""{"a":{}}""", """{"type":"set","path":["a","$segment"],"value":1}"""))
        }
        assertTrue("Invalid operation" in fails("{}", """{"type":"delete","path":["a"],"value":1}"""))
    }

    @Test
    fun `an empty path replaces the whole value, as in the original`() {
        val replaced = TreeApplier.apply(JsonObject.EMPTY, listOf(json("""{"type":"set","path":[],"value":[true]}""")))
        assertEquals(JsonArray(listOf(JsonBool.TRUE)), replaced)
    }
}
