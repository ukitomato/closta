package dev.ukitomato.closta.core.models

import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import java.security.MessageDigest

/**
 * The captures are what everything else here is measured against, so they get measured themselves.
 *
 * This is the source that wins when the official types and the captures disagree,
 * and a source that can be edited without anyone noticing is not a source. `manifest.json` records a
 * sha256 and a line count per capture; this recomputes both. It also counts the files actually
 * present, because a capture that is deleted outright would otherwise just stop being checked.
 *
 * Nothing here reads an [AgentEvent]: a capture must be shown to be genuine before what it contains
 * means anything, so this test does not wait on the ones that parse it.
 */
class ManifestTest {
    @TestFactory
    fun `every capture still has the bytes the manifest recorded`(): List<DynamicTest> =
        CaptureFixtures.manifest().scenarios.map { scenario ->
            DynamicTest.dynamicTest(scenario.scenario) {
                val bytes = CaptureFixtures.bytesOf(scenario.file)
                assertEquals(scenario.sha256, sha256(bytes), "${scenario.file}: sha256")
                assertEquals(
                    scenario.lines,
                    CaptureFixtures.nonBlankLines(String(bytes, Charsets.UTF_8)).size,
                    "${scenario.file}: line count",
                )
            }
        }

    @Test
    fun `the manifest accounts for every capture on disk and no others`() {
        val manifest = CaptureFixtures.manifest()
        val listed = manifest.scenarios.map { it.file }.sorted()

        assertEquals(EXPECTED_CAPTURES, manifest.scenarioCount, "manifest.json scenario_count")
        assertEquals(EXPECTED_CAPTURES, listed.size, "entries in scenarios[]")
        // Catches the capture that was added or deleted without touching the manifest — the case a
        // per-entry hash check cannot see, because the entry is simply not there.
        assertEquals(listed, CaptureFixtures.captureFileNames(), "captures present next to the manifest")
    }

    @Test
    fun `the captures hold the recorded number of lines in total`() {
        val total =
            CaptureFixtures.manifest().scenarios.sumOf { scenario ->
                CaptureFixtures.nonBlankLines(CaptureFixtures.textOf(scenario.file)).size
            }
        assertEquals(EXPECTED_LINES, total, "lines across all captures")
    }

    @Test
    fun `every capture was recorded with one CLI version`() {
        val manifest = CaptureFixtures.manifest()
        val versions = manifest.scenarios.map { it.claudeVersion }.toSet()

        // A mixed set would mean the captures describe two protocols, and the comparison against the
        // official types would be against neither of them.
        assertEquals(setOf(CLI_VERSION), versions, "claude_version across scenarios[]")
        assertEquals(CLI_VERSION, manifest.claudeVersion, "manifest.json claude_version")
    }

    @Test
    fun `every init reports the CLI version the manifest recorded for its capture`() {
        val checked =
            CaptureFixtures.manifest().scenarios.sumOf { scenario ->
                val inits = CaptureFixtures.readCapture(scenario.file).filterIsInstance<AgentEvent.SystemInit>()
                inits.forEach {
                    assertEquals(
                        scenario.claudeVersion,
                        it.claudeCodeVersion,
                        "${scenario.scenario}: system/init.claude_code_version against manifest.json",
                    )
                }
                inits.size
            }
        assertTrue(checked > 0, "at least one init was compared — an empty comparison proves nothing")
    }

    @Test
    fun `an init reports the model the capture was started with`() {
        var compared = 0
        CaptureFixtures.manifest().scenarios.forEach { scenario ->
            val flags = CaptureFixtures.manifestFlags(scenario.file)
            val at = flags.indexOf("--model")
            if (at < 0) return@forEach
            val requested = flags[at + 1]
            CaptureFixtures.readCapture(scenario.file).filterIsInstance<AgentEvent.SystemInit>().forEach {
                assertEquals(requested, it.model, "${scenario.scenario}: system/init.model against the --model flag")
                compared++
            }
        }
        assertTrue(compared > 0, "at least one init was compared — an empty comparison proves nothing")
    }

    @Test
    fun `the resume capture records both CLIs and the transcript it was taken with`() {
        val file = "22-resume.ndjson"
        val resumeFlags = CaptureFixtures.manifestResumeFlags(file)
        val (transcript, transcriptSha) =
            checkNotNull(
                CaptureFixtures.manifestTranscript(file),
            ) { "no transcript recorded" }

        // The second CLI opens the same session by --resume, and never names a new id: --session-id is only allowed
        // with --resume when forking; the fork scene (26) is the one that records that.
        assertTrue(checkNotNull(resumeFlags).any { it.startsWith("--resume=") }, "resume_flags: $resumeFlags")
        assertTrue(resumeFlags.none { it.startsWith("--session-id") }, "resume_flags: $resumeFlags")
        assertTrue(
            CaptureFixtures.manifestFlags(file).any { it.startsWith("--session-id") },
            "the first CLI names the id",
        )
        assertEquals(transcriptSha, sha256(CaptureFixtures.bytesOf(transcript)), "$transcript: sha256")
    }

    @Test
    fun `the resume-session-at capture records the fork flags with a new id and the cut point`() {
        val file = "27-resume-session-at.ndjson"
        val resumeFlags = checkNotNull(CaptureFixtures.manifestResumeFlags(file))
        assertTrue(resumeFlags.any { it.startsWith("--resume=") }, "resume_flags: $resumeFlags")
        assertTrue(resumeFlags.contains("--fork-session"), "resume_flags: $resumeFlags")
        assertTrue(resumeFlags.any { it.startsWith("--session-id=") }, "resume_flags: $resumeFlags")
        assertTrue(resumeFlags.any { it.startsWith("--resume-session-at=") }, "resume_flags: $resumeFlags")
    }

    @Test
    fun `the attachments capture records the stdin lines it was taken with, and two turns that both succeeded`() {
        val file = "23-attachments.ndjson"
        val stdin = checkNotNull(CaptureFixtures.manifestStdin(file)) { "no stdin lines recorded" }

        assertEquals(stdin.sha256, sha256(CaptureFixtures.bytesOf(stdin.file)), "${stdin.file}: sha256")
        assertEquals(
            stdin.lines,
            CaptureFixtures.nonBlankLines(CaptureFixtures.textOf(stdin.file)).size,
            "${stdin.file}: lines",
        )
        val flags = CaptureFixtures.manifestFlags(file)
        assertTrue("--permission-prompt-tool" in flags && "--model" in flags, "flags: $flags")
        val results = CaptureFixtures.readCapture(file).filterIsInstance<AgentEvent.Result>()
        assertEquals(2, results.size, "one result for each turn")
        assertTrue(results.none { it.isError }, "neither turn ended in an error")
        assertEquals(listOf("Red", "KIWI"), results.map { it.result }, "the answers to the picture and to the PDF")
    }

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private companion object {
        const val EXPECTED_CAPTURES = 40
        const val EXPECTED_LINES = 2832

        /** The CLI the captures were recorded from; the comparison against the official types is made against it. */
        const val CLI_VERSION = "2.1.282"
    }
}
