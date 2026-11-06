package dev.ukitomato.closta.presenter.stream

import dev.ukitomato.closta.presenter.TreeContract
import dev.ukitomato.closta.presenter.diff.Diff
import dev.ukitomato.closta.presenter.diff.DiffChecks
import dev.ukitomato.closta.presenter.diff.Op
import dev.ukitomato.closta.presenter.diff.structuralDiff
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.lang.reflect.Modifier

/** Each rule of [OpStream] on hand-made trees, with the exact messages it gives, as the protocol sends them. */
class OpStreamTest {
    private fun obj(text: String): JsonObject = JsonRead.parse(text) as JsonObject

    private fun tree(text: String): JsonObject =
        obj("""{"threads":{"order":["t1"],"byId":{"t1":{"id":"t1","isRunning":false,"messages":$text}}}}""")

    private fun withText(text: String): JsonObject =
        tree(
            """{"order":["m1"],"byId":{"m1":{"id":"m1","role":"user","parts":""" +
                """{"order":["m1:0"],"byId":{"m1:0":{"type":"text","text":"$text"}}}}}}""",
        )

    private val empty = tree("""{"order":[],"byId":{}}""")
    private val one = withText("hi")
    private val grown = withText("hi there")

    /** Epochs e1, e2, … in order. */
    private fun epochs(): () -> String {
        var next = 0
        return { "e${++next}" }
    }

    private fun wire(message: TreeMessage?): String = JsonText.compact(checkNotNull(message).toJson())

    @Test
    fun `a new stream is at seq 0 of a fresh epoch, and ready sends the tree it started from`() {
        val stream = OpStream(empty, epochs())
        assertEquals(Cursor("e1", 0), stream.cursor)
        assertSame(empty, stream.sent)
        assertEquals(
            """{"type":"snapshot","protocol":1,"epoch":"e1","seq":0,"tree":${JsonText.compact(empty)}}""",
            wire(stream.ready()),
        )
        assertEquals(TreeContract.Snapshot.Accepted, TreeContract.checkSnapshot(stream.ready().toJson()))
    }

    @Test
    fun `a change goes out as a patch at the next seq, carrying exactly the diff's ops in order`() {
        val stream = OpStream(empty, epochs())
        val first = stream.next(one) as Patch
        val ops = (structuralDiff(empty, one) as Diff.Ops).ops
        assertEquals(ops, first.ops)
        assertEquals(Cursor("e1", 1), first.cursor)
        assertEquals(Cursor("e1", 1), stream.cursor)
        assertSame(one, stream.sent)
        assertEquals(
            """{"type":"patch","epoch":"e1","seq":1,"ops":${JsonText.compact(JsonArray(ops.map(Op::toJson)))}}""",
            wire(first),
        )
        assertNull(TreeContract.checkPatch(first.toJson()), "the webview's envelope check takes the patch")
        val second = stream.next(grown) as Patch
        assertEquals(Cursor("e1", 2), second.cursor)
        assertEquals(
            """{"type":"patch","epoch":"e1","seq":2,"ops":[{"type":"append-text",""" +
                """"path":["threads","byId","t1","messages","byId","m1","parts","byId","m1:0","text"],""" +
                """"value":" there"}]}""",
            wire(second),
        )
    }

    @Test
    fun `an unchanged tree sends nothing and keeps the seq, and an equal copy becomes the tree sent`() {
        val stream = OpStream(one, epochs())
        assertNull(stream.next(one))
        val copy = DiffChecks.deepCopy(one) as JsonObject
        assertNull(stream.next(copy))
        assertEquals(Cursor("e1", 0), stream.cursor)
        assertSame(copy, stream.sent, "the next diff skips what it shares with the newest tree")
        assertEquals(Cursor("e1", 1), stream.next(grown)?.cursor)
    }

    @Test
    fun `a change ops cannot express starts a new epoch with a snapshot at seq 0`() {
        val stream = OpStream(empty, epochs())
        stream.next(one)
        // A root key that is gone takes a set at the empty path, which the protocol refuses: only a snapshot can do it.
        val withExtra =
            JsonObject
                .Builder()
                .put("threads", one["threads"]!!)
                .put("extra", JsonArray.EMPTY)
                .build()
        assertEquals(Cursor("e1", 2), stream.next(withExtra)?.cursor)
        val replaced = stream.next(grown)
        assertEquals(Diff.Replace, structuralDiff(withExtra, grown))
        assertEquals(Snapshot(Cursor("e2", 0), grown), replaced)
        assertEquals(
            """{"type":"snapshot","protocol":1,"epoch":"e2","seq":0,"tree":${JsonText.compact(grown)}}""",
            wire(replaced),
        )
        assertEquals(Cursor("e2", 0), stream.cursor)
        assertSame(grown, stream.sent)
        assertEquals(Cursor("e2", 1), stream.next(one)?.cursor, "the new epoch counts from 0")
    }

    @Test
    fun `ready and resync answer with the last tree sent at the current cursor, and change neither`() {
        val stream = OpStream(empty, epochs())
        stream.next(one)
        stream.next(grown)
        val expected = Snapshot(Cursor("e1", 2), grown)
        assertEquals(expected, stream.ready())
        assertEquals(expected, stream.resync())
        assertEquals(expected, stream.ready(), "a second ready gets the same answer")
        assertEquals(Cursor("e1", 2), stream.cursor)
        assertEquals(Cursor("e1", 3), stream.next(one)?.cursor, "the next patch follows the snapshot's seq")
    }

