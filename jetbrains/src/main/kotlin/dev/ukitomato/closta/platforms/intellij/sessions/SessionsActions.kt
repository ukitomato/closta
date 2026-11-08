package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonShortcuts
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.ui.DoubleClickListener
import com.intellij.ui.PopupHandler
import dev.ukitomato.closta.platforms.intellij.ClostaBundle.message
import dev.ukitomato.closta.platforms.intellij.chat.ChatDirectory
import dev.ukitomato.closta.platforms.intellij.chat.ChatSessions
import dev.ukitomato.closta.platforms.intellij.chat.Placement
import dev.ukitomato.closta.platforms.intellij.chat.asksBeforeStopping
import dev.ukitomato.closta.platforms.intellij.chat.bringAndShow
import dev.ukitomato.closta.platforms.intellij.chat.openNewChat
import dev.ukitomato.closta.platforms.intellij.session.SessionOpening
import dev.ukitomato.closta.presenter.view.TITLE_MAX
import java.awt.Component
import java.awt.Point
import java.awt.event.MouseEvent
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

/** The action place of the toolbar and the menus. */
internal const val SESSIONS_PLACE = "ClostaSessions"

internal fun endSession(entry: ChatDirectory.Entry) {
    entry.project.service<ChatSessions>().stopFromScreen(entry.sessionId)
}

/** The toolbar above the tree, registered as `Closta.Sessions.Toolbar`; its actions take context from [target]. */
internal fun sessionsToolbar(target: JComponent): JComponent {
    val group = ActionManager.getInstance().getAction("Closta.Sessions.Toolbar") as ActionGroup
    val toolbar = ActionManager.getInstance().createActionToolbar(SESSIONS_PLACE, group, true)
    toolbar.targetComponent = target
    return toolbar.component
}

/** Runs [run] at once, or, for a session whose CLI works or waits, after [yes] in a popup by the selection. */
internal fun confirmed(
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

/**
 * Gives [tree] its double click, Enter (`Closta.Sessions.Open`), Delete (`Closta.Sessions.Archive`) and the menu of a
 * row. Delete is bound on the tree alone, not as the keymap's: in the speed search it edits the text.
 */
internal fun wireTree(
    project: Project,
    tree: SessionsTree,
    parent: Disposable,
) {
    val component = tree.component
    object : DoubleClickListener() {
        override fun onDoubleClick(event: MouseEvent): Boolean {
            val item = tree.itemAt(event.point) ?: return false
            openItem(project, item)
            return true
        }
    }.installOn(component)
    val manager = ActionManager.getInstance()
    manager.getAction("Closta.Sessions.Open").registerCustomShortcutSet(CommonShortcuts.ENTER, component, parent)
    manager
        .getAction("Closta.Sessions.Archive")
        .registerCustomShortcutSet(CommonShortcuts.getDelete(), component, parent)
    component.addMouseListener(
        object : PopupHandler() {
            override fun invokePopup(
                comp: Component,
                x: Int,
                y: Int,
            ) {
                val item = tree.itemAt(Point(x, y)) ?: return
                tree.select(item.sessionId)
                val menu = if (item is SessionItem.Live) "Closta.Sessions.LiveMenu" else "Closta.Sessions.MarkMenu"
                val popup = manager.createActionPopupMenu(SESSIONS_PLACE, manager.getAction(menu) as ActionGroup)
                popup.setTargetComponent(component)
                popup.component.show(comp, x, y)
            }
        },
    )
}
