package dev.ukitomato.closta.providers.claude.launch

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout

/** How the answer to the record-place probe is read within a time, over scripted processes. */
class ProbeOutputTest {
    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `what the process printed is returned, and the process is destroyed`() {
        val process = ScriptedProcess("CLAUDE_AGENT_HOME=/home/u\nCLAUDE_AGENT_CONFIG=\n")
        assertEquals("CLAUDE_AGENT_HOME=/home/u\nCLAUDE_AGENT_CONFIG=\n", ProbeOutput.within(process, GUARD_MILLIS))
        assertEquals(1, process.destroyCount)
    }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a process that says nothing in time gives null and is destroyed`() {
        val process = ScriptedProcess(holdsOutput = true)
        assertNull(ProbeOutput.within(process, SHORT_MILLIS))
        assertEquals(1, process.destroyCount)
    }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `no more than the limit is read`() {
        val process = ScriptedProcess("x".repeat(100))
        assertEquals("x".repeat(10), ProbeOutput.within(process, GUARD_MILLIS, maxBytes = 10))
    }

    private companion object {
        const val TIMEOUT_SECONDS = 30L
        const val GUARD_MILLIS = 10_000L
        const val SHORT_MILLIS = 100L
    }
}
