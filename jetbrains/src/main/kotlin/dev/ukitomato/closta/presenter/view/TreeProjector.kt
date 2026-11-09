package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.TreeRules

/**
 * One thread to project: core's state of its conversation and the presenter's [Transcript] of it, both folded
 * by the caller from the same inputs. The host names the thread before the first turn, so
 * [id] is the host's and must be a tree key.
 */
data class ThreadSource(
    val id: String,
    val conversation: ConversationState,
    val transcript: Transcript,
) {
    init {
        require(TreeRules.isKey(id)) { "a thread id must be a tree key: '$id'" }
    }
}

/**
 * Projects threads to the state tree the webview receives (the protocol's Tree), in its vocabulary only.
 *
 * The tree is a value: a fresh projector given the same threads builds an equal tree. What one projector adds
 * is its memo of the last tree it built — a node whose record is the same object as last time, drawn with the
 * same domain facts, is the same node object, and so is every collection above nodes that all stayed. An
 * input that touches one message leaves every other message node, and the parts under it, as they were;
 * that is what lets whatever compares two trees skip an untouched branch by identity, and what lets the
 * webview's converter cache recognise a message it already converted. The memo is the projector's only
 * state.
 *
 * How to call it: from one thread at a time (the memo is plain fields); keep the previous tree yourself if
 * something compares trees — the projector does not hand it back; and expect a thread that leaves the list to
 * be forgotten, so that if it comes back it is built afresh.
 */
class TreeProjector {
    private var threads: Map<String, ThreadMemo> = emptyMap()
    private var root: Pair<CollectionMemo, JsonObject>? = null

    /** The tree of [sources], in their order. The protocol requires at least one thread, each id once. */
    fun project(sources: List<ThreadSource>): JsonObject {
        require(sources.isNotEmpty()) { "the tree has at least one thread" }
        require(sources.distinctBy { it.id }.size == sources.size) { "thread ids are unique" }
        val projected = LinkedHashMap<String, ThreadMemo>()
        for (source in sources) projected[source.id] = ThreadProjection(source, threads[source.id]).project()
        val collection = collection(projected, root?.first)
        val previous = root
        val node =
            if (previous != null && previous.first.node === collection.node) {
                previous.second
            } else {
                rootNode(collection.node)
            }
        threads = projected
        root = collection to node
        return node
    }
}

/** The tree of [sources], built from nothing. */
fun projectTree(sources: List<ThreadSource>): JsonObject = TreeProjector().project(sources)
