package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import kotlin.math.roundToInt

/** How near the plan's limit the CLI says the session is (`rate_limit_info.status`). */
enum class LimitStatus { ALLOWED, WARNING, REJECTED }

/**
 * The last `rate_limit_event`. [seq] is this record's own number: it goes up only when the status or the window
 * changes, so a dismissal holds while the same warning is repeated with a new share. [window] is the CLI's name
 * for it (`rateLimitType`), [utilizationPercent] the share used, and [usingOverage] says a refused session goes on
 * with extra usage.
 */
data class RateLimitRecord(
    val seq: Int,
    val status: LimitStatus,
    val window: String?,
    val utilizationPercent: Int?,
    val resetsAtEpochSec: Long?,
    val usingOverage: Boolean,
)

/**
 * The limit a `rate_limit_event` reports. The window's own figures (`unifiedWindows`, a share from 0 to 1) go
 * first, the top-level ones after; a line whose `rate_limit_info` cannot be read changes nothing.
 */
internal fun OperationRecords.rateLimited(event: AgentEvent.RateLimitEvent): OperationRecords {
    val info = JsonRead.parse(event.rateLimitInfo.text) as? JsonObject ?: return this
    val status = statusOf(info.string("status"))
    val window = info.string("rateLimitType")
    val own = window?.let { info.obj("unifiedWindows")?.obj(it) }
    val percent =
        own?.number("utilization")?.let { (it * PERCENT).roundToInt() } ?: info.number("utilization")?.let(::percentOf)
    val last = rateLimit
    val record =
        RateLimitRecord(
            seq =
                if (last == null ||
                    last.status != status ||
                    last.window != window
                ) {
                    (last?.seq ?: 0) + 1
                } else {
                    last.seq
                },
            status = status,
            window = window,
            utilizationPercent = percent,
            resetsAtEpochSec = own?.count("resetsAt") ?: info.count("resetsAt"),
            usingOverage = status == LimitStatus.REJECTED && info.string("overageStatus") == OVERAGE_ALLOWED,
        )
    return if (record == last) this else copy(rateLimit = record)
}

/** The user closed the banner of the limit [seq]. */
internal fun OperationRecords.dismissRateLimit(seq: Int): OperationRecords =
    if (rateLimitDismissed == seq) this else copy(rateLimitDismissed = seq)

/** The limit shown: a warning or a refusal the user has not dismissed. */
internal fun OperationRecords.rateLimitShown(): RateLimitRecord? =
    rateLimit?.takeIf { it.status != LimitStatus.ALLOWED && it.seq != rateLimitDismissed }

/** The type does not say what scale the top-level `utilization` is on: up to 1 is a share, above it a percentage. */
private fun percentOf(utilization: Double): Int =
    if (utilization <= 1.0) (utilization * PERCENT).roundToInt() else utilization.roundToInt()

private fun statusOf(wire: String?): LimitStatus =
    when (wire) {
        "allowed_warning" -> LimitStatus.WARNING
        "rejected" -> LimitStatus.REJECTED
        else -> LimitStatus.ALLOWED
    }

private const val PERCENT = 100
private const val OVERAGE_ALLOWED = "allowed"
