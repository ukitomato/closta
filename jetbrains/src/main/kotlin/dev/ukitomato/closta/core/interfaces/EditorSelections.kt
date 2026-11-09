package dev.ukitomato.closta.core.interfaces

/**
 * The selection in the frontmost text view, taken when asked — never pushed on every change.
 *
 * Second implementation: VS Code's `window.activeTextEditor` selection and `document.getText(range)`.
 */
interface EditorSelections {
    /** The current selection, or `Ok(null)` when there is no text view or nothing is selected. */
    suspend fun current(): IdeResult<SelectedText?>
}

/**
 * [path] relative to the project root, or absolute for a file outside the project; lines are 1-based and inclusive at
 * both ends.
 */
data class SelectedText(
    val path: String,
    val startLine: Int,
    val endLine: Int,
    val text: String,
)