    @Test
    fun `a ready asked while the stream starts a new epoch answers with a cursor and the tree sent at it`() {
        // The supplier is called in the middle of next(): a ready from there sees the stream between two states, the
        // way a ready from another thread would. The cursor and the tree are one value, so it sees the last whole one.
        val seen = ArrayList<Snapshot>()
        var stream: OpStream? = null
        var epochs = 0
        val made =
            OpStream(empty) {
                epochs++
                stream?.let { seen += it.ready() }
                "e$epochs"
            }
        stream = made
        made.next(one)
        val withExtra =
            JsonObject
                .Builder()
                .put("threads", one["threads"]!!)
                .put("extra", JsonArray.EMPTY)
                .build()
        made.next(withExtra)
        assertEquals(Snapshot(Cursor("e2", 0), grown), made.next(grown))
        assertEquals(listOf(Snapshot(Cursor("e1", 2), withExtra)), seen)
    }

    @Test
    fun `the cursor and the tree sent at it change only together, in one volatile field`() {
        // A test on one thread cannot see two fields torn apart between their writes, or a write another thread does
        // not see without volatile, so the shape of the stream is read: what changes is one field, and it is volatile.
        val changing =
            OpStream::class.java.declaredFields.filter {
                !Modifier.isStatic(it.modifiers) && !Modifier.isFinal(it.modifiers)
            }
        assertEquals(listOf("state"), changing.map { it.name }, "the cursor and the tree sent at it are one field")
        assertTrue(Modifier.isVolatile(changing.single().modifiers), "another thread sees the last pair written")
    }

    @Test
    fun `several changes sent as one patch are the diff of the trees at the two ends`() {
        val stream = OpStream(empty, epochs())
        val patch = stream.next(grown) as Patch
        assertEquals((structuralDiff(empty, grown) as Diff.Ops).ops, patch.ops)
        assertEquals(Cursor("e1", 1), patch.cursor)
        // Not the two diffs one after the other, joined: those are 3 ops, one setting the text the other appends to.
        val joined = (structuralDiff(empty, one) as Diff.Ops).ops + (structuralDiff(one, grown) as Diff.Ops).ops
        assertEquals(3, joined.size)
        assertNotEquals(joined, patch.ops)
        assertEquals(2, patch.ops.size)
    }

    @Test
    fun `the epoch supplier must give a non-empty id unlike the last one`() {
        assertThrows<IllegalStateException> { OpStream(empty) { "" } }
        val same = OpStream(empty) { "e1" }
        val withExtra =
            JsonObject
                .Builder()
                .put("threads", empty["threads"]!!)
                .put("extra", JsonArray.EMPTY)
                .build()
        same.next(withExtra)
        assertThrows<IllegalStateException> { same.next(empty) }
        val first = OpStream(empty)
        val second = OpStream(empty)
        assertTrue(first.cursor.epoch.isNotEmpty())
        assertNotEquals(first.cursor.epoch, second.cursor.epoch, "a new stream, as after a restart, is a new epoch")
    }

    @Test
    fun `a message prints its kind and cursor, never the tree or an op's value, and an epoch cannot break the line`() {
        val secret = "value-not-for-logs"
        val stream = OpStream(empty) { "e\n1" }
        val next =
            tree(
                """{"order":["m1"],"byId":{"m1":{"id":"m1","role":"user",""" +
                    """"parts":{"order":[],"byId":{}},"x":"$secret"}}}""",
            )
        val patch = stream.next(next)!!
        assertEquals("""patch "e\n1" 1 (2 ops)""", patch.toString())
        assertEquals("""snapshot "e\n1" 1 (1 root keys)""", stream.ready().toString())
        assertEquals("""cursor "e\n1" 1""", stream.cursor.toString())
        for (text in listOf(patch.toString(), stream.ready().toString(), stream.cursor.toString())) {
            assertTrue(secret !in text && '\n' !in text, text)
        }
        assertTrue(secret in wire(patch) && secret in wire(stream.ready()), "the wire form carries the values")
    }

    @Test
    fun `an epoch with a line separator, a bidirectional control or a C1 control is escaped wherever it is printed`() {
        val stream = OpStream(empty) { "e\u2028\u202e\u009b\u200e1" }
        val patch = stream.next(one)!!
        assertEquals("""patch "e\u2028\u202e\u009b\u200e1" 1 (2 ops)""", patch.toString())
        assertEquals("""snapshot "e\u2028\u202e\u009b\u200e1" 1 (1 root keys)""", stream.ready().toString())
        assertEquals("""cursor "e\u2028\u202e\u009b\u200e1" 1""", patch.cursor.toString())
        assertEquals(
            "e\u2028\u202e\u009b\u200e1",
            (patch.toJson()["epoch"] as JsonString).value,
            "the wire carries the epoch as it is",
        )
    }

    @Test
    fun `a patch's ops cannot be changed afterwards`() {
        val patch = OpStream(empty, epochs()).next(one) as Patch
        assertThrows<UnsupportedOperationException> { (patch.ops as MutableList<Op>).clear() }
    }
}
