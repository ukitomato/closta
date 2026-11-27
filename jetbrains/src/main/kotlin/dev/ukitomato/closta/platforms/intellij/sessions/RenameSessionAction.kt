package dev.ukitomato.closta.platforms.intellij.sessions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service
import com.intellij.openapi.ui.InputValidator
import com.intellij.openapi.ui.Messages
import dev.ukitomato.closta.platforms.intellij.ClostaBundle.message
import dev.ukitomato.closta.platforms.intellij.chat.ChatDirectory
import dev.ukitomato.closta.presenter.view.sessionName

/**
 * Names a running session: the name is asked for in a dialog and handed to the CLI, which keeps it in the session's
 * record. The dialog's text is the only thing typed here; what the sessions list and the tab show is the view's.
 */
internal class RenameSessionAction : SessionRowAction() {
    // A session the CLI has not started (no id yet), or one whose CLI is gone, has nothing to be asked.
    override fun suits(item: SessionItem): Boolean {
        val source = (item as? SessionItem.Live)?.entry?.source ?: return false
        return source.canSend.value && source.view.value.conversation.session != null
    }

    override fun run(
        e: AnActionEvent,
        item: SessionItem,
    ) {
        val live = item as? SessionItem.Live ?: return
        val initial = sessionName(live.entry.source.view.value.transcript).orEmpty()
        val typed =
            Messages.showInputDialog(
                e.project,
                message("sessions.rename.prompt"),
                message("sessions.rename.title"),
                null,
                initial,
                NamedInput,
            )
        renameTitle(typed.orEmpty())?.let { service<ChatDirectory>().rename(live.sessionId, it) }
    }

    private object NamedInput : InputValidator {
        override fun checkInput(inputString: String?) = inputString != null && renameTitle(inputString) != null

        override fun canClose(inputString: String?) = checkInput(inputString)
    }
}
