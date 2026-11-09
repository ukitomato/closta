package dev.ukitomato.closta.platforms.intellij.session

import java.util.concurrent.ConcurrentLinkedQueue

/**
 * The processes one session has created and not yet let go, held as the way to destroy each — `Process.destroy` for
 * the version check, `AgentProcess.destroy` for the session — so neither has to be wrapped as the other.
 *
 * [destroyAll] may run on another thread than the session (the owner's disposal); a process registered after that is
 * destroyed at once, so none can slip in behind it. Free of `com.intellij`.
 */
internal class LiveProcesses {
    private val destroyers = ConcurrentLinkedQueue<() -> Unit>()

    @Volatile
    private var closed = false

    /** Registers [target] and returns it; it is destroyed with [destroy] by [destroyAll]. */
    fun <T : Any> track(
        target: T,
        destroy: (T) -> Unit,
    ): T {
        destroyers += { destroy(target) }
        if (closed) destroyAll()
        return target
    }

    /** Destroys every registered process. Destroying is idempotent for both kinds, so running this twice is safe. */
    fun destroyAll() {
        closed = true
        generateSequence { destroyers.poll() }.forEach { it() }
    }
}
