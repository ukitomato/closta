package dev.ukitomato.closta.providers.claude.auth

import software.amazon.awssdk.awscore.exception.AwsServiceException
import software.amazon.awssdk.core.exception.SdkClientException
import software.amazon.awssdk.services.sts.model.RegionDisabledException

/** Why STS `GetSessionToken` failed, sorted by what the user has to do about it. */
enum class StsFailureReason {
    /** AWS did not accept the MFA code, or the MFA device it was checked against. */
    MFA_CODE_REJECTED,

    /** AWS did not accept the long-term access key: an unknown key ID or a wrong secret. */
    LONG_TERM_KEY_REJECTED,

    /** STS is not activated in the configured region. */
    REGION_DISABLED,

    /** STS could not be reached, or did not answer in time. */
    UNREACHABLE,

    /** STS refused the signature or the request's time because this computer's clock is off. */
    CLOCK_SKEW,

    /** Anything else; [StsCallException.errorCode] says what AWS answered, when it answered. */
    OTHER,
}

/**
 * An STS failure with the AWS SDK taken out: why ([reason]), the error code AWS answered with ([errorCode], only
 * when it has the shape of one), and the SDK exception's type name ([causeType]). Thrown by [AwsStsCall] so the
 * resolver can pass the reason on without knowing the SDK. The message is built from these three alone — never from
 * AWS's message, which can name the IAM user, and never from the request.
 */
class StsCallException(
    val reason: StsFailureReason,
    val errorCode: String?,
    val causeType: String,
) : RuntimeException("STS GetSessionToken failed: $reason${errorCode?.let { " ($it)" }.orEmpty()} ($causeType)")

/**
 * Sorts an AWS SDK failure into a [StsFailureReason]. The errors STS does not model (`AccessDenied`,
 * `InvalidClientTokenId`, `SignatureDoesNotMatch`) all arrive as a plain `StsException`, so the reason comes from
 * the error code, not the type. `GetSessionToken` cannot be restricted by IAM policies, so an access denial there is
 * the MFA check failing (the STS API reference for GetSessionToken).
 *
 * A clock error is told apart by the SDK's own judgement, [AwsServiceException.isClockSkewException], for the codes
 * that a clock can cause: a clock error code, or a refused signature whose signing time is over four minutes from the
 * response's `Date`. The signing time is this machine's clock less the correction the SDK carries over between
 * requests, so a clock that was set right after a correction is still seen as a clock error, not as a wrong key. Other
 * refusals (an access denial is the MFA code) keep their reason even when the clocks differ (the codes are 2.30.0's
 * `AwsErrorCode` sets).
 */
object StsFailures {
    // An AWS error code is an identifier such as AccessDenied; anything else in that field is not passed on.
    private val ERROR_CODE = Regex("[A-Za-z][A-Za-z0-9.]{0,63}")
    private val CLOCK_CODES =
        setOf(
            "RequestTimeTooSkewed",
            "RequestExpired",
            "RequestInTheFuture",
            "SignatureDoesNotMatch",
            "InvalidSignatureException",
            "AuthFailure",
        )

    fun classify(failure: Throwable): StsCallException {
        val causeType = failure.javaClass.simpleName
        return when (failure) {
            is RegionDisabledException -> StsCallException(StsFailureReason.REGION_DISABLED, code(failure), causeType)
            is AwsServiceException ->
                code(failure).let {
                    val clock = it in CLOCK_CODES && failure.isClockSkewException
                    val reason = if (clock) StsFailureReason.CLOCK_SKEW else reasonOf(it)
                    StsCallException(reason, it, causeType)
                }
            is SdkClientException -> StsCallException(StsFailureReason.UNREACHABLE, null, causeType)
            else -> StsCallException(StsFailureReason.OTHER, null, causeType)
        }
    }

    private fun code(failure: AwsServiceException): String? =
        failure.awsErrorDetails()?.errorCode()?.takeIf { ERROR_CODE.matches(it) }

    private fun reasonOf(code: String?): StsFailureReason =
        when (code) {
            "AccessDenied", "AccessDeniedException" -> StsFailureReason.MFA_CODE_REJECTED
            "InvalidClientTokenId", "SignatureDoesNotMatch" -> StsFailureReason.LONG_TERM_KEY_REJECTED
            "RegionDisabledException" -> StsFailureReason.REGION_DISABLED
            else -> StsFailureReason.OTHER
        }
}
