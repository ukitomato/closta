package dev.ukitomato.closta.platforms.intellij.composer

import com.intellij.icons.AllIcons
import com.intellij.ide.ui.laf.darcula.DarculaUIUtil
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.Presentation
import com.intellij.openapi.actionSystem.impl.ActionButtonWithText
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.ui.popup.IconButton
import com.intellij.ui.InplaceButton
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBLabel
import com.intellij.ui.scale.JBUIScale
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.thread.ThreadStyle
import dev.ukitomato.closta.platforms.intellij.ui.noHtml
import dev.ukitomato.closta.platforms.intellij.ui.plainTip
import java.awt.BasicStroke
import java.awt.BorderLayout
import java.awt.Color
import java.awt.FlowLayout
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.event.FocusAdapter
import java.awt.event.FocusEvent
import java.awt.event.KeyEvent
import javax.swing.AbstractAction
import javax.swing.Icon
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.KeyStroke
import javax.swing.SwingConstants

/**
 * A toolbar button: the IDE's [ActionButtonWithText] around one action, so it takes the keyboard (Tab, then Space or
 * Enter), draws the theme's hover, press, focus and disabled looks, and names itself to a screen reader. A chevron
 * follows the text when it opens a list. With no text it is an icon button (send, stop, attach). [onClick] gets the
 * button on the screen, for a popup to open under it.
 */
class ToolbarButton(
    text: String?,
    icon: Icon?,
    private val opensList: Boolean,
    private val onClick: (JComponent) -> Unit,
) : JComponent() {
    private val presentation = Presentation()
    private val button = Button(Press(), presentation)
    private var tip: String? = null

    var text: String? = text
        set(value) {
            field = value
            presentation.setText(value.orEmpty(), false)
            showTip()
        }
    var icon: Icon? = icon
        set(value) {
            field = value
            presentation.icon = value
        }
    var enabledToClick: Boolean = true
        set(value) {
            field = value
            presentation.isEnabled = value
            showTip()
        }

    /** Why it cannot be pressed now, shown as its tooltip while [enabledToClick] is off; `null` keeps the tooltip. */
    var disabledReason: String? = null
        set(value) {
            field = value
            showTip()
        }

    /** More to say after its name in the tooltip (not in its accessible name, which stays the name). */
    var hint: String? = null
        set(value) {
            field = value
            showTip()
        }
    var normal: Color = UIUtil.getLabelForeground()
        set(value) {
            field = value
            button.foreground = value
        }

    init {
        layout = BorderLayout()
        isOpaque = false
        presentation.setText(text.orEmpty(), false)
        presentation.icon = icon
        add(button, BorderLayout.CENTER)
    }

    /** Presses it as a click would, when it can be pressed. */
    fun click() = button.click()

    override fun setToolTipText(text: String?) {
        tip = text
        showTip()
    }

    override fun getToolTipText(): String? = tip

    private fun showTip() {
        val shown = disabledReason?.takeIf { !enabledToClick } ?: listOfNotNull(tip, hint).joinToString(" — ")
        presentation.description = plainTip(shown).orEmpty()
        button.accessibleContext.accessibleName = text?.takeIf { it.isNotEmpty() } ?: tip
        button.accessibleContext.accessibleDescription = shown
    }

    private inner class Press : DumbAwareAction() {
        override fun getActionUpdateThread() = ActionUpdateThread.EDT

        override fun update(e: AnActionEvent) {
            e.presentation.isEnabled = enabledToClick
        }

        override fun actionPerformed(e: AnActionEvent) {
            if (enabledToClick) onClick(button)
        }
    }

    private inner class Button(
        action: AnAction,
        presentation: Presentation,
    ) : ActionButtonWithText(action, presentation, PLACE, ActionToolbar.DEFAULT_MINIMUM_BUTTON_SIZE) {
        init {
            isFocusable = true
            setHorizontalTextPosition(SwingConstants.LEFT)
            // ActionButton presses itself on Space (released); Enter is the one key it lacks.
            getInputMap(WHEN_FOCUSED).put(KeyStroke.getKeyStroke(KeyEvent.VK_ENTER, 0), PRESS)
            actionMap.put(
                PRESS,
                object : AbstractAction() {
                    override fun actionPerformed(e: java.awt.event.ActionEvent) = click()
                },
            )
            addFocusListener(
                object : FocusAdapter() {
                    override fun focusGained(e: FocusEvent) = repaint()

                    override fun focusLost(e: FocusEvent) = repaint()
                },
            )
        }

        override fun shallPaintDownArrow(): Boolean = opensList

        override fun paintComponent(g: Graphics) {
            super.paintComponent(g)
            if (isFocusOwner) {
                val g2 = g.create() as Graphics2D
                try {
                    DarculaUIUtil.paintFocusBorder(g2, width, height, JBUI.scale(ThreadStyle.ARC).toFloat(), true)
                } finally {
                    g2.dispose()
                }
            }
        }
    }

    private companion object {
        const val PLACE = "ClostaToolbarButton"
        const val PRESS = "closta.press"
    }
}

