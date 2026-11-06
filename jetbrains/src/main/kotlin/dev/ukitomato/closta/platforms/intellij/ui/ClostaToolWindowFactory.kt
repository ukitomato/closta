package dev.ukitomato.closta.platforms.intellij.ui

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ex.ToolWindowEx
import com.intellij.ui.SimpleTextAttributes
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.chat.Placement
import dev.ukitomato.closta.platforms.intellij.chat.openNewChat
import dev.ukitomato.closta.platforms.intellij.chat.sidebarTitleActions

/**
 * The right tool window, "Closta": each conversation opened in the sidebar is a tab of its own; with none, it says so
 * and offers a new one. The sessions and the MCP servers live in the bottom window (`SessionsToolWindowFactory`).
 */
class ClostaToolWindowFactory :
    ToolWindowFactory,
    DumbAware {
    override fun createToolWindowContent(
        project: Project,
        toolWindow: ToolWindow,
    ) {
        // "+" and its ▾ are there before any conversation is: the sidebar can be started from itself.
        sidebarTitleActions(project, toolWindow)
        (toolWindow as? ToolWindowEx)?.emptyText?.apply {
            text = ClostaBundle.message("toolwindow.empty")
            appendLine(ClostaBundle.message("chat.newChat.inSidebar"), SimpleTextAttributes.LINK_PLAIN_ATTRIBUTES) {
                openNewChat(project, Placement.SIDEBAR)
            }
            appendLine(ClostaBundle.message("chat.newChat.inEditorTab"), SimpleTextAttributes.LINK_PLAIN_ATTRIBUTES) {
                openNewChat(project, Placement.EDITOR_TAB)
            }
        }
    }
}
