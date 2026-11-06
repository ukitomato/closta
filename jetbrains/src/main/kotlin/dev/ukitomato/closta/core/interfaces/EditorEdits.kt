package dev.ukitomato.closta.core.interfaces

/**
 * Replacing text in a project file through the IDE, so the user sees the change and can undo it.
 *
 * Second implementation: VS Code's `workspace.applyEdit` with a `WorkspaceEdit` replace.
 */
interface EditorEdits {
    /**
     * Replaces lines [EditRequest.startLine]..[EditRequest.endLine] of [EditRequest.path] (the whole file when both
     * are null) with [EditRequest.text]. A path outside the project, a missing or read-only file and a range past the
     * end of the file fail without changing anything.
     */
    suspend fun replace(request: EditRequest): IdeResult<EditApplied>
}

/** [path] is relative to the project root (an absolute path inside the project is accepted); lines are 1-based. */
data class EditRequest(
    val path: String,
    val text: String,
    val startLine: Int? = null,
    val endLine: Int? = null,
)

/** The edit was made; [undoable] says the IDE's undo history can take it back. */
data class EditApplied(
    val path: String,
    val undoable: Boolean,
)
