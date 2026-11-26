package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.DynamicBundle
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.Divider
import dev.ukitomato.closta.presenter.view.shortTokens
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/** The words on a divider of the thread; null for one this version has no words for (it is drawn as a bare line). */
fun dividerText(divider: Divider): String? =
    when (divider) {
        is Divider.Cleared ->
            divider.at?.let { clockOf(it, ZoneId.systemDefault()) }?.let {
                ClostaBundle.message("thread.divider.cleared", it)
            } ?: ClostaBundle.message("thread.divider.clearedNoTime")
        is Divider.Compacted -> compactedText(divider)
    }

private fun compactedText(divider: Divider.Compacted): String =
    if (divider.failed) {
        ClostaBundle.message("thread.divider.compactFailed")
    } else {
        val before = shortTokens(divider.preTokens)
        val base =
            divider.postTokens?.let { ClostaBundle.message("thread.divider.compacted", before, shortTokens(it)) }
                ?: ClostaBundle.message("thread.divider.compactedNoAfter", before)
        if (divider.trigger == AUTO_TRIGGER) base + autoSuffix() else base
    }

/** The "(auto)" after the words; English sets it off with a space, Japanese does not. */
private fun autoSuffix(): String {
    val auto = ClostaBundle.message("thread.divider.auto")
    return if (DynamicBundle.getLocale().language == "ja") auto else " $auto"
}

private const val AUTO_TRIGGER = "auto"

/** [at], an ISO 8601 instant, as the hour and minute in [zone] ("21:26"); null when it is not one. */
internal fun clockOf(
    at: String,
    zone: ZoneId,
): String? =
    try {
        CLOCK.format(Instant.parse(at).atZone(zone))
    } catch (ignoredNotAnInstant: DateTimeParseException) {
        null
    }

private val CLOCK: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")
