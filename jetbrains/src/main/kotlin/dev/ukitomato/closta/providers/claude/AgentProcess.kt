package dev.ukitomato.closta.providers.claude

import kotlinx.coroutines.flow.Flow

/**
 * An already-launched `claude` process, as [ClaudeSession] consumes it — the provider seam, seen from inside
 * `providers/claude`. argv and the process→`AgentProcess` bridge live in `providers/claude/launch`; the WSL
 * process spawn in `platforms`; auth in `providers/claude/auth` and `platforms`. So this seam carries no process
 * creation and no `com.intellij`. A test drives it with a fake process that replays a capture.
 *
 * [stdoutLines] is a **suspend/[Flow]** source, never a blocking `readLine` the caller must wrap in
 * `Dispatchers.IO`: [ClaudeSession] reads it on the coroutine that collects `events`, so a test can drive
 * the whole session cooperatively under `runBlocking`. An implementation backed by a real OS
 * pipe does that blocking→suspend bridging here, at its own boundary, off the caller's dispatcher.
 *
 * The implementation **must drain the process's stderr** (dropping it, or logging it its own way): an
 * undrained stderr fills the OS pipe buffer and deadlocks the reader — the same hazard as an unread stdout
 * (measured on stdio across WSL). stderr is not surfaced here because it is not protocol.
 */
interface AgentProcess {
    /**
     * One stdout line per element, in arrival order. **Completes only on a clean stdout close (a normal
     * end).** An abnormal termination — a dead process, a broken pipe, or a nonzero exit (e.g. 127 =
     * `command not found`) — must surface as an **exception** on this flow, never as a silent normal
     * completion, so `ClaudeSession` maps it to the event stream's error terminal. The exit
     * code itself is available separately via [awaitExit]. Intended for a **single collection** (`ClaudeSession`
     * collects it once and buffers into its own `Channel(UNLIMITED)`).
     */
    val stdoutLines: Flow<String>

    /** Writes one stream-json message to the process stdin, framing it as a line (appends the newline). */
    suspend fun writeStdin(line: String)

    /** Suspends until the process exits and returns its exit code (so the launch can tell 127 etc. apart). */
    suspend fun awaitExit(): Int

    /** Terminates the process and releases its handles. Idempotent. */
    fun destroy()

    /**
     * Kills the process (and, where the implementation can see them, its descendants) without giving it a chance to
     * clean up — for a process that did not end after [destroy]. Idempotent. The default is [destroy], so an
     * implementation that has no stronger way (a test's fake) stays as it was; an implementation backed by an OS
     * process must override it.
     */
    fun destroyForcibly() = destroy()
}
