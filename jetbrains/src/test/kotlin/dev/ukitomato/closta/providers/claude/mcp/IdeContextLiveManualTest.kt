package dev.ukitomato.closta.providers.claude.mcp

import dev.ukitomato.closta.core.interfaces.Diagnostic
import dev.ukitomato.closta.core.interfaces.DiagnosticSeverity
import dev.ukitomato.closta.core.interfaces.Diagnostics
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.providers.claude.AgentProcess
import dev.ukitomato.closta.providers.claude.ClaudeSession
import dev.ukitomato.closta.providers.claude.launch.ClaudeLaunchSpec
import dev.ukitomato.closta.providers.claude.launch.launchClaude
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import java.io.File
import java.nio.file.Files
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

/**
 * MANUAL end-to-end check: the **real** `claude` on this machine, through
 * [McpAgentProcess], with a fake [Diagnostics] that answers one marked finding. claude is asked to call
 * `mcp__ide-context__getDiagnostics`; the test passes when its final answer contains the marker.
 *
 * Gated on `CLOSTA_LIVE_CLAUDE=1`, so `./gradlew check` skips it (no CLI or sign-in needed). Run it by hand:
 * `CLOSTA_LIVE_CLAUDE=1 ./gradlew test --tests '*IdeContextLiveManualTest*'`. It costs one short turn.
 *
 * The round trip — the `mcp_message` lines the CLI sent and the `mcp_response` lines the wrapper wrote — is written to
 * `build/ide-context-live/roundtrip.ndjson`, together with a `can_use_tool` note when the CLI asked for permission
 * (not yet confirmed whether it does). Nothing but those JSON-RPC lines and the marker is written: no environment, no
 * secret.
 */
class IdeContextLiveManualTest {
    private val marker = "LIVE-MARK-" + UUID.randomUUID().toString().take(8)
    private val trace = CopyOnWriteArrayList<String>()

    private val diagnostics =
        object : Diagnostics {
            override suspend fun diagnostics(path: String?): IdeResult<List<Diagnostic>> =
                IdeResult.Ok(listOf(Diagnostic("/tmp/Live.kt", 1, 1, DiagnosticSeverity.ERROR, marker, "manual-test")))
        }

    /** Records the round trip's lines as they pass; changes nothing. */
    private inner class Tracing(
        private val inner: AgentProcess,
    ) : AgentProcess by inner {
        override val stdoutLines: Flow<String> =
            inner.stdoutLines.onEach { if ("mcp_message" in it) trace += "<- $it" }

        override suspend fun writeStdin(line: String) {
            if ("mcp_response" in line || "\"initialize\"" in line) trace += "-> $line"
            inner.writeStdin(line)
        }
    }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    @EnabledIfEnvironmentVariable(named = "CLOSTA_LIVE_CLAUDE", matches = "1")
    fun `real claude calls getDiagnostics through the wrapper and its answer carries the marker`() {
        val workDir = Files.createTempDirectory("ide-context-live").toFile()
        val sessionId = UUID.randomUUID().toString()
        val real =
            launchClaude(ClaudeLaunchSpec(sessionId = sessionId, cwd = workDir.path, permissionPromptToolStdio = true))
        val process = McpAgentProcess(Tracing(real), ideContextServers(bridge()))
        val session = ClaudeSession(process, sessionId)
        var answer = ""
        var cost = Double.NaN
        var version = "unknown"
        try {
            runBlocking {
                withTimeout(TIMEOUT_SECONDS * 1000L - GRACE_MILLIS) {
                    coroutineScope {
                        val turn = CompletableDeferred<AgentEvent.Result>()
                        val collector: Job =
                            launch {
                                session.events.collect { event ->
                                    when (event) {
                                        is AgentEvent.ControlRequest -> {
                                            trace += "can_use_tool: ${event.toolName}"
                                            session.respondToApproval(ApprovalDecision.Allow(event.requestId), "{}")
                                        }
                                        is AgentEvent.SystemInit -> version = event.claudeCodeVersion
                                        is AgentEvent.Result -> turn.complete(event)
                                        else -> Unit
                                    }
                                }
                            }
                        session.sendUserMessage(PROMPT)
                        val result = turn.await()
                        answer = result.result
                        cost = result.totalCostUsd
                        process.destroy()
                        collector.cancelAndJoin()
                    }
                }
            }
        } finally {
            process.destroy()
            val out = File("build/ide-context-live").apply { mkdirs() }
            File(out, "roundtrip.ndjson").writeText(trace.joinToString("\n", postfix = "\n"))
            workDir.deleteRecursively()
        }
        println(
            "[live] answer contains marker=${marker in answer}; trace lines=${trace.size}; " +
                "cost=$cost USD; claude version=$version",
        )
        assertTrue(marker in answer, "the answer did not carry the marker")
        assertTrue(trace.any { it.contains("tools/call") }, "no tools/call was seen")
    }

    private fun bridge() =
        object : dev.ukitomato.closta.core.interfaces.IdeBridge {
            override fun projectBasePath(): String? = null

            override val diagnostics: Diagnostics = this@IdeContextLiveManualTest.diagnostics
        }

    private companion object {
        const val TIMEOUT_SECONDS = 240L
        const val GRACE_MILLIS = 5_000L
        const val PROMPT =
            "Call the tool mcp__ide-context__getDiagnostics once with no arguments. " +
                "Then reply with the message text of the diagnostic it returned, and nothing else."
    }
}
