package dev.ukitomato.closta.core.interfaces

/**
 * Showing two texts side by side in the IDE's own diff view. It only reads: nothing is written to
 * any file, and showing the same pair twice does no harm.
 *
 * Second implementation: VS Code's `vscode.diff` command, given a left and a right document (each made from the text
 * as an untitled document) and a title.
 */
interface DiffViews {
    /**
     * Opens the diff of [DiffShowRequest.before] and [DiffShowRequest.after]. When `before` is null the host reads the
     * file at [DiffShowRequest.path] for the left side (an empty left if the file does not exist); a path outside the
     * project, or a file that exists but cannot be read as text, fails and opens nothing. When `before` is a text the
     * file is not read, and the path only names the view and picks its colouring.
     */
    suspend fun show(request: DiffShowRequest): IdeResult<Unit>
}

/**
 * [path] is relative to the project root (an absolute path is accepted). [before] is the left text, or null for the
 * file's current content (a Write); [after] is the right text.
 */
data class DiffShowRequest(
    val path: String,
    val before: String?,
    val after: String,
) {
    // The texts are the user's code: only their sizes are ever said.
    override fun toString(): String = "DiffShowRequest(before=${before?.length}, after=${after.length} chars)"
}
