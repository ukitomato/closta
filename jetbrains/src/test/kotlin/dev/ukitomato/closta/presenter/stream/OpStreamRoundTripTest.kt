package dev.ukitomato.closta.presenter.stream

import dev.ukitomato.closta.presenter.Receiver
import dev.ukitomato.closta.presenter.SyncContract
import dev.ukitomato.closta.presenter.SyncContract.Action
import dev.ukitomato.closta.presenter.TreeContract
import dev.ukitomato.closta.presenter.diff.Diff
import dev.ukitomato.closta.presenter.diff.DiffChecks
import dev.ukitomato.closta.presenter.diff.Op
import dev.ukitomato.closta.presenter.diff.ShapedTrees
import dev.ukitomato.closta.presenter.diff.structuralDiff
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText
import dev.ukitomato.closta.presenter.tree.JsonValue
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.Collections
import java.util.IdentityHashMap
import java.util.Random

/**
 * The host's stream ([OpStream]) and a webview's receiving side ([Receiver]: the copy of the receiver rule and of
 * the applier) over a link, on sequences of protocol-shaped trees ([ShapedTrees]) — first a clean link, then one that
 * loses, repeats and reorders messages, a host that restarts, a tree only a snapshot can reach, and patches the
 * receiver refuses.
 *
 * What holds on every sequence:
 * - each patch carries exactly the ops of the diff of the last tree sent and the next one, in their order, and a
 *   tree equal to the last one sent sends nothing;
 * - whenever the receiver is in step, its tree is the one the host sent at that cursor (never another tree under the
 *   same cursor) and passes the webview's checks;
 * - once the link is quiet and every request has been answered, the receiver is in step at the host's cursor and
 *   holds the tree last sent;
 * - a snapshot goes out only in answer to ready or resync, or as the first message of a new epoch.
 */
class OpStreamRoundTripTest {
    /** Epochs e1, e2, … across every stream of one sequence, as a host's runs would not reuse one. */
    private class Epochs {
        private var next = 0

        fun fresh(): String = "e${++next}"
    }

