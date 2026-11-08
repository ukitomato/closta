package dev.ukitomato.closta.platforms.intellij.composer

import dev.ukitomato.closta.core.models.Attachment

/** What one send took out of the composer, kept so it can go back when the message was not handed to the CLI. */
data class Outgoing(
    val words: String,
    val selections: List<LineSelection>,
    /** The followed file's path from the project's folder, bare. */
    val file: String?,
    val attachments: List<Attachment>,
)

/** The text the box holds after a send came back: [words] alone in an empty box, else above what was typed since. */
fun restoredText(
    current: String,
    words: String,
): String = if (current.isBlank()) words else words + "\n" + current
