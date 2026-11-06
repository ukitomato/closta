package dev.ukitomato.closta.platforms.intellij.thread

import java.awt.Container
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JComponent
import javax.swing.SwingUtilities

/**
 * Tells [changed] when the mouse comes over [root] (true) and leaves it (false), its children included: a child that
 * takes the mouse does not count as leaving. Call it after [root]'s children are in place.
 */
fun onHover(
    root: JComponent,
    changed: (Boolean) -> Unit,
) {
    val hover =
        object : MouseAdapter() {
            override fun mouseEntered(e: MouseEvent) = changed(true)

            override fun mouseExited(e: MouseEvent) {
                val at = SwingUtilities.convertPoint(e.component, e.point, root)
                if (!root.contains(at)) changed(false)
            }
        }

    fun listen(component: java.awt.Component) {
        component.addMouseListener(hover)
        (component as? Container)?.components?.forEach(::listen)
    }
    listen(root)
}
