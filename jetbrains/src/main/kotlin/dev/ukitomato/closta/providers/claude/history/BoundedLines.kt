package dev.ukitomato.closta.providers.claude.history

import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.io.InputStream

/**
 * The lines of a saved record, read without ever holding a line longer than [maxLineBytes]: a line that is
 * longer is not kept, only counted ([Line.TooLong]), and what is left of it up to its newline is read away. A record
 * has no limit on a line of its own, and one line of a file that is not what the CLI wrote must not become memory.
 *
 * A line is its bytes up to a `\n`, read as UTF-8 the way an `InputStreamReader` does (a damaged byte becomes a
 * replacement character: one damaged byte damages one line). Closing this closes [input].
 */
internal class BoundedLines(
    private val input: InputStream,
    private val maxLineBytes: Int,
) : Closeable {
    sealed interface Line {
        /** A line within the limit; blank when the record has an empty line. */
        class Text(
            val text: String,
        ) : Line

        /** A line longer than the limit: not read, only counted. */
        data object TooLong : Line
    }

    private val buffer = ByteArray(CHUNK)
    private var start = 0
    private var end = 0

    /** The next line, or null at the end of the record. */
    fun next(): Line? {
        val line = ByteArrayOutputStream()
        var tooLong = false
        var sawAny = false
        var finished = false
        while (!finished && fill()) {
            sawAny = true
            val newline = (start until end).firstOrNull { buffer[it] == NEWLINE }
            val stop = newline ?: end
            if (!tooLong) {
                if (line.size() + (stop - start) > maxLineBytes) {
                    tooLong = true
                    line.reset()
                } else {
                    line.write(buffer, start, stop - start)
                }
            }
            start = if (newline == null) end else newline + 1
            finished = newline != null
        }
        return when {
            !sawAny -> null
            tooLong -> Line.TooLong
            else -> Line.Text(String(line.toByteArray(), Charsets.UTF_8))
        }
    }

    // True when there are bytes to take; reads the next chunk when the last is used up.
    private fun fill(): Boolean {
        if (start >= end) {
            start = 0
            end = maxOf(input.read(buffer), 0)
        }
        return start < end
    }

    override fun close() = input.close()

    private companion object {
        const val CHUNK = 64 * 1024
        const val NEWLINE = '\n'.code.toByte()
    }
}
