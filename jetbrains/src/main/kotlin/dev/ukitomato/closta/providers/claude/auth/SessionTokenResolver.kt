package dev.ukitomato.closta.providers.claude.auth

/**
 * Inputs to STS `GetSessionToken`. The long-term keys and the MFA [tokenCode] are **secret**;
 * they are used once to obtain the session token and are never logged. [toString] is redacted so a stray
 * log/exception cannot echo them. [deviceArn]/[region]/[durationSeconds] are non-secret.
 */
class SessionTokenRequest(
    val tokenCode: String,
    val deviceArn: String,
    val region: String,
    val durationSeconds: Int,
    val longTermAccessKeyId: String,
    val longTermSecretAccessKey: String,
) {
    override fun toString(): String =
        "SessionTokenRequest(deviceArn=$deviceArn, region=$region, " +
            "durationSeconds=$durationSeconds, secrets=<redacted>)"
}

/**
 * Raw STS `GetSessionToken` output, SDK-neutral, before mapping to [SessionCredentials]. Keeping the raw
 * shape here lets [AwsStsSessionTokenResolver] map it in tested code while the SDK call stays behind the
 * [StsCall] seam.
 */
class StsTemporaryCredentials(
    val accessKeyId: String,
    val secretAccessKey: String,
    val sessionToken: String,
    val expirationEpochMillis: Long,
) {
    // The three key/token fields are secret. Redact like SessionCredentials so that turning this
    // into a `data class` later cannot silently start printing them (defense-in-depth on the seam DTO).
    override fun toString(): String =
        "StsTemporaryCredentials(expirationEpochMillis=$expirationEpochMillis, secrets=<redacted>)"
}

/**
 * The low-level STS `GetSessionToken` invocation, isolated as a seam so the resolver's request
 * pass-through, response mapping, and error handling can be measured with a fake — no AWS is reachable from
 * the unit tests. Production is [AwsStsCall] (the AWS SDK); it **may throw**.
 */
fun interface StsCall {
    fun getSessionToken(request: SessionTokenRequest): StsTemporaryCredentials
}

/**
 * Resolves temporary Bedrock credentials from an MFA code. Callers depend on this seam; production
 * is [AwsStsSessionTokenResolver] and tests inject a fake. Failures come back as [Result.failure] carrying
 * no secret — never thrown.
 */
fun interface SessionTokenResolver {
    fun resolve(request: SessionTokenRequest): Result<SessionCredentials>
}

/**
 * An STS resolution failed. Carries only the **type name** of the underlying cause — never its message and
 * never the request — so no long-term key, MFA code, or token can leak through the failure. The
 * cause is intentionally not chained for the same reason. [reason] and [errorCode] say what the user has to
 * do about it, when [AwsStsCall] could tell; a failure from elsewhere is [StsFailureReason.OTHER].
 */
class SessionTokenException(
    val causeType: String,
    val reason: StsFailureReason = StsFailureReason.OTHER,
    val errorCode: String? = null,
) : RuntimeException("STS session token resolution failed: $causeType")

/**
 * Production [SessionTokenResolver]: runs the injected [StsCall] and maps its raw output to
 * [SessionCredentials], wrapping any failure as a secret-free [SessionTokenException]. The default
 * [stsCall] is the AWS SDK ([AwsStsCall]); tests pass a fake.
 */
class AwsStsSessionTokenResolver(
    private val stsCall: StsCall = AwsStsCall,
) : SessionTokenResolver {
    override fun resolve(request: SessionTokenRequest): Result<SessionCredentials> =
        runCatching {
            val raw = stsCall.getSessionToken(request)
            SessionCredentials(
                accessKeyId = raw.accessKeyId,
                secretAccessKey = raw.secretAccessKey,
                sessionToken = raw.sessionToken,
                expirationEpochMillis = raw.expirationEpochMillis,
            )
        }.recoverCatching { failure ->
            throw if (failure is StsCallException) {
                SessionTokenException(failure.causeType, failure.reason, failure.errorCode)
            } else {
                SessionTokenException(failure::class.simpleName ?: "Throwable")
            }
        }
}
