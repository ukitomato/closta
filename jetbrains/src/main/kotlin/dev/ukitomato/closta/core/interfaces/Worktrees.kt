package dev.ukitomato.closta.core.interfaces

/**
 * Creating a git worktree for the project. It writes the file system and git for real and the IDE
 * cannot take it back, so the result says so and carries the way to remove it.
 *
 * Second implementation: the same `git` commands from VS Code's extension host (`child_process`).
 */
interface Worktrees {
    /** Creates the worktree and a new branch for it. Does not point any session at it. */
    suspend fun create(request: WorktreeRequest): IdeResult<WorktreeCreated>
}

/** [name] picks the directory; [branch] defaults to [name]. */
data class WorktreeRequest(
    val name: String,
    val branch: String? = null,
)

/** Where the worktree is, its branch, and the commands that undo it. [undoable] is false: only those undo it. */
data class WorktreeCreated(
    val path: String,
    val branch: String,
    val undoable: Boolean,
    val removeCommands: List<String>,
)
