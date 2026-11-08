package dev.ukitomato.closta.presenter.view

/** Text with its hidden and bidirectional characters replaced by marks; [hadHidden] tells whether any was replaced. */
data class VisibleText(
    val text: String,
    val hadHidden: Boolean,
)

/**
 * Replaces each hidden or bidirectional character with a mark such as `<U+202E>`, so it can be seen where it is shown.
 * Tab and line feed stay; every other C0 control, every C1 control, the bidi embedding, override, isolate and
 * zero-width characters, the line and paragraph separators, and the byte order mark are marked.
 */
fun visible(text: String): VisibleText {
    var hadHidden = false
    val out = StringBuilder(text.length)
    for (char in text) {
        if (isHidden(char)) {
            hadHidden = true
            out.append("<U+%04X>".format(char.code))
        } else {
            out.append(char)
        }
    }
    return VisibleText(out.toString(), hadHidden)
}

private const val TAB = 0x09
private const val LINE_FEED = 0x0A
private const val CONTROL_LIMIT = 0x20
private const val C1_FIRST = 0x80
private const val C1_LAST = 0x9F
private const val ZERO_WIDTH_FIRST = 0x200B
private const val ZERO_WIDTH_LAST = 0x200F
private const val EMBEDDING_FIRST = 0x202A
private const val EMBEDDING_LAST = 0x202E
private const val ISOLATE_FIRST = 0x2066
private const val ISOLATE_LAST = 0x2069
private const val LINE_SEPARATOR = 0x2028
private const val PARAGRAPH_SEPARATOR = 0x2029
private const val BYTE_ORDER_MARK = 0xFEFF

private fun isHidden(char: Char): Boolean {
    val code = char.code
    return when {
        code < CONTROL_LIMIT -> code != TAB && code != LINE_FEED
        code in C1_FIRST..C1_LAST -> true
        code in ZERO_WIDTH_FIRST..ZERO_WIDTH_LAST -> true
        code in EMBEDDING_FIRST..EMBEDDING_LAST -> true
        code in ISOLATE_FIRST..ISOLATE_LAST -> true
        code == LINE_SEPARATOR || code == PARAGRAPH_SEPARATOR -> true
        code == BYTE_ORDER_MARK -> true
        else -> false
    }
}
