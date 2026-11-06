package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.SyncContract.Action
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonNull
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/**
 * Shows [SyncContract] (with [MessagesContract], [TreeApplier] and `checkPatched` behind it, as [Receiver] drives
 * them) agrees with the webview's TypeScript receiver on the sync fixtures, step by step the way
 * the original tests replay them against the real one: the outcome, its reason and issue, the mode and cursor after
 * it, the resync it sends, the ready a restart sends, the tree after it, and the counts at the end of each case.
 */
class SyncContractTest {
    @TestFactory
    fun `every step of the sync fixtures gets the receiver's outcome, state and tree`(): List<DynamicTest> =
        ProtocolFixtures.cases("sync.json").map { case ->
            DynamicTest.dynamicTest(case.str("name")!!) { replay(case) }
        }

    @Test
    fun `the sync fixtures hold steps of every outcome, counted exactly`() {
        // Exact counts, so a loader that drops cases or steps fails here rather than passing on fewer.
        val cases = ProtocolFixtures.cases("sync.json")
        val expects =
            cases
                .flatMap {
                    (it["steps"] as JsonArray).items
                }.map { (it as JsonObject)["expect"] as JsonObject }
        val outcomes = expects.groupingBy { it.str("outcome") ?: "restart" }.eachCount()
        assertEquals(EXPECTED_CASES, cases.size, "cases")
        assertEquals(EXPECTED_OUTCOMES, outcomes.toSortedMap())
        val reasons = expects.mapNotNull { it.str("reason") }.groupingBy { it }.eachCount()
        assertEquals(EXPECTED_REASONS, reasons.toSortedMap())
        assertEquals(EXPECTED_WITH_DROPPED, cases.count { it.containsKey("dropped") }, "cases that check the counts")
    }

    private fun replay(case: JsonObject) {
        val receiver = Receiver()
        for ((index, item) in (case["steps"] as JsonArray).items.withIndex()) {
            val step = item as JsonObject
            val expect = step["expect"] as JsonObject
            val at = "step $index"
            if (step["restart"] != null) {
                val ready = receiver.restart()
                assertEquals(expect.str("mode"), receiver.state.mode, at)
                assertEquals(expect["cursor"], cursorJson(receiver.state.cursor), at)
                assertEquals(expect["send"], ready, at)
                continue
            }
            val action = receiver.receive(step["input"]).action
            assertEquals(expect.str("outcome"), kind(action), "$at: outcome")
            assertEquals(expect.str("reason"), reason(action), "$at: reason")
            assertEquals(expect["issue"], issue(action), "$at: issue")
            assertEquals(expect.str("mode"), receiver.state.mode, "$at: mode")
            assertEquals(expect["cursor"], cursorJson(receiver.state.cursor), "$at: cursor")
            expect["resync"]?.let { assertEquals(it, (action as? Action.Resync)?.message(), "$at: the resync sent") }
            expect["tree"]?.let { assertEquals(it, receiver.tree, "$at: the tree") }
        }
        (case["dropped"] as? JsonObject)?.let { dropped ->
            val counts = dropped.entries.associate { (key, value) -> key to TreeContract.number(value).toInt() }
            assertEquals(counts, receiver.state.dropped, "the counts at the end")
        }
    }

    private fun cursorJson(cursor: SyncContract.Cursor?): JsonValue = cursor?.toJson() ?: JsonNull

    private fun kind(action: Action): String =
        when (action) {
            is Action.Replace -> "replace"
            is Action.Apply -> "apply"
            is Action.Resync -> "resync"
            is Action.Drop -> "drop"
            is Action.Fatal -> "fatal"
            is Action.Theme -> "theme"
            is Action.Capabilities -> "capabilities"
        }

    private fun reason(action: Action): String? =
        when (action) {
            is Action.Resync -> action.reason
            is Action.Drop -> action.reason
            is Action.Fatal -> action.reason
            else -> null
        }

    private fun issue(action: Action): JsonValue? {
        val issue =
            when (action) {
                is Action.Resync -> action.issue
                is Action.Drop -> action.issue
                is Action.Fatal -> action.issue
                else -> null
            } ?: return null
        return JsonObject.of("code" to JsonString(issue.code), "at" to JsonString(issue.at))
    }

    private companion object {
        const val EXPECTED_CASES = 19
        const val EXPECTED_WITH_DROPPED = 16
        val EXPECTED_OUTCOMES =
            sortedMapOf(
                "apply" to 11,
                "capabilities" to 1,
                "drop" to 11,
                "fatal" to 5,
                "replace" to 27,
                "restart" to 2,
                "resync" to 12,
                "theme" to 1,
            )
        val EXPECTED_REASONS =
            sortedMapOf(
                "apply-failed" to 8,
                "awaiting" to 3,
                "bad-patch" to 1,
                "bad-snapshot" to 3,
                "epoch" to 1,
                "fatal" to 1,
                "gap" to 2,
                "malformed" to 5,
                "protocol-mismatch" to 2,
                "stale" to 1,
                "unknown-type" to 1,
            )
    }
}