    /** The host, the webview and the messages between them, with the faults a test asks for. */
    private class Link(
        tree: JsonObject,
        private val at: String,
    ) {
        private val epochs = Epochs()
        var stream = OpStream(tree, epochs::fresh)
            private set
        val receiver = Receiver()
        private val toWebview = ArrayDeque<JsonValue>()

        // Every message the link did not lose on purpose, and every one the webview read: by object, as sent.
        private val mustArrive: MutableSet<JsonValue> = Collections.newSetFromMap(IdentityHashMap())
        private val arrived: MutableSet<JsonValue> = Collections.newSetFromMap(IdentityHashMap())

        private fun post(raw: JsonValue) {
            mustArrive += raw
            toWebview.addLast(raw)
        }

        private val toHost = ArrayDeque<JsonObject>()
        private var held: JsonValue? = null

        // The last message the host sent was lost: no later patch shows the gap, so only a reconnect does.
        private var lastLost = false

        /** The tree the host sent at each cursor: what a receiver in step at that cursor must hold. */
        private val sentAt = HashMap<SyncContract.Cursor, JsonObject>()
        val outcomes = DiffChecks.Coverage()

        init {
            record(stream.ready())
            toHost.addLast(READY)
        }

        private fun record(message: TreeMessage) {
            sentAt[SyncContract.Cursor(message.cursor.epoch, message.cursor.seq)] = stream.sent
        }

        /** As the wire carries it: JSON text, read back. */
        private fun wire(message: TreeMessage): JsonValue =
            checkNotNull(JsonRead.parse(JsonText.compact(message.toJson()))) { "$at: the message does not read back" }

        /** The host reads what the webview sent and answers each ready and resync with a snapshot. */
        fun answer() {
            while (toHost.isNotEmpty()) {
                val request = toHost.removeFirst()
                val snapshot = if (request.str("type") == "ready") stream.ready() else stream.resync()
                outcomes.count("answered ${request.str("type")}")
                record(snapshot)
                post(wire(snapshot))
            }
        }

        /** The host projects [tree] and sends what the stream gives, through [fault]. */
        fun next(
            tree: JsonObject,
            fault: Fault = Fault.NONE,
        ) {
            val before = stream.sent
            val diff = structuralDiff(before, tree)
            val message = stream.next(tree)
            checkMessage(diff, message)
            if (message == null) return
            record(message)
            send(wire(message), fault)
        }

        private fun checkMessage(
            diff: Diff,
            message: TreeMessage?,
        ) {
            when (diff) {
                is Diff.Ops ->
                    if (diff.ops.isEmpty()) {
                        assertNull(message) { "$at: an equal tree sent $message" }
                    } else {
                        val patch = assertInstanceOf(Patch::class.java, message) { "$at: ops went out as $message" }
                        assertEquals(diff.ops, patch.ops) { "$at: the patch's ops are not the diff's, in order" }
                        assertEquals(JsonArray(diff.ops.map(Op::toJson)), patch.toJson()["ops"]) { "$at: wire ops" }
                        outcomes.count("patch")
                    }
                Diff.Replace -> {
                    val snapshot =
                        assertInstanceOf(Snapshot::class.java, message) { "$at: a replace went out as $message" }
                    assertEquals(0L, snapshot.cursor.seq) { "$at: a new epoch starts at seq 0" }
                    outcomes.count("snapshot of a new epoch")
                }
            }
        }

        private fun send(
            raw: JsonValue,
            fault: Fault,
        ) {
            lastLost = fault == Fault.LOST
            when (fault) {
                Fault.NONE -> post(raw)
                Fault.LOST -> Unit
                Fault.REPEATED -> repeat(2) { post(raw) }
                // A message already held goes first, so holding twice in a row reorders and never loses.
                Fault.HELD -> {
                    held?.let(toWebview::addLast)?.also { outcomes.count("held twice in a row") }
                    mustArrive += raw
                    held = raw
                }
                Fault.REFUSED_BY_APPLIER -> post(withOps(raw, appendToBoolean()))
                Fault.BROKEN_AFTER -> post(withOps(raw, noThreads()))
                Fault.BAD_PATCH -> post(withOps(raw, indexPath()))
            }
            if (fault != Fault.HELD) {
                held?.let(toWebview::addLast)
                held = null
            }
        }

        /**
         * The host builds its presenter again: a new stream, a new epoch, from the tree it would project now.
         * The new epoch starts with a snapshot — sent at once ([Restart.ANNOUNCED]), or as the answer to
         * the ready of a webview that was loaded again with it ([Restart.RELOADED]). [Restart.SILENT] breaks the rule:
         * the webview learns of the new epoch only from its first patch.
         */
        fun restartHost(
            tree: JsonObject,
            restart: Restart,
        ) {
            stream = OpStream(tree, epochs::fresh)
            lastLost = false
            outcomes.count("host restarted, ${restart.name.lowercase()}")
            when (restart) {
                Restart.ANNOUNCED -> {
                    val snapshot = stream.ready()
                    record(snapshot)
                    post(wire(snapshot))
                }
                Restart.RELOADED -> toHost.addLast(receiver.restart())
                Restart.SILENT -> Unit
            }
        }

        /** The webview reads everything that arrived; what it asks for goes to the host. */
        fun deliver() {
            while (toWebview.isNotEmpty()) {
                val raw = toWebview.removeFirst()
                arrived += raw
                val action = receiver.receive(raw).action
                outcomes.count(describe(action))
                if (action is Action.Resync) toHost.addLast(action.message())
                if (action is Action.Fatal) throw AssertionError("$at: the receiver went fatal: $action")
                checkInStep()
            }
        }

        // Whenever the receiver is in step, it holds what the host sent at its cursor, a tree the webview accepts.
        private fun checkInStep() {
            val state = receiver.state
            if (state.mode != SyncContract.SYNCED) return
            val cursor = checkNotNull(state.cursor)
            val expected = sentAt[cursor] ?: throw AssertionError("$at: in step at $cursor, which the host never sent")
            assertEquals(expected, receiver.tree) { "$at: in step at $cursor with another tree" }
            val issue = TreeContract.checkTree(receiver.tree)
            assertNull(issue) { "$at: in step at $cursor with a tree the webview refuses: $issue" }
        }

        /**
         * Runs the link until nothing is in flight; then the receiver must be in step with the host. A receiver
         * behind the host on a quiet link is only allowed when the host's last message was lost — no later patch
         * shows the gap — and then the link drops and comes back, which makes the webview send ready.
         */
        fun settle() {
            held?.let(toWebview::addLast)
            held = null
            repeat(MAX_ROUNDS) {
                if (toWebview.isEmpty() && toHost.isEmpty()) {
                    val cursor = stream.cursor.let { SyncContract.Cursor(it.epoch, it.seq) }
                    if (receiver.state.cursor != cursor && lastLost) {
                        lastLost = false
                        outcomes.count("reconnected after the last message was lost")
                        toHost.addLast(receiver.restart())
                        return@repeat
                    }
                    val missing = mustArrive.count { it !in arrived }
                    assertEquals(0, missing) { "$at: $missing messages the link was to deliver never arrived" }
                    assertEquals(SyncContract.SYNCED, receiver.state.mode) { "$at: the receiver is not in step" }
                    assertEquals(cursor, receiver.state.cursor) { "$at: the receiver's cursor" }
                    assertEquals(stream.sent, receiver.tree) { "$at: the receiver's tree is not the last one sent" }
                    return
                }
                deliver()
                answer()
            }
            throw AssertionError("$at: the link did not settle in $MAX_ROUNDS rounds")
        }

        fun quiet(): Boolean = toWebview.isEmpty() && toHost.isEmpty() && held == null

        private fun withOps(
            raw: JsonValue,
            ops: JsonArray,
        ): JsonValue {
            val message = raw as JsonObject
            if (message.str("type") != "patch") return raw
            outcomes.count("patch altered")
            val builder = JsonObject.Builder()
            message.entries.forEach { (key, value) -> builder.put(key, value) }
            return builder.put("ops", ops).build()
        }

        private val thread: List<String> get() {
            val threads = (stream.sent["threads"] as JsonObject)["order"] as JsonArray
            return listOf("threads", "byId", (threads.items.first() as JsonString).value)
        }

        // The webview's tree has a boolean there: the applier refuses to append to it.
        private fun appendToBoolean() = ops(op("append-text", thread + "isRunning", JsonString("x")))

        // A tree without a thread passes the applier and fails the check after the patch.
        private fun noThreads() = ops(op("set", listOf("threads", "order"), JsonArray.EMPTY))

        // An index in the path: the op check refuses the patch before the applier sees it.
        private fun indexPath() = ops(op("set", thread + listOf("messages", "order", "0"), JsonString("m")))

        private fun ops(vararg op: JsonObject) = JsonArray(op.toList())

        private fun op(
            type: String,
            path: List<String>,
            value: JsonValue,
        ): JsonObject =
            JsonObject.of("type" to JsonString(type), "path" to JsonArray(path.map(::JsonString)), "value" to value)

        private fun describe(action: Action): String =
            when (action) {
                is Action.Replace -> "replace"
                is Action.Apply -> "apply"
                is Action.Resync -> "resync ${action.reason}"
                is Action.Drop -> "drop ${action.reason}"
                is Action.Fatal -> "fatal ${action.reason}"
                is Action.Theme, is Action.Capabilities -> "other"
            }

        private fun JsonObject.str(key: String): String? = (this[key] as? JsonString)?.value

        companion object {
            const val MAX_ROUNDS = 8
            val READY: JsonObject = JsonObject.of("type" to JsonString("ready"))
        }
    }

