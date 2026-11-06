package dev.ukitomato.closta.platforms.intellij.bench

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.util.ui.UIUtil
import dev.ukitomato.closta.platforms.intellij.sessions.SESSIONS_TOOL_WINDOW_ID
import dev.ukitomato.closta.platforms.intellij.sessions.SessionDetailPanel
import dev.ukitomato.closta.platforms.intellij.sessions.SessionsWindowPanel
import java.awt.Component
import java.awt.KeyboardFocusManager
import java.awt.event.KeyEvent
import javax.swing.JScrollPane
import javax.swing.JTree
import javax.swing.SwingUtilities

/**
 * What [SessionsGallery] reaches in the bottom Closta window of [project]: its parts, where the keyboard is, and keys
 * pressed as the user would. EDT only.
 */
internal class SessionsWindowProbe(
    private val project: Project,
) {
    fun window(): ToolWindow? = ToolWindowManager.getInstance(project).getToolWindow(SESSIONS_TOOL_WINDOW_ID)

    fun panel(): SessionsWindowPanel? =
        window()?.contentManagerIfCreated?.contents?.firstNotNullOfOrNull { it.component as? SessionsWindowPanel }

    fun tree(): JTree? = panel()?.preferredFocus() as? JTree

    /** The window with its title bar: the decorator around the content, else the content alone. */
    fun decorated(): Component? {
        val content = window()?.component ?: return null
        return UIUtil.uiParents(content, false).firstOrNull { it.javaClass.simpleName.contains("InternalDecorator") }
            ?: content
    }

    /** The class of the component with the keyboard, and whether it is in the detail pane. */
    fun focusText(): String {
        val owner = KeyboardFocusManager.getCurrentKeyboardFocusManager().focusOwner ?: return "nobody"
        val detail = detail()
        val where = if (detail != null && SwingUtilities.isDescendingFrom(owner, detail)) "in the detail" else "outside"
        return "${owner.javaClass.name} ($where)"
    }

    /** Enter, pressed and released where the keyboard is. */
    fun pressEnter() {
        val owner = KeyboardFocusManager.getCurrentKeyboardFocusManager().focusOwner ?: return
        val now = System.currentTimeMillis()
        owner.dispatchEvent(KeyEvent(owner, KeyEvent.KEY_PRESSED, now, 0, KeyEvent.VK_ENTER, '\n'))
        owner.dispatchEvent(KeyEvent(owner, KeyEvent.KEY_RELEASED, now, 0, KeyEvent.VK_ENTER, '\n'))
    }

    /** Scrolls the detail's body to its end; false when it has nothing to scroll. */
    fun scrollDetailToEnd(): Boolean {
        val bar =
            detail()?.let { detail ->
                UIUtil
                    .uiTraverser(detail)
                    .filter(JScrollPane::class.java)
                    .map { it.verticalScrollBar }
                    .firstOrNull { it.isVisible && it.maximum > it.visibleAmount }
            }
        bar?.value = bar?.maximum ?: 0
        return bar != null
    }

    private fun detail(): SessionDetailPanel? =
        panel()?.let { UIUtil.uiTraverser(it).filter(SessionDetailPanel::class.java).first() }
}