/**
 * A context chip: an icon, a name and a close button in a rounded line. A [dashed] chip was put there by the composer
 * (the current file); a solid one by the user. [remove] is what its close button does (and Backspace on an empty
 * composer, for the last chip).
 */
class Chip(
    icon: Icon,
    name: String,
    tooltip: String?,
    private val dashed: Boolean,
    val remove: () -> Unit,
) : JPanel(FlowLayout(FlowLayout.LEFT, JBUI.scale(GAP), 0)) {
    init {
        isOpaque = false
        border = JBUI.Borders.empty(1, PAD_LEFT, 1, PAD_RIGHT)
        getAccessibleContext().accessibleName = name
        add(JBLabel(name, icon, JBLabel.LEFT).noHtml().apply { toolTipText = plainTip(tooltip) })
        add(
            InplaceButton(
                IconButton(
                    ClostaBundle.message("composer.chip.remove"),
                    AllIcons.Actions.Close,
                    AllIcons.Actions.CloseHovered,
                ),
            ) { remove() },
        )
    }

    override fun paintComponent(g: Graphics) {
        val g2 = g.create() as Graphics2D
        try {
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            g2.color = JBColor.border()
            if (dashed) {
                g2.stroke =
                    BasicStroke(
                        JBUIScale.scale(1f),
                        BasicStroke.CAP_BUTT,
                        BasicStroke.JOIN_ROUND,
                        1f,
                        floatArrayOf(JBUIScale.scale(DASH), JBUIScale.scale(DASH)),
                        0f,
                    )
            }
            val arc = JBUI.scale(ThreadStyle.ARC)
            g2.drawRoundRect(0, 0, width - 1, height - 1, arc, arc)
        } finally {
            g2.dispose()
        }
    }

    private companion object {
        const val GAP = 2
        const val PAD_LEFT = 6
        const val PAD_RIGHT = 2
        const val DASH = 3f
    }
}

/**
 * The rounded box around the composer: the one frame the input has. While the input has the keyboard the IDE's focus
 * ring is drawn around it, outside its line, as around any text field; room for the ring is kept all the time so the
 * box never moves.
 */
class ComposerBox : JPanel() {
    var focused: Boolean = false
        set(value) {
            field = value
            repaint()
        }

    /** Files are dragged over it: its line is dashed, as a drop place. */
    var dragging: Boolean = false
        set(value) {
            field = value
            repaint()
        }

    init {
        isOpaque = false
        val ring = DarculaUIUtil.BW.get()
        border = JBUI.Borders.empty(ThreadStyle.PAD_V + ring, ThreadStyle.PAD_H + ring)
    }

