package dev.ukitomato.closta.platforms.intellij.ide

import dev.ukitomato.closta.core.interfaces.IdeResult
import dev.ukitomato.closta.core.interfaces.WorktreeCreated
import dev.ukitomato.closta.core.interfaces.WorktreeRequest
import dev.ukitomato.closta.core.interfaces.Worktrees
import dev.ukitomato.closta.platforms.intellij.ClostaBundle
import kotlinx.coroutines.CancellationException

/**
 * Tells the user what a created worktree left behind: [notify] is called with the result of every
 * creation that succeeded, and a failure is passed on without a notice. A notice that cannot be shown does not turn a
 * created worktree into a failure — the result still says where it is and how to remove it.
 */
class NotifyingWorktrees(
    private val delegate: Worktrees,
    private val notify: (WorktreeCreated) -> Unit,
) : Worktrees {
    override suspend fun create(request: WorktreeRequest): IdeResult<WorktreeCreated> {
        val result = delegate.create(request)
        if (result is IdeResult.Ok) {
            try {
                notify(result.value)
            } catch (cancel: CancellationException) {
                throw cancel
            } catch (
                @Suppress("TooGenericExceptionCaught", "SwallowedException") shown: Exception,
            ) {
                // The result already carries everything the notice would say.
            }
        }
        return result
    }
}

/**
 * The notice's text: where the worktree is, its branch, that the IDE cannot undo it, that the original tree's
 * `git status` now lists `.claude/` as untracked, and the commands that remove it, one per line. What comes from
 * outside (the path, the branch, the commands) is escaped for the balloon's HTML.
 */
internal fun worktreeNoticeText(created: WorktreeCreated): String =
    ClostaBundle.message(
        "ide.worktree.created",
        htmlEscaped(created.path),
        htmlEscaped(created.branch),
        created.removeCommands.joinToString("\n") { htmlEscaped(it) },
    )
