package dev.ukitomato.closta.core.interfaces

/**
 * What core asks of the surrounding IDE, seen from core's side. It carries only IDE *context* that core
 * needs, never a `com.intellij` type.
 *
 * It started with the one member that was unambiguously needed — which project the session is scoped to —
 * and grew by **forward evolution**: six seams, one per use, each a property that may be
 * absent. A host that cannot satisfy a seam leaves it `null`, so what a host cannot do is visible in the type and no
 * caller has to call something to find out it fails. Every seam reports a refusal as a value ([IdeResult]).
 *
 * Second implementation (not a test fake): an IntelliJ project-context implementation
 * (`platforms/intellij/ide`). A VS Code extension host would be the other: each seam's doc names its VS Code
 * counterpart. Test fake: a stand-in returning fixed values.
 */
interface IdeBridge {
    /** Absolute path of the project root the session is scoped to, or null when there is none. */
    fun projectBasePath(): String?

    /** File names of the project, by query. Null when the host has no project files to list. */
    val projectFiles: ProjectFiles? get() = null

    /** The selection of the frontmost text view. Null when the host has no text view. */
    val editorSelections: EditorSelections? get() = null

    /** Replacement of text in a project file. Null when the host cannot edit. */
    val editorEdits: EditorEdits? get() = null

    /** Errors and warnings the IDE already found. Null when the host does no analysis. */
    val diagnostics: Diagnostics? get() = null

    /** Git worktree creation. Null when the host has no git project. */
    val worktrees: Worktrees? get() = null

    /** The IDE's diff view. Null when the host has none to open. */
    val diffViews: DiffViews? get() = null
}
