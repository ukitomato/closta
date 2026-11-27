package dev.ukitomato.closta.platforms.intellij.settings

/**
 * The Behaviour page while it is open: what was saved, and what the user has changed on the screen. The screen
 * edits the five properties; [isModified] compares them with what was saved, [current] is what Apply saves, and
 * [reset] puts the saved values back. Pure, so the fast suite measures it.
 */
class BehaviourEditor(
    private var saved: BehaviourSettings,
) {
    var saveBeforeSend: Boolean = saved.saveBeforeSend
    var respectGitIgnore: Boolean = saved.respectGitIgnore
    var initialPermissionMode: InitialPermissionMode? = saved.initialPermissionMode
    var reportNewErrors: Boolean = saved.reportNewErrors
    var addContentRoots: Boolean = saved.addContentRoots

    /** The values as edited. */
    fun current(): BehaviourSettings =
        BehaviourSettings(saveBeforeSend, respectGitIgnore, initialPermissionMode, reportNewErrors, addContentRoots)

    fun isModified(): Boolean = current() != saved

    /** After a save: what is on the screen is now what is saved. */
    fun applied() {
        saved = current()
    }

    /** Puts [from] on the screen and takes it as the saved state. */
    fun reset(from: BehaviourSettings) {
        saved = from
        saveBeforeSend = from.saveBeforeSend
        respectGitIgnore = from.respectGitIgnore
        initialPermissionMode = from.initialPermissionMode
        reportNewErrors = from.reportNewErrors
        addContentRoots = from.addContentRoots
    }
}
