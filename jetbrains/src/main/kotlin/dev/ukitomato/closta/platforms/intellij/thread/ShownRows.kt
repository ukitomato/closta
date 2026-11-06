package dev.ukitomato.closta.platforms.intellij.thread

import dev.ukitomato.closta.presenter.view.TextRow
import dev.ukitomato.closta.presenter.view.ThreadRow
import java.util.IdentityHashMap

/**
 * A row as the Swing column draws it: a presenter row as it is, or one Markdown block of a [TextRow] (a long reply is
 * many rows, so only the blocks in sight become components).
 */
sealed interface ShownRow {
    val key: String
    val opens: Boolean

    data class Of(
        val row: ThreadRow,
    ) : ShownRow {
        override val key: String get() = row.key
        override val opens: Boolean get() = row.opens
    }

    data class Block(
        override val key: String,
        val block: HtmlBlock,
        override val opens: Boolean,
    ) : ShownRow

    /** After the blocks of a reply that is still being written: it moves while the text comes. */
    data class Typing(
        override val key: String,
    ) : ShownRow {
        override val opens: Boolean get() = false
    }
}

/** Expands presenter rows into shown rows, giving back the same objects for every row that is the same object. */
class ShownRows(
    private val markdown: (String) -> List<HtmlBlock>,
) {
    private var made = IdentityHashMap<ThreadRow, List<ShownRow>>()

    // The blocks of the last time by key: a streaming reply is a new TextRow on every delta, but its blocks before
    // the last are equal to the ones before, and the same objects are given back so that only the last is drawn again.
    private var blocks = HashMap<String, ShownRow.Block>()
    private var replies = HashMap<String, String>()

    /** The whole Markdown of the reply the block [blockKey] is a part of, for copying it. */
    fun replyOf(blockKey: String): String? = replies[blockKey.substringBeforeLast('#')]

    fun of(rows: List<ThreadRow>): List<ShownRow> {
        val next = IdentityHashMap<ThreadRow, List<ShownRow>>()
        val out = ArrayList<ShownRow>(rows.size)
        for (row in rows) {
            val shown = made[row] ?: expand(row)
            next[row] = shown
            out += shown
        }
        made = next
        replies =
            HashMap<String, String>().also { kept -> rows.forEach { if (it is TextRow) kept[it.key] = it.markdown } }
        blocks =
            HashMap<String, ShownRow.Block>().also { kept ->
                out.forEach { if (it is ShownRow.Block) kept[it.key] = it }
            }
        return out
    }

    private fun expand(row: ThreadRow): List<ShownRow> =
        if (row is TextRow) {
            val shown: List<ShownRow> =
                markdown(row.markdown).mapIndexed { index, block ->
                    val fresh = ShownRow.Block("${row.key}#$index", block, row.opens && index == 0)
                    blocks[fresh.key]?.takeIf { it == fresh } ?: fresh
                }
            if (row.streaming) shown + ShownRow.Typing("${row.key}#typing") else shown
        } else {
            listOf(ShownRow.Of(row))
        }
}
