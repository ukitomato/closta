package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.MessagesContract.Parsed
import dev.ukitomato.closta.presenter.TreeContract.Issue
import dev.ukitomato.closta.presenter.tree.JsonNull
import dev.ukitomato.closta.presenter.tree.JsonNumber
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonString
import dev.ukitomato.closta.presenter.tree.JsonValue

/**
 * A Kotlin copy of the receiver's rule in the webview's TypeScript receiver (`initialSync`, `receive`, `applyFailed`,
 * `restart`): given what arrived, the webview's next state and the one thing to do. It is a copy for the tests that
 * keeps the TypeScript's branches, so the host's message stream can be replayed into a receiver without Node;
 * `SyncContractTest` shows the copy agrees with the original on every step of the sync fixtures — outcome, reason,
 * issue, mode, cursor, the resync or ready it sends, and the counts at the end.
 *
 * Its cursor is its own type, not the host's, so the copy does not lean on what it is used to test.
 */
object SyncContract {
    const val AWAITING = "awaiting"
    const val SYNCED = "synced"
    const val FATAL = "fatal"

    data class Cursor(
        val epoch: String,
        val seq: Long,
    ) {
        fun toJson(): JsonObject = JsonObject.of("epoch" to JsonString(epoch), "seq" to JsonNumber.of(seq))
    }

    data class State(
        val mode: String,
        val cursor: Cursor?,
        val dropped: Map<String, Int>,
    )

    sealed interface Action {
        data class Replace(
            val tree: JsonObject,
        ) : Action

        /** [from] is the rev the ops start from; [applyFailed] goes back to it. */
        data class Apply(
            val ops: List<JsonValue>,
            val from: Cursor,
        ) : Action

        data class Resync(
            val have: Cursor?,
            val reason: String,
            val issue: Issue? = null,
        ) : Action {
            /** The message the webview sends: `{"type":"resync","have":…,"reason":…}`. */
            fun message(): JsonObject =
                JsonObject.of(
                    "type" to JsonString("resync"),
                    "have" to (have?.toJson() ?: JsonNull),
                    "reason" to JsonString(reason),
                )
        }

        data class Drop(
            val reason: String,
            val issue: Issue? = null,
        ) : Action

        data class Fatal(
            val reason: String,
            val issue: Issue? = null,
        ) : Action

        data class Theme(
            val message: JsonObject,
        ) : Action

        data class Capabilities(
            val message: JsonObject,
        ) : Action
    }

    data class Received(
        val state: State,
        val action: Action,
    )

    fun initialSync(): State = State(AWAITING, null, emptyMap())

    /** `restart`: the state after sending ready again, and the ready to send. */
    fun restart(state: State): Pair<State, JsonObject> =
        State(AWAITING, null, state.dropped) to
            JsonObject.of(
                "type" to JsonString("ready"),
                "protocol" to JsonNumber.of(TreeContract.PROTOCOL_VERSION.toLong()),
            )

    private fun count(
        state: State,
        reason: String,
    ): Map<String, Int> {
        val times = (state.dropped[reason] ?: 0) + 1
        return state.dropped + (reason to times)
    }

    private fun drop(
        state: State,
        reason: String,
        issue: Issue? = null,
    ) = Received(state.copy(dropped = count(state, reason)), Action.Drop(reason, issue))

    private fun fatal(
        state: State,
        reason: String,
        issue: Issue? = null,
    ) = Received(State(FATAL, null, count(state, reason)), Action.Fatal(reason, issue))

    private fun resync(
        state: State,
        reason: String,
        have: Cursor?,
        issue: Issue? = null,
    ) = Received(State(AWAITING, have, count(state, reason)), Action.Resync(have, reason, issue))

    @Suppress("ReturnCount")
    private fun onPatch(
        state: State,
        patch: Parsed,
    ): Received {
        if (state.mode == FATAL) return drop(state, "fatal")
        val cursor = state.cursor
        if (state.mode == AWAITING || cursor == null) return drop(state, "awaiting")
        if (patch is Parsed.Rejected) return resync(state, "bad-patch", cursor, patch.issue)
        val (epoch, seq, ops) = patch as Parsed.Patch
        if (epoch != cursor.epoch) return resync(state, "epoch", cursor)
        if (seq <= cursor.seq) return drop(state, "stale")
        if (seq > cursor.seq + 1) return resync(state, "gap", cursor)
        return Received(State(SYNCED, Cursor(epoch, seq), state.dropped), Action.Apply(ops, cursor))
    }

    fun receive(
        state: State,
        raw: JsonValue?,
    ): Received {
        // Another protocol may shape its snapshot differently, so the version is read before the rest.
        if (TreeContract.isOtherProtocol(raw)) return fatal(state, "protocol-mismatch")
        val type = ((raw as? JsonObject)?.get("type") as? JsonString)?.value
        return when (val parsed = MessagesContract.parseHostMessage(raw)) {
            is Parsed.Rejected -> {
                val reason = if (parsed.issue.code == "unknown-type") "unknown-type" else "malformed"
                when (type) {
                    "snapshot" -> fatal(state, "bad-snapshot", parsed.issue)
                    "patch" -> onPatch(state, parsed)
                    else -> drop(state, reason, parsed.issue)
                }
            }
            is Parsed.Snapshot ->
                Received(State(SYNCED, Cursor(parsed.epoch, parsed.seq), state.dropped), Action.Replace(parsed.tree))
            is Parsed.Patch -> onPatch(state, parsed)
            is Parsed.Theme -> Received(state, Action.Theme(parsed.message))
            is Parsed.Capabilities -> Received(state, Action.Capabilities(parsed.message))
        }
    }

    /** `applyFailed`: the ops of [action] did not take, so the tree is at its `from` again; ask from there. */
    fun applyFailed(
        state: State,
        action: Action.Apply,
        issue: Issue? = null,
    ): Received = resync(state, "apply-failed", action.from, issue)
}
