package dev.ukitomato.closta.providers.claude

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.providers.claude.auth.AwsStsSessionTokenResolver
import dev.ukitomato.closta.providers.claude.auth.SessionTokenRequest
import dev.ukitomato.closta.providers.claude.launch.BedrockConfig
import dev.ukitomato.closta.providers.claude.launch.BedrockLaunch
import dev.ukitomato.closta.providers.claude.launch.ClaudeLaunchSpec
import dev.ukitomato.closta.providers.claude.launch.launchClaude
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import java.util.UUID

/**
 * MANUAL end-to-end smoke: launches the **real** `claude` CLI against **real** AWS Bedrock by wiring the
 * shipped pieces — STS credential resolution + Bedrock env, launchClaude, and ClaudeSession over
 * stream-json. It is **not** part of the automated suite: it is gated on
 * `CLOSTA_BEDROCK_SMOKE=1`, so `./gradlew check` skips it (no AWS/CLI needed for CI). Run it by hand on a
 * machine that has the `claude` CLI on PATH, real AWS access, and (if the account is VPC-gated) the VPN.
 *
 * Every secret comes from the environment; **nothing here prints the env, the AWS keys, the MFA
 * code, or the resolved session token**. Only the agent's own stream-json events are printed (they are
 * claude's output, not our secret). The MFA code is single-use — set `AWS_MFA_CODE` fresh right before a
 * run. This file is a throwaway harness: keep it or delete it after trying.
 *
 * `claude` runs in stream-json input mode, which keeps the session open for more turns rather than
 * exiting after one — so the harness stops when the turn's [AgentEvent.Result] arrives, then [destroy]s
 * the process to complete the (single-collection) event flow.
 *
 * Required env:
 *   CLOSTA_BEDROCK_SMOKE=1
 *   AWS_LT_ACCESS_KEY_ID / AWS_LT_SECRET_ACCESS_KEY   long-term IAM keys
 *   AWS_MFA_SERIAL                                    MFA device ARN/serial
 *   AWS_MFA_CODE                                      current 6-digit TOTP (single use)
 *   BEDROCK_REGION                                    e.g. ap-northeast-1
 * Optional env:
 *   BEDROCK_MODEL            ANTHROPIC_MODEL alias (e.g. "sonnet")
 *   BEDROCK_SONNET_ARN       inference-profile ARN for the sonnet alias
 *   BEDROCK_HAIKU_ARN        inference-profile ARN for the haiku alias
 *   BEDROCK_SMOKE_PROMPT     the user message (default: a trivial hello)
 */
class BedrockSmokeManualTest {
    @Test
    @Timeout(TIMEOUT_SECONDS)
    @EnabledIfEnvironmentVariable(named = "CLOSTA_BEDROCK_SMOKE", matches = "1")
    fun `launches real claude against real Bedrock and prints one turn of events`() {
        val region = requireEnv("BEDROCK_REGION")
        // Resolve MFA session credentials via the AWS SDK's STS GetSessionToken (real AWS).
        val credentials =
            AwsStsSessionTokenResolver()
                .resolve(
                    SessionTokenRequest(
                        tokenCode = requireEnv("AWS_MFA_CODE"),
                        deviceArn = requireEnv("AWS_MFA_SERIAL"),
                        region = region,
                        durationSeconds = STS_DURATION_SECONDS,
                        longTermAccessKeyId = requireEnv("AWS_LT_ACCESS_KEY_ID"),
                        longTermSecretAccessKey = requireEnv("AWS_LT_SECRET_ACCESS_KEY"),
                    ),
                ).getOrElse { failure ->
                    // The failure is secret-free by construction (SessionTokenException = type name only).
                    error("STS GetSessionToken failed: ${failure.message}")
                }
        println("[smoke] STS resolved; temp credentials valid=${credentials.isValid(System.currentTimeMillis())}")

        // Build the Bedrock launch env (CLAUDE_CODE_USE_BEDROCK + AWS_* + optional ANTHROPIC_*).
        val env =
            BedrockLaunch.env(
                BedrockConfig(
                    region = region,
                    model = System.getenv("BEDROCK_MODEL"),
                    sonnetModelId = System.getenv("BEDROCK_SONNET_ARN"),
                    haikuModelId = System.getenv("BEDROCK_HAIKU_ARN"),
                ),
                credentials,
            )
        // Never print `env` — it holds the AWS_* secrets. Only the key set is safe to show.
        println("[smoke] Bedrock env keys=${env.keys.sorted()}")

        // Launch the real `claude` CLI (native spawn) with that env, then drive one turn.
        val sessionId = UUID.randomUUID().toString()
        val process = launchClaude(ClaudeLaunchSpec(sessionId = sessionId, env = env))
        val session: AgentSession = ClaudeSession(process, sessionId)
        val prompt = System.getenv("BEDROCK_SMOKE_PROMPT") ?: "Reply with the single word: pong."

        try {
            runBlocking {
                withTimeout(TIMEOUT_SECONDS * 1000L - GRACE_MILLIS) {
                    coroutineScope {
                        val turn: CompletableDeferred<AgentEvent.Result> = CompletableDeferred()
                        val collector: Job =
                            launch {
                                session.events.collect { event: AgentEvent ->
                                    println("[event] $event")
                                    if (event is AgentEvent.Result && !turn.isCompleted) {
                                        turn.complete(event)
                                    }
                                }
                            }
                        session.sendUserMessage(prompt)
                        val result: AgentEvent.Result = turn.await()
                        println("[smoke] turn complete: isError=${result.isError}, result=${result.result}")
                        // stream-json input keeps claude alive for more turns; end it so the flow completes.
                        process.destroy()
                        collector.cancelAndJoin()
                    }
                }
            }
        } finally {
            process.destroy()
        }
    }

    private fun requireEnv(name: String): String =
        System.getenv(name) ?: error("missing required env var: $name (see BedrockSmokeManualTest KDoc)")

    private companion object {
        const val TIMEOUT_SECONDS = 180L
        const val STS_DURATION_SECONDS = 3600
        const val GRACE_MILLIS = 5_000L
    }
}
