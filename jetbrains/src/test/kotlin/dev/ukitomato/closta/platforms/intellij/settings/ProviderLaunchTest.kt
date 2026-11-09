package dev.ukitomato.closta.platforms.intellij.settings

import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Test

class ProviderLaunchTest {
    private val id = ProviderId.parse("8a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d")!!

    private fun env(record: ProviderRecord?): Map<String, String> =
        assertInstanceOf(ProviderLaunch.Env::class.java, ProviderLaunch.launchFor(record)).env

    @Test
    fun `the default is the claude command's own sign-in with nothing added`() {
        assertEquals(emptyMap<String, String>(), env(null))
    }

    @Test
    fun `Anthropic passes its model and nothing else`() {
        val withModel = ProviderRecord(id, "Work", ProviderKind.ANTHROPIC, model = "opus")
        assertEquals(mapOf("ANTHROPIC_MODEL" to "opus"), env(withModel))
        assertEquals(emptyMap<String, String>(), env(ProviderRecord(id, "Work", ProviderKind.ANTHROPIC)))
        assertEquals(emptyMap<String, String>(), env(ProviderRecord(id, "Work", ProviderKind.ANTHROPIC, model = " ")))
    }

    @Test
    fun `Amazon Bedrock needs a sign-in with the provider's Bedrock settings`() {
        val record =
            ProviderRecord(
                id,
                "Tokyo",
                ProviderKind.BEDROCK,
                model = "sonnet",
                bedrock =
                    BedrockFields(
                        region = "ap-northeast-1",
                        mfaDeviceArn = "arn:aws:iam::123456789012:mfa/dev",
                        sessionDurationSeconds = 3_600,
                        sonnetModelId = "apac.sonnet",
                        haikuModelId = "apac.haiku",
                    ),
            )
        val launch = assertInstanceOf(ProviderLaunch.NeedsBedrockSignIn::class.java, ProviderLaunch.launchFor(record))
        assertEquals(id, launch.providerId)
        assertEquals("ap-northeast-1", launch.config.region)
        assertEquals("sonnet", launch.config.model)
        assertEquals("apac.sonnet", launch.config.sonnetModelId)
        assertEquals("apac.haiku", launch.config.haikuModelId)
        // What the sign-in asks STS with comes from the same record.
        assertEquals("Tokyo", launch.providerName)
        assertEquals("arn:aws:iam::123456789012:mfa/dev", launch.mfaDevice)
        assertEquals(3_600, launch.sessionDurationSeconds)
    }

    @Test
    fun `a launch prints no value`() {
        val anthropic =
            ProviderLaunch.launchFor(ProviderRecord(id, "Work", ProviderKind.ANTHROPIC, model = "MARKER-model"))
        assertFalse("MARKER-model" in anthropic.toString()) { anthropic.toString() }
        val bedrock =
            ProviderLaunch.launchFor(
                ProviderRecord(
                    id,
                    "MARKER-name",
                    ProviderKind.BEDROCK,
                    bedrock =
                        BedrockFields(region = "us-east-1", mfaDeviceArn = "arn:aws:iam::123456789012:mfa/MARKER"),
                ),
            )
        assertFalse("MARKER" in bedrock.toString()) { bedrock.toString() }
    }
}
