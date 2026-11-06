package dev.ukitomato.closta.providers.claude.auth

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import software.amazon.awssdk.awscore.exception.AwsErrorDetails
import software.amazon.awssdk.core.exception.ApiCallTimeoutException
import software.amazon.awssdk.core.exception.SdkClientException
import software.amazon.awssdk.http.SdkHttpResponse
import software.amazon.awssdk.services.sts.model.RegionDisabledException
import software.amazon.awssdk.services.sts.model.StsException
import java.net.UnknownHostException
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * Sorts the AWS SDK's exceptions the way [AwsStsCall] meets them. The exceptions are built with the SDK's own builders,
 * so no AWS is reached; the messages carry a marker standing in for what AWS writes there (the IAM user's ARN).
 */
class StsFailuresTest {
    /**
     * An STS error as the SDK delivers it. [serverTime] is the response's `Date`; [correction] is the clock correction
     * the request was signed with, which the SDK puts in the exception (zero unless an earlier answer corrected it).
     */
    private fun stsError(
        code: String,
        serverTime: Instant? = null,
        correction: Duration = Duration.ZERO,
    ): StsException =
        StsException
            .builder()
            .statusCode(FORBIDDEN)
            .message("$code: $AWS_MESSAGE")
            .clockSkew(correction)
            .awsErrorDetails(
                AwsErrorDetails
                    .builder()
                    .errorCode(code)
                    .errorMessage(AWS_MESSAGE)
                    .sdkHttpResponse(response(serverTime))
                    .build(),
            ).build() as StsException

    private fun response(serverTime: Instant?): SdkHttpResponse =
        SdkHttpResponse
            .builder()
            .statusCode(FORBIDDEN)
            .apply {
                serverTime?.let { putHeader("Date", RFC_1123.format(it.atOffset(ZoneOffset.UTC))) }
            }.build()

    @Test
    fun `an access denial is the MFA code`() {
        val failure = StsFailures.classify(stsError("AccessDenied"))
        assertEquals(StsFailureReason.MFA_CODE_REJECTED, failure.reason)
        assertEquals("AccessDenied", failure.errorCode)
        assertEquals("StsException", failure.causeType)
    }

    @Test
    fun `an unknown key ID and a wrong secret are the long-term key`() {
        assertEquals(
            StsFailureReason.LONG_TERM_KEY_REJECTED,
            StsFailures.classify(stsError("InvalidClientTokenId")).reason,
        )
        assertEquals(
            StsFailureReason.LONG_TERM_KEY_REJECTED,
            StsFailures.classify(stsError("SignatureDoesNotMatch")).reason,
        )
    }

    @Test
    fun `a clock error code is the clock`() {
        listOf("RequestExpired", "RequestTimeTooSkewed", "RequestInTheFuture").forEach {
            val failure = StsFailures.classify(stsError(it))
            assertEquals(StsFailureReason.CLOCK_SKEW, failure.reason) { it }
            assertEquals(it, failure.errorCode)
        }
    }

    @Test
    fun `a signature error is the clock only when the signing time is over four minutes from AWS's clock`() {
        val now = Instant.now()
        listOf(FIVE_MINUTES, FIVE_MINUTES.negated()).forEach {
            assertEquals(
                StsFailureReason.CLOCK_SKEW,
                StsFailures.classify(stsError("SignatureDoesNotMatch", now.plus(it))).reason,
            ) { "AWS's clock $it away" }
        }
        val invalidSignature = stsError("InvalidSignatureException", now.plus(FIVE_MINUTES))
        assertEquals(StsFailureReason.CLOCK_SKEW, StsFailures.classify(invalidSignature).reason)
        listOf<Instant?>(now.plus(THREE_MINUTES), now, null).forEach {
            assertEquals(
                StsFailureReason.LONG_TERM_KEY_REJECTED,
                StsFailures.classify(stsError("SignatureDoesNotMatch", it)).reason,
            ) { "server time $it" }
        }
    }

    @Test
    fun `a refusal a clock cannot cause keeps its reason even when the clocks differ by ten minutes`() {
        // The SDK's own judgement also counts any 401 or 403 with a Date that far off; that branch is not taken.
        val far = Instant.now().plus(TEN_MINUTES)
        assertEquals(StsFailureReason.MFA_CODE_REJECTED, StsFailures.classify(stsError("AccessDenied", far)).reason)
        assertEquals(
            StsFailureReason.LONG_TERM_KEY_REJECTED,
            StsFailures.classify(stsError("InvalidClientTokenId", far)).reason,
        )
        val disabled =
            RegionDisabledException
                .builder()
                .statusCode(FORBIDDEN)
                .clockSkew(Duration.ZERO)
                .awsErrorDetails(
                    AwsErrorDetails
                        .builder()
                        .errorCode("RegionDisabledException")
                        .sdkHttpResponse(response(far))
                        .build(),
                ).build()
        assertEquals(StsFailureReason.REGION_DISABLED, StsFailures.classify(disabled).reason)
    }

    @Test
    fun `a correction left over after the clock was set right is still the clock`() {
        val now = Instant.now()
        // Signed an hour back by a correction the SDK carried over, while this machine's clock now agrees with AWS.
        val leftOver = stsError("SignatureDoesNotMatch", now, correction = Duration.ofHours(1))
        assertEquals(StsFailureReason.CLOCK_SKEW, StsFailures.classify(leftOver).reason)
        // The correction that matches AWS's clock: the signature itself was wrong.
        val corrected =
            stsError("SignatureDoesNotMatch", now.minus(Duration.ofHours(1)), correction = Duration.ofHours(1))
        assertEquals(StsFailureReason.LONG_TERM_KEY_REJECTED, StsFailures.classify(corrected).reason)
    }

    @Test
    fun `a disabled region is the region`() {
        val disabled =
            RegionDisabledException
                .builder()
                .statusCode(FORBIDDEN)
                .awsErrorDetails(AwsErrorDetails.builder().errorCode("RegionDisabledException").build())
                .build()
        val failure = StsFailures.classify(disabled)
        assertEquals(StsFailureReason.REGION_DISABLED, failure.reason)
        assertEquals("RegionDisabledException", failure.causeType)
    }

    @Test
    fun `no answer and a timeout are unreachable`() {
        val noHost = SdkClientException.create("Unable to execute HTTP request", UnknownHostException("sts"))
        assertEquals(StsFailureReason.UNREACHABLE, StsFailures.classify(noHost).reason)
        assertNull(StsFailures.classify(noHost).errorCode)
        val timeout = ApiCallTimeoutException.builder().message("Client execution did not complete").build()
        assertEquals(StsFailureReason.UNREACHABLE, StsFailures.classify(timeout).reason)
        assertEquals("ApiCallTimeoutException", StsFailures.classify(timeout).causeType)
    }

    @Test
    fun `anything else is other, with the code when AWS answered`() {
        val throttled = StsFailures.classify(stsError("Throttling"))
        assertEquals(StsFailureReason.OTHER, throttled.reason)
        assertEquals("Throttling", throttled.errorCode)
        val unexpected = StsFailures.classify(IllegalStateException(AWS_MESSAGE))
        assertEquals(StsFailureReason.OTHER, unexpected.reason)
        assertNull(unexpected.errorCode)
    }

    @Test
    fun `an error code without the shape of one is dropped`() {
        assertNull(StsFailures.classify(stsError("<b>$MARKER</b>")).errorCode)
        assertNull(StsFailures.classify(stsError("A".repeat(TOO_LONG))).errorCode)
    }

    @Test
    fun `AWS's message never reaches the failure`() {
        listOf(stsError("AccessDenied"), stsError("Throttling"), IllegalStateException(AWS_MESSAGE)).forEach {
            val failure = StsFailures.classify(it)
            assertFalse(failure.message.orEmpty().contains(MARKER)) { "AWS's message leaked: ${failure.message}" }
            assertFalse(failure.toString().contains(MARKER)) { "AWS's message leaked: $failure" }
            assertNull(failure.cause)
        }
    }

    private companion object {
        const val FORBIDDEN = 403
        val FIVE_MINUTES: Duration = Duration.ofMinutes(5)
        val THREE_MINUTES: Duration = Duration.ofMinutes(3)
        val TEN_MINUTES: Duration = Duration.ofMinutes(10)
        val RFC_1123: DateTimeFormatter = DateTimeFormatter.RFC_1123_DATE_TIME
        const val TOO_LONG = 65
        const val MARKER = "sts-failure-marker-arn:aws:iam::111122223333:user/someone"
        const val AWS_MESSAGE = "MultiFactorAuthentication failed for $MARKER"
    }
}
