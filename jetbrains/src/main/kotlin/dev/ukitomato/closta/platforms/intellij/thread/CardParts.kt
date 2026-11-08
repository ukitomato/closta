@file:Suppress("MatchingDeclarationName") // the cards' parts: the headline's class and the functions that make the rest

package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.icons.AllIcons
import com.intellij.ide.ui.laf.darcula.ui.DarculaButtonUI
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.ActionLink
import com.intellij.ui.dsl.builder.Panel
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import com.intellij.util.ui.WrapLayout
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.ui.plainTip
import dev.ukitomato.closta.presenter.view.ApprovalOutcome
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.FlowLayout
import javax.swing.Icon
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel

/** What a waiting card says first: an icon and one sentence of what Claude wants to do. */
internal data class Headline(
    val icon: Icon,
    val text: String,
    /** The file the tool works on, shown after [text] as a link; null for a command or another tool. */
    val file: String? = null,
)

private val EDITS = setOf("Edit", "MultiEdit", "NotebookEdit")
private const val MCP_PREFIX = "mcp__"

/** The headline of a permission card for [tool] working on [subject] (a command, a path or the input's first words). */
internal fun headlineOf(
    tool: String,
    subject: String?,
): Headline {
    val file = subject?.substringAfterLast('/')?.substringAfterLast('\\')
    return when {
        tool == "Bash" -> Headline(AllIcons.Nodes.Console, ClostaBundle.message("thread.headline.bash"))
        tool in EDITS -> Headline(AllIcons.Actions.Edit, ClostaBundle.message("thread.headline.edit"), file)
        tool == "Write" -> Headline(AllIcons.Actions.AddFile, ClostaBundle.message("thread.headline.write"), file)
        tool == "Read" -> Headline(AllIcons.Actions.Preview, ClostaBundle.message("thread.headline.read"), file)
        tool == "WebFetch" || tool == "WebSearch" ->
            Headline(AllIcons.General.Web, ClostaBundle.message("thread.headline.web"))
        tool.startsWith(MCP_PREFIX) -> {
            val (server, name) =
                tool.removePrefix(MCP_PREFIX).split("__", limit = 2).let {
                    it[0] to
                        it.getOrElse(1) { "" }
                }
            Headline(AllIcons.Nodes.Plugin, ClostaBundle.message("thread.headline.mcp", server, name))
        }
        else -> Headline(AllIcons.Nodes.Plugin, ClostaBundle.message("thread.headline.tool", tool))
    }
}

/** What an answered card shrinks to: one quiet line, the outcome and what it was about. */
internal fun answeredLine(
    outcome: ApprovalOutcome,
    said: String,
    about: String?,
): JComponent {
    val what =
        about
            ?.lineSequence()
            ?.firstOrNull()
            ?.takeIf { it.isNotBlank() }
            ?.let { " · " + it.take(ABOUT_MAX) }
    val pieces = listOfNotNull(said, what).map { it to SimpleTextAttributes.GRAYED_ATTRIBUTES }
    val icon = if (outcome == ApprovalOutcome.APPROVED) AllIcons.Actions.Checked else AllIcons.Actions.Cancel
    return EllipsizedLine(pieces, icon, UIUtil.getLabelFont())
}

private const val ABOUT_MAX = 120

/**
 * A card's answer button. It never takes the keyboard (the card keeps it, for its keys); [main] is drawn as the
 * default button, the answer Enter gives.
 */
internal fun cardButton(
    text: String,
    main: Boolean = false,
    act: () -> Unit,
): JButton =
    JButton(text).apply {
        isFocusable = false
        if (main) putClientProperty(DarculaButtonUI.DEFAULT_STYLE_KEY, true)
        addActionListener { act() }
    }

/** The line under a card that says why its answer did not go, in the error colour. */
internal fun failureRow(
    panel: Panel,
    failure: String?,
) {
    failure?.let { text -> panel.row { label(text).applyToComponent { foreground = UIUtil.getErrorForeground() } } }
}

/** Buttons in a line that wraps when the card is narrow (the sidebar). */
internal fun buttonLine(buttons: List<JComponent>): JComponent =
    JPanel(WrapLayout(FlowLayout.LEFT, 0, 0)).apply {
        isOpaque = false
        // The gaps go after each button (a layout's gap would go before the first too, and the card's other rows start
        // at its edge), below too for when they wrap.
        buttons.forEach { button ->
            add(
                JPanel(BorderLayout()).apply {
                    isOpaque = false
                    border = JBUI.Borders.empty(0, 0, BUTTON_GAP / 2, BUTTON_GAP)
                    add(button)
                },
            )
        }
    }

private const val BUTTON_GAP = 8

/**
 * A file's name as a link that opens [path]: cut with an ellipsis when the card is narrow (the sidebar), the whole path
 * in its tooltip.
 */
internal fun fileLink(
    name: String,
    path: String,
    open: () -> Unit,
): JComponent =
    ActionLink(name) { open() }.apply {
        toolTipText = plainTip(path)
        minimumSize = Dimension(JBUI.scale(LINK_MIN), preferredSize.height)
    }

private const val LINK_MIN = 40

/** The little width a [narrow] box asks for. */
internal fun narrowWidth(): Int = JBUI.scale(NARROW)

/** A soft box that asks for little width: a cell that fills its row gives it the row's width. */
internal fun narrow(): RoundedPanel =
    object : RoundedPanel() {
        override fun getPreferredSize(): Dimension =
            super.getPreferredSize().let { Dimension(minOf(it.width, JBUI.scale(NARROW)), it.height) }
    }

private const val NARROW = 120
