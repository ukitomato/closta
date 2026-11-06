package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.ide.impl.ProjectUtil
import com.intellij.openapi.components.service
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.content.Content
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.content.ContentManager
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.session.SessionOpening

/** Where a conversation is shown: an editor tab (Claude mainly writes) or the sidebar (the user mainly writes). */
enum class Placement { EDITOR_TAB, SIDEBAR }

const val TOOL_WINDOW_ID = "Closta"

/** Shows the open session [sessionId] at [placement]; false when it could not be shown there. */
fun openChat(
    project: Project,
    sessionId: String,
    placement: Placement,
): Boolean {
    val source = project.service<ChatSessions>().source(sessionId) ?: return false
    return when (placement) {
        Placement.EDITOR_TAB -> {
            val editors = FileEditorManager.getInstance(project)
            val file = openTab(project, sessionId) ?: ChatVirtualFile(sessionId, source.title)
            editors.openFile(file, true).isNotEmpty()
        }
        Placement.SIDEBAR -> openInSidebar(project, source)
    }
}

/** Moves the session [sessionId] to [placement] and closes the place it was in ([closeOld]) once it is there. */
fun moveChatTo(
    project: Project,
    sessionId: String,
    placement: Placement,
    closeOld: () -> Unit,
) {
    project.service<ChatSessions>().move(sessionId, { openChat(project, sessionId, placement) }, closeOld)
}

/** Opens a new session (in [workingDirectory], else the project's folder) and shows it at [placement]. */
fun openNewChat(
    project: Project,
    placement: Placement,
    opening: SessionOpening = SessionOpening.New,
    title: String = ClostaBundle.message("chat.newChat.title"),
    workingDirectory: String? = null,
) {
    val id = project.service<ChatSessions>().open(opening, title, workingDirectory)
    // A session no place could show would run unseen: it is stopped.
    if (!openChat(project, id, placement)) project.service<ChatSessions>().stop(id)
}

private fun openInSidebar(
    project: Project,
    source: ChatSource,
): Boolean {
    val window = ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID) ?: return false
    val sessions = project.service<ChatSessions>()
    val parent = Disposer.newDisposable("Closta chat ${source.sessionId}")
    val lease = sessions.lease(source.sessionId)
    val content = ContentFactory.getInstance().createContent(null, source.title, false)
    val panel =
        ChatPanel(
            project,
            source,
            object : ChatPlace {
                override val placement = Placement.SIDEBAR

                override fun move(to: Placement) = moveChatTo(project, source.sessionId, to, ::close)

                override fun close() {
                    window.contentManager.removeContent(content, true)
                }

                override fun retitle(title: String) {
                    content.displayName = chatTabTitle(title)
                    content.description = title
                }
            },
            lease,
            parent,
        )
    // Returns the lease when the sidebar tab goes (the order among the parent's children does not matter: EDT only).
    Disposer.register(parent) { lease.release() }
    content.component = panel
    content.setDisposer(parent)
    content.preferredFocusableComponent = panel.preferredFocus()
    window.contentManager.addContent(content)
    window.contentManager.setSelectedContent(content)
    window.show()
    return true
}

/** The editor tab that shows [sessionId] now, if one does. */
private fun openTab(
    project: Project,
    sessionId: String,
): ChatVirtualFile? =
    FileEditorManager
        .getInstance(project)
        .openFiles
        .filterIsInstance<ChatVirtualFile>()
        .firstOrNull { it.sessionId == sessionId }

/** The sidebar tab that shows [sessionId] now, if one does. */
private fun sidebarTab(
    contents: ContentManager,
    sessionId: String,
): Content? = contents.contents.firstOrNull { (it.component as? ChatPanel)?.sessionId == sessionId }

/**
 * Where [sessionId] is shown in [project] now, looked up as [bringAndShow] does (an editor tab, then the sidebar); null
 * when nowhere. Creates no tool window content.
 */
fun shownAt(
    project: Project,
    sessionId: String,
): Placement? {
    if (project.isDisposed) return null
    val contents = ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID)?.contentManagerIfCreated
    return when {
        openTab(project, sessionId) != null -> Placement.EDITOR_TAB
        contents != null && sidebarTab(contents, sessionId) != null -> Placement.SIDEBAR
        else -> null
    }
}

/**
 * Brings the window of [project] to the front and shows [sessionId] there: at [placement] when one is given, else in
 * the place that already shows it (an editor tab, then the sidebar), else in a new editor tab.
 */
fun bringAndShow(
    project: Project,
    sessionId: String,
    placement: Placement? = null,
): Boolean {
    ProjectUtil.focusProjectWindow(project, true)
    val tab = openTab(project, sessionId)
    val window = ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID)
    val content = window?.contentManager?.let { sidebarTab(it, sessionId) }
    return when {
        placement != null -> openChat(project, sessionId, placement)
        tab != null -> FileEditorManager.getInstance(project).openFile(tab, true).isNotEmpty()
        window != null && content != null -> {
            window.contentManager.setSelectedContent(content)
            window.show()
            true
        }
        else -> openChat(project, sessionId, Placement.EDITOR_TAB)
    }
}
