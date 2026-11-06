package dev.ukitomato.closta.presenter.stream

import dev.ukitomato.closta.presenter.diff.LogText
import dev.ukitomato.closta.presenter.diff.Op
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import java.util.Collections

/**
 * The version of the protocol the host speaks (`PROTOCOL_VERSION`): the snapshot carries it, and the webview's
 * ready says which one it speaks.
 */
const val PROTOCOL_VERSION: Long = 1

/**
 * Where a tree stands in the host's sequence (the protocol's `Cursor`): [epoch] names one lifetime of the host's tree,
 * [seq] counts the patches within it. A snapshot carries the cursor the tree is at; the patch after it carries
 * `seq + 1`. [toString] writes the epoch as [TreeMessage] does.
 */
data class Cursor(
    val epoch: String,
    val seq: Long,
) {
    override fun toString(): String = "cursor ${LogText.quote(epoch)} $seq"
}

/**
 * The messages that carry the tree, in the protocol's wire form ([toJson], the shape `parseHostMessage` reads): a
 * snapshot or a patch, each at a cursor. The protocol's `HostMessage` also names theme and capabilities; those are
 * messages of their own, outside the tree's sequence, and not here. Only [OpStream] makes these; a scan of
 * `src/main` keeps it so.
 *
 * [toString] names the kind and the cursor and never the tree or an op's value: a line that logs a message must not
 * carry what the CLI sent. The epoch is written as a JSON string with the line separators and bidirectional controls
 * escaped, so whatever made it cannot break or reorder a log line.
 */
sealed interface TreeMessage {
    val cursor: Cursor

    fun toJson(): JsonObject
}

/** The whole tree at [cursor]: the receiver replaces what it holds and is in step at [cursor]. */
class Snapshot internal constructor(
    override val cursor: Cursor,
    val tree: JsonObject,
) : TreeMessage {
    override fun toJson(): JsonObject =
        JsonObject.of(
            "type" to JsonString("snapshot"),
            "protocol" to JsonNumber.of(PROTOCOL_VERSION),
            "epoch" to JsonString(cursor.epoch),
            "seq" to JsonNumber.of(cursor.seq),
            "tree" to tree,
        )

    override fun equals(other: Any?): Boolean = other is Snapshot && cursor == other.cursor && tree == other.tree

    override fun hashCode(): Int = cursor.hashCode() * HASH_PRIME + tree.hashCode()

    override fun toString(): String = "snapshot ${LogText.quote(cursor.epoch)} ${cursor.seq} (${tree.size} root keys)"
}

/**
 * The [ops] that take the receiver's tree from `seq - 1` to [cursor] in the same epoch. They are a diff's ops as the
 * differ wrote them, in its order: the stream forwards them and never builds, drops or reorders one.
 */
class Patch internal constructor(
    override val cursor: Cursor,
    ops: List<Op>,
) : TreeMessage {
    val ops: List<Op> = Collections.unmodifiableList(ArrayList(ops))

    override fun toJson(): JsonObject =
        JsonObject.of(
            "type" to JsonString("patch"),
            "epoch" to JsonString(cursor.epoch),
            "seq" to JsonNumber.of(cursor.seq),
            "ops" to JsonArray(ops.map(Op::toJson)),
        )

    override fun equals(other: Any?): Boolean = other is Patch && cursor == other.cursor && ops == other.ops

    override fun hashCode(): Int = cursor.hashCode() * HASH_PRIME + ops.hashCode()

    override fun toString(): String = "patch ${LogText.quote(cursor.epoch)} ${cursor.seq} (${ops.size} ops)"
}

private const val HASH_PRIME = 31