    enum class Fault { NONE, LOST, REPEATED, HELD, REFUSED_BY_APPLIER, BROKEN_AFTER, BAD_PATCH }

    enum class Restart { ANNOUNCED, RELOADED, SILENT }

    @Test
    fun `on a clean link every message applies and the receiver is in step after each one`() {
        val outcomes = DiffChecks.Coverage()
        for (sequence in 0 until CLEAN_SEQUENCES) {
            val seed = CLEAN_SEED + sequence
            DiffChecks.seeded(seed, "clean sequence $sequence") {
                val trees = ShapedTrees(DiffChecks.random(seed), DiffChecks.Coverage())
                var tree = trees.start()
                val link = Link(tree, "clean sequence $sequence")
                link.settle()
                repeat(STEPS) { step ->
                    tree = trees.step(tree)
                    link.next(tree)
                    link.deliver()
                    assertTrue(link.quiet()) { "clean sequence $sequence step $step: the receiver asked for something" }
                    link.settle()
                }
                link.outcomes.counts.forEach { (kind, times) -> outcomes.count(kind, times) }
            }
        }
        // Only the first ready is ever answered with a snapshot; everything else applied as a patch.
        assertEquals(CLEAN_SEQUENCES, outcomes["replace"], outcomes.counts.toString())
        assertEquals(outcomes["patch"], outcomes["apply"], outcomes.counts.toString())
        assertEquals(setOf("answered ready", "patch", "replace", "apply"), outcomes.counts.keys)
        outcomes.assertReached(CLEAN_SEQUENCES * STEPS / 2, "patch")
    }

