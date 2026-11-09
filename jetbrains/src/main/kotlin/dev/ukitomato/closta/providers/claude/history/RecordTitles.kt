package dev.ukitomato.closta.providers.claude.history

import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonPrimitive
import java.nio.file.Path

/**
 * The title a saved record is listed by, read from as little of it as names it. Like [RecordLines], nothing here
 * throws for a damaged line, and no title leaves this but as the one returned.
 */
internal object RecordTitles {
    /** How many lines from the top of a record are read for its title. */
    const val HEAD_LINES = 200

    /** How many bytes of a record's newest end are read for the lines that name it. */
    const val TAIL_BYTES = 64L * 1024

    /** How many characters of the first sentence the title keeps. */
    const val TITLE_CHARS = 80

    private val WHITESPACE = Regex("\\s+")

    // The lines that name a session, as [RecordLines] finds the conversation's: only a line whose `type` says it is one
    // is parsed.
    private val NAMING_TYPE = Regex("\"type\"\\s*:\\s*\"(?:custom-title|ai-title|last-prompt)\"")

    // What the IDE puts in a request of its own accord (`<ide_opened_file>`, `<ide_selection>`): a text of these tags
    // only is not what the user asked.
    private val IDE_TAGS_ONLY = Regex("(?:\\s*<(ide_[a-z_]+)>.*?</\\1>)+\\s*", RegexOption.DOT_MATCHES_ALL)

    /**
     * What the top of a record says: whether a user of the main conversation speaks, the first sentence he says, and
     * the lines that named the session before it.
     */
    private class HeadScan(
        val sawUser: Boolean,
        val title: String?,
        val names: Names,
    )

    /**
     * The newest of each line that names a session, as far as it was read: the name the user gave (`custom-title`,
     * `/rename`), the CLI's title (`ai-title`) and the last prompt (`last-prompt`). The CLI writes them again as the
     * session goes on, so the newest is the one that holds.
     */
    class Names {
        var custom: String? = null
            private set
        var ai: String? = null
            private set
        var prompt: String? = null
            private set

        /** The name a session is listed by, the way Claude Code chooses it, or null when no line named it. */
        val chosen: String? get() = custom ?: ai ?: prompt

        /** These names, where [newer] (read from later in the record) has none of a kind. */
        fun under(newer: Names): Names =
            Names().also {
                it.custom = newer.custom ?: custom
                it.ai = newer.ai ?: ai
                it.prompt = newer.prompt ?: prompt
            }

        internal fun take(row: JsonObject) {
            when (row.string("type")) {
                "custom-title" -> clip(row.string("customTitle"))?.let { custom = it }
                "ai-title" -> clip(row.string("aiTitle"))?.let { ai = it }
                "last-prompt" -> clip(row.string("lastPrompt"))?.let { prompt = it }
            }
        }
    }

    /**
     * The title of the record at [path], or null when none of its first [HEAD_LINES] lines is a user line of the main
     * conversation (a record with no one speaking in it is not a session to open); empty when nothing in it is a title.
     *
     * It is chosen as Claude Code chooses it: the newest name the user gave, the CLI's title, the last prompt, and only
     * then the first sentence of a user. The CLI writes the names again as a session goes on, so they are looked for in
     * the lines before the first sentence and in the newest [TAIL_BYTES] of the record. A big record is never read to
     * its end for a title, nor through its middle.
     */
    fun titleOf(path: Path): String? {
        val scan = BoundedLines(RecordFiles.openHead(path), RecordLines.MAX_LINE_BYTES).use(::scanHead)
        if (!scan.sawUser) return null
        val newest =
            BoundedLines(RecordFiles.open(path, TAIL_BYTES).input, RecordLines.MAX_LINE_BYTES).use(::scanNames)
        return scan.names.under(newest).chosen ?: scan.title.orEmpty()
    }

    /**
     * Reads the top of a record up to its first user sentence, or [HEAD_LINES] lines. A line over the limit is not a
     * line to read for a title.
     */
    private fun scanHead(lines: BoundedLines): HeadScan {
        var sawUser = false
        var title: String? = null
        val names = Names()
        var read = 0
        while (read < HEAD_LINES && title == null) {
            val line = lines.next() ?: break
            read++
            val text = (line as? BoundedLines.Line.Text)?.text
            val row = text?.takeIf(RecordLines::mayBeConversation)?.let(RecordLines::row)
            if (row != null && row.isMainUser()) {
                sawUser = true
                title = sentenceOf(row)
            } else if (text != null) {
                takeName(text, names)
            }
        }
        return HeadScan(sawUser, title, names)
    }

    /** The newest names in [lines], read to their end: the newest part of a record, bounded by its caller. */
    private fun scanNames(lines: BoundedLines): Names {
        val names = Names()
        while (true) {
            val line = lines.next() ?: return names
            (line as? BoundedLines.Line.Text)?.text?.let { takeName(it, names) }
        }
    }

    private fun takeName(
        line: String,
        names: Names,
    ) {
        if (NAMING_TYPE.containsMatchIn(line)) RecordLines.row(line)?.let(names::take)
    }

    /**
     * The first sentence a user line holds: a string content, or the first text block of a list that says something.
     * A text of the IDE's tags only says nothing the user asked.
     */
    private fun sentenceOf(row: JsonObject): String? {
        val text =
            when (val content = (row.get("message") as? JsonObject)?.get("content")) {
                is JsonPrimitive -> content.takeIf { it.isString }?.asString?.takeIf(::isRequest)
                is JsonArray ->
                    content
                        .mapNotNull { block -> (block as? JsonObject)?.takeIf { it.string("type") == "text" } }
                        .firstNotNullOfOrNull { it.string("text")?.takeIf(::isRequest) }
                else -> null
            }
        return clip(text)
    }

    private fun isRequest(text: String): Boolean =
        text.isNotBlank() && !(text.trimStart().startsWith("<ide_") && IDE_TAGS_ONLY.matches(text))

    /** [text] as a title: one line, its white space one space, of [TITLE_CHARS] characters at most. */
    private fun clip(text: String?): String? {
        val sentence = text?.trim()?.replace(WHITESPACE, " ")?.takeIf { it.isNotEmpty() }
        // By characters a person sees, not by UTF-16 units: a title is never cut through a pair.
        val points = sentence?.codePoints()?.toArray()
        return if (points == null || points.size <= TITLE_CHARS) sentence else String(points, 0, TITLE_CHARS)
    }
}
