package dev.ukitomato.closta.presenter.stream

import dev.ukitomato.closta.presenter.Receiver
import dev.ukitomato.closta.presenter.SyncContract
import dev.ukitomato.closta.presenter.SyncContract.Action
import dev.ukitomato.closta.presenter.TreeContract
import dev.ukitomato.closta.presenter.TreeHash
import dev.ukitomato.closta.presenter.toolCalls
import dev.ukitomato.closta.presenter.tree.JsonArray
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText
import dev.ukitomato.closta.presenter.tree.JsonValue
import dev.ukitomato.closta.presenter.view.CaptureReplay
import dev.ukitomato.closta.presenter.view.PresenterInput
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/**
 * Each capture's stream ([ReplayGolden]) replayed into the Kotlin copy of the webview's receiving side ([Receiver]),
 * which `replay.test.ts` does again with the real receiver and applier from the committed file:
 * - the first message is the snapshot that answers ready, and every later one a patch that applies — no resync, no
 *   drop, no other snapshot, since nothing on the way is lost and the root never changes;
 * - after each message the receiver holds the tree the projection made at that input, whose [TreeHash] the line
 *   carries, under the stream's cursor;
 * - an approval is on its tool call, open, right after the `control_request` input, resolved right after the host's
 *   answer, and still there at every later input: the op stream never drops it;
 * - the applier may list a node's own fields in another order than the projection (it puts a key it adds at the
 *   end), but never the keys inside a value the screen prints as JSON (a tool call's arguments and result).
 */
class CaptureStreamTest {
    private val leafKeys = setOf("args", "result", "error", "options")

    /** One step of a replay as the webview meets it: the input, the projected tree after it, the message as sent. */
    private class Delivery(
        val index: Int,
        val input: PresenterInput?,
        val tree: JsonObject,
        val raw: JsonObject?,
    )

    private fun deliveries(replay: ReplayGolden.Replay): List<Delivery> =
        replay.steps.map { step ->
            val raw = step.message?.let { JsonRead.parse(JsonText.compact(it.toJson())) as JsonObject }
            Delivery(step.index, step.input, step.tree, raw)
        }

    @TestFactory
    fun `each capture's stream applies message by message to the projected trees`(): List<DynamicTest> =
        CaptureReplay.scenarios().map { scenario ->
            DynamicTest.dynamicTest(scenario) {
                val replay = ReplayGolden.replay(scenario)
                val (problems, approvals) = replayProblems(deliveries(replay))
                assertEquals(emptyList<String>(), problems, scenario)
                val expected = List(if (scenario in WITH_APPROVALS) approvalCount(scenario) else 0) { false }
                assertEquals(expected, approvals.values.toList(), "$scenario: the approvals, resolved at the end")
            }
        }

    /**
     * Replays [steps] into a [Receiver]; says what went wrong, and how each approval stood at the end. It stops after
     * the first input with a problem: what comes after follows from it, and one line says how much was left.
     */
    private fun replayProblems(steps: List<Delivery>): Pair<List<String>, Map<String, Boolean>> {
        val problems = ArrayList<String>()
        val receiver = Receiver()
        val open = LinkedHashMap<String, Boolean>()
        var messages = 0
        for ((position, step) in steps.withIndex()) {
            val at = "input ${step.index}"
            step.raw?.let { raw ->
                problems += messageFaults(receiver, raw, first = messages == 0).map { "$at: $it" }
                messages++
            }
            treeFault(receiver.tree, step.tree)?.let { problems += "$at: $it" }
            ReplayGolden.approvalOf(step.input)?.let { (id, opens) -> open[id] = opens }
            for ((id, isOpen) in open) approvalFault(receiver.tree, id, isOpen)?.let { problems += "$at: $it" }
            if (problems.isNotEmpty()) {
                val left = steps.size - position - 1
                if (left > 0) problems += "the $left inputs after $at were not checked: they follow from the above"
                return problems to open
            }
        }
        if (receiver.state.dropped.isNotEmpty()) problems += "dropped ${receiver.state.dropped}"
        return problems to open
    }

