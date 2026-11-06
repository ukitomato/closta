package dev.ukitomato.closta.providers.claude.launch

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AnthropicLaunchTest {
    @Test
    fun `env with a model emits only ANTHROPIC_MODEL and no AWS or Bedrock keys`() {
        val env = AnthropicLaunch.env(model = "opus")
        assertEquals(mapOf("ANTHROPIC_MODEL" to "opus"), env)
        // The direct-API path must not carry any Bedrock/AWS switch (those are merged only for Bedrock).
        assertFalse(env.containsKey("CLAUDE_CODE_USE_BEDROCK"))
        assertFalse(env.keys.any { it.startsWith("AWS_") }) { "no AWS_* keys on the direct-API path: ${env.keys}" }
    }

    @Test
    fun `env without a model is empty`() {
        assertTrue(AnthropicLaunch.env().isEmpty())
    }
}
