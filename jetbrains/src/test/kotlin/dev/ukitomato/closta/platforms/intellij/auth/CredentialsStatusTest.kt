package dev.ukitomato.closta.platforms.intellij.auth

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.ZoneId
import java.time.ZonedDateTime

class CredentialsStatusTest {
    private val zone = ZoneId.of("Asia/Tokyo")
    private val now = ZonedDateTime.of(2026, 10, 1, 23, 50, 0, 0, zone).toInstant().toEpochMilli()

    private fun describe(minutesLeft: Long) =
        CredentialsStatus.describe(StoredSession.Expires(now + minutesLeft * MINUTE), now, zone)

    @Test
    fun `fifteen minutes or more is valid, with the date`() {
        // 16 minutes from 23:50 is past midnight: the date shows which day.
        assertEquals("Valid until 2026-10-02 00:06.", describe(16))
        assertFalse(describe(15).startsWith("Valid"))
    }

    @Test
    fun `less than fifteen minutes is asked for again at the next start`() {
        assertEquals("Expires at 2026-10-02 00:05 (a new code at the next start).", describe(15))
        assertTrue(describe(14).contains("next start"))
    }

    @Test
    fun `past the expiry is expired`() {
        assertEquals("Expired at 2026-10-01 23:49 (a new code at the next start).", describe(-1))
    }

    @Test
    fun `none and unknown have their own words`() {
        assertTrue(CredentialsStatus.describe(StoredSession.None, now, zone).startsWith("None ("))
        assertTrue(CredentialsStatus.describe(StoredSession.Unknown, now, zone).startsWith("Unknown"))
    }

    @Test
    fun `reuse needs fifteen minutes left`() {
        assertTrue(SessionReuse.reusable(now + SessionReuse.MARGIN_MS + 1, now))
        assertFalse(SessionReuse.reusable(now + SessionReuse.MARGIN_MS, now))
    }

    private companion object {
        const val MINUTE = 60_000L
    }
}
