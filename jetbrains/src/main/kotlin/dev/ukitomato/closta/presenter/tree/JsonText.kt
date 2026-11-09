package dev.ukitomato.closta.presenter.tree

/**
 * Writes a [JsonValue] as JSON text, in one canonical form: members in the order they were put, nothing
 * escaped that RFC 8259 does not require — quotes, backslashes and control characters — so Japanese text
 * stays readable, except unpaired surrogates, which have no UTF-8 encoding and are written as `\u` escapes so
 * the text still says what the string held. For values without numbers this is what `JSON.stringify` prints
 * in the webview, with or without its 2-space indent. Numbers print as their text ([JsonNumber]).
 *
 * The compact form is what a tool-call's `argsText` holds when only the finished input is known, and what a
 * value too deep or unsafe for the tree is folded into; the pretty form is for goldens and diffs.
 */
object JsonText {
    private const val INDENT = "  "
    private const val HEX_DIGITS = 4
    private const val HEX = 16
    private const val LAST_CONTROL = 0x1f

    fun compact(value: JsonValue): String = StringBuilder().also { write(it, value, null) }.toString()

    fun pretty(value: JsonValue): String = StringBuilder().also { write(it, value, "") }.toString()

    // indent is null for the compact form; otherwise the indent of the line the value starts on.
    private fun write(
        out: StringBuilder,
        value: JsonValue,
        indent: String?,
    ) {
        when (value) {
            is JsonObject -> writeObject(out, value, indent)
            is JsonArray -> writeArray(out, value, indent)
            is JsonString -> quote(out, value.value)
            is JsonNumber -> out.append(value.text)
            is JsonBool -> out.append(value.value)
            JsonNull -> out.append("null")
        }
    }

    private fun writeObject(
        out: StringBuilder,
        value: JsonObject,
        indent: String?,
    ) {
        if (value.size == 0) {
            out.append("{}")
            return
        }
        val inner = indent?.let { it + INDENT }
        out.append('{')
        value.entries.forEachIndexed { index, (key, member) ->
            if (index > 0) out.append(',')
            if (inner != null) out.append('\n').append(inner)
            quote(out, key)
            out.append(if (inner != null) ": " else ":")
            write(out, member, inner)
        }
        if (indent != null) out.append('\n').append(indent)
        out.append('}')
    }

    private fun writeArray(
        out: StringBuilder,
        value: JsonArray,
        indent: String?,
    ) {
        if (value.items.isEmpty()) {
            out.append("[]")
            return
        }
        val inner = indent?.let { it + INDENT }
        out.append('[')
        value.items.forEachIndexed { index, item ->
            if (index > 0) out.append(',')
            if (inner != null) out.append('\n').append(inner)
            write(out, item, inner)
        }
        if (indent != null) out.append('\n').append(indent)
        out.append(']')
    }

    private fun quote(
        out: StringBuilder,
        text: String,
    ) {
        out.append('"')
        for (index in text.indices) {
            val char = text[index]
            when {
                char == '"' -> out.append("\\\"")
                char == '\\' -> out.append("\\\\")
                char == '\n' -> out.append("\\n")
                char == '\r' -> out.append("\\r")
                char == '\t' -> out.append("\\t")
                char == '\b' -> out.append("\\b")
                char == '\u000c' -> out.append("\\f")
                char.code <= LAST_CONTROL || isUnpaired(text, index) -> escape(out, char)
                else -> out.append(char)
            }
        }
        out.append('"')
    }

    private fun isUnpaired(
        text: String,
        index: Int,
    ): Boolean {
        val char = text[index]
        return when {
            char.isHighSurrogate() -> index + 1 >= text.length || !text[index + 1].isLowSurrogate()
            char.isLowSurrogate() -> index == 0 || !text[index - 1].isHighSurrogate()
            else -> false
        }
    }

    private fun escape(
        out: StringBuilder,
        char: Char,
    ) {
        out.append("\\u").append(char.code.toString(HEX).padStart(HEX_DIGITS, '0'))
    }
}
