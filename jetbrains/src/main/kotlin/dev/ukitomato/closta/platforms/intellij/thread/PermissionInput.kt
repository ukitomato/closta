package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.icons.AllIcons
import com.intellij.openapi.util.text.StringUtil
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.MAX_LINE_LENGTH_WORD_WRAP
import com.intellij.ui.dsl.builder.Panel
import com.intellij.ui.dsl.builder.RightGap
import com.intellij.util.ui.JBUI
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.PermissionCard
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.event.MouseWheelEvent
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JTextArea
import javax.swing.ScrollPaneConstants
import javax.swing.SwingUtilities

/**
 * What a permission card shows of what Allow sends, under its headline (and diff): the subject in a box unless it is
 * shown elsewhere (in the headline's link when [pathShown], under a diff, or among the fields), each input field as
 * its key and a box, and a warning line for a call outside the sandbox and for hidden characters.
 */
internal fun inputRows(
    panel: Panel,
    card: PermissionCard,
    pathShown: Boolean,
) {
    if (card.diff == null && !pathShown && !card.subjectInFields) {
        card.subject?.let { subject -> panel.row { cell(subjectBox(subject)).align(AlignX.FILL) } }
    }
    card.inputFields.forEach { field ->
        panel.row(plainLabel(field.key)) { cell(subjectBox(field.value)).align(AlignX.FILL) }
    }
    if (card.sandboxOff) warningRow(panel, ClostaBundle.message("thread.permission.sandboxOff"))
    if (card.hiddenMarked) warningRow(panel, ClostaBundle.message("thread.permission.hidden"))
}

private fun warningRow(
    panel: Panel,
    message: String,
) {
    panel.row {
        icon(AllIcons.General.Warning).gap(RightGap.SMALL)
        text(StringUtil.escapeXmlEntities(message), MAX_LINE_LENGTH_WORD_WRAP).align(AlignX.FILL).resizableColumn()
    }
}

/**
 * What a card runs on (a command, a path, a value of the input), whole: monospaced, wrapping, in a soft box. It asks
 * for little width, so a long line wraps inside the card instead of pushing it past the column's edge, and is no
 * taller than a code box ([ThreadRowViews.CODE_LINES] lines): the rest scrolls inside, so a long command never
 * stretches the card. Its bar stands beside the text whenever there is more, and the wheel scrolls the box while it
 * can, so the rest of a command cannot pass unseen ([BoxScroll]).
 */
internal fun subjectBox(subject: String): JComponent {
    val area = ThreadRowViews.wrapping(subject).apply { font = ThreadStyle.mono }
    val scroll = BoxScroll(area)
    return narrow().apply {
        layout = BorderLayout()
        border = JBUI.Borders.empty(ThreadStyle.PAD_V, ThreadStyle.PAD_H)
        add(scroll, BorderLayout.CENTER)
    }
}

/**
 * The subject box's scroll: as tall as the text wrapped at the width it is given, up to [ThreadRowViews.CODE_LINES]
 * lines, the width the row's (it asks for little). The vertical bar takes its own room (it does not lie over the text
 * and fade), and the wheel scrolls the box until its end in that direction, then goes on to the conversation.
 */
private class BoxScroll(
    private val area: JTextArea,
) : JBScrollPane(
        area,
        ScrollPaneConstants.VERTICAL_SCROLLBAR_AS_NEEDED,
        ScrollPaneConstants.HORIZONTAL_SCROLLBAR_NEVER,
    ) {
    init {
        setOverlappingScrollBar(false)
        verticalScrollBar.isOpaque = true
        border = JBUI.Borders.empty()
        isOpaque = false
        viewport.isOpaque = false
    }

    override fun getPreferredSize(): Dimension {
        val line = area.getFontMetrics(area.font).height
        val bar = if (verticalScrollBar.isVisible) verticalScrollBar.preferredSize.width else 0
        val height = minOf(area.preferredSize.height, line * ThreadRowViews.CODE_LINES)
        return Dimension(narrowWidth() + bar, height)
    }

    override fun processMouseWheelEvent(e: MouseWheelEvent) {
        val up = parent
        if (up == null || canScroll(e.preciseWheelRotation)) {
            super.processMouseWheelEvent(e)
        } else {
            up.dispatchEvent(SwingUtilities.convertMouseEvent(this, e, up))
            e.consume()
        }
    }

    private fun canScroll(rotation: Double): Boolean {
        val bar = verticalScrollBar
        return when {
            !bar.isVisible -> false
            rotation > 0 -> bar.value + bar.visibleAmount < bar.maximum
            rotation < 0 -> bar.value > bar.minimum
            else -> false
        }
    }
}

/** A label for text from the conversation (an input's key): never read as HTML. */
internal fun plainLabel(text: String): JLabel = JBLabel(text).apply { putClientProperty("html.disable", true) }
