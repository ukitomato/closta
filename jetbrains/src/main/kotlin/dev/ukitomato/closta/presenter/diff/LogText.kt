package dev.ukitomato.closta.presenter.diff

import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText

/**
 * Writes strings the CLI or the host chose into the text of a `toString`, so a log line that holds one stays one
 * line and reads in the order it was written: as a JSON string (`JsonText`, which already escapes quotes, backslashes
 * and the C0 controls), with every other character a viewer may act on rather than show also escaped as `\u` — the
 * Unicode controls (C1 among them, which some terminals run as cursor moves), the format characters (the
 * bidirectional controls and marks, U+FEFF, the tags) and the line and paragraph separators. A character outside
 * the Basic Multilingual Plane is escaped as its two UTF-16 units.
 *
 * `JsonText` itself writes what the webview receives and stays as it is; this is only for text meant for people.
 */
internal object LogText {
    private const val HEX = 16
    private const val HEX_DIGITS = 4

    private val escapedTypes =
        setOf(
            Character.CONTROL,
            Character.FORMAT,
            Character.LINE_SEPARATOR,
            Character.PARAGRAPH_SEPARATOR,
        ).map { it.toInt() }.toSet()

    private fun safe(json: String): String =
        buildString {
            json.codePoints().forEach { point ->
                val chars = Character.toChars(point)
                if (Character.getType(point) in escapedTypes) {
                    for (char in chars) append("\\u").append(char.code.toString(HEX).padStart(HEX_DIGITS, '0'))
                } else {
                    append(chars)
                }
            }
        }

    /** [text] as a JSON string, the characters above escaped too. */
    fun quote(text: String): String = safe(JsonText.compact(JsonString(text)))

    /** [path] as a JSON array of strings, the characters above escaped too. */
    fun path(path: List<String>): String = safe(JsonText.compact(JsonArray(path.map(::JsonString))))
}
