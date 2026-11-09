package dev.ukitomato.closta.platforms.intellij.settings

import dev.ukitomato.closta.platforms.intellij.store.ProviderId

/**
 * The kinds of provider the settings offer side by side. In code, Amazon Bedrock is a launch mode of the same claude
 * command, not a second kind of session. [wire] is what is stored: changing it would make saved providers
 * unreadable, so the unit tests pin it.
 */
enum class ProviderKind(
    val wire: String,
    val displayName: String,
) {
    ANTHROPIC("anthropic", "Anthropic"),
    BEDROCK("bedrock", "Amazon Bedrock"),
    ;

    companion object {
        /** The kind stored as [wire], or null when this version does not know it. */
        fun fromWire(wire: String): ProviderKind? = entries.firstOrNull { it.wire == wire }
    }
}

/**
 * The non-secret Amazon Bedrock settings of a provider. The long-term keys and the temporary credentials are secrets
 * and live in PasswordSafe, never here.
 */
data class BedrockFields(
    val region: String = "",
    val mfaDeviceArn: String = "",
    val sessionDurationSeconds: Int = DEFAULT_SESSION_SECONDS,
    val sonnetModelId: String? = null,
    val haikuModelId: String? = null,
) {
    companion object {
        /** Twelve hours: long enough for a working day, well inside what STS allows an IAM user. */
        const val DEFAULT_SESSION_SECONDS = 43_200
    }
}

/**
 * One provider as the user created it. [id] never changes — renaming changes [name] only — because the provider's
 * secrets are keyed by it. Holds no secret, so it may be a data class.
 *
 * A Bedrock provider always has [bedrock] and an Anthropic one never does: a record that disagreed would be
 * saved without its Bedrock settings and skipped on the next read, orphaning its secrets.
 */
data class ProviderRecord(
    val id: ProviderId,
    val name: String,
    val kind: ProviderKind,
    val model: String? = null,
    val bedrock: BedrockFields? = if (kind == ProviderKind.BEDROCK) BedrockFields() else null,
) {
    init {
        require((kind == ProviderKind.BEDROCK) == (bedrock != null)) {
            "a ${kind.wire} provider ${if (bedrock == null) "needs" else "must not have"} Bedrock settings"
        }
    }
}
