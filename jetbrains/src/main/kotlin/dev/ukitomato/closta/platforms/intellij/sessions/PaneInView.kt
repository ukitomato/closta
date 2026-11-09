package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import dev.ukitomato.closta.platforms.intellij.chat.ViewLeases
import dev.ukitomato.closta.platforms.intellij.chat.screenInView
import java.awt.Window
import java.awt.event.HierarchyEvent
import java.awt.event.HierarchyListener
import java.awt.event.WindowAdapter
import java.awt.event.WindowEvent
import javax.swing.JComponent
import javax.swing.SwingUtilities

/**
 * Tells the lease of the session the detail [pane] shows whether the pane is in view: shown, its tool window visible,
 * in the active window (as a conversation's screen does). Seen there, the session is read and its notifications stay
 * quiet. [cameIntoView] is told each time the pane is shown again.
 */
internal class PaneInView(
    private val pane: JComponent,
    private val toolWindow: ToolWindow,
    private val cameIntoView: () -> Unit,
    parent: Disposable,
) {
    private var lease: ViewLeases.Lease? = null
    private var window: Window? = null

    private val activation =
        object : WindowAdapter() {
            override fun windowActivated(event: WindowEvent) = report()

            override fun windowDeactivated(event: WindowEvent) = report()
        }

    private val hierarchy =
        HierarchyListener { event ->
            if (event.changeFlags and HierarchyEvent.SHOWING_CHANGED.toLong() != 0L) {
                window?.removeWindowListener(activation)
                window = if (pane.isShowing) SwingUtilities.getWindowAncestor(pane) else null
                window?.addWindowListener(activation)
                if (pane.isShowing) cameIntoView()
                report()
            }
        }

    init {
        pane.addHierarchyListener(hierarchy)
        Disposer.register(parent) {
            pane.removeHierarchyListener(hierarchy)
            window?.removeWindowListener(activation)
        }
    }

    /** Holds [lease] (the shown session's), returning the one held before; null holds none. */
    fun hold(lease: ViewLeases.Lease?) {
        this.lease?.release()
        this.lease = lease
        report()
    }

    private fun report() {
        val active = SwingUtilities.getWindowAncestor(pane)?.isActive == true
        lease?.visible(screenInView(pane.isShowing && toolWindow.isVisible, active))
    }
}
