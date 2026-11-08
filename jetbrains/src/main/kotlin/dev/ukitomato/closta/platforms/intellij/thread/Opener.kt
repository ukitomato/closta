package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.ide.ui.laf.darcula.DarculaUIUtil
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Container
import java.awt.Cursor
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.Rectangle
import java.awt.event.FocusAdapter
import java.awt.event.FocusEvent
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.accessibility.AccessibleContext
import javax.accessibility.AccessibleRole
import javax.accessibility.AccessibleState
import javax.accessibility.AccessibleStateSet
import javax.swing.Icon
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.SwingUtilities

/**
 * A row's header that does something when pressed (opens or closes the row, opens a sub-agent): [arrow] when it opens,
 * then [line]. The mouse presses it anywhere on it, the keyboard reaches it with Tab and presses it with Enter or
 * Space, and it draws the IDE's focus ring while it has the keyboard. [name] is what a screen reader says.
 */
internal class Opener(
    line: JComponent,
    arrow: Icon?,
    name: String,
    private val press: () -> Unit,
    /** Whether the row it opens is open; null when it opens something else (a sub-agent), which is no state. */
    private val expanded: Boolean? = null,
    /** It left the screen while it had the keyboard (its row was made again): the row's keeper passes it on. */
    private val dropped: (Opener) -> Unit = {},
) : JPanel(BorderLayout(JBUI.scale(GAP), 0)) {
    private var toggleContext: AccessibleContext? = null

    init {
        isOpaque = false
        isFocusable = true
        cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
        border = JBUI.Borders.empty(RING)
        arrow?.let { add(JBLabel(it), BorderLayout.WEST) }
        add(line, BorderLayout.CENTER)
        getAccessibleContext().accessibleName = name
        val mouse =
            object : MouseAdapter() {
                // checkUi: allow clickable-label — Tab reaches it, Enter or Space press it, it is named, it has a ring
                override fun mouseClicked(e: MouseEvent) {
                    if (SwingUtilities.isLeftMouseButton(e)) press()
                }
            }

        // The line's parts take the mouse for their tooltips: each of them listens too.
        fun listen(component: java.awt.Component) {
            component.addMouseListener(mouse)
            (component as? Container)?.components?.forEach(::listen)
        }
        listen(this)
        addKeyListener(
            object : KeyAdapter() {
                override fun keyPressed(e: KeyEvent) {
                    if (e.modifiersEx == 0 && (e.keyCode == KeyEvent.VK_ENTER || e.keyCode == KeyEvent.VK_SPACE)) {
                        press()
                        e.consume()
                    }
                }
            },
        )
        addFocusListener(
            object : FocusAdapter() {
                // Tab can reach a header made ahead below the view: the view comes to it.
                override fun focusGained(e: FocusEvent) {
                    repaint()
                    scrollRectToVisible(Rectangle(0, 0, width, height))
                }

                override fun focusLost(e: FocusEvent) = repaint()
            },
        )
    }

    override fun getAccessibleContext(): AccessibleContext =
        toggleContext ?: newToggleContext().also { toggleContext = it }

    private fun newToggleContext(): AccessibleContext =
        object : AccessibleJPanel() {
            override fun getAccessibleRole(): AccessibleRole = AccessibleRole.TOGGLE_BUTTON

            override fun getAccessibleStateSet(): AccessibleStateSet =
                super.getAccessibleStateSet().apply {
                    when (expanded) {
                        true -> add(AccessibleState.EXPANDED)
                        false -> add(AccessibleState.COLLAPSED)
                        null -> Unit
                    }
                }
        }

    override fun removeNotify() {
        val had = isFocusOwner
        super.removeNotify()
        if (had) dropped(this)
    }

    override fun paintChildren(g: Graphics) {
        super.paintChildren(g)
        if (!isFocusOwner) return
        val g2 = g.create() as Graphics2D
        try {
            DarculaUIUtil.paintFocusBorder(g2, width, height, JBUI.scale(ThreadStyle.ARC).toFloat(), true)
        } finally {
            g2.dispose()
        }
    }

    private companion object {
        const val GAP = 4
        const val RING = 2
    }
}
