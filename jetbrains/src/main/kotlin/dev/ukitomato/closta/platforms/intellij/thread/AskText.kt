package dev.ukitomato.closta.platforms.intellij.thread

private val MENTION = Regex("(?<=^|\\s)@\\S+")

/** Where the `@` mentions of an ask are: each word that starts with `@`, at the start or after a space. */
fun mentions(text: String): List<IntRange> = MENTION.findAll(text).map { it.range }.toList()

/** How many lines of an ask show before it folds. */
const val ASK_LINES = 12

/** The first [ASK_LINES] lines of [text] when it has more, else null (it shows whole). */
fun foldedAsk(text: String): String? {
    val lines = text.lines()
    return if (lines.size > ASK_LINES) lines.take(ASK_LINES).joinToString("\n") else null
}
