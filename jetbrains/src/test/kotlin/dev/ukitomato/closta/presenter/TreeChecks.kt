package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull

/** The checks every tree the projection builds is held to, in the tests. */
object TreeChecks {
    /**
     * The webview's check first — the stricter ones assume a tree it accepts — then the contract's vocabulary only,
     * then no array an op could address. A message is made only when a check fails.
     */
    fun assertContract(
        tree: JsonObject,
        at: String,
    ) {
        val issue = TreeContract.checkTree(tree)
        assertNull(issue) { "$at: the webview rejects the tree: $issue" }
        val strict = TreeContract.strictFault(tree)
        assertNull(strict) { "$at: a key the protocol does not name: $strict" }
        val array = TreeContract.entityArrayFault(tree)
        assertNull(array) { "$at: an array an op could address: $array" }
    }

    /** What the memo handed back is what a projection built from nothing makes of the same inputs. */
    fun assertSameAsFresh(
        memoized: JsonObject,
        fresh: JsonObject,
        at: String,
    ) {
        assertEquals(fresh, memoized) { "$at: the memoized tree is not what a fresh projector builds" }
        assertEquals(JsonText.pretty(fresh), JsonText.pretty(memoized)) { "$at: and it prints differently" }
    }
}
