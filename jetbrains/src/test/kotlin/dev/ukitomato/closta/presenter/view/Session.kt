package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.presenter.TreeChecks
import dev.ukitomato.closta.presenter.at
import dev.ukitomato.closta.presenter.tree.JsonObject

/**
 * One thread driven the way the host drives it: each input folds core and the transcript ([HostState]), then
 * the tree is projected, and every tree is held to the contract (strictly) and to what a projector without a
 * memo builds from the same state.
 */
class Session(
    private val threadId: String = "t1",
) {
    var state = HostState()
        private set
    val conversation: ConversationState get() = state.conversation
    val transcript: Transcript get() = state.transcript
    private val projector = TreeProjector()
    private var inputs = 0
    var tree: JsonObject = project()
        private set

    private fun project(): JsonObject {
        val tree = projector.project(listOf(state.source(threadId)))
        val at = "after input $inputs"
        TreeChecks.assertContract(tree, at)
        TreeChecks.assertSameAsFresh(tree, projectTree(listOf(state.source(threadId))), at)
        return tree
    }

    fun input(input: PresenterInput): JsonObject {
        state = state.next(input)
        inputs++
        tree = project()
        return tree
    }

    fun events(vararg events: AgentEvent): JsonObject {
        events.forEach { input(PresenterInput.Event(it)) }
        return tree
    }

    fun send(
        id: String,
        text: String,
    ): JsonObject = input(PresenterInput.UserSent(id, text))

    fun decide(
        decision: ApprovalDecision,
        elapsedMs: Long = 1_000,
    ): JsonObject = input(PresenterInput.Decided(decision, elapsedMs))

    /** A user turn [command] that has started: queued and started, as the CLI announces it. */
    fun turn(command: String): JsonObject = events(Lines.queued(command), Lines.started(command))

    val thread: JsonObject get() = tree.at("threads", "byId", threadId)
}
