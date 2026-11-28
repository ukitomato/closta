package dev.ukitomato.closta.platforms.intellij.thread

/** What was typed beside a plan's answer on its card and in the detail pane; null where nothing was typed. */
data class PlanNote(
    val card: String?,
    val pane: String?,
) {
    // Not the sentences: they are the user's words.
    override fun toString(): String = "PlanNote(card=${card != null}, pane=${pane != null})"
}

/** The sentence to send with the tab's comments: the card's if it says something, else the pane's, else none. */
internal fun planNote(note: PlanNote?): String =
    note?.card?.takeIf { it.isNotBlank() } ?: note?.pane?.takeIf { it.isNotBlank() } ?: ""
