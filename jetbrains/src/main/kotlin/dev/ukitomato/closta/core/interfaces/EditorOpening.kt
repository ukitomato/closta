package dev.ukitomato.closta.core.interfaces

/**
 * Opening a file in an editor tab, without taking the keyboard from where the user is typing. The counterpart of a
 * VS Code host is `window.showTextDocument` with `preserveFocus`.
 */
interface EditorOpening {
    /** Opens the file at [path] (absolute, as the IDE writes it), at the 1-based [line] when given. */
    suspend fun open(
        path: String,
        line: Int?,
    ): IdeResult<Unit>
}
