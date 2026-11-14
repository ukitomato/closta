package dev.ukitomato.closta.core.models

import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test

/**
 * `total_cost_usd` is a session running total, so folding *replaces* it and never adds.
 * Capture 10 carries two results at `0.0794802` → `0.21946859999999999`; the final session cost is
 * the last value, not their sum (`≈0.299`). The two figures are read straight from the current
 * capture — older recordings had other values from a re-recording and the capture wins.
 */
class SessionCostTest {
    @Test
    fun `capture 10 ends at the last cost figure, not the sum of the two`() {
        val state = CaptureFixtures.readCapture("10-background-task.ndjson").fold(ConversationState(), ::fold)

        assertEquals(FINAL_COST, state.usage.sessionCostUsd, "session cost is the last total, replaced not summed")
        assertNotEquals(SUM_OF_TWO, state.usage.sessionCostUsd, 1e-9, "must not accumulate the running total")
    }

    private companion object {
        const val FINAL_COST = 0.21946859999999999
        const val SUM_OF_TWO = 0.0794802 + 0.21946859999999999
    }
}
