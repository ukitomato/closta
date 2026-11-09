package dev.ukitomato.closta.providers.claude.launch

/**
 * Builds the environment overlay for firstParty (direct Anthropic) `claude` — the contrast to [BedrockLaunch]. No
 * AWS/Bedrock switches: only the optional `ANTHROPIC_MODEL`. The direct-API auth key, if any, is merged into the
 * launch env by the caller, **not here** — keeping the credential merge in one place avoids double-injection or
 * omission.
 */
object AnthropicLaunch {
    fun env(model: String? = null): Map<String, String> =
        buildMap {
            model?.let { put("ANTHROPIC_MODEL", it) }
        }
}
