package dev.ukitomato.closta.presenter.view

/** The most characters of one output that are read: the CLI sends the last 8 KiB. */
private const val MAX_CHARS = 64 * 1024

private const val ESC = '\u001B'
private const val BEL = '\u0007'
private const val CSI_INTRO = '['
private const val OSC_INTRO = ']'
private const val ST_END = '\\'
private const val PARAMETER_FIRST = '0'
private const val INTERMEDIATE_LAST = '/'
private const val FINAL_FIRST = '@'
private const val FINAL_LAST = '~'

/**
 * A terminal's output as the plain text it would show once settled, for a text area: colour and cursor sequences
 * (CSI) and window titles (OSC, ended by a bell or by ESC and a backslash, or by the end of its line) are dropped,
 * `\r\n` is a line end, a `\r` inside a line goes back to its start and what follows overwrites it (a progress line
 * shows its last state), and every other control character is made visible as [visible] does. Nothing is read as
 * markup.
 */
fun terminalText(raw: String): String {
    val text = if (raw.length > MAX_CHARS) raw.takeLast(MAX_CHARS) else raw
    val lines = LineBuffer(text.length)
    var at = 0
    while (at < text.length) {
        val skipped = endOfSequence(text, at)
        val char = text[at]
        at =
            when {
                skipped > at -> skipped
                char == '\r' && text.getOrNull(at + 1) == '\n' -> at + 1
                else -> {
                    lines.put(char)
                    at + 1
                }
            }
    }
    return visible(lines.toString()).text
}

/** The text so far, with the place in its last line where the next character goes. */
private class LineBuffer(
    capacity: Int,
) {
    private val out = StringBuilder(capacity)
    private var lineStart = 0
    private var column = 0

    fun put(char: Char) {
        when (char) {
            '\r' -> column = 0
            '\n' -> {
                out.append('\n')
                lineStart = out.length
                column = 0
            }
            else -> {
                if (lineStart + column < out.length) out.setCharAt(lineStart + column, char) else out.append(char)
                column++
            }
        }
    }

    override fun toString(): String = out.toString()
}

/** Where the escape sequence at [at] ends, or [at] when none starts there. */
private fun endOfSequence(
    text: String,
    at: Int,
): Int =
    when {
        text[at] != ESC -> at
        text.getOrNull(at + 1) == CSI_INTRO -> endOfCsi(text, at + 2)
        text.getOrNull(at + 1) == OSC_INTRO -> endOfOsc(text, at + 2)
        else -> at
    }

/** Where the CSI whose parameters start at [from] ends: after its final byte; an unfinished one takes the rest. */
private fun endOfCsi(
    text: String,
    from: Int,
): Int {
    var at = from
    while (at < text.length && text[at] in PARAMETER_FIRST..'?') at++
    while (at < text.length && text[at] in ' '..INTERMEDIATE_LAST) at++
    return if (at < text.length && text[at] in FINAL_FIRST..FINAL_LAST) at + 1 else at
}

/** Where the OSC whose body starts at [from] ends: after its bell or string terminator; at its line end otherwise. */
private fun endOfOsc(
    text: String,
    from: Int,
): Int {
    var at = from
    var end = -1
    while (end < 0 && at < text.length) {
        val char = text[at]
        end =
            when {
                char == BEL -> at + 1
                char == ESC && text.getOrNull(at + 1) == ST_END -> at + 2
                char == '\n' -> at
                else -> -1
            }
        at++
    }
    return if (end >= 0) end else text.length
}
