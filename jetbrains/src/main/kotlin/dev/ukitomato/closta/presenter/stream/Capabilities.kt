package dev.ukitomato.closta.presenter.stream

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString

/**
 * What the host can do (the protocol's `CapabilitiesMessage`): the names of the commands it acts on and of the
 * parts of the IDE it can reach, so the webview hides what a host cannot. It is a message of its own, outside the
 * tree's sequence: it has no cursor, and [TreeMessage] stays the messages that carry the tree. The host sends it
 * after each ready, whether or not a session is bound, because what it names does not depend on a session.
 *
 * Only a name in [CapabilityNames] is made, and a name once, in the order given.
 *
 * [toString] says how many names it holds, as a log line may; a name is not a secret, but a log says kinds and sizes.
 */
class Capabilities private constructor(
    val names: List<String>,
) {
    fun toJson(): JsonObject =
        JsonObject.of("type" to JsonString("capabilities"), "names" to JsonArray(names.map(::JsonString)))

    override fun equals(other: Any?): Boolean = other is Capabilities && names == other.names

    override fun hashCode(): Int = names.hashCode()

    override fun toString(): String = "capabilities (${names.size} names)"

    companion object {
        /**
         * The capabilities of a host that acts on [commands], on the [fields] of a command that it names apart from
         * the command, and reaches [ide]; an unknown name is refused.
         */
        fun of(
            commands: Collection<String>,
            ide: Collection<String>,
            fields: Collection<String> = emptyList(),
        ): Capabilities {
            val names = (commands + fields + ide).distinct()
            val unknown = names.filterNot(CapabilityNames::isKnown)
            require(unknown.isEmpty()) { "not a capability name: ${unknown.size} of ${names.size}" }
            // A field is named apart from the command, so a name that is a command's or the IDE's is not one.
            val notFields = fields.filterNot { it in CapabilityNames.FIELDS }
            require(notFields.isEmpty()) { "not the name of a field: ${notFields.size} of ${fields.size}" }
            return Capabilities(names)
        }
    }
}

/**
 * The names a host may give (the webview's `CapabilityName`): a command's own type, and the parts of
 * the IDE. A test holds this list to the TypeScript one. A group that adds a name adds it here and there.
 */
object CapabilityNames {
    const val FILES = "files"
    const val SELECTION = "selection"
    const val EDIT = "edit"
    const val DIAGNOSTICS = "diagnostics"
    const val WORKTREE = "worktree"
    const val DIFF = "diff"

    /** The parts of the IDE a host may reach. */
    val IDE: List<String> = listOf(FILES, SELECTION, EDIT, DIAGNOSTICS, WORKTREE, DIFF)

    /** The commands the protocol names, by their type. */
    val COMMANDS: List<String> =
        listOf(
            "send",
            "interrupt",
            "respond-approval",
            "stop-task",
            "set-model",
            "set-permission-mode",
            "request-context-usage",
            "set-effort",
            "query-files",
            "capture-selection",
            "apply-code",
            "open-diff",
            "list-sessions",
            "resume-session",
            "attachment-chunk",
            "list-mcp-servers",
            "set-mcp-server-enabled",
            "reconnect-mcp-server",
            "rewind-files",
            "fork-session",
            "rewind-conversation",
            "view-ready",
        )

    /**
     * `respond-approval`'s `suggestionIds`: a host that names the command may still drop the field, so the field has a
     * name of its own. A host names it when it passes the suggestions on to the CLI (the IDE host does).
     */
    const val ACCEPT_SUGGESTIONS = "accept-suggestions"

    /** The fields of a command that a host may not act on, each named apart from the command's type. */
    val FIELDS: List<String> = listOf(ACCEPT_SUGGESTIONS)

    val ALL: Set<String> = (COMMANDS + FIELDS + IDE).toSet()

    fun isKnown(name: String): Boolean = name in ALL
}
