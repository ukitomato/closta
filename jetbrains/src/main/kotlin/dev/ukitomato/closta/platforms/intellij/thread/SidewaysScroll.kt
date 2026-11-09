package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.ui.components.JBScrollPane
import java.awt.Component
import java.awt.event.MouseWheelEvent
import javax.swing.SwingUtilities

/**
 * A scroll pane for a box inside the conversation (a code block, a diff, a tool's output): the vertical wheel goes on
 * to the conversation, so reading never stops at a box; only Shift+wheel (a trackpad's sideways swipe comes as one)
 * moves the box itself, sideways. Its bars overlap the box's content, inside its rounded edge.
 */
internal open class SidewaysScroll(
    view: Component,
    vertical: Int,
    horizontal: Int,
) : JBScrollPane(view, vertical, horizontal) {
    init {
        setOverlappingScrollBar(true)
    }

    override fun processMouseWheelEvent(e: MouseWheelEvent) {
        val up = parent
        if (e.isShiftDown || up == null) {
            super.processMouseWheelEvent(e)
        } else {
            up.dispatchEvent(SwingUtilities.convertMouseEvent(this, e, up))
            e.consume()
        }
    }
}