    // The first message answers ready; every later one is a patch that applies, leaving the receiver at its cursor.
    private fun messageFaults(
        receiver: Receiver,
        raw: JsonObject,
        first: Boolean,
    ): List<String> {
        val faults = ArrayList<String>()
        val action = receiver.receive(raw).action
        val due = if (first) action is Action.Replace else action is Action.Apply
        if (!due) faults += "${describe(action)} where ${if (first) "a replace" else "an apply"} was due"
        if (!first && raw["type"] != JsonString("patch")) faults += "a snapshot after the first"
        val cursor = SyncContract.Cursor((raw["epoch"] as JsonString).value, TreeContract.number(raw["seq"]).toLong())
        if (receiver.state.cursor != cursor) faults += "at ${receiver.state.cursor}, sent $cursor"
        return faults
    }

    // The kind of [action] and why, without the tree or the ops it carries.
    private fun describe(action: Action): String =
        when (action) {
            is Action.Replace -> "replace"
            is Action.Apply -> "apply"
            is Action.Resync -> "resync (${action.reason}${action.issue?.let { ", ${it.code} at ${it.at}" }.orEmpty()})"
            is Action.Drop -> "drop (${action.reason})"
            is Action.Fatal -> "fatal (${action.reason})"
            is Action.Theme, is Action.Capabilities -> "a ${action::class.simpleName?.lowercase()} message"
        }

    private fun treeFault(
        tree: JsonValue?,
        projected: JsonObject,
    ): String? =
        when {
            tree == null -> "no tree"
            tree != projected -> "not the projected tree"
            TreeHash.of(tree) != TreeHash.of(projected) -> "another hash"
            TreeContract.checkTree(tree) != null -> "a tree the webview refuses"
            else -> leafOrderFault(tree, projected, "tree", false)?.let { "$it prints otherwise" }
        }

    private fun approvalFault(
        tree: JsonValue?,
        id: String,
        open: Boolean,
    ): String? {
        val call =
            tree?.let { held ->
                toolCalls(held).values.singleOrNull { (it["approval"] as? JsonObject)?.get("id") == JsonString(id) }
            }
                ?: return "the approval $id is on no tool call"
        val approval = call["approval"] as JsonObject
        val resolved = approval.containsKey("approved") || approval.containsKey("resolution")
        return if (resolved == open) "the approval $id is not ${if (open) "open" else "resolved"}" else null
    }

    // Where the keys of an object inside a leaf value come in another order in [applied] than in [projected].
    private fun leafOrderFault(
        applied: JsonValue,
        projected: JsonValue,
        path: String,
        inLeaf: Boolean,
    ): String? =
        when {
            applied is JsonObject && projected is JsonObject -> {
                if (inLeaf && applied.keys.toList() != projected.keys.toList()) {
                    path
                } else {
                    projected.keys.firstNotNullOfOrNull { key ->
                        val child = applied[key] ?: return@firstNotNullOfOrNull null
                        leafOrderFault(child, projected[key]!!, "$path.$key", inLeaf || key in leafKeys)
                    }
                }
            }
            applied is JsonArray && projected is JsonArray ->
                projected.items.indices.firstNotNullOfOrNull { index ->
                    applied.items.getOrNull(index)?.let {
                        leafOrderFault(it, projected.items[index], "$path[$index]", inLeaf)
                    }
                }
            else -> null
        }

    // ---- the checks find what they are there for: defects planted in 05's stream ----

    private val permission by lazy { deliveries(ReplayGolden.replay("05-permission-can-use-tool")) }
    private val request by lazy { permission.first { ReplayGolden.approvalOf(it.input)?.opens == true } }
    private val requestId by lazy { ReplayGolden.approvalOf(request.input)!!.requestId }

    private fun List<Delivery>.withMessage(
        index: Int,
        change: (JsonObject) -> JsonObject?,
    ): List<Delivery> =
        map {
            if (it.index == index && it.raw != null) {
                Delivery(it.index, it.input, it.tree, change(it.raw))
            } else {
                it
            }
        }