    override fun paintComponent(g: Graphics) {
        val g2 = g.create() as Graphics2D
        try {
            g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            val arc = JBUI.scale(ThreadStyle.ARC)
            val ring = DarculaUIUtil.BW.get()
            g2.color = UIUtil.getTextFieldBackground()
            g2.fillRoundRect(ring, ring, width - 2 * ring - 1, height - 2 * ring - 1, arc, arc)
            g2.color = if (dragging) JBUI.CurrentTheme.Focus.focusColor() else JBColor.border()
            if (dragging) {
                g2.stroke =
                    BasicStroke(
                        JBUIScale.scale(1f),
                        BasicStroke.CAP_BUTT,
                        BasicStroke.JOIN_ROUND,
                        1f,
                        floatArrayOf(JBUIScale.scale(DASH), JBUIScale.scale(DASH)),
                        0f,
                    )
            }
            g2.drawRoundRect(ring, ring, width - 2 * ring - 1, height - 2 * ring - 1, arc, arc)
            if (focused) DarculaUIUtil.paintFocusBorder(g2, width, height, (arc + ring).toFloat(), true)
        } finally {
            g2.dispose()
        }
    }

    private companion object {
        const val DASH = 4f
    }
}

/** The fixed-height line under the composer: empty, or what happened (red for what was refused). */
class StatusLine : JBLabel(" ") {
    init {
        noHtml()
        border = JBUI.Borders.empty(2, PAD)
        foreground = UIUtil.getContextHelpForeground()
        font = JBUI.Fonts.smallFont()
    }

    fun say(
        text: String?,
        error: Boolean = false,
    ) {
        this.text = text ?: " "
        // The line is one line high and cuts what is longer; the whole text is its tooltip.
        toolTipText = plainTip(text)
        foreground = if (error) UIUtil.getErrorForeground() else UIUtil.getContextHelpForeground()
    }

    /** The line keeps one line's height whatever it says, so the composer never moves when it changes. */
    override fun getPreferredSize() =
        super.getPreferredSize().also {
            it.height =
                getFontMetrics(font).height + JBUI.scale(PAD)
        }

    private companion object {
        const val PAD = 4
    }
}

/** Gives [component] a tooltip and returns it, for short builders. */
fun <T : JComponent> T.tip(text: String): T = apply { toolTipText = text }

/**
 * The share of the context used, as a small ring and the percentage: a label, not a button (nothing happens on a
 * click), and not on the Tab path. From [WARN_AT] percent the ring takes the theme's warning colour.
 */
class ContextUse : JBLabel() {
    private var percentage = 0.0

    init {
        foreground = UIUtil.getContextHelpForeground()
        border = JBUI.Borders.empty(0, PAD)
        isFocusable = false
        icon = Ring()
    }

    fun show(percentage: Double) {
        this.percentage = percentage
        text = "${percentage.toInt()}%"
        repaint()
    }

    private inner class Ring : Icon {
        override fun getIconWidth() = JBUI.scale(SIZE)

        override fun getIconHeight() = JBUI.scale(SIZE)

        override fun paintIcon(
            c: java.awt.Component?,
            g: Graphics,
            x: Int,
            y: Int,
        ) {
            val g2 = g.create() as Graphics2D
            try {
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                val line = JBUIScale.scale(2f)
                val size = iconWidth - line
                val left = x + line / 2
                val top = y + line / 2
                g2.stroke = BasicStroke(line)
                g2.color = JBColor.border()
                g2.draw(
                    java.awt.geom.Ellipse2D
                        .Float(left, top, size, size),
                )
                g2.color =
                    if (percentage >= WARN_AT) {
                        JBUI.CurrentTheme.Banner.WARNING_BORDER_COLOR
                    } else {
                        UIUtil.getContextHelpForeground()
                    }
                val sweep = -(percentage.coerceIn(0.0, FULL) / FULL * DEGREES)
                g2.draw(
                    java.awt.geom.Arc2D
                        .Float(left, top, size, size, START, sweep.toFloat(), java.awt.geom.Arc2D.OPEN),
                )
            } finally {
                g2.dispose()
            }
        }
    }

    private companion object {
        const val WARN_AT = 80.0
        const val FULL = 100.0
        const val DEGREES = 360.0
        const val START = 90f
        const val SIZE = 12
        const val PAD = 4
    }
}
