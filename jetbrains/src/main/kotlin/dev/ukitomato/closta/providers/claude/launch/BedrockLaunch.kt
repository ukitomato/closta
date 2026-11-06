package dev.ukitomato.closta.providers.claude.launch

import dev.ukitomato.closta.providers.claude.auth.SessionCredentials

/**
 * Non-secret Bedrock launch settings. [region] is required (STS and the launched `claude` both use it);
 * the model fields are optional aliases / inference-profile IDs whose concrete values come from settings
 * (not yet confirmed). None of these are secret.
 */
class BedrockConfig(
    val region: String,
    val model: String? = null,
    val sonnetModelId: String? = null,
    val haikuModelId: String? = null,
)

/**
 * Builds the environment overlay that runs `claude` against Amazon Bedrock. It merges the fixed
 * Bedrock switch, the region, the optional model aliases, and the temporary AWS credentials into a `Map`
 * the caller hands to `ClaudeLaunchSpec.env`, which keeps it off argv and redacts it in
 * `toString`. Bedrock is a launch **mode** of `claude`, not a separate CLI (no sibling CLI is duplicated);
 * [AnthropicLaunch] is the contrast (no AWS).
 *
 * The env **key names** are provisional, taken from an earlier prototype used against real Bedrock; they are
 * not yet confirmed against the current `claude` CLI (confirm before a live run). Always emits
 * `CLAUDE_CODE_USE_BEDROCK`/`AWS_REGION`/`AWS_*`; the `ANTHROPIC_*` keys appear only when their config value is
 * present.
 */
object BedrockLaunch {
    /**
     * The keys a Bedrock launch does not take over from the IDE's environment. Each one would make claude
     * use other credentials than the injected `AWS_*` or another provider than Bedrock: `AWS_PROFILE` makes the AWS
     * SDK skip the environment's keys, the Bedrock API key and the skip-auth switch replace SigV4 signing, the other
     * providers' switches route requests elsewhere, and the Anthropic credentials block Bedrock under managed
     * settings. Endpoint overrides (`ANTHROPIC_BEDROCK_BASE_URL`), proxies and model keys stay: users set them on
     * purpose.
     */
    val INHERITED_KEYS_TO_DROP: Set<String> =
        setOf(
            "AWS_PROFILE",
            "AWS_BEARER_TOKEN_BEDROCK",
            "CLAUDE_CODE_SKIP_BEDROCK_AUTH",
            "CLAUDE_CODE_USE_VERTEX",
            "CLAUDE_CODE_USE_FOUNDRY",
            "CLAUDE_CODE_USE_MANTLE",
            "ANTHROPIC_API_KEY",
            "ANTHROPIC_AUTH_TOKEN",
            "CLAUDE_CODE_OAUTH_TOKEN",
        )

    fun env(
        config: BedrockConfig,
        credentials: SessionCredentials,
    ): Map<String, String> =
        buildMap {
            put("CLAUDE_CODE_USE_BEDROCK", "1")
            put("AWS_REGION", config.region)
            // takeIf { isNotBlank() }: a blank ("" or whitespace) alias is treated as absent, so an empty
            // setting does not emit an empty ANTHROPIC_MODEL.
            config.model?.takeIf { it.isNotBlank() }?.let { put("ANTHROPIC_MODEL", it) }
            config.sonnetModelId?.takeIf { it.isNotBlank() }?.let { put("ANTHROPIC_DEFAULT_SONNET_MODEL", it) }
            config.haikuModelId?.takeIf { it.isNotBlank() }?.let { put("ANTHROPIC_DEFAULT_HAIKU_MODEL", it) }
            putAll(credentials.asEnv())
        }
}
