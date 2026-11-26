package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.presenter.view.LimitStatus
import dev.ukitomato.closta.presenter.view.RateLimitRecord
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.text.MessageFormat
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import java.util.ResourceBundle

class LimitTextTest {
    private val saved = Locale.getDefault()
    private val tokyo = ZoneId.of("Asia/Tokyo")

    // 2026-11-14 15:30 in Tokyo.
    private val reset = Instant.parse("2026-11-14T06:30:00Z")

    @BeforeEach
    fun english() = Locale.setDefault(Locale.ENGLISH)

    @AfterEach
    fun restore() = Locale.setDefault(saved)

    @Test
    fun `a reset on the same day in the zone is the clock alone, another day goes before it`() {
        assertAll(
            { assertEquals("15:30", resetClock(reset, Instant.parse("2026-11-14T01:00:00Z"), tokyo)) },
            { assertEquals("11/14 15:30", resetClock(reset, Instant.parse("2026-11-13T14:00:00Z"), tokyo)) },
            {
                // The same moments in UTC: the reset is the 14th there, and now the 15th.
                assertEquals("11/14 06:30", resetClock(reset, Instant.parse("2026-11-15T00:30:00Z"), ZoneId.of("UTC")))
            },
        )
    }

    @Test
    fun `the windows have names, no window is the plan, and an unknown one is its own name`() {
        assertAll(
            { assertEquals("5-hour", windowName("five_hour")) },
            { assertEquals("7-day (Opus)", windowName("seven_day_opus")) },
            { assertEquals("extra usage", windowName("overage")) },
            { assertEquals("7-day (extra usage included)", windowName("seven_day_overage_included")) },
            { assertEquals("plan", windowName(null)) },
            { assertEquals("tangelo", windowName("tangelo")) },
        )
    }

    private fun record(
        status: LimitStatus,
        percent: Int?,
        resetsAt: Instant?,
        overage: Boolean = false,
    ) = RateLimitRecord(1, status, "five_hour", percent, resetsAt?.epochSecond, overage)

    private val now = Instant.parse("2026-11-14T01:00:00Z")

    @Test
    fun `a warning says the share used and when it resets`() {
        assertEquals(
            "5-hour limit 85% used · resets 15:30",
            limitText(record(LimitStatus.WARNING, 85, reset), now, tokyo),
        )
    }

    @Test
    fun `a warning with no share says the limit is near, and no reset says nothing of it`() {
        assertAll(
            {
                assertEquals(
                    "Nearing the 5-hour limit · resets 15:30",
                    limitText(record(LimitStatus.WARNING, null, reset), now, tokyo),
                )
            },
            {
                assertEquals(
                    "Nearing the 5-hour limit",
                    limitText(record(LimitStatus.WARNING, null, null), now, tokyo),
                )
            },
        )
    }

    @Test
    fun `in Japanese a warning with no share says the limit is near and when it resets`() {
        val japanese = ResourceBundle.getBundle("messages.ClostaBundle", Locale.JAPANESE)
        val words: Words = {
            key,
            params,
            ->
            MessageFormat(japanese.getString(key), Locale.JAPANESE).format(params)
        }

        assertEquals(
            "5 時間の上限に近づいています · 15:30 にリセット",
            limitText(record(LimitStatus.WARNING, null, reset), now, tokyo, words),
        )
    }

    @Test
    fun `a refusal on extra usage says it goes on`() {
        assertEquals(
            "Reached the 5-hour limit · resets 15:30 · Continuing on extra usage",
            limitText(record(LimitStatus.REJECTED, 100, reset, overage = true), now, tokyo),
        )
    }
}
