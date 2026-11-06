package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonValue

/** How a line of a [EditDiff] reads: kept, added, or removed. */
enum class DiffKind {
    SAME,
    ADDED,
    REMOVED,
}

data class DiffLine(
    val kind: DiffKind,
    val text: String,
)

/**
 * The small diff a permission card shows for an `Edit` or a `Write`: the lines
 * of the input's strings, not of the file. [added] and [removed] count every line, also the ones [cut] left out of
 * [lines].
 */
data class EditDiff(
    val filePath: String,
    val lines: List<DiffLine>,
    val added: Int,
    val removed: Int,
    val replaceAll: Boolean,
    val cut: Boolean,
) {
    // The path and the lines are the user's code: never in a log.
    override fun toString(): String = "EditDiff(+$added -$removed, ${lines.size} lines, cut=$cut)"
}

/** The most lines a card shows; the rest is for the diff viewer. */
const val DIFF_MAX_LINES = 2_000

private const val CONTEXT = 3
private const val LCS_MAX_CELLS = 4_000_000L
private const val EDIT = "Edit"
private const val WRITE = "Write"

/** The diff for a call of [toolName] with [input]; null for any other tool, or an input that cannot be read. */
fun editDiff(
    toolName: String,
    input: JsonValue?,
): EditDiff? {
    val fields = input as? JsonObject
    val path = fields?.string("file_path") ?: return null
    return when (toolName) {
        EDIT -> editOf(path, fields)
        WRITE ->
            fields.string("content")?.let {
                made(
                    path,
                    linesOf(it).map { line ->
                        DiffLine(DiffKind.ADDED, line)
                    },
                )
            }
        else -> null
    }
}

private fun editOf(
    path: String,
    fields: JsonObject,
): EditDiff? {
    val old = fields.string("old_string")
    val new = fields.string("new_string")
    return if (old == null ||
        new == null
    ) {
        null
    } else {
        made(path, compared(linesOf(old), linesOf(new)), fields.replaceAll())
    }
}

private fun JsonObject.replaceAll() = this["replace_all"] == JsonBool.TRUE

private fun made(
    path: String,
    all: List<DiffLine>,
    replaceAll: Boolean = false,
): EditDiff {
    val shown = withContext(all)
    return EditDiff(
        filePath = path,
        lines = shown.take(DIFF_MAX_LINES),
        added = all.count { it.kind == DiffKind.ADDED },
        removed = all.count { it.kind == DiffKind.REMOVED },
        replaceAll = replaceAll,
        cut = shown.size > DIFF_MAX_LINES,
    )
}

/** The lines of [text]: split at `\n`, no empty line after a last newline, none at all for "". */
private fun linesOf(text: String): List<String> {
    if (text.isEmpty()) return emptyList()
    val lines = text.split('\n')
    return if (text.endsWith('\n')) lines.dropLast(1) else lines
}

/** [old] to [new] line by line: the common head and tail kept, the middle by LCS when it is small enough. */
private fun compared(
    old: List<String>,
    new: List<String>,
): List<DiffLine> {
    var head = 0
    while (head < old.size && head < new.size && old[head] == new[head]) head++
    var tail = 0
    while (tail < old.size - head &&
        tail < new.size - head &&
        old[old.size - 1 - tail] == new[new.size - 1 - tail]
    ) {
        tail++
    }
    val a = old.subList(head, old.size - tail)
    val b = new.subList(head, new.size - tail)
    val middle =
        if (a.size.toLong() * b.size > LCS_MAX_CELLS) {
            a.map { DiffLine(DiffKind.REMOVED, it) } + b.map { DiffLine(DiffKind.ADDED, it) }
        } else {
            lcs(a, b)
        }
    return old.subList(0, head).map { DiffLine(DiffKind.SAME, it) } +
        middle +
        old.subList(old.size - tail, old.size).map { DiffLine(DiffKind.SAME, it) }
}

private fun lcs(
    a: List<String>,
    b: List<String>,
): List<DiffLine> {
    // length[i][j]: the LCS of a[i..] and b[j..].
    val length = Array(a.size + 1) { IntArray(b.size + 1) }
    for (i in a.indices.reversed()) {
        for (j in b.indices.reversed()) {
            length[i][j] = if (a[i] == b[j]) length[i + 1][j + 1] + 1 else maxOf(length[i + 1][j], length[i][j + 1])
        }
    }
    val out = ArrayList<DiffLine>(a.size + b.size)
    var i = 0
    var j = 0
    while (i < a.size || j < b.size) {
        when {
            i < a.size && j < b.size && a[i] == b[j] -> {
                out += DiffLine(DiffKind.SAME, a[i])
                i++
                j++
            }
            // A removal goes ahead of the addition that replaces it.
            i < a.size && (j == b.size || length[i + 1][j] >= length[i][j + 1]) ->
                out +=
                    DiffLine(DiffKind.REMOVED, a[i++])
            else -> out += DiffLine(DiffKind.ADDED, b[j++])
        }
    }
    return out
}

/** [lines] with the kept lines more than [CONTEXT] away from every change left out. */
private fun withContext(lines: List<DiffLine>): List<DiffLine> {
    val changed = lines.indices.filter { lines[it].kind != DiffKind.SAME }
    if (changed.isEmpty()) return emptyList()
    val near = BooleanArray(lines.size)
    for (at in changed) {
        for (k in (at - CONTEXT).coerceAtLeast(0)..(at + CONTEXT).coerceAtMost(lines.size - 1)) {
            near[k] =
                true
        }
    }
    return lines.filterIndexed { index, _ -> near[index] }
}

/**
 * What the file would hold after the call, for the diff viewer (nothing is written): an `Edit`'s replacement put into
 * [current] (every one with `replace_all`), a `Write`'s content. Null for an `Edit` whose `old_string` is not in
 * [current], and for any other tool.
 */
fun contentAfter(
    toolName: String,
    input: JsonValue?,
    current: String?,
): String? {
    val fields = input as? JsonObject ?: return null
    return when (toolName) {
        EDIT -> {
            val old = fields.string("old_string")
            val new = fields.string("new_string")
            val now = current ?: ""
            when {
                old.isNullOrEmpty() || new == null || old !in now -> null
                fields.replaceAll() -> now.replace(old, new)
                else -> now.replaceFirst(old, new)
            }
        }
        WRITE -> fields.string("content")
        else -> null
    }
}

/**
 * The two sides the diff viewer shows for the call: the file now and [contentAfter] it; for an `Edit` whose text is not
 * in the file (any more), its `old_string` against its `new_string`. Null when there is nothing to show.
 */
fun diffSides(
    toolName: String,
    input: JsonValue?,
    current: String?,
): Pair<String, String>? {
    contentAfter(toolName, input, current)?.let { return (current ?: "") to it }
    val fields = input as? JsonObject
    val old = fields?.string("old_string")
    val new = fields?.string("new_string")
    return if (toolName == EDIT && old != null && new != null) old to new else null
}
