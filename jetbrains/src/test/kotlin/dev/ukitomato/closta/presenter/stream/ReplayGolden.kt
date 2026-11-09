package dev.ukitomato.closta.presenter.stream

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.presenter.TreeHash
import dev.ukitomato.closta.presenter.tree.JsonBool
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonText
import dev.ukitomato.closta.presenter.view.CaptureReplay
import dev.ukitomato.closta.presenter.view.HostState
import dev.ukitomato.closta.presenter.view.PresenterInput
import dev.ukitomato.closta.presenter.view.TreeProjector
import java.util.concurrent.ConcurrentHashMap

/**
 * Each capture replayed the way the host lives it — core and the transcript folded per input ([HostState]), the
 * tree projected by one [TreeProjector], and one [OpStream.next] per input — as the stream of messages a webview
 * receives, written to `src/test/protocol-fixtures/replay.jsonl` for the webview's own receiver and applier to replay
 * (in its replay test). The file is the generated stream, not a hand-made fixture: `ReplayGoldenTest` holds it to what
 * this makes, and it changes whenever the projection or the differ does.
 *
 * All captures are in the one file, one JSON object per line, so a capture added to the recorder is replayed on both
 * sides without a new import (a test next to the sources cannot list a directory). A changed op shows as a
 * changed line. Per capture, in order:
 * - `{"scenario":…,"inputs":…,"messages":…}` — the capture, how many host inputs it has and how many messages follow;
 * - `{"input":i,"tree":…,"message":…}` — a message the host sends after input `i` (-1: the snapshot that answers the
 *   webview's first ready), and [TreeHash] of the tree the webview must hold once it has applied it;
 * - `{"input":i,"approval":id,"open":…}` — after input `i` the tree holds the approval `id` on its tool call, still
 *   open (a `control_request` came) or resolved (the host answered it). The id is the request's, read from the input,
 *   not from the tree;
 * - `{"final":…}` — the tree after the last input, as the projection writes it.
 */
object ReplayGolden {
    const val FILE = "replay.jsonl"
    const val BEFORE_INPUTS = -1

    /**
     * Epochs e1, e2, … for one capture, as a host would choose new ones. A capture whose projection lost a root key
     * would get a snapshot of a new epoch in the file, which the checks on the stream then name, rather than a
     * supplier that refuses to repeat an epoch.
     */
    fun epochs(): () -> String {
        var next = 0
        return { "e${++next}" }
    }

    /** The approval an input opens ([opens]) or resolves, named by the request's id. */
    data class ApprovalStep(
        val requestId: String,
        val opens: Boolean,
    )

    class Step(
        val index: Int,
        val input: PresenterInput?,
        val tree: JsonObject,
        val message: TreeMessage?,
    )

    class Replay(
        val scenario: String,
        val inputs: Int,
        val steps: List<Step>,
    ) {
        val messages: List<Step> get() = steps.filter { it.message != null }
        val final: JsonObject get() = steps.last().tree
    }

    private val replays = ConcurrentHashMap<String, Replay>()

    /** The capture's replay, made once per test run: steps and trees are values. */
    fun replay(scenario: String): Replay = replays.getOrPut(scenario) { make(scenario) }

    private fun make(scenario: String): Replay {
        var state = HostState()
        val projector = TreeProjector()
        val first = projector.project(listOf(state.source(CaptureReplay.THREAD)))
        val stream = OpStream(first, epochs())
        val steps = mutableListOf(Step(BEFORE_INPUTS, null, first, stream.ready()))
        val inputs = CaptureReplay.inputs(scenario)
        for ((index, input) in inputs.withIndex()) {
            state = state.next(input)
            val tree = projector.project(listOf(state.source(CaptureReplay.THREAD)))
            steps += Step(index, input, tree, stream.next(tree))
        }
        return Replay(scenario, inputs.size, steps)
    }

    /** The approval [input] opens or resolves, if any. */
    fun approvalOf(input: PresenterInput?): ApprovalStep? =
        when (input) {
            is PresenterInput.Event ->
                (input.event as? AgentEvent.ControlRequest)?.let { ApprovalStep(it.requestId, opens = true) }
            is PresenterInput.Decided -> ApprovalStep(input.decision.requestId, opens = false)
            else -> null
        }

    fun lines(replay: Replay): List<JsonObject> =
        buildList {
            add(
                JsonObject.of(
                    "scenario" to JsonString(replay.scenario),
                    "inputs" to JsonNumber.of(replay.inputs.toLong()),
                    "messages" to JsonNumber.of(replay.messages.size.toLong()),
                ),
            )
            for (step in replay.steps) {
                val index = JsonNumber.of(step.index.toLong())
                step.message?.let { message ->
                    add(
                        JsonObject.of(
                            "input" to index,
                            "tree" to JsonString(TreeHash.of(step.tree)),
                            "message" to message.toJson(),
                        ),
                    )
                }
                approvalOf(step.input)?.let { (id, open) ->
                    add(JsonObject.of("input" to index, "approval" to JsonString(id), "open" to JsonBool.of(open)))
                }
            }
            add(JsonObject.of("final" to replay.final))
        }

    /** The whole file: every capture, in the recorder's order. */
    fun text(): String =
        CaptureReplay.scenarios().flatMap { lines(replay(it)) }.joinToString("") { JsonText.compact(it) + "\n" }
}
