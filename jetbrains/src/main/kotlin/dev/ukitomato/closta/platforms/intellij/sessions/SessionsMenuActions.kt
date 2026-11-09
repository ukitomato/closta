package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataKey
import com.intellij.openapi.actionSystem.PlatformCoreDataKeys
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.ui.speedSearch.SpeedSearchSupply
import dev.ukitomato.closta.platforms.intellij.ClostaBundle.message
import dev.ukitomato.closta.platforms.intellij.chat.ChatDirectory
import dev.ukitomato.closta.platforms.intellij.chat.Placement
import dev.ukitomato.closta.platforms.intellij.chat.clearWasRunningMark
import javax.swing.JComponent
import javax.swing.JTree

/** The session the sessions window has chosen; given by [SessionsWindowPanel] to whatever runs from inside it. */
val SESSION_ITEM: DataKey<SessionItem> = DataKey.create("Closta.SessionItem")

/** Told after a mark was cleared, so the sessions window drops its row. */
internal val SESSION_MARKS_CHANGED: DataKey<() -> Unit> = DataKey.create("Closta.SessionMarksChanged")

/** An action of the sessions window's rows: it acts on [SESSION_ITEM] and is enabled for the sessions [suits]. */
internal abstract class SessionRowAction : DumbAwareAction() {
    // The selection is read from the data context only.
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    protected open fun suits(item: SessionItem): Boolean = true

    protected open fun enabledIn(e: AnActionEvent): Boolean = true

    override fun update(e: AnActionEvent) {
        val item = e.getData(SESSION_ITEM)
        e.presentation.isEnabled = item != null && suits(item) && enabledIn(e)
    }

    override fun actionPerformed(e: AnActionEvent) {
        val item = e.getData(SESSION_ITEM) ?: return
        run(e, item)
    }

    protected abstract fun run(
        e: AnActionEvent,
        item: SessionItem,
    )
}

private fun SessionItem.isLive() = this is SessionItem.Live

internal class OpenInEditorAction : SessionRowAction() {
    override fun suits(item: SessionItem) = item.isLive()

    override fun run(
        e: AnActionEvent,
        item: SessionItem,
    ) = e.project?.let { openItem(it, item, Placement.EDITOR_TAB) } ?: Unit
}

internal class OpenInSidebarAction : SessionRowAction() {
    override fun suits(item: SessionItem) = item.isLive()

    override fun run(
        e: AnActionEvent,
        item: SessionItem,
    ) = e.project?.let { openItem(it, item, Placement.SIDEBAR) } ?: Unit
}

internal class ResumeInEditorAction : SessionRowAction() {
    override fun suits(item: SessionItem) = !item.isLive()

    override fun run(
        e: AnActionEvent,
        item: SessionItem,
    ) = e.project?.let { openItem(it, item, Placement.EDITOR_TAB) } ?: Unit
}

internal class ResumeInSidebarAction : SessionRowAction() {
    override fun suits(item: SessionItem) = !item.isLive()

    override fun run(
        e: AnActionEvent,
        item: SessionItem,
    ) = e.project?.let { openItem(it, item, Placement.SIDEBAR) } ?: Unit
}

internal class ClearMarkAction : SessionRowAction() {
    override fun suits(item: SessionItem) = !item.isLive()

    override fun run(
        e: AnActionEvent,
        item: SessionItem,
    ) {
        e.project?.clearWasRunningMark(item.sessionId)
        e.getData(SESSION_MARKS_CHANGED)?.invoke()
    }
}

/** Enter on a row, and what a double click does: opens the session where it is shown, else in an editor tab. */
internal class OpenAction : SessionRowAction() {
    // Enter while the speed search is open belongs to the search.
    override fun enabledIn(e: AnActionEvent) = !speedSearching(e)

    override fun run(
        e: AnActionEvent,
        item: SessionItem,
    ) = e.project?.let { openItem(it, item) } ?: Unit
}

// Stopping cannot be taken back from here: it is asked once more while the session works or waits.
internal class EndSessionAction : SessionRowAction() {
    override fun suits(item: SessionItem) = item.isLive()

    override fun run(
        e: AnActionEvent,
        item: SessionItem,
    ) {
        val live = item as? SessionItem.Live ?: return
        confirmed(
            item,
            message("chat.sessions.stop.confirm"),
            message("action.Closta.Sessions.EndSession.MainMenu.text"),
            e,
        ) {
            endSession(live.entry)
        }
    }
}

/** Archiving also stops the CLI; it is asked once more while the session works or waits. */
internal class ArchiveAction : SessionRowAction() {
    override fun suits(item: SessionItem) = item.isLive()

    // Delete is bound on the tree alone, and in the speed search it edits the text.
    override fun enabledIn(e: AnActionEvent) =
        e.getData(PlatformCoreDataKeys.CONTEXT_COMPONENT) is JTree && !speedSearching(e)

    override fun run(
        e: AnActionEvent,
        item: SessionItem,
    ) {
        confirmed(
            item,
            message("chat.sessions.archive.confirm"),
            message("action.Closta.Sessions.Archive.MainMenu.text"),
            e,
        ) {
            service<ChatDirectory>().archive(item.sessionId)
        }
    }
}

private fun speedSearching(e: AnActionEvent): Boolean {
    val component = e.getData(PlatformCoreDataKeys.CONTEXT_COMPONENT) as? JComponent
    return component != null && SpeedSearchSupply.getSupply(component)?.isPopupActive == true
}
