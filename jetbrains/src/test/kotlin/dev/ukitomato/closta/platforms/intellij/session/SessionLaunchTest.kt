package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.platforms.intellij.auth.SignInOutcome
import dev.ukitomato.closta.platforms.intellij.settings.ProviderLaunch
import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import dev.ukitomato.closta.providers.claude.auth.SessionCredentials
import dev.ukitomato.closta.providers.claude.launch.BedrockConfig
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** The launch asks the CLI to put its permission prompts on stdin, where the host answers them from the webview. */
class SessionLaunchTest {
    @Test
    fun `the claude command line routes permission prompts to the host over stdio`() =
        runBlocking {
            val planner =
                NativeSessionLaunchPlanner({ ProviderLaunch.Env(emptyMap()) }) { _, _ -> SignInOutcome.Cancelled }
            val argv = planner.plan("s1", "/work").spec.toArgv()
            val flag = argv.indexOf("--permission-prompt-tool")
            assertEquals("stdio", argv.getOrNull(flag + 1)) { argv.joinToString(" ") }
        }

    @Test
    fun `so does the command line of an Amazon Bedrock provider after its sign-in`() =
        runBlocking {
            val bedrock =
                ProviderLaunch.NeedsBedrockSignIn(
                    ProviderId.generate(),
                    BedrockConfig(region = "eu-west-1"),
                    providerName = "Bedrock dev",
                    mfaDevice = "GAHT12345678",
                    sessionDurationSeconds = 43_200,
                )
            val credentials = SessionCredentials("test-key-id", "test-secret", "test-token", Long.MAX_VALUE)
            val planner = NativeSessionLaunchPlanner({ bedrock }) { _, _ -> SignInOutcome.SignedIn(credentials) }
            val argv = planner.plan("s1", "/work").spec.toArgv()
            val flag = argv.indexOf("--permission-prompt-tool")
            assertEquals("stdio", argv.getOrNull(flag + 1)) { argv.joinToString(" ") }
        }
}
