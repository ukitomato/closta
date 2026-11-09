package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue

// What the composer is offered, kept next to the transcript: the CLI's slash commands, the last answer to the
// webview's file query, and the last selection it took in.

/**
 * One slash command the CLI has. [argumentHint] is absent when the CLI gave none (or an empty one).
 */
data class SlashCommandRecord(
    val name: String,
    val description: String,
    val argumentHint: String? = null,
)

/**
 * The slash commands the thread shows. [detailed] says the list came from the `initialize` response (name, description
 * and hint); a list from `system/init` is names only. A detailed list is never replaced by a names-only one.
 */
data class SlashCommands(
    val items: List<SlashCommandRecord> = emptyList(),
    val detailed: Boolean = false,
)

/**
 * The answer to the webview's last file query, [commandId] being the id the webview gave that command. [failure] is the
 * kind of failure ([ComposerFailure]) when the host could not list the files; [paths] are relative to the project root.
 */
data class FileSearchRecord(
    val commandId: String,
    val match: String,
    val paths: List<String> = emptyList(),
    val truncated: Boolean = false,
    val failure: String? = null,
) {
    // The query and the paths are the user's project: never in a log.
    override fun toString(): String = "FileSearchRecord(${paths.size} paths, failure=$failure)"
}

/**
 * The answer to the webview's last request to take the selection in, by the command's id. Only the place is kept: the
 * selected text is never carried (an op would carry it on every resync).
 */
data class SelectionRecord(
    val commandId: String,
    val answer: SelectionAnswer,
)

sealed interface SelectionAnswer {
    /** [path] is relative to the project root, or absolute for a file outside it; lines are 1-based, both included. */
    data class Selected(
        val path: String,
        val startLine: Int,
        val endLine: Int,
    ) : SelectionAnswer {
        // The path is the user's project: never in a log.
        override fun toString(): String = "Selected($startLine-$endLine)"
    }

    /** There is no text view, or nothing is selected. */
    data object NoSelection : SelectionAnswer

    data class Failed(
        val failure: String,
    ) : SelectionAnswer
}

/**
 * The answer to the webview's last `apply-code`, by the command's id. Only the place written is kept: neither the
 * text written nor the text it replaced is carried (an op would carry it on every resync).
 */
data class ApplyRecord(
    val commandId: String,
    val answer: ApplyAnswer,
)

sealed interface ApplyAnswer {
    /** [path] is relative to the project root, or absolute outside it; lines are 1-based, both included. */
    data class Written(
        val path: String,
        val startLine: Int,
        val endLine: Int,
        val undoable: Boolean,
    ) : ApplyAnswer {
        // The path is the user's project: never in a log.
        override fun toString(): String = "Written($startLine-$endLine, undoable=$undoable)"
    }

    /** Nothing was written; [failure] is the kind ([ComposerFailure]). */
    data class Failed(
        val failure: String,
    ) : ApplyAnswer
}

/** The kinds of failure a file query, a selection or an apply can end with, as the tree names them. */
object ComposerFailure {
    const val UNAVAILABLE = "unavailable"
    const val FAILED = "failed"

    /** `apply-code` with nothing selected in the editor. */
    const val NO_SELECTION = "no-selection"

    /** `apply-code` while another apply is writing. */
    const val BUSY = "busy"

    /**
     * What a kind of failure the IDE's seam named is called in the tree: lower case, with a hyphen (`out-of-range`).
     * [kindName] is the enum constant's name (`OUT_OF_RANGE`); this package builds on `core.models` only, not the enum.
     */
    fun of(kindName: String): String = kindName.lowercase().replace('_', '-')
}

/** The slash commands of an `initialize` response (`response.response.commands`), or null when it has none. */
internal fun commandsOfResponse(response: JsonValue?): List<SlashCommandRecord>? {
    val commands =
        ((response as? JsonObject)?.obj("response"))?.array("commands")?.items ?: return null
    return commands.mapNotNull { item ->
        val fields = item as? JsonObject
        val name = fields?.string("name")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
        SlashCommandRecord(
            name,
            fields.string("description").orEmpty(),
            fields.string("argumentHint")?.takeIf { it.isNotEmpty() },
        )
    }
}

/** The names of a `system/init`'s `slash_commands`, or null when it has none. */
internal fun commandsOfInit(slashCommands: JsonValue?): List<SlashCommandRecord>? =
    (slashCommands as? JsonArray)?.items?.mapNotNull { item ->
        (item as? JsonString)?.value?.takeIf { it.isNotEmpty() }?.let { SlashCommandRecord(it, "") }
    }

// What the host found in the IDE: its answers to what the webview asked, each kept alone, the last one only;
// and what a turn changed on disk, by the turn's user message.
internal fun foldAnswered(
    transcript: Transcript,
    input: PresenterInput,
): Transcript =
    when (input) {
        is PresenterInput.FilesFound -> transcript.copy(fileSearch = input.search)
        is PresenterInput.SelectionCaptured -> transcript.copy(selection = input.selection)
        is PresenterInput.CodeApplied -> transcript.copy(applied = input.applied)
        is PresenterInput.TurnChangesFound -> foldTurnChanges(transcript, input)
        else -> transcript
    }
