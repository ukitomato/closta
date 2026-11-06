package dev.ukitomato.closta.providers.claude.auth

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SessionCredentialsTest {
    private fun creds(expirationEpochMillis: Long = 10_000_000L) =
        SessionCredentials(
            accessKeyId = "AKIA_SECRET_ACCESS_KEY_ID",
            secretAccessKey = "SECRET_ACCESS_KEY_VALUE",
            sessionToken = "SESSION_TOKEN_VALUE",
            expirationEpochMillis = expirationEpochMillis,
        )

    @Test
    fun `toString redacts all three secret fields and keeps only the expiry`() {
        val rendered = creds(expirationEpochMillis = 42L).toString()
        // None of the secret values may appear (a data class toString would print them —
        // reverting the toString override to the default fails this, so the redaction is load-bearing).
        assertFalse(rendered.contains("AKIA_SECRET_ACCESS_KEY_ID")) { "access key id leaked: $rendered" }
        assertFalse(rendered.contains("SECRET_ACCESS_KEY_VALUE")) { "secret access key leaked: $rendered" }
        assertFalse(rendered.contains("SESSION_TOKEN_VALUE")) { "session token leaked: $rendered" }
        assertTrue(rendered.contains("42")) { "expiry should be visible for debugging: $rendered" }
        assertTrue(rendered.contains("redacted")) { "should say it redacted: $rendered" }
    }

    @Test
    fun `asEnv maps the three AWS credential variables`() {
        val env = creds().asEnv()
        assertEquals(
            setOf("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"),
            env.keys,
        )
        assertEquals("AKIA_SECRET_ACCESS_KEY_ID", env["AWS_ACCESS_KEY_ID"])
        assertEquals("SECRET_ACCESS_KEY_VALUE", env["AWS_SECRET_ACCESS_KEY"])
        assertEquals("SESSION_TOKEN_VALUE", env["AWS_SESSION_TOKEN"])
    }

    @Test
    fun `isValid is true before the expiry minus margin and false at or after it`() {
        val c = creds(expirationEpochMillis = 1_000_000L)
        val margin = 120_000L
        assertTrue(c.isValid(nowMs = 0L, marginMs = margin)) { "well before expiry" }
        assertTrue(c.isValid(nowMs = 1_000_000L - margin - 1, marginMs = margin)) { "just inside the margin" }
        assertFalse(c.isValid(nowMs = 1_000_000L - margin, marginMs = margin)) { "exactly at expiry minus margin" }
        assertFalse(c.isValid(nowMs = 1_000_000L, marginMs = margin)) { "at expiry" }
        assertFalse(c.isValid(nowMs = 2_000_000L, marginMs = margin)) { "past expiry" }
    }
}
