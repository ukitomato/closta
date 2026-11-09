package dev.ukitomato.closta.providers.claude

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * An [AgentProcess] driven by a [ProcessScript] instead of a real `claude` process — the test double used
 * so `ClaudeSession` can be exercised with no CLI. It streams raw stdout lines (which `ClaudeSession`
 * decodes through [StreamJsonCodec]), optionally blocking after a control request until the host answers on
 * stdin (mirroring the CLI blocking on an unanswered `request_id`), and ends the stream normally, with an
 * error, or before it starts (the three terminals the contract measures).
 *
 * The stdout source is suspend/Flow: the flow suspends cooperatively, so under the contract's
 * single-threaded `runBlocking` the `yield` hand-off reaches it. A dropped stream ends with a
 * **non-[kotlinx.coroutines.CancellationException]** provider error, because the contract's
 * `failureOfCollecting` does not re-raise cancellation and would otherwise mis-read it.
 */
class FakeAgentProcess(
    private val script: ProcessScript,
) : AgentProcess {
    private val stdinWrites = mutableListOf<String>()

    /** stdin lines the session wrote, in order — for fake-specific checks. */
    val writtenStdin: List<String> get() = stdinWrites.toList()

    private var destroyedFlag = false

    /** Whether [destroy] has run — for the lifecycle test. */
    val isDestroyed: Boolean get() = destroyedFlag

    // One gate; the recorded captures carry at most one control request. respondToApproval or interrupt
    // (any stdin write) or destroy releases it.
    private val stdinArrived = CompletableDeferred<Unit>()

    override val stdoutLines: Flow<String> =
        flow {
            (script.termination as? ProcessTermination.LaunchFailure)?.let { throw it.cause }
            for (beat in script.beats) {
                when (beat) {
                    is ProcessBeat.Line -> emit(beat.text)
                    ProcessBeat.AwaitStdin -> stdinArrived.await()
                }
            }
            (script.termination as? ProcessTermination.Error)?.let { throw it.cause }
        }

    override suspend fun writeStdin(line: String) {
        stdinWrites += line
        if (!stdinArrived.isCompleted) stdinArrived.complete(Unit)
    }

    override suspend fun awaitExit(): Int = 0

    override fun destroy() {
        destroyedFlag = true
        if (!stdinArrived.isCompleted) stdinArrived.complete(Unit)
    }
}

/** How a [FakeAgentProcess] streams stdout and ends. */
data class ProcessScript(
    val beats: List<ProcessBeat>,
    val termination: ProcessTermination = ProcessTermination.Complete,
)

/** One step the fake plays on stdout. */
sealed interface ProcessBeat {
    /** Emit one raw stdout line (the session decodes it with [StreamJsonCodec]). */
    data class Line(
        val text: String,
    ) : ProcessBeat

    /** Block stdout until the host writes to stdin — the CLI blocking on an unanswered `request_id`. */
    data object AwaitStdin : ProcessBeat
}

/** How the fake's stdout ends — the three capture-absent terminals. */
sealed interface ProcessTermination {
    data object Complete : ProcessTermination

    /** Mid/post-stream failure — a dropped connection or dead process. Must not be a CancellationException. */
    data class Error(
        val cause: Throwable,
    ) : ProcessTermination

    /** Fails the moment stdout is collected — a launch that never produced a usable process. */
    data class LaunchFailure(
        val cause: Throwable,
    ) : ProcessTermination
}

/** Streams [rawLines] straight through, no blocking — used for golden and transport checks. */
fun straightReplay(
    rawLines: List<String>,
    termination: ProcessTermination = ProcessTermination.Complete,
): ProcessScript = ProcessScript(rawLines.map { ProcessBeat.Line(it) }, termination)

/**
 * Streams [rawLines] but blocks on the host after each control-request line, reproducing the CLI blocking
 * on an unanswered `request_id`. The line's kind is decided with [StreamJsonCodec] (the builder, not the fake,
 * decodes — the fake only replays strings).
 */
fun awaitingAfterControlRequest(rawLines: List<String>): ProcessScript =
    ProcessScript(
        buildList {
            for (line in rawLines) {
                add(ProcessBeat.Line(line))
                if (StreamJsonCodec.decode(line) is AgentEvent.ControlRequest) add(ProcessBeat.AwaitStdin)
            }
        },
    )
