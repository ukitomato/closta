package dev.ukitomato.closta.providers.claude.launch

import dev.ukitomato.closta.providers.claude.auth.SessionCredentials
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BedrockLaunchTest {
    private fun creds() =
        SessionCredentials(
            accessKeyId = "AKIA_TMP",
            secretAccessKey = "TMP_SECRET",
            sessionToken = "TMP_TOKEN",
            expirationEpochMillis = 1L,
        )

    @Test
    fun `env with a full config emits every key with its value plus the AWS credentials`() {
        val env =
            BedrockLaunch.env(
                BedrockConfig(
                    region = "ap-northeast-1",
                    model = "sonnet",
                    sonnetModelId = "arn:sonnet",
                    haikuModelId = "arn:haiku",
                ),
                creds(),
            )
        assertEquals("1", env["CLAUDE_CODE_USE_BEDROCK"])
        assertEquals("ap-northeast-1", env["AWS_REGION"])
        assertEquals("sonnet", env["ANTHROPIC_MODEL"])
        assertEquals("arn:sonnet", env["ANTHROPIC_DEFAULT_SONNET_MODEL"])
        assertEquals("arn:haiku", env["ANTHROPIC_DEFAULT_HAIKU_MODEL"])
        assertEquals("AKIA_TMP", env["AWS_ACCESS_KEY_ID"])
        assertEquals("TMP_SECRET", env["AWS_SECRET_ACCESS_KEY"])
        assertEquals("TMP_TOKEN", env["AWS_SESSION_TOKEN"])
    }

    @Test
    fun `env omits the optional model keys when they are absent but always emits the mandatory keys`() {
        val env = BedrockLaunch.env(BedrockConfig(region = "us-east-1"), creds())
        // Mandatory keys are always present.
        assertTrue(env.containsKey("CLAUDE_CODE_USE_BEDROCK"))
        assertEquals("us-east-1", env["AWS_REGION"])
        assertTrue(env.containsKey("AWS_ACCESS_KEY_ID"))
        assertTrue(env.containsKey("AWS_SECRET_ACCESS_KEY"))
        assertTrue(env.containsKey("AWS_SESSION_TOKEN"))
        // Optional model keys are omitted (not present with an empty value).
        assertFalse(env.containsKey("ANTHROPIC_MODEL"))
        assertFalse(env.containsKey("ANTHROPIC_DEFAULT_SONNET_MODEL"))
        assertFalse(env.containsKey("ANTHROPIC_DEFAULT_HAIKU_MODEL"))
    }

    @Test
    fun `env treats a blank model alias as absent rather than emitting an empty value`() {
        val env =
            BedrockLaunch.env(
                BedrockConfig(region = "us-east-1", model = "", sonnetModelId = "   ", haikuModelId = ""),
                creds(),
            )
        // A blank/whitespace alias must not produce an empty ANTHROPIC_* value (would confuse the CLI).
        assertFalse(env.containsKey("ANTHROPIC_MODEL"))
        assertFalse(env.containsKey("ANTHROPIC_DEFAULT_SONNET_MODEL"))
        assertFalse(env.containsKey("ANTHROPIC_DEFAULT_HAIKU_MODEL"))
        // Mandatory keys still present.
        assertEquals("1", env["CLAUDE_CODE_USE_BEDROCK"])
        assertEquals("us-east-1", env["AWS_REGION"])
    }

    @Test
    fun `the inherited keys a launch drops are nine and none of them is one it builds`() {
        // The env this object builds must survive the drop, or the launch would lose its own switch.
        assertEquals(DROPPED_COUNT, BedrockLaunch.INHERITED_KEYS_TO_DROP.size)
        val built =
            BedrockLaunch.env(
                BedrockConfig(region = "us-east-1", model = "m", sonnetModelId = "s", haikuModelId = "h"),
                creds(),
            )
        assertTrue(built.keys.intersect(BedrockLaunch.INHERITED_KEYS_TO_DROP).isEmpty())
    }

    private companion object {
        const val DROPPED_COUNT = 9
    }
}
