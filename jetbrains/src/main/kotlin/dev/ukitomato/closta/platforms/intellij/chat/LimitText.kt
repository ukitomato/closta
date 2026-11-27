package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.LimitStatus
import dev.ukitomato.closta.presenter.view.RateLimitRecord
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** A message of the bundle by its key: the plugin's own, or another language's in a test. */
internal typealias Words = (key: String, params: Array<out String>) -> String

private val bundleWords: Words = ::bundleMessage

private fun bundleMessage(
    key: String,
    vararg params: String,
): String = ClostaBundle.message(key, *params)

/**
 * The words of the limit banner: how near the limit is, when it resets, and whether the session goes on with extra
 * usage. Plain text: the window can be a name the CLI made, so the caller escapes it before putting it in HTML.
 */
internal fun limitText(
    record: RateLimitRecord,
    now: Instant = Instant.now(),
    zone: ZoneId = ZoneId.systemDefault(),
    words: Words = bundleWords,
): String {
    val window = windowName(record.window, words)
    val percent = record.utilizationPercent
    val main =
        when {
            record.status == LimitStatus.REJECTED -> words("composer.limit.rejected", arrayOf(window))
            percent != null -> words("composer.limit.warning", arrayOf(window, percent.toString()))
            else -> words("composer.limit.warningNoPercent", arrayOf(window))
        }
    val resets =
        record.resetsAtEpochSec?.let {
            words("composer.limit.resets", arrayOf(resetClock(Instant.ofEpochSecond(it), now, zone)))
        }
    val overage = words("composer.limit.overage", emptyArray()).takeIf { record.usingOverage }
    return listOfNotNull(main, resets, overage).joinToString(SEPARATOR)
}

/** The name of a limit's window (`rateLimitType`); no window is the plan's, and an unknown name is itself. */
internal fun windowName(
    window: String?,
    words: Words = bundleWords,
): String {
    val key =
        when (window) {
            null -> "composer.limit.window.plan"
            "five_hour" -> "composer.limit.window.fiveHour"
            "seven_day" -> "composer.limit.window.sevenDay"
            "seven_day_opus" -> "composer.limit.window.sevenDayOpus"
            "seven_day_sonnet" -> "composer.limit.window.sevenDaySonnet"
            "seven_day_overage_included" -> "composer.limit.window.sevenDayOverageIncluded"
            "overage" -> "composer.limit.window.overage"
            else -> return window
        }
    return words(key, emptyArray())
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
