package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformCoreDataKeys
import com.intellij.openapi.project.DumbAwareAction
import dev.ukitomato.closta.platforms.intellij.chat.ChatPanel
import java.awt.Component
import java.awt.KeyboardFocusManager
import javax.swing.SwingUtilities

/**
 * Moves every call that runs in front in the conversation that has the keyboard to the background. Enabled while
 * one does. It has no shortcut of its own (Ctrl+B is the IDE's Go to Declaration); it is an action so the keymap
 * can give it one.
 */
class BackgroundAllAction : DumbAwareAction() {
    // Reads the Swing tree of the focused component.
    override fun getActionUpdateThread() = ActionUpdateThread.EDT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = chatOf(e)?.canMoveToBackground() == true
    }

    override fun actionPerformed(e: AnActionEvent) {
        chatOf(e)?.moveAllToBackground()
    }

    private fun chatOf(e: AnActionEvent): ChatPanel? {
        val owner: Component? =
            e.getData(PlatformCoreDataKeys.CONTEXT_COMPONENT)
                ?: KeyboardFocusManager.getCurrentKeyboardFocusManager().focusOwner
        return owner?.let { SwingUtilities.getAncestorOfClass(ChatPanel::class.java, it) as? ChatPanel }
    }
}
