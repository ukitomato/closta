package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import dev.ukitomato.closta.platforms.intellij.ClostaBundle.message
import dev.ukitomato.closta.platforms.intellij.chat.ChatDirectory
import dev.ukitomato.closta.platforms.intellij.chat.ChatSessions
import dev.ukitomato.closta.platforms.intellij.chat.Placement
import dev.ukitomato.closta.platforms.intellij.chat.asksBeforeStopping
import dev.ukitomato.closta.platforms.intellij.chat.bringAndShow
import dev.ukitomato.closta.platforms.intellij.chat.clearWasRunningMark
import dev.ukitomato.closta.platforms.intellij.chat.newChatChoices
import dev.ukitomato.closta.platforms.intellij.chat.openNewChat
import dev.ukitomato.closta.platforms.intellij.chat.providerSwitch
import dev.ukitomato.closta.platforms.intellij.chat.resumeChosen
import dev.ukitomato.closta.platforms.intellij.session.SessionOpening
import dev.ukitomato.closta.presenter.view.TITLE_MAX
import javax.swing.JComponent

/**
 * Shows a live session in its own project's window (at [placement], else where it is already shown, else in an editor
 * tab), or resumes a marked one in [project].
 */
fun openItem(
    project: Project,
    item: SessionItem,
    placement: Placement? = null,
) {
    when (item) {
        is SessionItem.Live -> bringAndShow(item.entry.project, item.sessionId, placement)
        is SessionItem.Mark ->
            openNewChat(
                project,
                placement ?: Placement.EDITOR_TAB,
                SessionOpening.Resume(item.sessionId),
                item.title.take(TITLE_MAX),
                item.workingDirectory,
            )
    }
}

/** Ends a live session the way the sessions list always has: it stops, and leaves a mark to resume it by. */
private fun endSession(item: SessionItem) {
    val entry = (item as? SessionItem.Live)?.entry ?: return
    endSession(entry)
}

internal fun endSession(entry: ChatDirectory.Entry) {
    entry.project.service<ChatSessions>().stopFromScreen(entry.sessionId)
}

/**
 * The sessions window's toolbar and the menus of its rows. Each acts on the session [selected] gives when it runs.
 * [marksChanged] is told after a mark was cleared, so the tree drops it.
 */
internal class SessionsActions(
    private val project: Project,
    private val selected: () -> SessionItem?,
    private val marksChanged: () -> Unit,
) {
    private val liveMenu =
        DefaultActionGroup(
            onSelected(message("chat.sessions.openInEditor")) { openItem(project, it, Placement.EDITOR_TAB) },
            onSelected(message("chat.sessions.openInSidebar")) { openItem(project, it, Placement.SIDEBAR) },
            asking(message("chat.sessions.stop"), STOP_QUESTION, ::endSession),
            asking(message("chat.sessions.archive"), ARCHIVE_QUESTION) {
                service<ChatDirectory>().archive(it.sessionId)
            },
        )

    private val markMenu =
        DefaultActionGroup(
            onSelected(message("chat.sessions.resumeInEditor")) { openItem(project, it, Placement.EDITOR_TAB) },
            onSelected(message("chat.sessions.resumeInSidebar")) { openItem(project, it, Placement.SIDEBAR) },
            onSelected(message("chat.sessions.clearMark")) {
                project.clearWasRunningMark(it.sessionId)
                marksChanged()
            },
        )

    /** The toolbar above the tree; its actions take their context from [target]. */
    fun toolbar(target: JComponent): JComponent {
        val group =
            DefaultActionGroup(
                providerSwitch(),
                object : DumbAwareAction(message("chat.newChat"), null, AllIcons.General.Add) {
                    override fun actionPerformed(e: AnActionEvent) = openNewChat(project, Placement.SIDEBAR)
                },
                newChatChoices(project),
                object : DumbAwareAction(message("chat.sessions.resume"), null, AllIcons.Vcs.History) {
                    override fun actionPerformed(e: AnActionEvent) =
                        resumeChosen(project, Placement.SIDEBAR, e.inputEvent?.component as? JComponent)
                },
                ActionManager.getInstance().getAction("Closta.NextWaiting"),
                Separator.getInstance(),
                object : DumbAwareAction(message("sessions.window.endSession"), null, AllIcons.Actions.Suspend) {
                    override fun getActionUpdateThread() = ActionUpdateThread.EDT

                    override fun update(e: AnActionEvent) {
                        e.presentation.isEnabled = selected() is SessionItem.Live
                    }

                    override fun actionPerformed(e: AnActionEvent) {
                        val item = selected() ?: return
                        confirmed(item, STOP_QUESTION, message("chat.sessions.stop"), e) { endSession(item) }
                    }
                },
            )
        val toolbar = ActionManager.getInstance().createActionToolbar(PLACE, group, true)
        toolbar.targetComponent = target
        return toolbar.component
    }

    /** The menu of a row showing [item]. */
    fun menuFor(item: SessionItem): ActionGroup = if (item is SessionItem.Live) liveMenu else markMenu

    private fun onSelected(
        text: String,
        run: (SessionItem) -> Unit,
    ) = object : DumbAwareAction(text) {
        override fun actionPerformed(e: AnActionEvent) {
            selected()?.let(run)
        }
    }

    // Stopping or archiving cannot be taken back from here: [run] is asked once more while the session works or waits.
    private fun asking(
        text: String,
        question: String,
        run: (SessionItem) -> Unit,
    ) = object : DumbAwareAction(text) {
        override fun actionPerformed(e: AnActionEvent) {
            selected()?.let { item -> confirmed(item, question, text, e) { run(item) } }
        }
    }

    /** Runs [run] at once, or, for a session whose CLI works or waits, after [yes] in a popup by the selection. */
    private fun confirmed(
        item: SessionItem,
        question: String,
        yes: String,
        e: AnActionEvent,
        run: () -> Unit,
    ) {
        if (!asksBeforeStopping(item.group())) {
            run()
            return
        }
        JBPopupFactory
            .getInstance()
            .createConfirmation(question, yes, message("chat.changes.confirm.cancel"), run, 1)
            .showInBestPositionFor(e.dataContext)
    }

    companion object {
        /** The action place of the toolbar and the menus. */
        const val PLACE = "ClostaSessions"

        private val STOP_QUESTION: String get() = message("chat.sessions.stop.confirm")
        private val ARCHIVE_QUESTION: String get() = message("chat.sessions.archive.confirm")
    }
}
