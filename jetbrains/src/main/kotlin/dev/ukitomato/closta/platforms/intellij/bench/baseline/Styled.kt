package dev.ukitomato.closta.platforms.intellij.bench.baseline

import com.intellij.openapi.editor.markup.TextAttributes

/** A range of [Styled] text and how it is drawn; [lines] paints whole lines (a block's background). */
data class Span(
    val start: Int,
    val end: Int,
    val attributes: TextAttributes,
    val lines: Boolean = false,
)

/** Plain text with the spans that style it, built front to back. */
class Styled {
    val text = StringBuilder()
    val spans = mutableListOf<Span>()

    val length: Int get() = text.length

    /** Appends [words] with every line separator made `\n` (a Document refuses `\r`). */
    fun append(words: CharSequence) {
        text.append(words.toString().replace("\r\n", "\n").replace('\r', '\n'))
    }

    /** Appends what [build] writes and styles it with [attributes]. */
    fun withStyle(
        attributes: TextAttributes?,
        lines: Boolean = false,
        build: Styled.() -> Unit,
    ) {
        val start = length
        build()
        if (attributes != null && length > start) spans += Span(start, length, attributes, lines)
    }

    fun newLine() {
        if (text.isNotEmpty() && text.last() != '\n') text.append('\n')
    }

    /** Ends what came before with one empty line, never more. */
    fun blankLine() {
        newLine()
        if (text.length >= 2 && text[text.length - 2] != '\n') text.append('\n')
    }
}
