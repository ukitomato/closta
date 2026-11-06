package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.EDT
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.util.Disposer
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.ColoredListCellRenderer
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.session.ClaudeSessionService
import dev.ukitomato.closta.platforms.intellij.session.SessionOpening
import dev.ukitomato.closta.presenter.view.SavedSessionRecord
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import javax.swing.JComponent
import javax.swing.JList
import javax.swing.SwingConstants

/** Closta: New Conversation: a new session in an editor tab. */
class NewChatAction :
    AnAction(),
    DumbAware {
    override fun actionPerformed(event: AnActionEvent) {
        event.project?.let { openNewChat(it, Placement.EDITOR_TAB) }
    }

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabled = event.project != null
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT
}

/** Closta: a new session in the Closta tool window (the Sessions tab's toolbar offers it). */
class NewSidebarChatAction :
    AnAction(),
    DumbAware {
    override fun actionPerformed(event: AnActionEvent) {
        event.project?.let { openNewChat(it, Placement.SIDEBAR) }
    }

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabled = event.project != null
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT
}

/** Closta: Resume a Saved Conversation: chooses a saved session and resumes it in an editor tab. */
class ResumeChatAction :
    AnAction(),
    DumbAware {
    override fun actionPerformed(event: AnActionEvent) {
        event.project?.let { resumeChosen(it, Placement.EDITOR_TAB) }
    }

    override fun update(event: AnActionEvent) {
        event.presentation.isEnabled = event.project != null
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT
}

/**
 * Lists the saved sessions by opening a session for a moment and asking it (the record is read without the CLI), then
 * closes it and offers the list, newest first, each with when it was last written; the chosen one is resumed at
 * [placement]. While it is read a popup says so (closing it gives up the list); none saved says so too.
 */
fun resumeChosen(
    project: Project,
    placement: Placement,
    under: JComponent? = null,
) {
    val service = project.service<ClaudeSessionService>()
    val probe = service.open()
    val once = Disposer.newDisposable(project, "Closta saved sessions")
    val loading = loadingPopup()
    show(loading, project, under)
    service.viewScope(once).launch {
        try {
            val saved =
                try {
                    probe.listSaved()
                    probe.view.value.transcript.savedSessions
                        .orEmpty()
                } finally {
                    service.close(probe.id)
                }
            withContext(Dispatchers.EDT) {
                // Closed while it was read: the list is not wanted any more.
                if (loading.isVisible) {
                    loading.cancel()
                    offer(project, placement, under, saved)
                }
            }
        } finally {
            // Last: disposing [once] cancels this coroutine's scope.
            withContext(NonCancellable + Dispatchers.EDT) {
                loading.cancel()
                Disposer.dispose(once)
            }
        }
    }
}

private fun offer(
    project: Project,
    placement: Placement,
    under: JComponent?,
    saved: List<SavedSessionRecord>,
) {
    if (saved.isEmpty()) {
        show(JBPopupFactory.getInstance().createMessage(NONE_SAVED), project, under)
        return
    }
    val sorted = saved.sortedByDescending { it.updatedAtMs }
    val popup =
        JBPopupFactory
            .getInstance()
            .createPopupChooserBuilder(sorted)
            .setTitle(ClostaBundle.message("chat.saved.title"))
            .setRenderer(SavedRenderer())
            // The search field is there from the start, so the list says it can be searched; it matches the titles.
            .setNamerForFiltering { it.title }
            .setFilterAlwaysVisible(true)
            .setItemChosenCallback {
                openNewChat(project, placement, SessionOpening.Resume(it.id), it.title.take(TITLE_MAX))
            }.createPopup()
    show(popup, project, under)
}

private fun loadingPopup(): JBPopup =
    JBPopupFactory
        .getInstance()
        .createComponentPopupBuilder(
            JBLabel(ClostaBundle.message("chat.mcp.loading"), AnimatedIcon.Default.INSTANCE, SwingConstants.LEADING)
                .apply { border = JBUI.Borders.empty(LOADING_PAD) },
            null,
        ).setRequestFocus(false)
        .setCancelOnClickOutside(true)
        .createPopup()

private fun show(
    popup: JBPopup,
    project: Project,
    under: JComponent?,
) {
    if (under != null && under.isShowing) popup.showUnderneathOf(under) else popup.showCenteredInCurrentWindow(project)
}

/** A saved conversation: its title, and in grey when it was last written. */
private class SavedRenderer : ColoredListCellRenderer<SavedSessionRecord>() {
    override fun customizeCellRenderer(
        list: JList<out SavedSessionRecord>,
        value: SavedSessionRecord,
        index: Int,
        selected: Boolean,
        hasFocus: Boolean,
    ) {
        append(value.title.take(TITLE_MAX), SimpleTextAttributes.REGULAR_ATTRIBUTES)
        append("  " + timeText(Instant.ofEpochMilli(value.updatedAtMs)), SimpleTextAttributes.GRAYED_SMALL_ATTRIBUTES)
    }
}

private const val TITLE_MAX = 80
private const val LOADING_PAD = 8
private val NONE_SAVED: String get() = ClostaBundle.message("chat.open.noneSaved")
