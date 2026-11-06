package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.diff.Diff
import dev.ukitomato.closta.presenter.diff.Op
import dev.ukitomato.closta.presenter.diff.structuralDiff
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/**
 * Shows the copy of the op checks in [TreeContract] agrees with the webview's on the protocol fixtures: every host
 * patch the reject fixtures hold is rejected with the same code, and every patch the sync fixtures feed the
 * receiver gets the verdict the receiver gave it. The rest pins the depth rule at its edges, which the fixtures
 * reach only from one side, and the case `checkPatched` gets wrong, which the differ is built to avoid.
 */
class TreeContractOpsTest {
    private fun json(text: String): JsonValue = checkNotNull(JsonRead.parse(text)) { text }

    @TestFactory
    fun `every host patch the reject fixtures hold is rejected with the same code`(): List<DynamicTest> {
        val patches =
            ProtocolFixtures.cases("rejects.json").filter { case ->
                case.str("direction") == "host" && (case["message"] as? JsonObject)?.str("type") == "patch"
            }
        assertEquals(17, patches.size, "rejects.json's host patch cases")
        return patches.map { case ->
            DynamicTest.dynamicTest(case.str("name")!!) {
                assertEquals(case.str("code"), TreeContract.checkPatch(case["message"]!!)?.code)
            }
        }
    }

    @Test
    fun `every patch the receiver read gets the receiver's verdict`() {
        val verdicts = HashMap<String, Int>()
        for (case in ProtocolFixtures.cases("sync.json")) {
            for ((index, item) in (case["steps"] as JsonArray).items.withIndex()) {
                val step = item as JsonObject
                val input = step["input"] as? JsonObject
                if (input?.str("type") != "patch") continue
                val expect = step["expect"] as JsonObject
                val at = "${case.str("name")} / step $index"
                val issue = TreeContract.checkPatch(input)
                when (expect.str("outcome") to expect.str("reason")) {
                    // A patch that waits or follows a fatal is dropped before anything shows whether it was read.
                    "drop" to "awaiting", "drop" to "fatal" -> verdicts.merge("unread", 1, Int::plus)
                    "resync" to "bad-patch" -> {
                        val expected = expect["issue"] as JsonObject
                        assertEquals(TreeContract.Issue(expected.str("code")!!, expected.str("at")!!), issue, at)
                        verdicts.merge("rejected", 1, Int::plus)
                    }
                    else -> {
                        assertNull(issue, at)
                        verdicts.merge("accepted", 1, Int::plus)
                    }
                }
            }
        }
        assertEquals(mapOf("accepted" to 23, "rejected" to 1, "unread" to 4), verdicts)
    }

    private fun set(
        path: Int,
        depth: Int,
    ): JsonValue {
        var value: JsonValue = JsonNumber.of(1)
        repeat(depth) { value = JsonArray(listOf(value)) }
        val segments = JsonArray((1..path).map { JsonString("k$it") })
        return JsonObject.of("type" to JsonString("set"), "path" to segments, "value" to value)
    }

    @Test
    fun `a set fits when its path and the depth of its value add up to MAX_DEPTH, and not one more`() {
        // The webview's MAX_DEPTH is 256, written out so the copy cannot drift with it.
        assertNull(TreeContract.checkOp(set(path = 4, depth = 252)))
        assertEquals("malformed", TreeContract.checkOp(set(path = 4, depth = 253))?.code)
        assertNull(TreeContract.checkOp(set(path = 256, depth = 0)))
        assertEquals(TreeContract.Issue("malformed", "op.path"), TreeContract.checkOp(set(path = 257, depth = 0)))
        assertEquals("malformed", TreeContract.checkOp(set(path = 256, depth = 1))?.code)
        assertNull(TreeContract.checkOp(set(path = 1, depth = 255)))
    }

    @Test
    fun `append-text takes a string value and the same path rules`() {
        assertNull(TreeContract.checkOp(json("""{"type":"append-text","path":["a","b"],"value":""}""")))
        val notText = json("""{"type":"append-text","path":["a"],"value":{}}""")
        assertEquals(TreeContract.Issue("malformed", "op.value"), TreeContract.checkOp(notText))
        val index = json("""{"type":"append-text","path":["a","3"],"value":"x"}""")
        assertEquals(TreeContract.Issue("index-segment", "op.path[1]"), TreeContract.checkOp(index))
        val missing = json("""{"type":"append-text","path":["a"]}""")
        assertEquals(TreeContract.Issue("malformed", "op.value"), TreeContract.checkOp(missing))
    }

    @Test
    fun `checkPatched fails a correct tree when a later op replaced the path of an earlier one`() {
        val tree =
            json(
                """{"threads":{"order":["t1"],"byId":{"t1":{"id":"t1","isRunning":true,
                "messages":{"order":["a1"],"byId":{"a1":{"id":"a1","role":"assistant",
                "parts":{"order":["p1"],"byId":{"p1":{"type":"text","text":"x"}}}}}}}}}}""",
            )
        val ops =
            (
                json(
                    """[{"type":"append-text",
                    "path":["threads","byId","t1","messages","byId","a1","parts","byId","p1","text"],"value":"y"},
                    {"type":"set","path":["threads","byId","t1","messages"],"value":{"order":[],"byId":{}}}]""",
                ) as JsonArray
            ).items
        val applied = TreeApplier.apply(tree, ops)
        assertNull(TreeContract.checkTree(applied), "the tree is correct")
        val issue = TreeContract.checkPatched(applied, ops)
        assertEquals(TreeContract.Issue("bad-tree", "tree.threads.byId.t1.messages.byId.a1"), issue)
        // The same change as the differ writes it: the order and the byId that lost a1, set whole, nothing below.
        val diff = structuralDiff(tree as JsonObject, applied as JsonObject) as Diff.Ops
        val messages = listOf("threads", "byId", "t1", "messages")
        assertEquals(listOf(messages + "order", messages + "byId"), diff.ops.map { it.path })
        assertNull(TreeContract.checkPatched(applied, diff.ops.map(Op::toJson)))
    }

    @Test
    fun `segments that are fine as keys pass, and the ops are checked in order`() {
        for (segment in listOf("01", "-1", "1.5", " ", "x y", "toolu_01", "m1:0", "Constructor", "__proto")) {
            assertNull(TreeContract.checkSegment(JsonString(segment), "s"), segment)
        }
        val ops = json("""[{"type":"set","path":["a"],"value":1},{"type":"set","path":["a","prototype"],"value":1}]""")
        assertEquals(TreeContract.Issue("unsafe-segment", "ops[1].path[1]"), TreeContract.checkOps(ops))
        assertEquals(TreeContract.Issue("malformed", "ops"), TreeContract.checkOps(JsonObject.EMPTY))
        assertNull(TreeContract.checkOps(JsonArray.EMPTY))
    }
}
