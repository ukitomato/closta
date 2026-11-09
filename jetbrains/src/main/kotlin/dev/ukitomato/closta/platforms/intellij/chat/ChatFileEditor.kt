package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.ide.FileIconProvider
import com.intellij.openapi.components.service
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.fileEditor.ex.FileEditorManagerEx
import com.intellij.openapi.fileEditor.impl.EditorTabTitleProvider
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.util.text.HtmlChunk
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.LightVirtualFile
import com.intellij.ui.components.ActionLink
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.panels.VerticalLayout
import com.intellij.util.ui.JBUI
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.ClostaIcons
import dev.ukitomato.closta.platforms.intellij.session.SessionOpening
import java.awt.GridBagLayout
import java.beans.PropertyChangeListener
import javax.swing.Icon
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.SwingConstants

/**
 * The file an editor tab of a conversation stands for: the session it shows, by id. Its tab is named [shownTitle]
 * ([ChatTabTitles]), which follows the conversation's first request; the file's own name stays what it was opened as.
 */
class ChatVirtualFile(
    val sessionId: String,
    title: String,
) : LightVirtualFile(title) {
    @Volatile
    var shownTitle: String = title

    init {
        isWritable = false
    }
}

/** Shows the Closta tower on a conversation's editor tab (it has no extension, so the IDE would show plain text's). */
class ChatTabIcons :
    FileIconProvider,
    DumbAware {
    override fun getIcon(
        file: VirtualFile,
        flags: Int,
        project: Project?,
    ): Icon? = if (file is ChatVirtualFile) ClostaIcons.Closta else null
}

/** Names a conversation's editor tab after the conversation, and gives the whole title as its tooltip. */
class ChatTabTitles :
    EditorTabTitleProvider,
    DumbAware {
    override fun getEditorTabTitle(
        project: Project,
        file: VirtualFile,
    ): String? = (file as? ChatVirtualFile)?.let { chatTabTitle(it.shownTitle) }

    override fun getEditorTabTooltipHtml(
        project: Project,
        virtualFile: VirtualFile,
    ): HtmlChunk? = (virtualFile as? ChatVirtualFile)?.let { HtmlChunk.text(it.shownTitle) }
}

/** Opens a [ChatVirtualFile] as a conversation in an editor tab. The tab leases its session while it is open. */
class ChatFileEditorProvider :
    FileEditorProvider,
    DumbAware {
    override fun accept(
        project: Project,
        file: VirtualFile,
    ): Boolean = file is ChatVirtualFile

    override fun acceptRequiresReadAction(): Boolean = false

    override fun createEditor(
        project: Project,
        file: VirtualFile,
    ): FileEditor = ChatFileEditor(project, file as ChatVirtualFile)

    override fun getEditorTypeId(): String = "closta-chat"

    override fun getPolicy(): FileEditorPolicy = FileEditorPolicy.HIDE_DEFAULT_EDITOR
}

private class ChatFileEditor(
    project: Project,
    private val chat: ChatVirtualFile,
) : UserDataHolderBase(),
    FileEditor {
    private val sessions = project.service<ChatSessions>()
    private val lease = sessions.lease(chat.sessionId)
    private val panel: JComponent
    private val focus: JComponent?

    init {
        val source = sessions.source(chat.sessionId)
        if (source == null) {
            // The session ended while the tab was away (the IDE reopening tabs it remembered): it can be resumed.
            val resume =
                ActionLink(ClostaBundle.message("chat.ended.resume")) {
                    // Closed first: the resumed session keeps this id, and an open tab of it would be taken as its own.
                    FileEditorManager.getInstance(project).closeFile(chat)
                    // A worktree's conversation left a mark with its folder when it stopped: it is resumed there, as
                    // the list resumes it. With no mark, in the project's folder.
                    val folder = project.wasRunningMarks()[chat.sessionId]?.workingDirectory
                    openNewChat(
                        project,
                        Placement.EDITOR_TAB,
                        SessionOpening.Resume(chat.sessionId),
                        chat.name,
                        folder,
                    )
                }
            panel =
                JPanel(GridBagLayout()).apply {
                    val column =
                        JPanel(VerticalLayout(JBUI.scale(GAP), SwingConstants.CENTER)).apply {
                            isOpaque = false
                            add(JBLabel(ClostaBundle.message("chat.ended")))
                            add(resume)
                        }
                    add(column)
                }
            focus = resume
        } else {
            val chatPanel =
                ChatPanel(project, source, EditorTabPlace(project, chat), lease, this)
            panel = chatPanel
            focus = chatPanel.preferredFocus()
        }
    }

    override fun getComponent(): JComponent = panel

    override fun getPreferredFocusedComponent(): JComponent? = focus

    override fun getName(): String = "Closta"

    override fun getFile(): VirtualFile = chat

    override fun setState(state: FileEditorState) = Unit

    override fun isModified(): Boolean = false

    override fun isValid(): Boolean = true

    override fun addPropertyChangeListener(listener: PropertyChangeListener) = Unit

    override fun removePropertyChangeListener(listener: PropertyChangeListener) = Unit

    override fun dispose() = lease.release()
}

private class EditorTabPlace(
    private val project: Project,
    private val chat: ChatVirtualFile,
) : ChatPlace {
    override val placement = Placement.EDITOR_TAB

    override fun move(to: Placement) = moveChatTo(project, chat.sessionId, to, ::close)

    override fun close() = FileEditorManager.getInstance(project).closeFile(chat)

    override fun retitle(title: String) {
        chat.shownTitle = title
        FileEditorManagerEx.getInstanceEx(project).updateFilePresentation(chat)
    }
}

private const val GAP = 8
