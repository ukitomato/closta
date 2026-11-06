package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager
import dev.ukitomato.closta.platforms.intellij.chat.ChatDirectory

/**
 * Jumps to the next session that waits for the user, from anywhere in the IDE: shows and activates the bottom Closta
 * window, chooses the session, and puts the keyboard in its answer (the answer delay keeps a key already on its way
 * from answering it). Enabled while some session waits.
 *
 * Default shortcut: Ctrl+Alt+Shift+Period. Checked against every `first-keystroke` and `second-keystroke` in every XML
 * of every jar of the IntelliJ IDEA 2026.2.4 distribution (lib and plugins, nested module jars included: the
 * keymaps and the plugins' own `<keyboard-shortcut>` elements), with the modifiers compared as a set. No letter with
 * Ctrl+Alt+Shift is free there (W is DumpLookupElementWeights, J SelectAllOccurrences, N GotoSymbol, Q the Database
 * Tools console), but Period is used by none of them. Shortcuts of plugins that are not bundled are not covered.
 */
class NextWaitingAction : DumbAwareAction() {
    // Reads the directory's current value only, which is safe from any thread.
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = e.project != null && waitingCount(service<ChatDirectory>().entries.value) > 0
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val window = ToolWindowManager.getInstance(project).getToolWindow(SESSIONS_TOOL_WINDOW_ID) ?: return
        window.activate {
            val panel = window.contentManager.contents.firstNotNullOfOrNull { it.component as? SessionsWindowPanel }
            // The keyboard goes to the detail only when a waiting session was chosen.
            if (panel?.selectNextWaiting() == true) panel.focusAnswer()
        }
    }
}

/** Opens the bottom Closta window on its Sessions tab and selects [sessionId] there. */
fun showInSessions(
    project: Project,
    sessionId: String,
) {
    val window = ToolWindowManager.getInstance(project).getToolWindow(SESSIONS_TOOL_WINDOW_ID) ?: return
    window.activate {
        val content =
            window.contentManager.contents.firstOrNull { it.component is SessionsWindowPanel } ?: return@activate
        window.contentManager.setSelectedContent(content)
        (content.component as SessionsWindowPanel).select(sessionId)
    }
}
