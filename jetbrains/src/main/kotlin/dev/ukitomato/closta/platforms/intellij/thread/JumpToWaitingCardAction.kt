package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformCoreDataKeys
import com.intellij.openapi.keymap.KeymapUtil
import com.intellij.openapi.project.DumbAwareAction
import dev.ukitomato.closta.platforms.intellij.chat.ChatPanel
import java.awt.Component
import java.awt.KeyboardFocusManager
import javax.swing.SwingUtilities

const val JUMP_TO_WAITING_CARD_ID = "Closta.JumpToWaitingCard"

/** The first keyboard shortcut the keymap gives the jump to a waiting card, as text; empty when it has none. */
fun jumpKeyText(): String =
    ActionManager
        .getInstance()
        .getAction(JUMP_TO_WAITING_CARD_ID)
        ?.let(KeymapUtil::getFirstKeyboardShortcutText)
        .orEmpty()

/**
 * Moves the keyboard between a conversation's composer and its waiting card: from the composer to the card at the
 * top, from a card back to the composer. Enabled while the conversation that has the keyboard has a card waiting.
 *
 * Default shortcut: Alt+Shift+W. No action of the IDE's own keymaps ($default, XWin, GNOME, KDE, the macOS ones,
 * Eclipse, NetBeans, Visual Studio) or of a bundled plugin has it. It is an action so the keymap can show and change
 * it.
 */
class JumpToWaitingCardAction : DumbAwareAction() {
    // Reads the Swing tree of the focused component.
    override fun getActionUpdateThread() = ActionUpdateThread.EDT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = chatOf(e)?.hasWaitingCard() == true
    }

    override fun actionPerformed(e: AnActionEvent) {
        chatOf(e)?.jumpBetweenComposerAndCard(owner(e))
    }

    private fun owner(e: AnActionEvent): Component? =
        e.getData(PlatformCoreDataKeys.CONTEXT_COMPONENT)
            ?: KeyboardFocusManager.getCurrentKeyboardFocusManager().focusOwner

    private fun chatOf(e: AnActionEvent): ChatPanel? =
        owner(e)?.let { SwingUtilities.getAncestorOfClass(ChatPanel::class.java, it) as? ChatPanel }
}
