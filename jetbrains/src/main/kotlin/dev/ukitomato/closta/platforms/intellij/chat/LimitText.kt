package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.LimitStatus
import dev.ukitomato.closta.presenter.view.RateLimitRecord
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * The words of the limit banner: how near the limit is, when it resets, and whether the session goes on with extra
 * usage. Plain text: the window can be a name the CLI made, so the caller escapes it before putting it in HTML.
 */
internal fun limitText(
    record: RateLimitRecord,
    now: Instant = Instant.now(),
    zone: ZoneId = ZoneId.systemDefault(),
): String {
    val window = windowName(record.window)
    val main =
        when {
            record.status == LimitStatus.REJECTED -> ClostaBundle.message("composer.limit.rejected", window)
            record.utilizationPercent != null ->
                ClostaBundle.message("composer.limit.warning", window, record.utilizationPercent.toString())
            else -> ClostaBundle.message("composer.limit.warningNoPercent", window)
        }
    val resets =
        record.resetsAtEpochSec?.let {
            ClostaBundle.message("composer.limit.resets", resetClock(Instant.ofEpochSecond(it), now, zone))
        }
    val overage = ClostaBundle.message("composer.limit.overage").takeIf { record.usingOverage }
    return listOfNotNull(main, resets, overage).joinToString(SEPARATOR)
}

/** The name of a limit's window (`rateLimitType`); no window is the plan's, and an unknown name is itself. */
internal fun windowName(window: String?): String =
    when (window) {
        null -> ClostaBundle.message("composer.limit.window.plan")
        "five_hour" -> ClostaBundle.message("composer.limit.window.fiveHour")
        "seven_day" -> ClostaBundle.message("composer.limit.window.sevenDay")
        "seven_day_opus" -> ClostaBundle.message("composer.limit.window.sevenDayOpus")
        "seven_day_sonnet" -> ClostaBundle.message("composer.limit.window.sevenDaySonnet")
        "overage" -> ClostaBundle.message("composer.limit.window.overage")
        else -> window
    }

/** When a limit resets, in [zone]: the clock alone on the same day as [now], the date before it on another. */
internal fun resetClock(
    at: Instant,
    now: Instant,
    zone: ZoneId,
): String {
    val reset = at.atZone(zone)
    val sameDay = reset.toLocalDate() == now.atZone(zone).toLocalDate()
    return (if (sameDay) CLOCK else DATED).format(reset)
}

private const val SEPARATOR = " · "
private val CLOCK: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
private val DATED: DateTimeFormatter = DateTimeFormatter.ofPattern("M/d HH:mm")
