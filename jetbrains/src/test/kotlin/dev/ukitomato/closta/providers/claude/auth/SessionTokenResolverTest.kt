package dev.ukitomato.closta.providers.claude.auth

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Drives the production [AwsStsSessionTokenResolver] with a **fake** [StsCall] so the resolver's request
 * pass-through, response mapping, and secret-free failure handling are measured without reaching AWS
 * (real STS is deliberately not exercised). The AWS boundary itself ([AwsStsCall]) is not exercised here.
 */
class SessionTokenResolverTest {
    private fun request() =
        SessionTokenRequest(
            tokenCode = "123456",
            deviceArn = "arn:aws:iam::111122223333:mfa/dev",
            region = "ap-northeast-1",
            durationSeconds = 3600,
            longTermAccessKeyId = "AKIA_LONG_TERM_ID",
            longTermSecretAccessKey = "LONG_TERM_SECRET",
        )

    @Test
    fun `resolve passes the request to the STS seam and maps the raw response`() {
        var seen: SessionTokenRequest? = null
        val raw =
            StsTemporaryCredentials(
                accessKeyId = "AKIA_TMP",
                secretAccessKey = "TMP_SECRET",
                sessionToken = "TMP_TOKEN",
                expirationEpochMillis = 999L,
            )
        val resolver =
            AwsStsSessionTokenResolver { req ->
                seen = req
                raw
            }

        val req = request()
        val result = resolver.resolve(req)

        // The STS call is an injectable seam (the fake above is the injection).
        // The request reaches the seam unchanged, and the raw response maps 1:1 to SessionCredentials.
        assertSame(req, seen)
        assertTrue(result.isSuccess)
        val creds = result.getOrThrow()
        assertEquals("AKIA_TMP", creds.accessKeyId)
        assertEquals("TMP_SECRET", creds.secretAccessKey)
        assertEquals("TMP_TOKEN", creds.sessionToken)
        assertEquals(999L, creds.expirationEpochMillis)
    }

    @Test
    fun `resolve returns a secret-free failure when the STS seam throws`() {
        // The fake throws with the long-term secret and MFA code embedded in its message, simulating a
        // badly-behaved cause. resolve must not throw, must return failure, and the failure must
        // not carry any secret. Reverting the recoverCatching wrap would surface this message.
        val resolver =
            AwsStsSessionTokenResolver { _ ->
                // A specific exception stands in for an SDK failure (detekt forbids throwing the generic
                // RuntimeException); its message embeds secrets to prove the wrapper strips them.
                throw IllegalStateException("STS rejected LONG_TERM_SECRET / 123456")
            }

        val result = resolver.resolve(request())

        assertTrue(result.isFailure)
        val failure = result.exceptionOrNull()!!
        assertTrue(failure is SessionTokenException) { "should be the secret-free wrapper: $failure" }
        val message = failure.message.orEmpty()
        assertFalse(message.contains("LONG_TERM_SECRET")) { "long-term secret leaked: $message" }
        assertFalse(message.contains("123456")) { "MFA code leaked: $message" }
        // The wrapper does not chain the cause, so nothing downstream can print the leaky message either.
        assertNull(failure.cause)
    }

    @Test
    fun `StsTemporaryCredentials toString redacts the secret fields`() {
        // The raw seam DTO also carries the three secrets; its toString must not print them (so a
        // later data-class refactor cannot silently leak). Reverting the override to the default fails this.
        val rendered =
            StsTemporaryCredentials(
                accessKeyId = "AKIA_RAW_ID",
                secretAccessKey = "RAW_SECRET",
                sessionToken = "RAW_TOKEN",
                expirationEpochMillis = 7L,
            ).toString()
        assertFalse(rendered.contains("AKIA_RAW_ID")) { "access key id leaked: $rendered" }
        assertFalse(rendered.contains("RAW_SECRET")) { "secret access key leaked: $rendered" }
        assertFalse(rendered.contains("RAW_TOKEN")) { "session token leaked: $rendered" }
        assertTrue(rendered.contains("redacted")) { "should say it redacted: $rendered" }
    }

    @Test
    fun `request toString does not leak the MFA code or long-term secret`() {
        val rendered = request().toString()
        assertFalse(rendered.contains("123456")) { "MFA code leaked: $rendered" }
        assertFalse(rendered.contains("LONG_TERM_SECRET")) { "long-term secret leaked: $rendered" }
        assertFalse(rendered.contains("AKIA_LONG_TERM_ID")) { "long-term key id leaked: $rendered" }
        assertTrue(rendered.contains("ap-northeast-1")) { "non-secret region should be visible: $rendered" }
    }

    @Test
    fun `resolve keeps the reason, the error code and the cause type of a sorted STS failure`() {
        // AwsStsCall sorts an SDK failure into a StsCallException; the resolver passes its reason on.
        val resolver =
            AwsStsSessionTokenResolver { _ ->
                throw StsCallException(StsFailureReason.MFA_CODE_REJECTED, "AccessDenied", "StsException")
            }

        val failure = resolver.resolve(request()).exceptionOrNull() as SessionTokenException

        assertEquals(StsFailureReason.MFA_CODE_REJECTED, failure.reason)
        assertEquals("AccessDenied", failure.errorCode)
        assertEquals("StsException", failure.causeType)
        assertFalse(failure.message.orEmpty().contains("123456")) { "MFA code leaked: ${failure.message}" }
    }

    @Test
    fun `resolve calls any other failure other`() {
        val resolver = AwsStsSessionTokenResolver { _ -> throw IllegalStateException("not sorted") }

        val failure = resolver.resolve(request()).exceptionOrNull() as SessionTokenException

        assertEquals(StsFailureReason.OTHER, failure.reason)
        assertNull(failure.errorCode)
        assertEquals("IllegalStateException", failure.causeType)
    }
}
