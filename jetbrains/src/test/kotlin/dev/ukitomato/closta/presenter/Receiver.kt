package dev.ukitomato.closta.presenter

import dev.ukitomato.closta.presenter.SyncContract.Action
import dev.ukitomato.closta.presenter.SyncContract.Received
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonValue

/**
 * One webview's receiving side, as the original TypeScript tests and state layer drive it: the receiver's rule
 * ([SyncContract]) decides, the applier ([TreeApplier]) holds the tree. An apply takes the ops whole; when the
 * applier refuses them, or the tree they leave fails the check along their paths (`checkPatched`), the tree goes
 * back to what it was before them and the receiver asks for a resync from the rev they started from (the
 * protocol's resync rules).
 *
 * It copies the receiver's rule and the applier, not the rest of the state layer
 * of the original TypeScript implementation: no ready sent again after `STALE_LIMIT` stale patches in a row, no wait
 * and retries for a snapshot, and no clearing of the answered approvals on a replace. As a stand-in for the webview it
 * is more forgiving than the real one there.
 */
class Receiver {
    var state: SyncContract.State = SyncContract.initialSync()
        private set

    /** The tree the applier holds; null until the first snapshot. */
    var tree: JsonValue? = null
        private set

    fun receive(raw: JsonValue?): Received {
        val received = SyncContract.receive(state, raw)
        val result =
            when (val action = received.action) {
                is Action.Replace -> received.also { tree = action.tree }
                is Action.Apply -> apply(received, action)
                else -> received
            }
        state = result.state
        return result
    }

    /** Sends ready again (`restart`); returns the ready. */
    fun restart(): JsonObject {
        val (next, ready) = SyncContract.restart(state)
        state = next
        return ready
    }

    private fun apply(
        received: Received,
        action: Action.Apply,
    ): Received {
        val before = checkNotNull(tree) { "an apply before any snapshot" }
        val applied =
            try {
                TreeApplier.apply(before, action.ops)
            } catch (_: TreeApplier.Refused) {
                null
            }
        val issue = applied?.let { TreeContract.checkPatched(it, action.ops) }
        if (applied == null || issue != null) return SyncContract.applyFailed(received.state, action, issue)
        tree = applied
        return received
    }
}
