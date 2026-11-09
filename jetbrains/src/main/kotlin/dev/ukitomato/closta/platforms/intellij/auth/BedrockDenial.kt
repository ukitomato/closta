package dev.ukitomato.closta.platforms.intellij.auth

import dev.ukitomato.closta.platforms.intellij.ClostaBundle

/** The two kinds of Bedrock 403 the plugin tells apart, and the rest. */
enum class BedrockDenialKind {
    /** The temporary credentials the session was launched with have expired. */
    CREDENTIALS_EXPIRED,

    /** A policy explicitly denies the request — with a VPC or source condition, that is being off the VPN. */
    DENIED_BY_POLICY,

    /** Any other 403. */
    OTHER_FORBIDDEN,
}

/** What to tell the user about a Bedrock 403: what went wrong and what to do next. */
data class BedrockDenial(
    val kind: BedrockDenialKind,
    val cause: String,
    val remedy: String,
)

/**
 * Tells the two kinds of Bedrock 403 apart. claude itself reports both as the same 403 (Claude Code's errors
 * page: it "can't tell those two causes apart"), so the plugin adds what it knows: when the credentials it launched the
 * session with expire. Past that time a 403 is the expiry whatever its text says; before it, the text decides — AWS's
 * expired-token wording, or the "explicit deny" phrase IAM puts into an access denial by a policy.
 *
 * The sign-in does not call this: the 403 arrives with the first request to the model, in the conversation. The
 * wording lives here so that the conversation shows it rather than writing its own.
 */
object BedrockDenials {
    private const val FORBIDDEN = 403
    private val EXPIRED =
        listOf(
            "expiredtoken",
            "security token included in the request is expired",
            "security token included in the request has expired",
        )
    private const val EXPLICIT_DENY = "explicit deny"

    /**
     * The denial behind a failed request with HTTP [status] and [text], for a session launched with credentials that
     * expire at [credentialsExpireAt] (null when unknown); null when it is not a 403.
     */
    fun classify(
        status: String?,
        text: String,
        credentialsExpireAt: Long?,
        nowMs: Long,
    ): BedrockDenial? {
        if (status?.trim()?.toIntOrNull() != FORBIDDEN) return null
        val lower = text.lowercase()
        val kind =
            when {
                credentialsExpireAt != null && nowMs >= credentialsExpireAt -> BedrockDenialKind.CREDENTIALS_EXPIRED
                EXPIRED.any { it in lower } -> BedrockDenialKind.CREDENTIALS_EXPIRED
                EXPLICIT_DENY in lower -> BedrockDenialKind.DENIED_BY_POLICY
                else -> BedrockDenialKind.OTHER_FORBIDDEN
            }
        return describe(kind)
    }

    /** The words for [kind]. */
    fun describe(kind: BedrockDenialKind): BedrockDenial =
        when (kind) {
            BedrockDenialKind.CREDENTIALS_EXPIRED ->
                BedrockDenial(
                    kind,
                    ClostaBundle.message("auth.denial.expired.cause"),
                    ClostaBundle.message("auth.denial.expired.remedy"),
                )
            BedrockDenialKind.DENIED_BY_POLICY ->
                BedrockDenial(
                    kind,
                    ClostaBundle.message("auth.denial.policy.cause"),
                    ClostaBundle.message("auth.denial.policy.remedy"),
                )
            BedrockDenialKind.OTHER_FORBIDDEN ->
                BedrockDenial(
                    kind,
                    ClostaBundle.message("auth.denial.other.cause"),
                    ClostaBundle.message("auth.denial.other.remedy"),
                )
        }
}
