package dev.ukitomato.closta.platforms.intellij.settings

/**
 * The permission modes a new session can be started in from Settings. It is the host's
 * [dev.ukitomato.closta.platforms.intellij.session.PERMISSION_MODES] without `bypassPermissions`: that
 * mode is chosen per session in the operations console, through its confirmation, and a setting that applied it
 * at every start would skip that. The type has no value for it, so it cannot be written, and [of] does not read it.
 */
enum class InitialPermissionMode(
    val wire: String,
) {
    DEFAULT("default"),
    ACCEPT_EDITS("acceptEdits"),
    PLAN("plan"),
    AUTO("auto"),
    DONT_ASK("dontAsk"),
    ;

    companion object {
        /** The mode named [wire], or null for a word that is not one of these five (including `bypassPermissions`). */
        fun of(wire: String?): InitialPermissionMode? = entries.firstOrNull { it.wire == wire }
    }
}

/**
 * What Settings | Tools | Closta | Behaviour holds, as the host reads it. A null [initialPermissionMode]
 * leaves the mode to the CLI.
 */
data class BehaviourSettings(
    /** Save the IDE's unsaved documents before each message is sent. */
    val saveBeforeSend: Boolean = true,
    /** Leave the files the version control ignores out of the `@` completion. */
    val respectGitIgnore: Boolean = true,
    /** The permission mode new sessions start in; null is the CLI's own. */
    val initialPermissionMode: InitialPermissionMode? = null,
)