    @Test
    fun `a link that loses, repeats and reorders, a host that restarts, and refused patches all recover`() {
        val outcomes = DiffChecks.Coverage()
        for (sequence in 0 until FAULT_SEQUENCES) {
            val seed = FAULT_SEED + sequence
            val at = "fault sequence $sequence"
            DiffChecks.seeded(seed, at) {
                val random = DiffChecks.random(seed)
                val trees = ShapedTrees(random, DiffChecks.Coverage())
                var tree = trees.start()
                var extra = false
                val link = Link(tree, at)
                link.settle()
                repeat(STEPS) { step ->
                    tree = trees.step(tree)
                    // A root key that comes and goes: its removal only a snapshot of a new epoch can send.
                    if (random.nextInt(PERCENT) < EXTRA_ROOT_KEY) extra = !extra
                    val next = if (extra) withExtra(tree) else tree
                    when (val roll = random.nextInt(PERCENT)) {
                        in 0 until RESTART ->
                            link.restartHost(next, if (roll % 2 == 0) Restart.ANNOUNCED else Restart.RELOADED)
                        else -> link.next(next, pickFault(random))
                    }
                    link.deliver()
                    if (random.nextBoolean()) link.answer()
                    if (step % SETTLE_EVERY == SETTLE_EVERY - 1) link.settle()
                }
                link.settle()
                link.outcomes.counts.forEach { (kind, times) -> outcomes.count(kind, times) }
            }
        }
        outcomes.assertReached(
            ENOUGH,
            "patch",
            "apply",
            "replace",
            "snapshot of a new epoch",
            "host restarted, announced",
            "host restarted, reloaded",
            "patch altered",
            "answered ready",
            "answered resync",
            "drop stale",
            "drop awaiting",
            "resync gap",
            "resync epoch",
            "resync apply-failed",
            "resync bad-patch",
            "reconnected after the last message was lost",
            "held twice in a row",
        )
    }

    @Test
    fun `a host that starts a new epoch without a snapshot leaves the webview behind until the next patch`() {
        val trees = ShapedTrees(DiffChecks.random(SILENT_SEED), DiffChecks.Coverage())
        var tree = trees.start()
        val link = Link(tree, "silent restart")
        link.settle()
        repeat(SILENT_STEPS) {
            tree = trees.step(tree)
            link.next(tree)
        }
        link.deliver()
        val behind = link.receiver.state.cursor
        // The restarted host's first tree differs from what the webview holds, but nothing is sent until it changes.
        val changed = generateSequence { trees.step(tree) }.first { it != tree }
        link.restartHost(changed, Restart.SILENT)
        link.deliver()
        assertEquals(behind, link.receiver.state.cursor, "the webview still holds the old epoch")
        assertNotEquals(link.stream.sent, link.receiver.tree, "an old tree, under a cursor the host no longer has")
        // The first patch of the new epoch is what tells it; it asks for a resync and the snapshot puts it in step.
        val after = generateSequence { trees.step(changed) }.first { it != changed }
        link.next(after)
        link.deliver()
        assertEquals(1, link.outcomes["resync epoch"])
        link.settle()
    }

    private fun pickFault(random: Random): Fault {
        val roll = random.nextInt(PERCENT)
        return when {
            roll < LOST -> Fault.LOST
            roll < REPEATED -> Fault.REPEATED
            roll < HELD -> Fault.HELD
            roll < REFUSED -> Fault.REFUSED_BY_APPLIER
            roll < BROKEN -> Fault.BROKEN_AFTER
            roll < BAD -> Fault.BAD_PATCH
            else -> Fault.NONE
        }
    }

    private fun withExtra(tree: JsonObject): JsonObject =
        JsonObject
            .Builder()
            .put("threads", tree["threads"]!!)
            .put("extra", JsonString("only a snapshot removes me"))
            .build()

    private companion object {
        const val SILENT_SEED = 25_200_000L
        const val SILENT_STEPS = 5
        const val CLEAN_SEED = 25_000L
        const val CLEAN_SEQUENCES = 60
        const val FAULT_SEED = 25_100_000L
        const val FAULT_SEQUENCES = 120
        const val STEPS = 30
        const val SETTLE_EVERY = 10
        const val ENOUGH = 10
        const val PERCENT = 100
        const val EXTRA_ROOT_KEY = 12
        const val RESTART = 3

        // pickFault: cumulative percentages.
        const val LOST = 6
        const val REPEATED = 12
        const val HELD = 18
        const val REFUSED = 21
        const val BROKEN = 24
        const val BAD = 27
    }
}
