package dev.ukitomato.closta.presenter.tree

import com.google.gson.Strictness
import com.google.gson.stream.JsonReader
import com.google.gson.stream.JsonToken
import java.io.IOException
import java.io.StringReader

/**
 * Reads JSON text into a [JsonValue], or gives `null` when the text is not one complete JSON value. It never
 * throws: the presenter reads the content of stdout lines with it, and a reader that throws on one odd line
 * would stop the projection for the whole conversation.
 *
 * The reader counts nesting itself. Gson 2.11's `JsonReader` has no nesting limit, and everything that later
 * walks a value (equality, the writer) recurses, so a value that would open more than [NESTING_LIMIT] objects
 * and arrays is not built: it is skipped (`skipValue` walks it with a counter, not by recursion) and stands in
 * the value as [TOO_DEEP]. The rest of the line is read as usual. Losing the whole line instead would lose what
 * sits next to the deep value — a tool call's command beside a deep pad, the approval for it, the block count
 * of its message — and a call the user is asked to approve must show what it runs. The limit is twice the
 * tree's [TreeRules.MAX_DEPTH] on purpose: a value that is too deep *for the tree* is still read whole, so the
 * projection can fold it into its text. The value is built with a stack of its own, so no input overflows the
 * call stack while reading.
 *
 * Later Gson releases give `JsonReader` a nesting limit of its own, 255 by default (2.13.1 checked), which
 * would refuse those values first: upgrading Gson needs `setNestingLimit(NESTING_LIMIT)` here.
 */
object JsonRead {
    const val NESTING_LIMIT: Int = 2 * TreeRules.MAX_DEPTH

    /** What stands where a value nested deeper than [NESTING_LIMIT] was. */
    const val TOO_DEEP: String = "[nested deeper than $NESTING_LIMIT levels, not shown]"

    fun parse(text: String): JsonValue? =
        try {
            val reader = JsonReader(StringReader(text))
            reader.setStrictness(Strictness.STRICT)
            ValueReader(reader).read().takeIf { reader.peek() == JsonToken.END_DOCUMENT }
        } catch (ignoredMalformed: IOException) {
            null
        } catch (ignoredWrongToken: IllegalStateException) {
            null
        } catch (ignoredBadNumber: IllegalArgumentException) {
            null
        }

    private sealed interface Open {
        fun add(value: JsonValue)

        fun close(): JsonValue
    }

    private class OpenObject : Open {
        private val builder = JsonObject.Builder()
        var name: String? = null

        override fun add(value: JsonValue) {
            builder.put(checkNotNull(name), value)
            name = null
        }

        override fun close(): JsonValue = builder.build()
    }

    private class OpenArray : Open {
        private val items = ArrayList<JsonValue>()

        override fun add(value: JsonValue) {
            items.add(value)
        }

        override fun close(): JsonValue = if (items.isEmpty()) JsonArray.EMPTY else JsonArray(items)
    }

    /** Reads one value token by token; the objects and arrays still open are its stack. */
    private class ValueReader(
        private val reader: JsonReader,
    ) {
        private val open = ArrayDeque<Open>()

        fun read(): JsonValue {
            while (true) {
                val value = next() ?: continue
                val parent = open.lastOrNull() ?: return value
                parent.add(value)
            }
        }

        // A value that is complete after this token, or null while one is still open.
        private fun next(): JsonValue? =
            when (reader.peek()) {
                JsonToken.BEGIN_OBJECT -> enter(OpenObject()) { reader.beginObject() }
                JsonToken.BEGIN_ARRAY -> enter(OpenArray()) { reader.beginArray() }
                JsonToken.NAME -> {
                    (open.last() as OpenObject).name = reader.nextName()
                    null
                }
                JsonToken.END_OBJECT -> {
                    reader.endObject()
                    open.removeLast().close()
                }
                JsonToken.END_ARRAY -> {
                    reader.endArray()
                    open.removeLast().close()
                }
                else -> scalar()
            }

        private fun enter(
            container: Open,
            begin: () -> Unit,
        ): JsonValue? {
            if (open.size == NESTING_LIMIT) {
                reader.skipValue()
                return JsonString(TOO_DEEP)
            }
            begin()
            open.addLast(container)
            return null
        }

        private fun scalar(): JsonValue =
            when (reader.peek()) {
                JsonToken.STRING -> JsonString(reader.nextString())
                JsonToken.NUMBER -> JsonNumber(reader.nextString())
                JsonToken.BOOLEAN -> JsonBool.of(reader.nextBoolean())
                JsonToken.NULL -> {
                    reader.nextNull()
                    JsonNull
                }
                else -> throw IOException("no value at ${reader.path}")
            }
    }
}
