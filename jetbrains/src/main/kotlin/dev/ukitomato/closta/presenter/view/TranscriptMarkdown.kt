package dev.ukitomato.closta.presenter.view

/**
 * The head of an exported conversation. [exportedAt] is the time as the host wrote it, in the user's own clock. The
 * title is the conversation's name, which the user typed or said: [toString] leaves it out.
 */
data class ExportHeader(
    val title: String,
    val model: String?,
    val exportedAt: String,
) {
    override fun toString(): String = "ExportHeader(${if (model == null) "no model" else "model"})"
}

/** The fixed words of an export, as the host says them in the user's language; the presenter has no bundle. */
data class ExportWords(
    val you: String,
    val claude: String,
    val attachment: String,
    val subagent: String,
    val denied: String,
    val withdrawn: String,
    val cleared: String,
    val compacted: String,
    val olderLeftOut: String,
    val model: String,
    val exportedAt: String,
)

private const val RULE = "---"

/**
 * The conversation as Markdown: what the user said and Claude answered, each tool call as one line, a sub-agent as one
 * line, and the places where the conversation was cleared or compacted. Thinking, tool results and diffs are left out.
 * Lines end with `\n`, and so does the text.
 */
fun transcriptMarkdown(
    transcript: Transcript,
    header: ExportHeader,
    words: ExportWords,
): String {
    val out = ExportBuilder()
    out.line("# ${oneLine(header.title)}")
    if (transcript.restored?.partly == true) out.line("> ${oneLine(words.olderLeftOut)}")
    val stamp = "${words.exportedAt}: ${oneLine(header.exportedAt)}"
    out.line(header.model?.let { "${words.model}: ${oneLine(it)} · $stamp" } ?: stamp)
    for (key in transcript.messages.order) {
        val message = transcript.messages[key] ?: continue
        if (message.role == Role.USER) {
            userMessage(out, message, key in transcript.withdrawn, words)
        } else {
            assistantMessage(out, message, words)
        }
    }
    return out.text()
}

private fun userMessage(
    out: ExportBuilder,
    message: MessageRecord,
    withdrawn: Boolean,
    words: ExportWords,
) {
    out.block("## ${words.you}" + if (withdrawn) " (${words.withdrawn})" else "")
    for (part in message.parts.values()) {
        when (part) {
            is TextRecord -> if (!part.reasoning) out.block(clean(part.text))
            is AttachmentRecord -> out.item("- ${words.attachment}: ${oneLine(part.name)}")
            else -> Unit
        }
    }
}

private fun assistantMessage(
    out: ExportBuilder,
    message: MessageRecord,
    words: ExportWords,
) {
    var headed = false
    val heading = {
        if (!headed) out.block("## ${words.claude}")
        headed = true
    }
    for (part in message.parts.values()) {
        when (part) {
            is TextRecord ->
                if (!part.reasoning && part.text.isNotBlank()) {
                    heading()
                    out.block(clean(part.text))
                }
            is ToolCallRecord -> {
                heading()
                out.item(toolItem(part, words))
            }
            is InformationalRecord -> {
                heading()
                out.block(clean(part.content).lines().joinToString("\n") { "> $it" })
            }
            is ClearedRecord -> {
                out.block(RULE)
                out.block(oneLine(words.cleared))
                headed = false
            }
            is CompactedRecord -> {
                out.block(RULE)
                out.block(oneLine(words.compacted))
                headed = false
            }
            else -> Unit
        }
    }
}

private fun toolItem(
    call: ToolCallRecord,
    words: ExportWords,
): String {
    agentSummary(call)?.let { summary ->
        return "- ${words.subagent}" + (summary.description?.let { ": ${oneLine(it)}" } ?: "")
    }
    val line = toolLine(call)
    val changes = listOfNotNull(line.added?.let { "+$it" }, line.removed?.let { "−$it" }).joinToString(" ")
    val refused = if (line.state == ToolLineState.DENIED) " (${words.denied})" else ""
    return "- ${oneLine(line.label)}" + (if (changes.isEmpty()) "" else " $changes") + refused
}

/** What the CLI or the user wrote, with its line ends made `\n` and its hidden characters made visible. */
private fun clean(text: String): String = visible(text.replace("\r\n", "\n").replace('\r', '\n')).text.trim('\n')

private fun oneLine(text: String): String = visible(text).text.replace('\n', ' ')

/**
 * Collects blocks, each set off by an empty line; consecutive list items ([item]) stay together, so a run of tool
 * calls reads as one list.
 */
private class ExportBuilder {
    private val text = StringBuilder()
    private var listOpen = false

    fun line(line: String) {
        text.append(line).append('\n')
    }

    fun block(block: String) {
        text.append('\n').append(block).append('\n')
        listOpen = false
    }

    fun item(item: String) {
        if (!listOpen) text.append('\n')
        text.append(item).append('\n')
        listOpen = true
    }

    fun text(): String = text.toString()
}
