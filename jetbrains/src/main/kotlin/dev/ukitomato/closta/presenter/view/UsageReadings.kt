package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import kotlin.math.roundToInt

/**
 * The answer to `get_usage`: what the session cost so far ([sessionCostUsd], `session.total_cost_usd`), whether the
 * plan's limits could be read, and the windows of the plan's limits the plugin names.
 */
data class UsageRecord(
    val sessionCostUsd: Double,
    val rateLimitsAvailable: Boolean,
    val windows: List<UsageWindow>,
)

/**
 * One window of the plan's limits: its CLI name, the share used in percent (null when the CLI gives none), and when it
 * resets, as the CLI wrote it (ISO 8601).
 */
data class UsageWindow(
    val name: String,
    val utilizationPercent: Int?,
    val resetsAt: String?,
)

/**
 * The windows read, in this order. The answer holds many other names (capture 43: names of no window the type
 * gives, all null, and `extra_usage`, `limits`, `spend` and `model_scoped`, which are no window of this shape):
 * none of them is read.
 */
private val WINDOWS = listOf("five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet")

/**
 * Reads the `response` of a `get_usage` answer; null when it has no cost of the session. No limits, limits said not
 * available, or a window that is null leave those windows out and keep the cost.
 */
internal fun usageOf(body: JsonObject): UsageRecord? {
    val cost = body.obj("session")?.number("total_cost_usd")?.takeIf { it.isFinite() } ?: return null
    val available = (body["rate_limits_available"] as? JsonBool)?.value == true
    val limits = body.obj("rate_limits")?.takeIf { available }
    val windows =
        limits?.let { all ->
            WINDOWS.mapNotNull { name ->
                all.obj(name)?.let { window ->
                    UsageWindow(
                        name,
                        window.number("utilization")?.takeIf { it.isFinite() }?.roundToInt(),
                        window.string("resets_at"),
                    )
                }
            }
        }
    return UsageRecord(cost, available, windows.orEmpty())
}
