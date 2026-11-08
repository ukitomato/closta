package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.ColoredTreeCellRenderer
import com.intellij.ui.SimpleColoredComponent
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.render.RenderingHelper
import com.intellij.ui.render.RenderingUtil
import com.intellij.util.ui.EmptyIcon
import com.intellij.util.ui.JBUI
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.chat.secondLine
import dev.ukitomato.closta.platforms.intellij.chat.waitReasonText
import dev.ukitomato.closta.platforms.intellij.session.SystemClock
import dev.ukitomato.closta.presenter.view.SessionGroup
import dev.ukitomato.closta.presenter.view.WindowGroup
import dev.ukitomato.closta.presenter.view.WindowRow
import java.awt.BorderLayout
import java.awt.Component
import java.time.Duration
import javax.swing.Icon
import javax.swing.JPanel
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.TreeCellRenderer

/**
 * Draws a row of the sessions tree. A heading: its name in bold and its count in grey. A session: its state's icon, its
 * title (bold while unread), in grey the other project, repository, branch and what it waits for, and at the right edge
 * in grey where it is shown (while it waits and is shown somewhere), else how long it has been in its group.
 *
 * The right part is a component of its own on the east of the row. The tree shrinks its rows to the visible width
 * ([RenderingHelper.SHRINK_LONG_RENDERER], set by [SessionsTree]), so it sits at the visible right edge and a long
 * title is cut with an ellipsis before it. The row panel is returned for every row, headings too: a [main] returned
 * alone would be taken out of the panel by the tree's renderer pane.
 */
internal class SessionsRenderer(
    private val project: Project,
) : TreeCellRenderer {
    private val clock = SystemClock()
    private val main = Main()
    private val right = SimpleColoredComponent().apply { ipad = JBUI.insets(1, RIGHT_GAP, 1, RIGHT_PAD) }
    private val row =
        JPanel(BorderLayout()).apply {
            isOpaque = false
            add(main, BorderLayout.CENTER)
            add(right, BorderLayout.EAST)
        }

    override fun getTreeCellRendererComponent(
        tree: JTree,
        value: Any?,
        selected: Boolean,
        expanded: Boolean,
        leaf: Boolean,
        row: Int,
        hasFocus: Boolean,
    ): Component {
        main.getTreeCellRendererComponent(tree, value, selected, expanded, leaf, row, hasFocus)
        val item = (value as? DefaultMutableTreeNode)?.userObject as? SessionItem
        right.clear()
        right.isOpaque = false
        right.font = tree.font
        val text = item?.let(::rightText)
        // A screen reader reads the row panel, not the parts in it: it is named after what they say.
        this.row.getAccessibleContext().accessibleName =
            listOfNotNull(main.getCharSequence(false).toString(), text).joinToString(", ")
        if (text == null) return this.row
        // Grey as the row's own grey text is: it turns to the selection's colour only where the theme does that.
        val attributes =
            if (selected &&
                RenderingUtil.isFocused(tree) &&
                JBUI.CurrentTheme.Tree.Selection
                    .forceFocusedSelectionForeground()
            ) {
                SimpleTextAttributes(SimpleTextAttributes.STYLE_PLAIN, RenderingUtil.getSelectionForeground(tree))
            } else {
                SimpleTextAttributes.GRAYED_ATTRIBUTES
            }
        right.append(text, attributes)
        return this.row
    }

    /** Where a waiting session is shown, else how long it has been in its group; null when neither is known. */
    private fun rightText(item: SessionItem): String? {
        val entry = (item as? SessionItem.Live)?.entry ?: return null
        val shown = if (item.group() == SessionGroup.WAITING) shownAtText(entry) else null
        return shown ?: entry.since?.let { elapsedText(Duration.between(it, clock.now())) }
    }

    private inner class Main : ColoredTreeCellRenderer() {
        override fun customizeCellRenderer(
            tree: JTree,
            value: Any?,
            selected: Boolean,
            expanded: Boolean,
            leaf: Boolean,
            row: Int,
            hasFocus: Boolean,
        ) {
            when (val shown = (value as? DefaultMutableTreeNode)?.userObject) {
                is WindowRow.Header -> {
                    append(groupLabel(shown.group), BOLD)
                    append("  ${shown.count}", SimpleTextAttributes.GRAYED_ATTRIBUTES)
                }
                is SessionItem -> item(shown)
            }
        }

        private fun item(item: SessionItem) {
            icon = sessionIcon(item.group())
            appendWithClipping(
                item.title,
                if (item.isUnread()) BOLD else SimpleTextAttributes.REGULAR_ATTRIBUTES,
                ELLIPSIS,
            )
            val grey =
                when (item) {
                    is SessionItem.Live -> {
                        val entry = item.entry
                        val other = entry.project.takeIf { it != project }?.name
                        secondLine(other, entry.head, entry.summary.reason?.let(::waitReasonText))
                    }
                    is SessionItem.Mark -> ""
                }
            if (grey.isNotEmpty()) appendWithClipping("  $grey", SimpleTextAttributes.GRAYED_ATTRIBUTES, ELLIPSIS)
        }
    }

    private companion object {
        const val RIGHT_GAP = 12

        /** Room between the right column and the tree's edge, where the scroll bar shows over it. */
        const val RIGHT_PAD = 10

        /**
         * Cuts a fragment to the width left for it, ending in "…". The width is up to the row's end, so a title cut
         * this way leaves no room for the grey after it, which is then not shown.
         */
        val ELLIPSIS =
            SimpleColoredComponent.FragmentTextClipper { component, g, _, text, width ->
                val metrics = component.getFontMetrics(g.font)
                if (metrics.stringWidth(text) <= width) {
                    text
                } else {
                    var end = text.length
                    while (end > 0 && metrics.stringWidth(text.substring(0, end) + "…") > width) end--
                    text.substring(0, end).trimEnd() + "…"
                }
            }
        val BOLD: SimpleTextAttributes = SimpleTextAttributes.REGULAR_BOLD_ATTRIBUTES

        fun groupLabel(group: WindowGroup): String =
            when (group) {
                WindowGroup.WAITING -> ClostaBundle.message("sessions.window.group.waiting")
                WindowGroup.RUNNING -> ClostaBundle.message("sessions.window.group.running")
                WindowGroup.FINISHED -> ClostaBundle.message("sessions.window.group.finished")
                WindowGroup.WAS_RUNNING -> ClostaBundle.message("sessions.window.group.wasRunning")
            }
    }
}

/** The icon of a session in [group], in the tree and in the detail's header. */
internal fun sessionIcon(group: SessionGroup): Icon =
    when (group) {
        SessionGroup.WAITING -> AllIcons.General.Warning
        SessionGroup.RUNNING -> AnimatedIcon.Default.INSTANCE
        SessionGroup.UNREAD -> AllIcons.General.Information
        SessionGroup.OTHER -> EmptyIcon.ICON_16
    }
