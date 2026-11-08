package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.openapi.components.serviceIfCreated
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.content.ContentManagerEvent
import com.intellij.ui.content.ContentManagerListener
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.chat.ChatDirectory
import dev.ukitomato.closta.platforms.intellij.chat.McpPanel

/** The id of the bottom tool window (plugin.xml) that lists the sessions of every open project. */
const val SESSIONS_TOOL_WINDOW_ID = "Closta.Sessions"

/**
 * The bottom Closta tool window: a Sessions tab (the sessions tree and the detail pane) and an MCP tab (the MCP servers
 * of the conversation last in view, asked for again each time the tab is chosen).
 */
class SessionsToolWindowFactory :
    ToolWindowFactory,
    DumbAware {
    // The badge is put on as soon as the window is registered, before anyone opens it.
    override fun init(toolWindow: ToolWindow) {
        serviceIfCreated<ChatDirectory>()?.let { badge(toolWindow, waitingCount(it.entries.value)) }
    }

    override fun createToolWindowContent(
        project: Project,
        toolWindow: ToolWindow,
    ) {
        val parent = Disposer.newDisposable("Closta sessions window")
        val panel = SessionsWindowPanel(project, toolWindow, parent)
        val content =
            ContentFactory.getInstance().createContent(panel, ClostaBundle.message("toolwindow.tab.sessions"), false)
        content.preferredFocusableComponent = panel.preferredFocus()
        content.setDisposer(parent)
        content.isCloseable = false
        toolWindow.contentManager.addContent(content)

        val mcpParent = Disposer.newDisposable("Closta MCP")
        val mcp = McpPanel(project, mcpParent)
        val mcpContent =
            ContentFactory.getInstance().createContent(mcp, ClostaBundle.message("toolwindow.tab.mcp"), false)
        mcpContent.setDisposer(mcpParent)
        mcpContent.isCloseable = false
        toolWindow.contentManager.addContent(mcpContent)
        toolWindow.contentManager.addContentManagerListener(
            object : ContentManagerListener {
                override fun selectionChanged(event: ContentManagerEvent) {
                    if (event.operation == ContentManagerEvent.ContentOperation.add && event.content == mcpContent) {
                        mcp.refresh()
                    }
                }
            },
        )
        toolWindow.contentManager.setSelectedContent(content)
        serviceIfCreated<ChatDirectory>()?.let { badge(toolWindow, waitingCount(it.entries.value)) }
    }
}
