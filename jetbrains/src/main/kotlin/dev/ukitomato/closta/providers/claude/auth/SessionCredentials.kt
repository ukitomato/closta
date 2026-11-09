package dev.ukitomato.closta.providers.claude.auth

/**
 * Temporary AWS credentials from STS `GetSessionToken` (MFA), injected into the `claude` child process
 * as `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN` when running against Bedrock.
 * Pure data, `com.intellij`-independent.
 *
 * The three key/token fields are **secret**. This is deliberately **not** a `data class`: an
 * auto-generated `toString` would print the secrets into any log line, exception, or stack dump. The
 * override below redacts all three and keeps only the non-secret [expirationEpochMillis] (mirrors
 * `ClaudeLaunchSpec.toString`). Persistence is PasswordSafe's job, never plaintext.
 */
class SessionCredentials(
    val accessKeyId: String,
    val secretAccessKey: String,
    val sessionToken: String,
    val expirationEpochMillis: Long,
) {
    /** True while the token is still usable at [nowMs], keeping a [marginMs] safety buffer. */
    fun isValid(
        nowMs: Long,
        marginMs: Long = DEFAULT_MARGIN_MS,
    ): Boolean = nowMs < expirationEpochMillis - marginMs

    /** The `AWS_*` overlay to merge into the launch env so the CLI's AWS chain picks these up. */
    fun asEnv(): Map<String, String> =
        mapOf(
            "AWS_ACCESS_KEY_ID" to accessKeyId,
            "AWS_SECRET_ACCESS_KEY" to secretAccessKey,
            "AWS_SESSION_TOKEN" to sessionToken,
        )

    // Never let the secrets reach a log/exception. Only the non-secret expiry is shown.
    override fun toString(): String =
        "SessionCredentials(expirationEpochMillis=$expirationEpochMillis, secrets=<redacted>)"

    private companion object {
        const val DEFAULT_MARGIN_MS = 120_000L
    }
}
