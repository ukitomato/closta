package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import dev.ukitomato.closta.platforms.intellij.session.SessionOpening
import dev.ukitomato.closta.presenter.view.sessionTitle

/** The conversations the user closed in this project, newest first; the last ones can be opened again. EDT only. */
@Service(Service.Level.PROJECT)
class ClosedChats {
    private var stack = ClosedChatStack()

    fun closed(chat: ClosedChat) {
        stack = stack.closed(chat)
    }

    fun latest(): ClosedChat? = stack.latest()

    fun reopened(hostId: String) {
        stack = stack.reopened(hostId)
    }
}

/** What [source], shown at [placement] in [project], would leave behind if its screen were closed now. */
fun leftViewOf(
    project: Project,
    source: ChatSource,
    placement: Placement,
): LeftView =
    LeftView(
        project.locationHash,
        placement,
        sessionTitle(source.view.value.transcript) ?: source.title,
        source.workingDirectory,
    )

/** Puts what a screen the user closed left onto the stack of the open project it belonged to, if there is one. */
fun rememberClosed(
    sessionId: String,
    left: LeftView?,
) {
    rememberClosedIn(sessionId, left) { hash ->
        openProjectOf(hash)?.let { project ->
            object : ClosedSink {
                override val closing get() = project.service<ChatSessions>().closing

                override fun closed(chat: ClosedChat) = project.service<ClosedChats>().closed(chat)
            }
        }
    }
}

private fun openProjectOf(locationHash: String): Project? =
    ProjectManager.getInstance().openProjects.firstOrNull { !it.isDisposed && it.locationHash == locationHash }

/** Closta: Reopen Closed Conversation: opens the last closed conversation again where it was. */
class ReopenClosedChatAction : DumbAwareAction() {
    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.EDT

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabled = event.project?.service<ClosedChats>()?.latest() != null
    }

    override fun actionPerformed(event: AnActionEvent) {
        val project = event.project ?: return
        val closed = project.service<ClosedChats>()
        val chat = closed.latest() ?: return
        val reopened =
            if (project.service<ChatSessions>().source(chat.hostId) != null) {
                openChat(project, chat.hostId, chat.placement)
            } else {
                resume(project, chat)
            }
        if (reopened) closed.reopened(chat.hostId)
    }

    // The session ended: its conversation is resumed (a new one when nothing was said after a `/clear`).
    private fun resume(
        project: Project,
        chat: ClosedChat,
    ): Boolean {
        val resume = tabResume(chat.hostId, project.clearedTabs(), project.wasRunningMarks())
        val opening = resume.savedId?.let { SessionOpening.Resume(it) } ?: SessionOpening.New
        val folder = resume.workingDirectory ?: chat.workingDirectory
        val opened = runCatching { openNewChat(project, chat.placement, opening, chat.title, folder) }.isSuccess
        if (opened) project.saveClearedTabs(project.clearedTabs() - chat.hostId)
        return opened
    }
}
