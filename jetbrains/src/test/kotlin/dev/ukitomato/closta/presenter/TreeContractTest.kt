package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/**
 * Shows [TreeContract] agrees with the webview's checks on the protocol fixtures: every tree the sync fixtures
 * hold is accepted, every snapshot they feed the receiver gets the outcome the receiver gives it, and every
 * host snapshot the reject fixtures hold is rejected with the same code. Without this the projection could
 * pass a copy that has drifted from the original.
 */
class TreeContractTest {
    @TestFactory
    fun `every tree in the sync fixtures is accepted, every snapshot gets the receiver's outcome`(): List<DynamicTest> {
        val cases = ProtocolFixtures.cases("sync.json")
        assertTrue(cases.isNotEmpty(), "sync.json has cases")
        return cases.map { case ->
            DynamicTest.dynamicTest((case["name"] as JsonString).value) {
                val steps = (case["steps"] as JsonArray).items.map { it as JsonObject }
                for ((index, step) in steps.withIndex()) {
                    val expect = step["expect"] as JsonObject
                    expect["tree"]?.let {
                        assertNull(
                            TreeContract.checkTree(it),
                            "step $index: the expected tree is accepted",
                        )
                    }
                    val input = step["input"] as? JsonObject
                    if (input != null && (input["type"] as? JsonString)?.value == "snapshot") {
                        assertEquals(receiverOutcome(expect), TreeContract.checkSnapshot(input), "step $index")
                    }
                }
            }
        }
    }

    @Test
    fun `the sync fixtures hold trees and snapshots of every outcome`() {
        // Exact counts, so a loader that drops cases fails here rather than passing on fewer.
        val steps =
            ProtocolFixtures.cases("sync.json").flatMap { case ->
                (case["steps"] as JsonArray).items.map { it as JsonObject }
            }
        val snapshots = steps.filter { ((it["input"] as? JsonObject)?.get("type") as? JsonString)?.value == "snapshot" }
        val outcomes =
            snapshots
                .groupingBy {
                    receiverOutcome(
                        it["expect"] as JsonObject,
                    )::class.simpleName
                }.eachCount()
        assertEquals(mapOf("Accepted" to 27, "Rejected" to 3, "Mismatch" to 2), outcomes)
        assertEquals(46, steps.count { (it["expect"] as JsonObject).containsKey("tree") }, "expected trees")
    }

    @TestFactory
    fun `every host snapshot the reject fixtures hold is rejected with the same code`(): List<DynamicTest> {
        val snapshots =
            ProtocolFixtures.cases("rejects.json").filter { case ->
                val message = case["message"] as? JsonObject
                (case["direction"] as JsonString).value == "host" &&
                    (message?.get("type") as? JsonString)?.value == "snapshot"
            }
        assertEquals(82, snapshots.size, "rejects.json's host snapshot cases")
        return snapshots.map { case ->
            DynamicTest.dynamicTest((case["name"] as JsonString).value) {
                val outcome = TreeContract.checkSnapshot(case["message"] as JsonObject)
                val code = (outcome as? TreeContract.Snapshot.Rejected)?.issue?.code ?: outcome.toString()
                assertEquals((case["code"] as JsonString).value, code)
            }
        }
    }

    @Test
    fun `a tree exactly MAX_DEPTH deep is accepted and one level deeper is not`() {
        // The webview's MAX_DEPTH is 256, written out here so the copy cannot drift with it.
        // The skeleton down to a part takes 10 levels; args take the rest.
        assertNull(TreeContract.checkTree(Trees.withArgs(Trees.nested(246))))
        assertEquals("malformed", TreeContract.checkTree(Trees.withArgs(Trees.nested(247)))?.code)
    }

    @Test
    fun `unsafe members are refused anywhere in the tree`() {
        val proto = Trees.withArgs(JsonObject.of("deep" to JsonObject.of("__proto__" to JsonObject.EMPTY)))
        assertEquals("unsafe-segment", TreeContract.checkTree(proto)?.code)
        val constructor = Trees.withArgs(JsonObject.of("constructor" to JsonObject.of("prototype" to JsonBool.TRUE)))
        assertEquals("unsafe-segment", TreeContract.checkTree(constructor)?.code)
        val plainConstructor = Trees.withArgs(JsonObject.of("constructor" to JsonString("fine")))
        assertNull(TreeContract.checkTree(plainConstructor))
    }

    @Test
    fun `the strict check refuses an unnamed key at every kind of node, and allows every key it names`() {
        assertNull(TreeContract.strictFault(Trees.everyKey()))
        assertNull(TreeContract.checkTree(Trees.everyKey()))
        for ((name, tree) in Trees.oneExtraKeyEach()) {
            assertNull(TreeContract.checkTree(tree), "$name: the webview accepts an unknown key")
            assertEquals("unknown-key", TreeContract.strictFault(tree)?.code, "$name: the strict check does not")
        }
    }

    @Test
    fun `the strict check refuses what the sync fixture of unknown keys keeps`() {
        val name = "unknown keys and part kinds stay in the tree"
        val case = ProtocolFixtures.cases("sync.json").single { (it["name"] as JsonString).value == name }
        val first = (case["steps"] as JsonArray).items.first() as JsonObject
        val tree = first.at("expect", "tree")
        assertNull(TreeContract.checkTree(tree))
        assertNotNull(TreeContract.strictFault(tree))
    }

    @Test
    fun `an array that is not an order and not inside a leaf value is an entity array`() {
        assertNull(TreeContract.entityArrayFault(Trees.everyKey()))
        val inArgs = Trees.withArgs(JsonObject.of("list" to JsonArray(listOf(JsonString("a")))))
        assertNull(TreeContract.entityArrayFault(inArgs))
        val inThread =
            JsonObject.of(
                "threads" to
                    JsonObject.of("order" to JsonArray.EMPTY, "byId" to JsonObject.EMPTY, "x" to JsonArray.EMPTY),
            )
        assertEquals("tree.threads.x", TreeContract.entityArrayFault(inThread))
        val numbers = JsonObject.of("order" to JsonArray(listOf<JsonValue>(JsonBool.TRUE)))
        assertEquals("tree.order", TreeContract.entityArrayFault(numbers))
    }

    private fun receiverOutcome(expect: JsonObject): TreeContract.Snapshot {
        val outcome = (expect["outcome"] as JsonString).value
        val reason = (expect["reason"] as? JsonString)?.value
        return when {
            outcome == "replace" -> TreeContract.Snapshot.Accepted
            outcome == "fatal" && reason == "protocol-mismatch" -> TreeContract.Snapshot.Mismatch
            outcome == "fatal" && reason == "bad-snapshot" -> {
                val issue = expect["issue"] as JsonObject
                TreeContract.Snapshot.Rejected(
                    TreeContract.Issue((issue["code"] as JsonString).value, (issue["at"] as JsonString).value),
                )
            }
            else -> error("a snapshot step expects $outcome/$reason")
        }
    }
}
