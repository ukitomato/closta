@file:Suppress("MatchingDeclarationName") // the action and the flow it starts

package dev.ukitomato.closta.platforms.intellij.chat

import com.intellij.ide.trustedProjects.TrustedProjects
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.EDT
import com.intellij.openapi.components.service
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vcs.ProjectLevelVcsManager
import com.intellij.platform.ide.progress.withBackgroundProgress
import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.core.interfaces.WorktreeCreated
import dev.ukitomato.closta.core.interfaces.WorktreeRequest
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import dev.ukitomato.closta.platforms.intellij.ide.GitWorktrees
import dev.ukitomato.closta.platforms.intellij.session.ClaudeSessionService
import dev.ukitomato.closta.platforms.intellij.session.SessionOpening
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.awt.datatransfer.StringSelection
import java.io.File
import java.time.LocalDateTime

/** Closta: New Conversation in a Worktree: a new worktree, and a new session in it in an editor tab. */
class NewWorktreeChatAction :
    AnAction(),
    DumbAware {
    override fun actionPerformed(event: AnActionEvent) {
        event.project?.let(::openWorktreeChat)
    }

    override fun update(event: AnActionEvent) {
        val project = event.project
        event.presentation.isEnabled = project?.basePath != null && worktreeChatPossible(project)
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT
}

/**
 * Makes a worktree of the project's repository under `.claude/worktrees/<name>` on a new branch of the same name
 * ([worktreeName], [GitWorktrees]) and opens a new conversation there in an editor tab, titled by the branch. A refusal
 * (or an untrusted project) is a notification that says why, without a path. The user removes the worktree: the
 * notice of a made one copies the commands that remove it, to paste in a terminal.
 */
fun openWorktreeChat(project: Project) {
    val root = project.basePath ?: return
    if (!worktreeChatAllowed(project)) {
        notice(ClostaBundle.message("chat.worktree.untrusted"), NotificationType.WARNING).notify(project)
        return
    }
    val once = Disposer.newDisposable(project, "Closta worktree")
    project.service<ClaudeSessionService>().viewScope(once).launch {
        try {
            // Not cancellable: git cannot be stopped midway, and a cancel would leave the worktree behind.
            val result =
                withBackgroundProgress(project, ClostaBundle.message("chat.worktree.creating"), cancellable = false) {
                    withContext(Dispatchers.IO) {
                        val taken = File(root, ".claude/worktrees").list()?.toSet().orEmpty()
                        GitWorktrees(root).create(WorktreeRequest(worktreeName(LocalDateTime.now(), taken)))
                    }
                }
            withContext(Dispatchers.EDT) {
                when (result) {
                    is IdeResult.Ok -> opened(project, result.value)
                    is IdeResult.Failed ->
                        notice(
                            worktreeRefusal(result.kind),
                            NotificationType.WARNING,
                        ).notify(project)
                }
            }
        } finally {
            // Last: disposing [once] cancels this coroutine's scope.
            withContext(NonCancellable + Dispatchers.EDT) { Disposer.dispose(once) }
        }
    }
}

/** The one place that decides whether a worktree may be made: only in a trusted project (the IDE's Safe Mode). */
private fun worktreeChatAllowed(project: Project?): Boolean =
    project != null && TrustedProjects.isProjectTrusted(project)

/** Whether a worktree can be made now: a trusted project with a Git root. */
internal fun worktreeChatPossible(project: Project): Boolean = worktreeChatAllowed(project) && hasGitRoot(project)

private fun hasGitRoot(project: Project): Boolean {
    val manager = ProjectLevelVcsManager.getInstance(project)
    val git = manager.findVcsByName("Git") ?: return false
    return manager.getRootsUnderVcs(git).isNotEmpty()
}

private fun opened(
    project: Project,
    created: WorktreeCreated,
) {
    openNewChat(project, Placement.EDITOR_TAB, SessionOpening.New, worktreeTitle(created.branch), created.path)
    notice(ClostaBundle.message("chat.worktree.created", created.branch), NotificationType.INFORMATION)
        .addAction(
            NotificationAction.createSimple(ClostaBundle.message("chat.worktree.copyRemove")) {
                CopyPasteManager.getInstance().setContents(StringSelection(created.removeCommands.joinToString("\n")))
            },
        ).notify(project)
}

private fun notice(
    text: String,
    type: NotificationType,
) = NotificationGroupManager
    .getInstance()
    .getNotificationGroup(NoticeGroups.WORKTREE)
    .createNotification(text, type)
