package dev.ukitomato.closta.platforms.intellij.composer

import dev.ukitomato.closta.core.models.Attachment

/** A range of lines of a file, as a chip: [path] from the project's folder, [start] to [end] counted from 1. */
class LineSelection(
    val path: String,
    val start: Int,
    val end: Int,
)

/**
 * What is being written in one conversation, kept apart from its composer: the composer of a conversation is made
 * again when it moves between the sidebar and an editor tab, and this goes with it. Touched on the EDT only.
 */
class ComposerDraft(
    val history: PromptHistory,
) {
    var text: String = ""

    /** How many messages the transcript had when the history was last [PromptHistory.seed]ed from it. */
    var seenMessages: Int = 0
    val selections = ArrayList<LineSelection>()
    val attached = ArrayList<Attachment>()

    /** The small pictures of the attached images, made off the EDT once each. */
    val thumbnails = java.util.IdentityHashMap<Attachment, javax.swing.Icon>()

    /** The files whose current-file chip the user took away (by URL). */
    val dismissed = HashSet<String>()
}
