package dev.ukitomato.closta.platforms.intellij.composer

import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.JBPopupListener
import com.intellij.openapi.ui.popup.LightweightWindowEvent
import com.intellij.ui.components.ActionLink
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.panels.VerticalLayout
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.ui.noHtml
import dev.ukitomato.closta.presenter.view.ComposerState
import dev.ukitomato.closta.presenter.view.ContextCategory
import dev.ukitomato.closta.presenter.view.ContextKind
import dev.ukitomato.closta.presenter.view.ContextRecord
import dev.ukitomato.closta.presenter.view.shortTokens
import java.awt.BorderLayout
import java.awt.FlowLayout
import java.util.Locale
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.Timer

/**
 * The popup of the context's breakdown. It keeps nothing of its own: each [show] draws the composer's state again, so
 * the whole answer that comes while it is open fills it in (only what it was drawn from is kept, to skip a state that
 * changes nothing here). [recount] asks for the whole answer again. [asked] is whether the whole answer was just asked
 * for, so that it says it is counting before the request is in [state]; a session that is not running asks nothing.
 */
internal class ContextPopup(
    state: ComposerState,
    asked: Boolean,
    private val recount: () -> Unit,
) {
    private val content =
        JPanel(VerticalLayout(JBUI.scale(GAP))).apply {
            border = JBUI.Borders.empty(GAP * 2)
        }

    // What the content was last drawn from, so that a state that changes nothing here (a streamed reply) draws nothing.
    private var drawn: Triple<ContextRecord?, Boolean, Boolean>? = null

    private var forced = asked
    private var latest = state
    private val forcedTimer =
        Timer(FORCED_MS) {
            forced = false
            show(latest)
        }.apply { isRepeats = false }

    val popup: JBPopup =
        JBPopupFactory
            .getInstance()
            .createComponentPopupBuilder(content, null)
            .setRequestFocus(true)
            .setCancelOnClickOutside(true)
            .createPopup()

    init {
        // Opened as the whole answer is asked for: the request is not in [state] yet.
        draw(state)
        if (forced) forcedTimer.start()
        popup.addListener(
            object : JBPopupListener {
                override fun onClosed(event: LightweightWindowEvent) = forcedTimer.stop()
            },
        )
    }

    /** Draws [state] again while the popup is open, and fits the popup to what it now says. */
    fun show(state: ComposerState) {
        latest = state
        if (draw(state) && popup.isVisible) popup.pack(true, true)
    }

    /**
     * [state]'s context: the tokens used, then the rows in the window, the compaction's reserve and the window left,
     * each kind in the CLI's order, and the tool schemas kept out of the window as one line. With no rows (an answer of
     * the totals alone), it says they are being counted, or offers to count them again.
     */
    private fun draw(state: ComposerState): Boolean {
        if (forced && state.contextWaiting) {
            forced = false
            forcedTimer.stop()
        }
        val from = Triple(state.context, state.contextWaiting, forced)
        if (from == drawn) return false
        drawn = from
        content.removeAll()
        val context = state.context
        context?.let {
            val tokens = ClostaBundle.message("composer.context.tokens", "${it.totalTokens}", "${it.maxTokens}")
            content.add(JBLabel(tokens))
        }
        val categories = context?.categories.orEmpty()
        when (breakdownBody(categories.size, state.contextWaiting, forced)) {
            BreakdownBody.ROWS -> rows(categories, context?.maxTokens ?: 0)
            BreakdownBody.COUNTING -> content.add(quiet(ClostaBundle.message("composer.context.counting")))
            BreakdownBody.RECOUNT ->
                content.add(
                    ActionLink(ClostaBundle.message("composer.context.recount")) { recount() },
                )
        }
        content.revalidate()
        content.repaint()
        return true
    }

    private fun rows(
        categories: List<ContextCategory>,
        max: Long,
    ) {
        for (kind in SHOWN) {
            categories.filter { it.kind == kind }.forEach { content.add(row(it, max)) }
        }
        val deferred = categories.filter { it.kind == ContextKind.DEFERRED }
        if (deferred.isNotEmpty()) {
            val tokens = shortTokens(deferred.sumOf { it.tokens })
            content.add(quiet(ClostaBundle.message("composer.context.deferred", tokens)))
        }
    }

    private fun row(
        category: ContextCategory,
        max: Long,
    ): JComponent {
        val numbers =
            JPanel(FlowLayout(FlowLayout.RIGHT, JBUI.scale(GAP * 2), 0)).apply {
                isOpaque = false
                add(JBLabel(shortTokens(category.tokens)))
                if (max > 0) {
                    val share = "%.1f".format(Locale.ROOT, category.tokens * PERCENT / max)
                    add(quiet(ClostaBundle.message("composer.context.share", share)))
                }
            }
        return JPanel(BorderLayout(JBUI.scale(GAP * 2), 0)).apply {
            isOpaque = false
            add(JBLabel(category.name).noHtml(), BorderLayout.CENTER)
            add(numbers, BorderLayout.EAST)
        }
    }

    private fun quiet(text: String) = JBLabel(text).apply { foreground = UIUtil.getContextHelpForeground() }

    private companion object {
        const val GAP = 4
        const val FORCED_MS = 2_000
        const val PERCENT = 100.0

        // The kinds drawn as rows, in this order; the deferred tools are one line after them.
        val SHOWN = listOf(ContextKind.USED, ContextKind.BUFFER, ContextKind.FREE)
    }
}
