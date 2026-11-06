package dev.ukitomato.closta.platforms.intellij.composer

import dev.ukitomato.closta.presenter.view.MessageSource
import dev.ukitomato.closta.presenter.view.Role
import dev.ukitomato.closta.presenter.view.TextRecord
import dev.ukitomato.closta.presenter.view.Transcript

// The prompts sent before, walked with ↑ and ↓, decided without the IDE. Free of `com.intellij`.

/**
 * The prompts sent in a conversation, oldest first, and where ↑ and ↓ have walked to. Below the newest is the draft:
 * what was in the composer when the walk began, given back when ↓ comes down to it. A prompt edited during the walk
 * keeps its edit until the walk ends ([add]). The same prompt twice in a row is kept once.
 */
class PromptHistory(
    entries: List<String>,
) {
    private val entries = ArrayList<String>()
    private val edits = HashMap<Int, String>()
    private var at = 0
    private var draft = ""

    /** Whether the history has its start: prompts given, [seed]ed, or one [add]ed. */
    var seeded: Boolean = false
        private set

    /** Whether a prompt was sent from here: from then on the history grows by [add] only. */
    var sentHere: Boolean = false
        private set

    init {
        entries.forEach(::append)
        at = this.entries.size
        seeded = this.entries.isNotEmpty()
    }

    /**
     * Starts the history from [prompts] (a resumed conversation's, read from its transcript). A restore writes the
     * newest part of the record first and then all of it, so a longer list replaces a shorter one, until a prompt is
     * sent from here or while ↑ is walking.
     */
    fun seed(prompts: List<String>) {
        if (sentHere || at != entries.size) return
        val fresh = PromptHistory(prompts).entries
        if (fresh.size <= entries.size) return
        seeded = true
        entries.clear()
        entries += fresh
        at = entries.size
    }

    /** Whether ↑ has an older prompt to show. */
    val canUp: Boolean get() = at > 0

    /** Whether the walk is above the draft, so ↓ has somewhere to go. */
    val canDown: Boolean get() = at < entries.size

    /** The prompt before the one shown ([current] is what the composer holds now); null at the oldest. */
    fun up(current: String): String? {
        if (!canUp) return null
        leave(current)
        at--
        return shown()
    }

    /** The prompt after the one shown, or the draft below the newest; null when the draft is shown. */
    fun down(current: String): String? {
        if (!canDown) return null
        leave(current)
        at++
        return shown()
    }

    /** [sent] was sent: it becomes the newest prompt and the walk ends. */
    fun add(sent: String) {
        seeded = true
        sentHere = true
        append(sent)
        edits.clear()
        draft = ""
        at = entries.size
    }

    private fun append(prompt: String) {
        if (prompt.isNotBlank() && prompt != entries.lastOrNull()) entries += prompt
    }

    private fun leave(current: String) {
        when {
            at == entries.size -> draft = current
            current != entries[at] -> edits[at] = current
            else -> edits.remove(at)
        }
    }

    private fun shown(): String = if (at == entries.size) draft else edits[at] ?: entries[at]
}

/** The lines the composer adds under a prompt: the current file (`@path`) and a selection (`⧉ path#L1-L3`). */
private val ADDED_LINE = Regex("""^(@|⧉ )\S+$""")

/** [sent] without the lines the composer added under it, so ↑ gives back what the user wrote. */
fun promptOf(sent: String): String {
    val lines = sent.lines()
    val kept = lines.dropLastWhile { ADDED_LINE.matches(it) }
    return if (kept.isEmpty() || kept.all { it.isBlank() }) sent else kept.joinToString("\n")
}

/** The prompts the user sent in [transcript], oldest first: the history of a resumed conversation. */
fun promptsOf(transcript: Transcript): List<String> =
    transcript.messages.order.mapNotNull { key ->
        val message = transcript.messages[key]?.takeIf { it.role == Role.USER && it.source != MessageSource.Nested }
        message
            ?.parts
            ?.values()
            ?.filterIsInstance<TextRecord>()
            ?.joinToString("\n") { it.text }
            ?.takeIf { it.isNotBlank() }
            ?.let(::promptOf)
    }
