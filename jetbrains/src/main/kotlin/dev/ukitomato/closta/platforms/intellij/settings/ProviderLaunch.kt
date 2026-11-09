package dev.ukitomato.closta.platforms.intellij.settings

import dev.ukitomato.closta.platforms.intellij.store.ProviderId
import dev.ukitomato.closta.providers.claude.launch.AnthropicLaunch
import dev.ukitomato.closta.providers.claude.launch.BedrockConfig

/**
 * What the active provider means for the next claude process. Amazon Bedrock is a launch mode of the same command,
 * so both kinds end up as an environment for `ClaudeLaunchSpec.env`; Bedrock just needs temporary
 * credentials first, which the MFA sign-in supplies through `BedrockLaunch`.
 */
sealed interface ProviderLaunch {
    /** Launch with this environment. Printed as a count only: a provider may add credentials to it later. */
    class Env(
        val env: Map<String, String>,
    ) : ProviderLaunch {
        override fun toString(): String = "Env(<${env.size} redacted>)"
    }

    /**
     * Bedrock needs a sign-in (temporary credentials) before a process can be launched with [config]. It carries what
     * the sign-in asks STS with, read with [config] from the same record, so an Apply in between cannot mix two.
     */
    class NeedsBedrockSignIn(
        val providerId: ProviderId,
        val config: BedrockConfig,
        val providerName: String,
        val mfaDevice: String,
        val sessionDurationSeconds: Int,
    ) : ProviderLaunch {
        override fun toString(): String = "NeedsBedrockSignIn(providerId=$providerId, region=${config.region})"
    }

    companion object {
        /** The launch for [record]; null is the default Anthropic, the claude command's own sign-in. */
        fun launchFor(record: ProviderRecord?): ProviderLaunch {
            val bedrock = record?.bedrock
            return if (record != null && record.kind == ProviderKind.BEDROCK && bedrock != null) {
                NeedsBedrockSignIn(
                    record.id,
                    BedrockConfig(
                        region = bedrock.region,
                        model = record.model,
                        sonnetModelId = bedrock.sonnetModelId,
                        haikuModelId = bedrock.haikuModelId,
                    ),
                    providerName = record.name,
                    mfaDevice = bedrock.mfaDeviceArn,
                    sessionDurationSeconds = bedrock.sessionDurationSeconds,
                )
            } else {
                Env(AnthropicLaunch.env(record?.model?.takeIf { it.isNotBlank() }))
            }
        }
    }
}