    private fun JsonObject.withOps(keep: (JsonObject) -> Boolean): JsonObject {
        val ops = (this["ops"] as JsonArray).items.map { it as JsonObject }.filter(keep)
        val builder = JsonObject.Builder()
        entries.forEach { (key, value) -> builder.put(key, value) }
        return builder.put("ops", JsonArray(ops)).build()
    }

    private fun JsonObject.path(): List<String> = (this["path"] as JsonArray).items.map { (it as JsonString).value }

    @Test
    fun `an op that puts the approval on its call, left out of the stream, is found where the request came`() {
        val dropped =
            permission.withMessage(request.index) { message ->
                message.withOps { it.path().last() != "approval" }
            }
        val problems = replayProblems(dropped).first
        assertTrue(
            "input ${request.index}: the approval $requestId is on no tool call" in problems,
            problems.toString(),
        )
        assertTrue("input ${request.index}: not the projected tree" in problems, problems.toString())
    }

    @Test
    fun `an answer left out of the stream leaves the approval open where it should be resolved`() {
        val answer = permission.first { ReplayGolden.approvalOf(it.input)?.opens == false }
        val unanswered =
            permission.withMessage(answer.index) { message -> message.withOps { "approval" !in it.path() } }
        val problems = replayProblems(unanswered).first
        assertTrue("input ${answer.index}: the approval $requestId is not resolved" in problems, problems.toString())
    }

    @Test
    fun `a lost patch, a patch the check after it refuses, and a reordered leaf value are found`() {
        val messages = permission.filter { it.raw != null }
        val lost = replayProblems(permission.withMessage(messages[3].index) { null }).first
        // The tree after the lost patch's input is not the projected one; the replay stops there.
        assertEquals("input ${messages[3].index}: not the projected tree", lost.first(), lost.toString())
        assertTrue(lost.last().endsWith("were not checked: they follow from the above"), lost.toString())
        val broken =
            permission.withMessage(messages[1].index) { message ->
                val builder = JsonObject.Builder()
                message.entries.forEach { (key, value) -> builder.put(key, value) }
                val emptyOrder =
                    JsonObject.of(
                        "type" to JsonString("set"),
                        "path" to JsonArray(listOf(JsonString("threads"), JsonString("order"))),
                        "value" to JsonArray.EMPTY,
                    )
                builder.put("ops", JsonArray((message["ops"] as JsonArray).items + emptyOrder)).build()
            }
        val refused = replayProblems(broken).first
        val why = "resync (apply-failed, bad-tree at tree.threads.byId.thread-1) where an apply was due"
        assertTrue("input ${messages[1].index}: $why" in refused, refused.toString())
        // The projection lists a tool call's arguments in another order than the stream gave them.
        val last = permission.last()
        val call = toolCalls(last.tree).values.first { (it["args"] as JsonObject).size > 1 }
        val reordered = reorderArgs(last.tree, call["toolCallId"] as JsonString)
        val problems =
            replayProblems(
                permission.dropLast(1) + Delivery(last.index, last.input, reordered, last.raw),
            ).first
        assertTrue(
            problems.any {
                it.startsWith("input ${last.index}: tree.") && it.endsWith(".args prints otherwise")
            },
            problems.toString(),
        )
    }

    // [tree] with the arguments of the tool call [id] in the reverse order.
    private fun reorderArgs(
        value: JsonValue,
        id: JsonString,
    ): JsonObject {
        fun walk(node: JsonValue): JsonValue =
            when {
                node is JsonObject && node["toolCallId"] == id -> {
                    val builder = JsonObject.Builder()
                    node.entries.forEach { (key, member) ->
                        val args = member as? JsonObject
                        val reversed =
                            JsonObject.Builder().also { b ->
                                args?.entries?.reversed()?.forEach { (k, v) -> b.put(k, v) }
                            }
                        builder.put(key, if (key == "args" && args != null) reversed.build() else member)
                    }
                    builder.build()
                }
                node is JsonObject -> {
                    val builder = JsonObject.Builder()
                    node.entries.forEach { (key, member) -> builder.put(key, walk(member)) }
                    builder.build()
                }
                else -> node
            }
        return walk(value) as JsonObject
    }

