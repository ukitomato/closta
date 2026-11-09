package dev.ukitomato.closta.core.models

import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/**
 * Every recorded line becomes an [AgentEvent], and every capture is checked on its own.
 *
 * "Read them all and count" would pass just as happily on fourteen captures as on fifteen, so the
 * capture list comes from `manifest.json` and each entry becomes its own test: dropping a capture
 * makes a named test disappear and the count assertion fail, rather than quietly shrinking the
 * denominator.
 *
 * The per-line conversions are asserted directly as well. Reaching them only through a whole-capture
 * count means a field that lands in the wrong place stays invisible until some later reader happens
 * to want it, and the failure then points at the capture rather than at the mapping.
 */
class AgentEventFixtureTest {
    @Test
    fun `manifest lists every recorded capture`() {
        val manifest = CaptureFixtures.manifest()
        assertEquals(EXPECTED_CAPTURES, manifest.scenarioCount, "manifest.json scenario_count")
        assertEquals(EXPECTED_CAPTURES, manifest.scenarios.size, "manifest.json scenarios[] length")
    }

    @TestFactory
    fun `every line of every capture becomes an AgentEvent`(): List<DynamicTest> =
        CaptureFixtures.manifest().scenarios.map { scenario ->
            DynamicTest.dynamicTest(scenario.scenario) {
                val text = CaptureFixtures.textOf(scenario.file)
                val lines = CaptureFixtures.nonBlankLines(text)
                val events = CaptureFixtures.parseAll(text)

                assertEquals(lines.size, events.size, "${scenario.file}: one event per non-blank line")
                assertEquals(scenario.lines, lines.size, "${scenario.file}: manifest.json line count")

                val unplaceable = events.withIndex().filter { (_, event) -> event !is AgentEvent.Known }
                // Only the known gaps may stay unplaced, and each of them still has to: a gap that gets closed is
                // taken off the table, and a new one is not quietly let in.
                val unknownWireTypes =
                    unplaceable
                        .map { (_, event) -> (event as? AgentEvent.UnknownKind)?.wireType ?: "broken line" }
                        .groupingBy { it }
                        .eachCount()
                assertEquals(
                    CaptureFixtures.KNOWN_UNPLACED[scenario.scenario].orEmpty(),
                    unknownWireTypes,
                    "${scenario.file}: the lines that did not become a known event — " +
                        "first at line ${unplaceable.firstOrNull()?.index?.plus(1)}: " +
                        "${unplaceable.firstOrNull()?.value}",
                )
            }
        }

    @Test
    fun `the captures hold the recorded number of lines in total`() {
        val total = CaptureFixtures.manifest().scenarios.sumOf { CaptureFixtures.readCapture(it.file).size }
        assertEquals(EXPECTED_LINES, total, "lines across all captures")
    }

    @Test
    fun `a line carries its own kind`() {
        val kinds = allEvents().filterIsInstance<AgentEvent.Known>().map { it.kind }.toSet()
        assertEquals(
            AgentEventKind.entries.toSet(),
            kinds,
            "every declared kind should appear in the captures, and no line should invent one",
        )
    }

    @Test
    fun `a turn boundary line becomes CommandLifecycle`() {
        val event =
            CaptureFixtures.parse(
                """{"type":"command_lifecycle","command_uuid":"2db4d1c4","state":"queued",""" +
                    """"uuid":"a6026949","session_id":"0d09d32e"}""",
            )

        val lifecycle = assertInstanceOf(AgentEvent.CommandLifecycle::class.java, event)
        assertAll(
            { assertEquals(AgentEventKind.COMMAND_LIFECYCLE, lifecycle.kind) },
            { assertEquals("2db4d1c4", lifecycle.commandUuid) },
            { assertEquals("queued", lifecycle.state) },
            { assertEquals("a6026949", lifecycle.uuid) },
            { assertEquals("0d09d32e", lifecycle.sessionId) },
        )
    }

    @Test
    fun `a system line keeps its subtype instead of collapsing into one bucket`() {
        val status =
            CaptureFixtures.parse(
                """{"type":"system","subtype":"status","status":null,"permissionMode":"plan",""" +
                    """"uuid":"d7ad0e15","session_id":"1a0d2541"}""",
            )
        val updated =
            CaptureFixtures.parse(
                """{"type":"system","subtype":"task_updated","task_id":"a9647d7f",""" +
                    """"patch":{"status":"completed"},"uuid":"17b5da97","session_id":"fce28e10"}""",
            )

        val statusEvent = assertInstanceOf(AgentEvent.SystemStatus::class.java, status)
        val updatedEvent = assertInstanceOf(AgentEvent.SystemTaskUpdated::class.java, updated)
        assertAll(
            // Null where the official type says non-null: the capture wins, and a value the CLI
            // leaves empty is not a reason to refuse the line.
            { assertNull(statusEvent.status, "status is null on 5 of the 34 recorded system/status lines") },
            { assertEquals("plan", statusEvent.permissionMode) },
            { assertEquals("a9647d7f", updatedEvent.taskId) },
            { assertEquals("""{"status":"completed"}""", updatedEvent.patch.text) },
        )
    }

    @Test
    fun `a nested payload is carried through as text rather than modelled`() {
        val event =
            CaptureFixtures.parse(
                """{"type":"stream_event","event":{"type":"content_block_delta","index":0},""" +
                    """"session_id":"0d09d32e","parent_tool_use_id":null,"uuid":"3f1d0c22","ttft_ms":812}""",
            )

        val streamEvent = assertInstanceOf(AgentEvent.StreamEvent::class.java, event)
        assertAll(
            { assertEquals("""{"type":"content_block_delta","index":0}""", streamEvent.event.text) },
            { assertNull(streamEvent.parentToolUseId, "an explicit JSON null is an absent value") },
            { assertEquals(FIRST_TOKEN_MS, streamEvent.ttftMs) },
            { assertNull(streamEvent.userMessageUuid, "a field the line omits is absent, not an error") },
        )
    }

    @Test
    fun `a control request keeps its payload and its correlation id`() {
        val event =
            CaptureFixtures.parse(
                """{"type":"control_request","request_id":"fd37592b",""" +
                    """"request":{"subtype":"can_use_tool","tool_name":"Write"}}""",
            )

        val request = assertInstanceOf(AgentEvent.ControlRequest::class.java, event)
        assertAll(
            { assertEquals("fd37592b", request.requestId) },
            { assertEquals("""{"subtype":"can_use_tool","tool_name":"Write"}""", request.request.text) },
        )
    }

    @Test
    fun `a trailing newline is not an event`() {
        val line = """{"type":"command_lifecycle","command_uuid":"c","state":"started","uuid":"u","session_id":"s"}"""

        assertEquals(1, CaptureFixtures.parseAll("$line\n").size, "a trailing newline")
        assertEquals(1, CaptureFixtures.parseAll("$line\n\n   \n").size, "blank lines between and after")
    }

    private fun allEvents(): List<AgentEvent> =
        CaptureFixtures.manifest().scenarios.flatMap { CaptureFixtures.readCapture(it.file) }

    private companion object {
        /** Both figures are recorded in `manifest.json`; holding them here is what makes a drift visible. */
        const val EXPECTED_CAPTURES = 40
        const val EXPECTED_LINES = 2832

        /** Arbitrary: it only has to survive the conversion as a number. */
        const val FIRST_TOKEN_MS = 812L
    }
}
