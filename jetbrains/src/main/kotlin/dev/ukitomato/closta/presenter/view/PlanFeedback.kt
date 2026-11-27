package dev.ukitomato.closta.presenter.view

private const val MAX_DIFF_LINES = 2000
private const val CONTEXT = 2

private const val LEAD =
    "The user reviewed the plan in the editor and left comments. Lines starting with + were added by the user, " +
        "lines starting with - were removed. Revise the plan accordingly and present it again."

private enum class Kind(
    val mark: Char,
) {
    SAME(' '),
    DELETED('-'),
    ADDED('+'),
}

private class Op(
    val kind: Kind,
    val text: String,
)

/**
 * The user's edits to a plan as comments for Claude: a lead sentence, the user's [note] when it is not blank, and the
 * changed lines as unified-diff hunks with two lines of context. Null when the plan is the same, ignoring trailing
 * spaces. Past 2,000 lines on either side the difference is not worked out; the whole [edited] text follows
 * `Edited plan:` instead.
 */
fun planFeedback(
    original: String,
    edited: String,
    note: String,
): String? {
    val before = linesOf(original)
    val after = linesOf(edited)
    val head = if (note.isBlank()) LEAD else "$LEAD\n\nUser note: ${note.trim()}"
    return when {
        before == after -> null
        before.size > MAX_DIFF_LINES || after.size > MAX_DIFF_LINES -> "$head\n\nEdited plan:\n$edited"
        else -> "$head\n\n${hunksOf(diff(before, after)).joinToString("\n")}"
    }
}

private fun linesOf(text: String): List<String> = text.replace("\r\n", "\n").split('\n').map { it.trimEnd() }

/** The edit script from [before] to [after]: the common head and tail are peeled off first. */
private fun diff(
    before: List<String>,
    after: List<String>,
): List<Op> {
    var head = 0
    while (head < before.size && head < after.size && before[head] == after[head]) head++
    var tail = 0
    while (tail < before.size - head &&
        tail < after.size - head &&
        before[before.size - 1 - tail] == after[after.size - 1 - tail]
    ) {
        tail++
    }
    val ops = ArrayList<Op>(before.size + after.size)
    before.subList(0, head).forEach { ops += Op(Kind.SAME, it) }
    ops += middleOf(before.subList(head, before.size - tail), after.subList(head, after.size - tail))
    before.subList(before.size - tail, before.size).forEach { ops += Op(Kind.SAME, it) }
    return ops
}

private fun middleOf(
    a: List<String>,
    b: List<String>,
): List<Op> {
    // lcs[i][j]: the common length of a[i..] and b[j..].
    val lcs = Array(a.size + 1) { IntArray(b.size + 1) }
    for (i in a.indices.reversed()) {
        for (j in b.indices.reversed()) {
            lcs[i][j] = if (a[i] == b[j]) lcs[i + 1][j + 1] + 1 else maxOf(lcs[i + 1][j], lcs[i][j + 1])
        }
    }
    val ops = ArrayList<Op>(a.size + b.size)
    var i = 0
    var j = 0
    while (i < a.size || j < b.size) {
        when {
            i < a.size && j < b.size && a[i] == b[j] -> ops += Op(Kind.SAME, a[i++]).also { j++ }
            j >= b.size || (i < a.size && lcs[i + 1][j] >= lcs[i][j + 1]) -> ops += Op(Kind.DELETED, a[i++])
            else -> ops += Op(Kind.ADDED, b[j++])
        }
    }
    return ops
}

/** The hunks of [ops]: each change with [CONTEXT] lines around it, changes whose contexts meet sharing one hunk. */
private fun hunksOf(ops: List<Op>): List<String> {
    val changed = ops.indices.filter { ops[it].kind != Kind.SAME }
    val hunks = ArrayList<String>()
    var group = 0
    while (group < changed.size) {
        var last = group
        while (last + 1 < changed.size && changed[last + 1] - changed[last] - 1 <= 2 * CONTEXT) last++
        val from = maxOf(0, changed[group] - CONTEXT)
        val to = minOf(ops.size - 1, changed[last] + CONTEXT)
        hunks += hunk(ops, from, to)
        group = last + 1
    }
    return hunks
}

private fun hunk(
    ops: List<Op>,
    from: Int,
    to: Int,
): String {
    val skipped = ops.subList(0, from)
    val shown = ops.subList(from, to + 1)
    val oldBefore = skipped.count { it.kind != Kind.ADDED }
    val newBefore = skipped.count { it.kind != Kind.DELETED }
    val oldCount = shown.count { it.kind != Kind.ADDED }
    val newCount = shown.count { it.kind != Kind.DELETED }
    // A side with no lines starts at the line before, as `diff -u` writes it.
    val oldStart = if (oldCount == 0) oldBefore else oldBefore + 1
    val newStart = if (newCount == 0) newBefore else newBefore + 1
    val body = shown.joinToString("\n") { "${it.kind.mark}${it.text}" }
    return "@@ -$oldStart,$oldCount +$newStart,$newCount @@\n$body"
}
