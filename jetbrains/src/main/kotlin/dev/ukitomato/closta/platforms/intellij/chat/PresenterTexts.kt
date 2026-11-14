package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.EFFORT_LEVELS
import dev.ukitomato.closta.presenter.view.MCP_STATUSES
import dev.ukitomato.closta.presenter.view.PERMISSION_MODES
import dev.ukitomato.closta.presenter.view.RewindRefusal
import dev.ukitomato.closta.presenter.view.SANDBOX_NOT_APPLIED
import dev.ukitomato.closta.presenter.view.SANDBOX_NOT_CONFIRMED
import dev.ukitomato.closta.presenter.view.SANDBOX_NOT_OFF
import dev.ukitomato.closta.presenter.view.SANDBOX_NOT_STARTED
import dev.ukitomato.closta.presenter.view.SANDBOX_REFUSED_TURN
import dev.ukitomato.closta.presenter.view.SwitchRecord
import dev.ukitomato.closta.presenter.view.WaitReason

// The words for what the presenter hands over as values: it cannot reach the IDE's bundle itself.

/** An MCP server's state as the MCP tab shows it; a state the plugin has no words for is shown as the CLI wrote it. */
fun mcpStatusText(status: String): String =
    if (status in MCP_STATUSES) ClostaBundle.message("mcp.status.$status") else status

/** A permission mode as the composer says it; a mode the plugin has no words for is shown as its id. */
fun modeText(mode: String): String = if (mode in PERMISSION_MODES) ClostaBundle.message("composer.mode.$mode") else mode

/** [modeText] for a narrow composer ("Edits" for Accept Edits). */
fun shortModeText(mode: String): String =
    if (mode in PERMISSION_MODES) ClostaBundle.message("composer.mode.$mode.short") else mode

/** An effort level as the composer says it; a level the plugin has no words for is shown as its id. */
fun effortText(level: String): String =
    if (level in EFFORT_LEVELS) ClostaBundle.message("composer.effort.$level") else level

/** The sandbox button's name: on or off. */
fun sandboxText(on: Boolean): String = ClostaBundle.message(if (on) "composer.sandbox.on" else "composer.sandbox.off")

/** The line saying a sandbox switch did not take, and why: the presenter's reasons in words, the CLI's as it wrote. */
fun sandboxFailureText(record: SwitchRecord): String {
    val detail = record.detail.orEmpty()
    val reason = sandboxReasonKey(detail)?.let { ClostaBundle.message(it) } ?: detail
    val key = if (record.value == "true") "composer.sandbox.failed.on" else "composer.sandbox.failed.off"
    return ClostaBundle.message(key, reason)
}

/** The bundle key of a sandbox failure's [detail] when the presenter made it; null for the CLI's own sentence. */
fun sandboxReasonKey(detail: String): String? =
    when (detail) {
        SANDBOX_REFUSED_TURN -> "composer.sandbox.reason.turn"
        SANDBOX_NOT_APPLIED -> "composer.sandbox.reason.notApplied"
        SANDBOX_NOT_OFF -> "composer.sandbox.reason.notOff"
        SANDBOX_NOT_CONFIRMED -> "composer.sandbox.reason.notConfirmed"
        SANDBOX_NOT_STARTED -> "composer.sandbox.reason.notStarted"
        else -> null
    }

/** The one line saying what a waiting session waits for. */
fun waitReasonText(reason: WaitReason): String =
    when (reason) {
        WaitReason.Question -> ClostaBundle.message("wait.question")
        WaitReason.Plan -> ClostaBundle.message("wait.plan")
        is WaitReason.Permission ->
            reason.subject?.let { ClostaBundle.message("wait.permission.subject", reason.toolName, it) }
                ?: ClostaBundle.message("wait.permission", reason.toolName)
        WaitReason.Other -> ClostaBundle.message("wait.other")
    }

/** Why an ask or a turn's end offers nothing. */
fun rewindRefusalText(refusal: RewindRefusal): String =
    when (refusal) {
        RewindRefusal.RUNNING -> ClostaBundle.message("rewind.refused.running")
        RewindRefusal.UNKNOWN -> ClostaBundle.message("rewind.refused.unknown")
        RewindRefusal.NOTHING_AFTER -> ClostaBundle.message("rewind.refused.nothingAfter")
    }
