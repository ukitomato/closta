package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.panels.VerticalLayout
import com.intellij.util.ui.JBUI
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.thread.HtmlBlock
import dev.ukitomato.closta.platforms.intellij.thread.ThreadRowViews
import dev.ukitomato.closta.platforms.intellij.thread.ThreadStyle
import dev.ukitomato.closta.platforms.intellij.ui.noHtml
import java.awt.Dimension
import java.awt.Rectangle
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.ScrollPaneConstants
import javax.swing.Scrollable

// The pieces the detail pane's bodies and answer views share.

private const val COLUMN_GAP = 8
private const val SCROLL_UNIT = 16

/** A column of components as wide as the scroll pane it is in, growing downwards. */
internal class Column(
    parts: List<JComponent>,
    // checkUi: allow unnamed-component — a container: each part in it carries its own name
) : JPanel(VerticalLayout(JBUI.scale(COLUMN_GAP))),
    Scrollable {
    init {
        isOpaque = false
        parts.forEach { add(it) }
    }

    override fun getPreferredScrollableViewportSize(): Dimension = preferredSize

    override fun getScrollableUnitIncrement(
        visibleRect: Rectangle,
        orientation: Int,
        direction: Int,
    ): Int = JBUI.scale(SCROLL_UNIT)

    override fun getScrollableBlockIncrement(
        visibleRect: Rectangle,
        orientation: Int,
        direction: Int,
    ): Int = visibleRect.height

    override fun getScrollableTracksViewportWidth(): Boolean = true

    override fun getScrollableTracksViewportHeight(): Boolean = false
}

/** [content] scrolling up and down only, without a border of its own. */
internal fun scrolling(content: JComponent): JComponent =
    JBScrollPane(
        content,
        ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED,
        ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER,
    ).apply {
        border = JBUI.Borders.empty()
        isOpaque = false
        viewport.isOpaque = false
    }

/** A reply's (or a plan's) Markdown blocks, drawn as the conversation draws them. */
internal fun markdownColumn(blocks: List<HtmlBlock>): JComponent =
    Column(blocks.map(ThreadRowViews::htmlBlock)).apply {
        border = JBUI.Borders.empty(ThreadStyle.PAD_V, ThreadStyle.PAD_H)
    }

/** [markdownColumn] in a framed box that scrolls (a plan, a finished session's last reply). */
internal fun markdownBox(blocks: List<HtmlBlock>): JComponent =
    JBScrollPane(markdownColumn(blocks)).apply {
        border = JBUI.Borders.customLine(ThreadStyle.cardBorder)
        viewport.background = ThreadStyle.background
    }

/** A grey line. */
internal fun greyLine(text: String): JBLabel = JBLabel(text).noHtml().apply { foreground = ThreadStyle.muted }

/** "n more waiting" under the shown wait; hidden when none. */
internal fun moreLine(): JBLabel = greyLine("").apply { border = JBUI.Borders.emptyTop(COLUMN_GAP) }

internal fun JBLabel.showMore(more: Int) {
    text = ClostaBundle.message("sessions.window.detail.more", more)
    isVisible = more > 0
}
