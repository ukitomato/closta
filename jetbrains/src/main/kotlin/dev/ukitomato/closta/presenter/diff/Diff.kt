package dev.ukitomato.closta.presenter.diff

import java.util.Collections

/** What turns one tree into the next: a list of ops, or nothing short of sending the tree whole. */
sealed interface Diff {
    /**
     * Ops that turn the previous tree into the next when applied in order; empty when the trees are equal.
     *
     * No op's path is a prefix of another's, or equal to it — within this one diff. The ops of two diffs one
     * after the other can break that (the second may set a node the first went into), so a caller that sends
     * several changes as one patch diffs the trees at the two ends again rather than joining the lists.
     */
    class Ops internal constructor(
        ops: List<Op>,
    ) : Diff {
        // The list is all there is to the result, and `diff.ops` says what it holds.
        @Suppress("MemberNameEqualsClassName")
        val ops: List<Op> = Collections.unmodifiableList(ArrayList(ops))

        override fun equals(other: Any?): Boolean = other is Ops && ops == other.ops

        override fun hashCode(): Int = ops.hashCode()

        // Each op as its kind, path and size (Op.toString), never its value.
        override fun toString(): String = ops.joinToString("; ", prefix = "Ops(", postfix = ")")
    }

    /**
     * The change cannot be written as ops: the root changed, and the previous root has a key the next one lacks,
     * or the next root has a key no path may start with. Either would take a set at the empty path, which the
     * protocol refuses — replacing the whole tree is what a snapshot is for.
     */
    data object Replace : Diff
}
