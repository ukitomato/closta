package dev.ukitomato.closta.core.models

/**
 * One saved session of the project, as the list shows it: the CLI's own id for it, a [title] made from its
 * first
 * user sentence (the id when it has none), when it was last written ([updatedAtMs], epoch milliseconds) and how big its
 * record is ([bytes]).
 *
 * The title is the user's own words: it is shown, and never logged.
 */
data class SavedSessionSummary(
    val id: String,
    val title: String,
    val updatedAtMs: Long,
    val bytes: Long,
) {
    override fun toString(): String = "SavedSessionSummary($id, ${title.length} chars, $bytes bytes)"
}

/**
 * What reading one saved session gave: the [events] to fold, in the order the CLI wrote them, as the
 * [AgentEvent.User] and [AgentEvent.Assistant] lines the record held, and how many lines it did not give.
 *
 * [skipped] counts the lines that are not events of the conversation (other kinds of line, damaged lines, a
 * sub-agent's,
 * the CLI's own notes to the model); [dropped] counts the lines of the conversation that were left out because the
 * record is longer than the host restores, the oldest first. Only counts: what a line said is never kept here.
 */
data class SavedTranscript(
    val events: List<AgentEvent>,
    val skipped: Int,
    val dropped: Int,
) {
    override fun toString(): String = "SavedTranscript(${events.size} events, $skipped skipped, $dropped dropped)"
}
