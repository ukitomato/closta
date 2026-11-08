package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.icons.AllIcons
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.vcs.FileStatus
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.ColorUtil
import com.intellij.ui.JBColor
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.scale.JBUIScale
import com.intellij.util.ui.JBFont
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.presenter.view.ToolLine
import dev.ukitomato.closta.presenter.view.ToolLineState
import java.awt.BasicStroke
import java.awt.Color
import java.awt.Component
import java.awt.Font
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import javax.swing.Icon

/**
 * The look of the conversation, all taken from the IDE's theme: the editor's background, the panel colour for the
 * user's messages, the theme's accent for what is running and waiting, the VCS colours for what was added and
 * removed. A tool's state is an icon and a word, never a colour alone.
 */
object ThreadStyle {
    val background: Color get() = JBColor.namedColor("Editor.background", UIUtil.getPanelBackground())

    /**
     * The user's message on the conversation's background: [lifted] from it. A box painted on something else (a
     * card's subject) lifts from what it sits on instead, so it shows on every theme's background.
     */
    val askBackground: Color get() = lifted(background)

    /**
     * One step from [under] toward the text colour. Not a theme key: the panel's colour and the editor search field's
     * were tried, and in Islands each is the conversation's own background in one of the two places it is shown. Not
     * the action button's hover colour either, so the buttons inside the box still show their hover.
     */
    fun lifted(under: Color): Color = ColorUtil.mix(under, UIUtil.getLabelForeground(), LIFT)

    private const val LIFT = 0.07
    val cardBorder: Color = JBColor.border()
    val accent: Color = JBUI.CurrentTheme.Focus.focusColor()
    val muted: Color get() = UIUtil.getContextHelpForeground()
    val added: Color get() = FileStatus.ADDED.color ?: UIUtil.getLabelSuccessForeground()

    // Not FileStatus.DELETED: the VCS greys a deleted file, and a count of removed lines must not read as muted.
    val removed: Color get() = UIUtil.getErrorForeground()
    val running: Color get() = accent
    val selected: Color get() = UIUtil.getListSelectionBackground(true)

    /**
     * A card that waits for an answer: the panel's colour (a dialog's) lifted off the editor's, in the theme's accent
     * line. The info banner's fill was tried first: its blue drowned the buttons.
     */
    val pendingFill: Color get() = UIUtil.getPanelBackground()
    val pendingLine: Color get() = accent

    /** The space between two rows of the conversation, and above a row that starts a message (unscaled). */
    const val ROW_GAP = 6
    const val MESSAGE_GAP = 16

    /**
     * The one corner of every box the plugin paints itself (unscaled): the user's message, a card, a subject, a diff,
     * the composer and its chips. `JBUI.CurrentTheme.Component` has no arc in 262, so it is the IDE's usual 8.
     */
    const val ARC = 8

    /** The padding inside a box (unscaled): a card, the user's message, a subject, the composer. */
    const val PAD_V = 8
    const val PAD_H = 12

    /** The space at the panel's left and right edges (unscaled): the composer, the running list, the header, bars. */
    const val INSET = 10

    /** How far the lines under a heading are indented (unscaled). */
    const val INDENT = 18

    /**
     * The editor's font at the label's size: tool lines, subjects and diffs are code, but no bigger than the reply
     * around them when the editor's font is set larger.
     */
    val mono: Font
        get() =
            JBFont.create(
                // checkUi: allow raw-size-colour — the editor's family needs a Font; its size is the label's, scaled
                Font(
                    EditorColorsManager.getInstance().globalScheme.editorFontName,
                    Font.PLAIN,
                    JBUI.Fonts.label().size,
                ),
                false,
            )

    /** A tool's state as the IDE shows a run's: spinning while it runs, the success and error icons after. */
    fun stateIcon(state: ToolLineState): Icon =
        when (state) {
            ToolLineState.RUNNING -> AnimatedIcon.Default.INSTANCE
            ToolLineState.OK -> AllIcons.Status.Success
            ToolLineState.ERROR -> AllIcons.General.Error
        }

    /** A tool's state in words, for its tooltip and a screen reader. */
    fun stateWord(state: ToolLineState): String =
        when (state) {
            ToolLineState.RUNNING -> ClostaBundle.message("thread.tool.running")
            ToolLineState.OK -> ClostaBundle.message("thread.tool.done")
            ToolLineState.ERROR -> ClostaBundle.message("mcp.status.failed")
        }

    /** The label of a tool line and its counts, each with its attributes (the state is an icon of its own). */
    fun pieces(line: ToolLine): List<Pair<String, SimpleTextAttributes>> =
        buildList {
            add(line.label to SimpleTextAttributes.REGULAR_ATTRIBUTES)
            line.added?.let { add(" +$it" to SimpleTextAttributes(SimpleTextAttributes.STYLE_PLAIN, added)) }
            line.removed?.let { add(" −$it" to SimpleTextAttributes(SimpleTextAttributes.STYLE_PLAIN, removed)) }
        }
}

/** A small circle: filled for the task being worked on, [hollow] for one not started yet. */
class DotIcon(
    private val color: Color,
    private val hollow: Boolean = false,
) : Icon {
    override fun paintIcon(
        c: Component?,
        g: Graphics,
        x: Int,
        y: Int,
    ) {
        val g2 = g.create() as Graphics2D
        try {
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            g2.color = color
            val size = JBUI.scale(DOT)
            val left = x + (iconWidth - size) / 2
            val top = y + (iconHeight - size) / 2
            if (hollow) {
                g2.stroke = BasicStroke(JBUIScale.scale(1f))
                g2.drawOval(left, top, size - 1, size - 1)
            } else {
                g2.fillOval(left, top, size, size)
            }
        } finally {
            g2.dispose()
        }
    }

    override fun getIconWidth(): Int = JBUI.scale(BOX)

    override fun getIconHeight(): Int = JBUI.scale(BOX)

    private companion object {
        const val DOT = 7
        const val BOX = 12
    }
}
