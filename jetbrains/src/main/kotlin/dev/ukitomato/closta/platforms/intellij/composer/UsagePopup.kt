package dev.ukitomato.closta.platforms.intellij.composer

import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.panels.VerticalLayout
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.chat.resetClock
import dev.ukitomato.closta.platforms.intellij.chat.windowName
import dev.ukitomato.closta.presenter.view.ComposerState
import dev.ukitomato.closta.presenter.view.UsageRecord
import dev.ukitomato.closta.presenter.view.UsageWindow
import java.awt.BorderLayout
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeParseException
import java.util.Locale
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JProgressBar

/**
 * The popup of the session's cost and the plan's limits. It keeps nothing of its own: each [show] draws the composer's
 * state again, so an answer that comes while it is open fills it in (only what it was drawn from is kept, to skip a
 * state that changes nothing here).
 */
internal class UsagePopup(
    state: ComposerState,
) {
    private val content =
        JPanel(VerticalLayout(JBUI.scale(GAP))).apply {
            border = JBUI.Borders.empty(GAP * 2)
        }

    // What the content was last drawn from, so that a state that changes nothing here (a streamed reply) draws nothing.
    private var drawn: Triple<UsageRecord?, Boolean, Double?>? = null

    val popup: JBPopup =
        JBPopupFactory
            .getInstance()
            .createComponentPopupBuilder(content, null)
            .setTitle(ClostaBundle.message("composer.usage.title"))
            .setRequestFocus(true)
            .setCancelOnClickOutside(true)
            .createPopup()

    init {
        draw(state)
    }

    /** Draws [state] again while the popup is open, and fits the popup to what it now says. */
    fun show(state: ComposerState) {
        if (draw(state) && popup.isVisible) popup.pack(true, true)
    }

    /**
     * [state]'s usage: the cost, then the windows the answer has, and that the CLI is being asked. While a request
     * waits, the cost is the composer's (newer than the last answer's) and the windows are the last answer's.
     */
    private fun draw(state: ComposerState): Boolean {
        val from = Triple(state.usage, state.usageWaiting, state.costUsd)
        if (from == drawn) return false
        drawn = from
        content.removeAll()
        val usage = state.usage
        val cost =
            if (state.usageWaiting) {
                state.costUsd ?: usage?.sessionCostUsd
            } else {
                usage?.sessionCostUsd ?: state.costUsd
            }
        cost?.let {
            content.add(JBLabel(ClostaBundle.message("composer.usage.cost", "%.4f".format(Locale.ROOT, it))))
        }
        if (state.usageWaiting) {
            content.add(quiet(ClostaBundle.message("composer.usage.loading")))
        }
        usage?.windows?.forEach { content.add(window(it)) }
        content.revalidate()
        content.repaint()
        return true
    }

    private fun window(window: UsageWindow): JComponent {
        val name = windowName(window.name)
        val head =
            JPanel(BorderLayout(JBUI.scale(GAP * 2), 0)).apply {
                isOpaque = false
                add(JBLabel(name), BorderLayout.CENTER)
                window.utilizationPercent?.let {
                    add(JBLabel(ClostaBundle.message("composer.usage.window", it.toString())), BorderLayout.EAST)
                }
            }
        val rows =
            JPanel(VerticalLayout(JBUI.scale(2))).apply {
                isOpaque = false
                border = JBUI.Borders.emptyTop(GAP)
                add(head)
            }
        window.utilizationPercent?.let { percent ->
            rows.add(
                JProgressBar(0, FULL).apply {
                    value = percent.coerceIn(0, FULL)
                    getAccessibleContext().accessibleName = name
                },
            )
        }
        resetsOf(window.resetsAt)?.let {
            val resets =
                ClostaBundle.message(
                    "composer.limit.resets",
                    resetClock(it, Instant.now(), ZoneId.systemDefault()),
                )
            rows.add(quiet(resets))
        }
        return rows
    }

    private fun quiet(text: String) = JBLabel(text).apply { foreground = UIUtil.getContextHelpForeground() }

    private fun resetsOf(at: String?): Instant? =
        at?.let {
            try {
                Instant.parse(it)
            } catch (_: DateTimeParseException) {
                null
            }
        }

    private companion object {
        const val GAP = 4
        const val FULL = 100
    }
}