    @Test
    fun `the captures with an approval are the ones the recorder answered, each opened then resolved`() {
        val seen =
            CaptureReplay.scenarios().associateWith { scenario ->
                ReplayGolden.replay(scenario).steps.mapNotNull { ReplayGolden.approvalOf(it.input)?.opens }
            }
        assertEquals(
            WITH_APPROVALS.associateWith { scenario ->
                List(approvalCount(scenario)) { listOf(true, false) }.flatten()
            },
            seen.filterValues { it.isNotEmpty() },
        )
    }

    @Test
    fun `every capture streams one snapshot and then patches only, counted exactly`() {
        val counts =
            CaptureReplay.scenarios().associateWith { scenario ->
                val messages = ReplayGolden.replay(scenario).messages.map { it.message!! }
                assertInstanceOf(Snapshot::class.java, messages.first(), scenario)
                for (message in messages.drop(1)) assertInstanceOf(Patch::class.java, message, scenario)
                messages.size
            }
        assertEquals(EXPECTED_MESSAGES, counts)
    }

    /**
     * One approval per capture, but 25 asks twice (a Write in each of its first two turns), and 29 and 38 (plan, Edit).
     */
    private fun approvalCount(scenario: String): Int =
        if (scenario == "25-rewind-files" ||
            scenario == "29-exit-plan-mode" ||
            scenario == "38-plan-bypass"
        ) {
            2
        } else {
            1
        }

    private companion object {
        val WITH_APPROVALS =
            listOf(
                "05-permission-can-use-tool",
                "12-subagent-permission",
                "13-ask-timeout",
                "14-ask-answers-updatedinput",
                "15-ask-afktimeout-updatedinput",
                "16-permission-suggestion-accept",
                "17-edit-approval",
                "18-ask-multi-question",
                "25-rewind-files",
                "29-exit-plan-mode",
                "30-deny-empty-message",
                "36-sandbox-unavailable",
                "37-plan-auto",
                "38-plan-bypass",
            )
        val EXPECTED_MESSAGES =
            mapOf(
                "01-baseline-text" to 9,
                "02-tool-bash-autorun" to 27,
                "03-initialize-handshake" to 10,
                "04-tool-autorun-with-ppt-stdio" to 31,
                "05-permission-can-use-tool" to 40,
                "06-context-usage" to 3,
                "07-set-model-and-mode" to 22,
                "08-subagent-task" to 81,
                "09-parallel-subagents" to 117,
                "10-background-task" to 127,
                "11-background-followup" to 127,
                "12-subagent-permission" to 58,
                "13-ask-timeout" to 37,
                "14-ask-answers-updatedinput" to 34,
                "15-ask-afktimeout-updatedinput" to 45,
                "16-permission-suggestion-accept" to 66,
                "17-edit-approval" to 60,
                "18-ask-multi-question" to 58,
                "19-interrupt-background" to 56,
                "20-todowrite" to 85,
                "21-compact" to 16,
                "22-resume" to 28,
                "23-attachments" to 17,
                "24-mcp-management" to 12,
                "25-rewind-files" to 96,
                "26-fork-session" to 32,
                "27-resume-session-at" to 22,
                "28-effort-live" to 10,
                "29-exit-plan-mode" to 173,
                "30-deny-empty-message" to 27,
                "31-send-mid-turn" to 36,
                "32-interrupt-foreground" to 63,
                "33-sandbox-live" to 63,
                "34-sandbox-launch" to 2,
                "35-sandbox-project-setting" to 2,
                "36-sandbox-unavailable" to 41,
                "37-plan-auto" to 134,
                "38-plan-bypass" to 130,
                "39-sandbox-resume" to 39,
                "40-sandbox-same-id" to 3,
            )
    }
}
