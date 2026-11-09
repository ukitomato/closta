package dev.ukitomato.closta.platforms.intellij.auth

import com.intellij.openapi.project.Project
import com.intellij.terminal.frontend.toolwindow.TerminalToolWindowTabsManager
import com.intellij.util.concurrency.annotations.RequiresEdt
import dev.ukitomato.closta.platforms.intellij.ClostaBundle

/**
 * Signing the CLI in, which the conversation cannot do: `/login` is not a command of a `-p` session, and
 * `claude auth login` asks in a terminal of its own. The tab opens in the session's [directory] and the command is
 * typed into the user's own shell, so the IDE picks the shell as for any terminal there (a WSL project's opens in its
 * distribution) and the shell's PATH finds `claude` as it does by hand. The session goes on afterwards: the CLI reads
 * the credentials again on the next send.
 */
object SignInTerminal {
    private const val COMMAND = "claude auth login"

    @RequiresEdt
    fun open(
        project: Project,
        directory: String?,
    ) {
        val builder =
            TerminalToolWindowTabsManager
                .getInstance(project)
                .createTabBuilder()
                .tabName(ClostaBundle.message("thread.signIn.tab"))
                .requestFocus(true)
        directory?.let(builder::workingDirectory)
        builder.createTab().view.sendText("$COMMAND\n")
    }
}
