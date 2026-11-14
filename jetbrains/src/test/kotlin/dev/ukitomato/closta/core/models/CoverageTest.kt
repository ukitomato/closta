package dev.ukitomato.closta.core.models

import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The three figures the comparison against the official types turns on.
 *
 * A table could say how the captures line up with the SDK's declarations, but tables go stale in
 * silence, so the figures are pinned here too: raise the CLI version, record again, and whichever of
 * the three moved says what moved with it.
 *
 * The expectations come from `@anthropic-ai/claude-agent-sdk@0.3.282`, whose bundled `package.json`
 * gives `claudeCodeVersion` `2.1.282` — the version the captures were recorded from. The package is
 * not vendored here, so the two counts that describe *it* (44 and 39) are written down rather than
 * computed; everything that describes the **captures** is counted from the captures, and the
 * classification is checked against them so that a figure cannot agree with itself.
 */
class CoverageTest {
    @Test
    fun `the captures contain exactly the kinds that are modelled`() {
        assertAll(
            { assertEquals(OBSERVED_KINDS, observedKinds().size, "distinct kinds in the captures") },
            { assertEquals(OBSERVED_KINDS, AgentEventKind.entries.size, "variants of AgentEvent that are kinds") },
            {
                assertEquals(
                    AgentEventKind.entries.toSet(),
                    observedKinds(),
                    "a modelled kind that never arrives is a branch no test can reach",
                )
            },
        )
    }

    @Test
    fun `the one kind with no official declaration is one the captures really send`() {
        val lifecycleCaptures =
            CaptureFixtures.manifest().scenarios.count { scenario ->
                CaptureFixtures.readCapture(scenario.file).any { it is AgentEvent.CommandLifecycle }
            }

        assertAll(
            // Written down, not derived: if this kind were absent from the captures, leaving it
            // modelled would be exactly the mistake the previous assertion forbids.
            { assertTrue(observedKinds().containsAll(UNDECLARED), "the undeclared kind is in the captures") },
            { assertEquals(CAPTURES_WITH_LIFECYCLE, lifecycleCaptures, "captures containing command_lifecycle") },
            // 18 observed, 17 declared somewhere in StdoutMessage. The difference of one is the whole
            // reason AgentEvent has eighteen kinds and not seventeen.
            {
                assertEquals(
                    DECLARED_IN_STDOUT_MESSAGE,
                    OBSERVED_KINDS - UNDECLARED.size,
                    "observed kinds declared in StdoutMessage (of $STDOUT_MESSAGE_KINDS declared kinds)",
                )
            },
        )
    }

    @Test
    fun `the control protocol is why the denominator is StdoutMessage and not SDKMessage`() {
        val controlLines =
            CaptureFixtures.manifest().scenarios.sumOf { scenario ->
                CaptureFixtures.readCapture(scenario.file).count {
                    it is AgentEvent.Known && it.kind in CONTROL_PROTOCOL_ONLY
                }
            }

        assertAll(
            { assertTrue(observedKinds().containsAll(CONTROL_PROTOCOL_ONLY), "the control kinds are recorded") },
            // Counting against SDKMessage instead drops these lines and reports two recorded kinds as
            // undeclared, which they are not — they are declared, just not in that subset.
            { assertEquals(CONTROL_PROTOCOL_LINES, controlLines, "recorded control-protocol lines") },
            {
                assertEquals(
                    DECLARED_IN_SDK_MESSAGE,
                    DECLARED_IN_STDOUT_MESSAGE - CONTROL_PROTOCOL_ONLY.size,
                    "observed kinds declared in SDKMessage (of $SDK_MESSAGE_KINDS declared kinds)",
                )
            },
        )
    }

    @Test
    fun `the declared kinds that never arrive are left unmodelled`() {
        // Modelling them would add branches no capture can exercise; leaving them out means that the
        // day one arrives it is counted as unknown, which is the signal the counter exists for.
        assertEquals(
            NEVER_OBSERVED,
            STDOUT_MESSAGE_KINDS - DECLARED_IN_STDOUT_MESSAGE,
            "declared kinds absent from all $RECORDED_LINES recorded lines",
        )
    }

    private fun observedKinds(): Set<AgentEventKind> =
        CaptureFixtures
            .manifest()
            .scenarios
            .flatMap { CaptureFixtures.readCapture(it.file) }
            .filterIsInstance<AgentEvent.Known>()
            .map { it.kind }
            .toSet()

    private companion object {
        /** `StdoutMessage` in sdk.d.ts — "everything the CLI writes to its output stream". */
        const val STDOUT_MESSAGE_KINDS = 44

        /** `SDKMessage`: the subset of the above without the control protocol and keep-alives. */
        const val SDK_MESSAGE_KINDS = 39

        /** Distinct kinds across the captures (including commands_changed and compact_boundary). */
        const val OBSERVED_KINDS = 18

        /** Of those, the ones `StdoutMessage` declares. */
        const val DECLARED_IN_STDOUT_MESSAGE = 17

        /** Of those, the ones that are also in the `SDKMessage` subset. */
        const val DECLARED_IN_SDK_MESSAGE = 15

        /** Declared but never recorded. */
        const val NEVER_OBSERVED = 27

        /**
         * Lines across the 40 captures (01-40).
         */
        const val RECORDED_LINES = 2832

        /**
         * Captures in which `command_lifecycle` appears; 06, 07, 24, 34, 35 and 40 have no user turn.
         */
        const val CAPTURES_WITH_LIFECYCLE = 33

        /**
         * `control_response` 21 + `control_request` 5 in captures 01-15; 16-21 add 7 responses (6 initialize,
         * 1 interrupt) and 3 requests; 22 adds 2 responses (the two initializes of the resume capture); 23 adds 1 (the
         * one initialize of the attachments capture); 24 adds 9 (the initialize and the eight MCP requests); 25 and 26
         * add 7 (capture 25: the initialize and two rewind_files responses, two can_use_tool requests; capture 26: the
         * two initializes of its two CLIs); 27 adds 2 (the two initializes of its two CLIs); 28 adds 8 (the
         * initialize, the get_settings before the switches, and three apply_flag_settings each with the get_settings
         * after it); 29 adds 3 (the initialize, the ExitPlanMode and the Edit can_use_tool requests); 32 adds 2 (the
         * initialize and the interrupt); 33 adds 8 (the initialize, then a get_settings first and after each of
         * the three apply_flag_settings); 34 and 35 add 2 each (the initialize and the get_settings); 36 adds 4 (the
         * second CLI's initialize, apply_flag_settings and get_settings, and the Bash can_use_tool request — the first
         * CLI refused to start without answering initialize); 37 adds 3 (the initialize, the set_permission_mode and
         * the ExitPlanMode can_use_tool request); 38 adds 5 (the initialize, the refused and the accepted
         * set_permission_mode, the ExitPlanMode and the Edit can_use_tool requests); 39 adds 3 (the two initializes and
         * the get_settings of the resumed CLI); 40 adds 4 (the initialize and the get_settings of each of its two
         * CLIs).
         */
        const val CONTROL_PROTOCOL_LINES = 104

        /**
         * Observed, but with no declaration anywhere in the package's `.d.ts` files: the word appears
         * once in sdk.d.ts, in prose on `interrupt`.
         */
        val UNDECLARED = setOf(AgentEventKind.COMMAND_LIFECYCLE)

        /** Declared by `StdoutMessage` only: the control protocol is not part of `SDKMessage`. */
        val CONTROL_PROTOCOL_ONLY = setOf(AgentEventKind.CONTROL_REQUEST, AgentEventKind.CONTROL_RESPONSE)
    }
}
