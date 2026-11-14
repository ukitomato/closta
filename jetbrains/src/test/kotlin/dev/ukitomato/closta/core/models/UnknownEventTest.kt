package dev.ukitomato.closta.core.models

import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The counter for lines that could not be placed, and the proof that a kind the official
 * types never declared is not one of them.
 *
 * Three routes, because a counter that only ever sees zero is indistinguishable from a counter that
 * is not wired up: the captures (nothing to count), an injected unknown kind (something to count),
 * and a damaged line (something to count *separately*). Only the second and third show that the
 * first zero means anything.
 */
class UnknownEventTest {
    @Test
    fun `the recorded captures leave nothing uncounted`() {
        // Every capture places every line; whatever is left in the exception table is exactly the
        // known gaps (CaptureFixtures.KNOWN_UNPLACED), counted here so the counter is seen to count them.
        val recorded = allEvents()
        val known =
            CaptureFixtures.KNOWN_UNPLACED.values
                .flatMap { it.entries }
                .groupingBy { it.key }
                .fold(0) { sum, entry -> sum + entry.value }
        val all = UnknownEventTally.of(recorded)
        assertEquals(known, all.unknownByWireType, "the known gaps, and nothing else")
        assertEquals(0, all.brokenLineCount, "unreadable lines across all the captures")
        val tally =
            UnknownEventTally.of(
                CaptureFixtures
                    .manifest()
                    .scenarios
                    .filter { it.scenario !in CaptureFixtures.KNOWN_UNPLACED }
                    .flatMap { CaptureFixtures.readCapture(it.file) },
            )

        assertAll(
            { assertEquals(0, tally.unknownCount, "unknown kinds in the captures: ${tally.unknownByWireType}") },
            { assertEquals(0, tally.brokenLineCount, "unreadable lines in the captures") },
            { assertTrue(tally.isClean, "the captures are the baseline the counter is measured against") },
            { assertNull(tally.firstUnknown, "nothing to keep a sample of") },
        )
    }

    @Test
    fun `command_lifecycle is a kind of its own and not an unknown`() {
        val events = allEvents()
        val lifecycle = events.filterIsInstance<AgentEvent.CommandLifecycle>()

        assertAll(
            // Undeclared in the official SDK types, present on every turn. Counting it as unknown
            // would put 63 lines into the alarm on every run and the alarm would stop meaning
            // anything.
            { assertEquals(COMMAND_LIFECYCLE_LINES, lifecycle.size, "recorded command_lifecycle lines") },
            {
                assertTrue(
                    events.none { it is AgentEvent.UnknownKind && it.wireType == "command_lifecycle" },
                    "command_lifecycle must not be counted as unknown",
                )
            },
            {
                assertEquals(
                    AgentEventKind.COMMAND_LIFECYCLE,
                    AgentEventKind.ofWireType("command_lifecycle"),
                    "the wire type resolves to a declared kind",
                )
            },
        )
    }

    @Test
    fun `an injected unknown kind is counted and kept`() {
        val line = """{"type":"holographic_telemetry","uuid":"u","session_id":"s"}"""

        val event = CaptureFixtures.parse(line)
        val tally = UnknownEventTally.EMPTY.accept(event)

        val unknown = assertInstanceOf(AgentEvent.UnknownKind::class.java, event)
        assertAll(
            { assertEquals("holographic_telemetry", unknown.wireType) },
            { assertEquals(1, tally.unknownCount) },
            { assertEquals(0, tally.brokenLineCount, "a new kind is not a damaged line") },
            { assertEquals(mapOf("holographic_telemetry" to 1), tally.unknownByWireType) },
            { assertEquals(line, tally.firstUnknown?.text, "the sample is the line itself") },
        )
    }

    @Test
    fun `an unknown system subtype is counted under its subtype`() {
        val line = """{"type":"system","subtype":"quantum_entangled","uuid":"u","session_id":"s"}"""

        val unknown = assertInstanceOf(AgentEvent.UnknownKind::class.java, CaptureFixtures.parse(line))
        // Counting it as plain `system` would hide the new subtype among the eight known ones.
        assertEquals("system/quantum_entangled", unknown.wireType)
    }

    @Test
    fun `a known kind that lost a required field is counted as unknown`() {
        // `state` is on every recorded command_lifecycle line. Its absence means the shape moved,
        // which is the same news as a new kind and belongs in the same counter.
        val line = """{"type":"command_lifecycle","command_uuid":"c","uuid":"u","session_id":"s"}"""

        val unknown = assertInstanceOf(AgentEvent.UnknownKind::class.java, CaptureFixtures.parse(line))
        assertEquals("command_lifecycle", unknown.wireType)
    }

    @Test
    fun `a damaged line is counted separately from an unknown kind`() {
        val damaged = "{\"type\":\"assistant\", this is not JSON"

        val event = CaptureFixtures.parse(damaged)
        val tally = UnknownEventTally.EMPTY.accept(event)

        val broken = assertInstanceOf(AgentEvent.BrokenLine::class.java, event)
        assertAll(
            { assertEquals(damaged, broken.line, "the bytes are kept so the damage can be looked at") },
            { assertTrue(broken.reason.isNotBlank(), "a damaged line says why it could not be read") },
            { assertEquals(1, tally.brokenLineCount) },
            // The whole point of two numbers: a new CLI version and a damaged pipe send the reader
            // to different places, and one total would not say which.
            { assertEquals(0, tally.unknownCount, "a damaged line is not a new kind") },
            { assertEquals(damaged, tally.firstBrokenLine) },
        )
    }

    @Test
    fun `the two counters add up without merging`() {
        val lines =
            listOf(
                """{"type":"holographic_telemetry","uuid":"u1","session_id":"s"}""",
                """{"type":"holographic_telemetry","uuid":"u2","session_id":"s"}""",
                """{"type":"tachyon_pulse","uuid":"u3","session_id":"s"}""",
                "not json at all",
                """{"type":"command_lifecycle","command_uuid":"c","state":"queued","uuid":"u4","session_id":"s"}""",
            )

        val tally = UnknownEventTally.of(lines.map(CaptureFixtures::parse))

        assertAll(
            { assertEquals(mapOf("holographic_telemetry" to 2, "tachyon_pulse" to 1), tally.unknownByWireType) },
            { assertEquals(3, tally.unknownCount) },
            { assertEquals(1, tally.brokenLineCount) },
            { assertEquals(4, tally.totalCount) },
            { assertTrue(!tally.isClean) },
            // One sample per sort, not one per line: keeping every unknown line whole would rebuild
            // in test output the payloads the capture scrubber exists to strip.
            { assertEquals(lines[0], tally.firstUnknown?.text, "the sample is the first unknown, not the last") },
            { assertEquals("not json at all", tally.firstBrokenLine) },
        )
    }

    @Test
    fun `a known line leaves the counter untouched`() {
        val known =
            CaptureFixtures.parse(
                """{"type":"command_lifecycle","command_uuid":"c","state":"completed","uuid":"u","session_id":"s"}""",
            )

        // Safe to fold over a whole stream without filtering it first.
        assertEquals(UnknownEventTally.EMPTY, UnknownEventTally.EMPTY.accept(known))
    }

    private fun allEvents(): List<AgentEvent> =
        CaptureFixtures.manifest().scenarios.flatMap { CaptureFixtures.readCapture(it.file) }

    private companion object {
        /** The `command_lifecycle` lines across all the captures, counted by hand. */
        const val COMMAND_LIFECYCLE_LINES = 135
    }
}
