package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.BadgeIconSupplier
import dev.ukitomato.closta.platforms.intellij.ClostaIcons
import dev.ukitomato.closta.platforms.intellij.chat.ChatDirectory
import dev.ukitomato.closta.presenter.view.SessionGroup
import javax.swing.Icon

/** The tool window's own icon (plugin.xml), which the badge is put on. */
private val PLAIN_ICON: Icon = ClostaIcons.Closta

/** Puts the badge on [window]'s icon while [waiting] sessions wait, and takes it off when none does. */
fun badge(
    window: ToolWindow,
    waiting: Int,
) {
    window.setIcon(if (waiting > 0) BadgeIconSupplier(PLAIN_ICON).getLiveIndicatorIcon(true) else PLAIN_ICON)
}

/** [badge] on the bottom Closta tool window of every open project. */
fun badgeEveryWindow(waiting: Int) {
    for (project in ProjectManager.getInstance().openProjects) {
        if (project.isDisposed) continue
        ToolWindowManager.getInstance(project).getToolWindow(SESSIONS_TOOL_WINDOW_ID)?.let { badge(it, waiting) }
    }
}

/** How many sessions of the list wait for the user. */
fun waitingCount(entries: List<ChatDirectory.Entry>): Int = entries.count { it.summary.group == SessionGroup.WAITING }
