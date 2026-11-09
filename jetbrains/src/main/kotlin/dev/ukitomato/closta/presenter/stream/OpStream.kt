package dev.ukitomato.closta.presenter.stream

import dev.ukitomato.closta.presenter.diff.Diff
import dev.ukitomato.closta.presenter.diff.structuralDiff
import dev.ukitomato.closta.presenter.tree.JsonObject
import java.util.UUID

/**
 * The host's side of keeping one webview's tree in step with the projection (the protocol's resync rules): the
 * cursor the webview is at once it has applied everything sent, and the tree it then holds — the last one sent.
 *
 * - [next] diffs the last tree sent against the projection's next tree. Equal trees send nothing and leave the seq
 *   as it is. Ops go out as a patch at `seq + 1`, exactly the diff's ops in the diff's order. A change ops cannot
 *   express ([Diff.Replace]) starts a new epoch, whose first message is a snapshot at seq 0.
 * - [ready] and [resync] answer with a snapshot of the last tree sent at the current cursor, so the next patch is
 *   `seq + 1` of the same epoch. What the webview asks with never changes the epoch, and its `have` does not matter:
 *   any resync is answered with the whole tree.
 *
 * So a snapshot is sent only in answer to ready or resync, or as the first message of a new epoch; everything else
 * is a patch. A new stream is a new epoch too: the host makes one when it starts and when it builds the presenter
 * again, and sends a webview that is already open the new stream's [ready] snapshot. Until a snapshot of the new
 * epoch arrives, that webview holds the old tree; the first patch of the new epoch would make it ask for a resync,
 * but nothing comes while the tree stays as it is.
 *
 * How often to call [next] is the caller's. Calling it less often diffs the two trees at the ends of the gap, which
 * is how several changes go out as one patch; the op lists of two diffs are never joined (a later op may set a node
 * an earlier one went into, and the webview's check after the patch then refuses a correct tree).
 *
 * How to call it:
 * - [next], [ready], [resync], [cursor] and [sent] from one thread, the projector's, and send each answer before the
 *   next call to [next]. It holds no lock. A [ready] from another thread can be answered with the tree before a patch
 *   that is already on its way and arrive after it: the webview then holds the older tree as synced and does not
 *   notice until the next patch, and none comes while the CLI waits for an approval that patch carried;
 * - send the messages it returns in the order it returns them, all on one path that keeps their order. A snapshot
 *   that answers a resync on another path than the patches can overtake them or fall behind.
 *
 * The cursor and the tree sent under it are still one value, replaced in one volatile write, so that a call that
 * breaks the rule above at least never pairs the new tree with the old seq, whose next patch would apply its ops
 * twice (an append-text would show its text twice).
 *
 * The stream checks nothing about the trees or the ops — the projection keeps the tree within the protocol's rules, the
 * differ writes ops the webview accepts, and the webview checks both on arrival — and it logs nothing.
 */
class OpStream(
    tree: JsonObject,
    private val newEpoch: () -> String = ::randomEpoch,
) {
    /** The cursor and the tree the webview holds at it, always replaced together. */
    private data class Sent(
        val cursor: Cursor,
        val tree: JsonObject,
    )

    @Volatile
    private var state: Sent = Sent(Cursor(fresh(previous = null), 0), tree)

    /** Where the webview is once it has applied everything sent. Read it on the projector's thread, like [sent]. */
    val cursor: Cursor get() = state.cursor

    /** The tree the webview holds at [cursor]. */
    val sent: JsonObject get() = state.tree

    /**
     * What to send so that the webview holds [tree]: a patch, a snapshot of a new epoch, or null when [tree] equals
     * the last tree sent. [tree] becomes the last tree sent in every case, so the next diff can skip the branches it
     * shares with it by identity.
     */
    fun next(tree: JsonObject): TreeMessage? {
        val now = state
        return when (val diff = structuralDiff(now.tree, tree)) {
            is Diff.Ops ->
                if (diff.ops.isEmpty()) {
                    state = Sent(now.cursor, tree)
                    null
                } else {
                    val cursor = Cursor(now.cursor.epoch, now.cursor.seq + 1)
                    state = Sent(cursor, tree)
                    Patch(cursor, diff.ops)
                }
            Diff.Replace -> {
                val cursor = Cursor(fresh(now.cursor.epoch), 0)
                state = Sent(cursor, tree)
                Snapshot(cursor, tree)
            }
        }
    }

    /** The answer to the webview's ready: the last tree sent, at the current cursor. */
    fun ready(): Snapshot = state.let { Snapshot(it.cursor, it.tree) }

    /** The answer to the webview's resync, whatever cursor it says it has: the same as [ready]. */
    fun resync(): Snapshot = ready()

    private fun fresh(previous: String?): String {
        val epoch = newEpoch()
        check(epoch.isNotEmpty() && epoch != previous) { "a new epoch must be a non-empty id unlike the last one" }
        return epoch
    }
}

/** An epoch no other host run or presenter is likely to have chosen. */
fun randomEpoch(): String = UUID.randomUUID().toString()
