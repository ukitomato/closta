package dev.ukitomato.closta.presenter.diff

import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.opentest4j.AssertionFailedError

/** What a failure of the property checks says, so that a failing seed can be read and run again. */
class DiffChecksTest {
    private fun obj(text: String): JsonObject = JsonRead.parse(text) as JsonObject

    @Test
    fun `a branch that lost its identity is named by its path`() {
        val prev = obj("""{"a":{"b":{"c":1},"d":{"e":2}},"f":{"g":3}}""")
        val a = prev["a"] as JsonObject
        // The op wrote a.b; a.d is rebuilt equal although no op went into it.
        val applied =
            JsonObject.of(
                "a" to JsonObject.of("b" to obj("""{"c":9}"""), "d" to DiffChecks.deepCopy(a["d"]!!)),
                "f" to prev["f"]!!,
            )
        val failure =
            assertThrows<AssertionError> {
                DiffChecks.assertKept(prev, applied, listOf(listOf("a", "b")), "case 7")
            }
        assertTrue("case 7: the branch at [a, d]" in failure.message!!, failure.message)
        // With a.d kept as the same object, the walk passes and counts the two branches it saw kept: a.d and f.
        val kept = JsonObject.of("a" to JsonObject.of("b" to obj("""{"c":9}"""), "d" to a["d"]!!), "f" to prev["f"]!!)
        assertEquals(2, DiffChecks.assertKept(prev, kept, listOf(listOf("a", "b")), "case 7"))
    }

    @Test
    fun `a failed comparison inside seeded keeps its expected and actual, behind the seed and the label`() {
        val failure =
            assertThrows<AssertionFailedError> {
                DiffChecks.seeded(SEED, "generic case 3 rootEdges=true") { assertEquals("next", "applied", "at") }
            }
        assertTrue(failure.message!!.startsWith("seed $SEED (generic case 3 rootEdges=true): at"), failure.message)
        assertTrue(failure.isExpectedDefined && failure.isActualDefined)
        assertEquals("next", failure.expected.value)
        assertEquals("applied", failure.actual.value)
    }

    @Test
    fun `an exception inside seeded is wrapped with the seed and the label, other errors pass through`() {
        val refused = IllegalStateException("Expected string at path [t]")
        val wrapped =
            assertThrows<AssertionFailedError> { DiffChecks.seeded(SEED, "shaped sequence 1") { throw refused } }
        assertTrue(wrapped.message!!.startsWith("seed $SEED (shaped sequence 1): "), wrapped.message)
        assertSame(refused, wrapped.cause)
        val error = OutOfMemoryError("not an assertion")
        assertSame(error, assertThrows<OutOfMemoryError> { DiffChecks.seeded(SEED, "deep case 0") { throw error } })
    }

    @Test
    fun `assertReached fails when a kind came up too few times or never, and names it`() {
        val coverage = DiffChecks.Coverage()
        coverage.count("append-text", 3)
        coverage.count("replace", 2)
        coverage.count("nothing", 0)
        coverage.assertReached(2, "append-text", "replace")
        val short = assertThrows<AssertionError> { coverage.assertReached(3, "append-text", "replace") }
        assertTrue("fewer than 3 times: [replace]" in short.message!!, short.message)
        val never =
            assertThrows<AssertionError> { coverage.assertReached(1, "append-text", "nothing", "set of an array") }
        assertTrue("[nothing, set of an array]" in never.message!!, never.message)
        assertEquals(mapOf("append-text" to 3, "replace" to 2), coverage.counts.toMap(), "a count of 0 is not kept")
    }

    @Test
    fun `a case's random source depends on its seed alone`() {
        val draws = { random: java.util.Random -> List(3) { random.nextInt() } }
        assertEquals(draws(DiffChecks.random(SEED)), draws(DiffChecks.random(SEED)))
        assertTrue(DiffChecks.random(SEED).nextLong() != DiffChecks.random(SEED + 1).nextLong())
    }

    private companion object {
        const val SEED = 24_000_042L
    }
}
