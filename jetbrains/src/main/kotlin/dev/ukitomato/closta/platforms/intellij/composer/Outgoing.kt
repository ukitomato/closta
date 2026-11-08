package dev.ukitomato.closta.platforms.intellij.composer

import dev.ukitomato.closta.core.models.Attachment
import javax.swing.Icon

/** What one send took out of the composer, kept so it can go back when the message was not handed to the CLI. */
data class Outgoing(
    val words: String,
    val selections: List<LineSelection>,
    /** The followed file's path from the project's folder, bare. */
    val file: String?,
    val attachments: List<Attachment>,
    /** The small pictures of the attached images, taken out with them. */
    val thumbnails: Map<Attachment, Icon> = emptyMap(),
)

/** The text the box holds after a send came back: [words] alone in an empty box, else above what was typed since. */
fun restoredText(
    current: String,
    words: String,
): String = if (current.isBlank()) words else words + "\n" + current

/** What goes to the CLI: a slash command (judged after trimming) goes alone; any other message adds ranges and file. */
fun outgoingText(
    outgoing: Outgoing,
    range: (LineSelection) -> String,
): String {
    if (outgoing.words.trim().startsWith("/")) return outgoing.words
    val places = outgoing.selections.joinToString("") { "\n" + range(it) }
    return outgoing.words + places + outgoing.file?.let { "\n@$it" }.orEmpty()
}
