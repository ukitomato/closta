package dev.ukitomato.closta.providers.claude.launch

import dev.ukitomato.closta.providers.claude.AgentProcess
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import java.io.BufferedWriter

/**
 * Wraps an already-started [Process] as the [AgentProcess] `ClaudeSession` consumes. This is the **real OS
 * stdout read point**, so it does the blocking→suspend bridging here, off the collector's
 * dispatcher; `ClaudeSession` stays dispatcher-independent. Abnormal termination surfaces as an exception on
 * [stdoutLines], never as a silent normal completion.
 *
 * Teardown is via [destroy]: a blocking `readLine` on the process pipe (a `FileInputStream`) does **not**
 * abort on thread interruption, so cancelling the collection alone does not unwedge the reader. `ClaudeSession`
 * calls [destroy] in its `finally`, which closes the streams and lets the reads return.
 */
class ProcessAgentProcess(
    private val process: Process,
) : AgentProcess {
    private val stdin: BufferedWriter = process.outputStream.bufferedWriter()

    override val stdoutLines: Flow<String> =
        flow {
            coroutineScope {
                // stdout is read on a dedicated IO coroutine into an UNLIMITED channel so the OS reader is
                // never paused: WSL-tunnelled stdio deadlocks if the reader stops, measured at 200 KB.
                // A suspending (bounded) channel would push backpressure back into the reader and re-create
                // that deadlock; a conflating/dropping buffer would lose protocol lines — neither is allowed.
                val lines: Channel<String> = Channel(Channel.UNLIMITED)
                // stderr must be drained or the OS pipe fills and deadlocks the reader. It runs
                // until stderr EOF (process exit) — NOT cancelled at stdout EOF, so it keeps draining while
                // awaitExit() below waits for a process that closed stdout but is still writing stderr. A late
                // stderr read error is best-effort (stderr is not protocol) and must not turn a clean
                // stdout completion into a stream error.
                launch(Dispatchers.IO) {
                    try {
                        process.errorStream.bufferedReader().use { it.forEachLine { _ -> } }
                    } catch (cancel: CancellationException) {
                        throw cancel
                    } catch (
                        @Suppress("TooGenericExceptionCaught") ignored: Throwable,
                    ) {
                        // best-effort drain; a broken stderr does not fail the event stream
                    }
                }
                launch(Dispatchers.IO) {
                    try {
                        process.inputStream.bufferedReader().use { reader ->
                            // trySend to an UNLIMITED channel never suspends: the OS reader keeps draining
                            // regardless of how fast the collector consumes.
                            reader.forEachLine { line -> lines.trySend(line) }
                        }
                        lines.close()
                    } catch (cancel: CancellationException) {
                        lines.close(cancel)
                        throw cancel
                    } catch (
                        @Suppress("TooGenericExceptionCaught") failure: Throwable,
                    ) {
                        // A dead process or broken stdout surfaces to the stream as an error, not a silent end.
                        lines.close(failure)
                    }
                }
                for (line in lines) emit(line)
                // stdout closed cleanly. Await exit *inside* this scope so the stderr drainer is still active
                // (no deadlock if the process floods stderr after closing stdout). A nonzero exit (e.g. 127 =
                // `command not found`) is abnormal and surfaces as an exception, not a normal completion.
                val code = awaitExit()
                if (code != 0) throw ProcessExitException(code)
            }
        }

    override suspend fun writeStdin(line: String) {
        withContext(Dispatchers.IO) {
            stdin.write(line)
            stdin.write("\n")
            stdin.flush()
        }
    }

    // Process.waitFor() is idempotent once the process has exited: it returns the same code on every call,
    // so both [stdoutLines]' terminal check and an external caller observe the same exit. Interruptible: a process
    // that closed stdout but runs on would otherwise hold a cancelled collection until it ends.
    override suspend fun awaitExit(): Int = runInterruptible(Dispatchers.IO) { process.waitFor() }

    override fun destroy() {
        runCatching { stdin.close() } // release the stdin FD and unwedge a blocked reader; idempotent
        process.destroy()
    }

    // The descendants are listed before the parent dies (they are re-parented after), and listing may fail: a Process
    // that is not the JDK's has no handle, and over WSL only the Windows side's children are seen. The parent's kill
    // does not depend on any of it.
    override fun destroyForcibly() {
        runCatching { stdin.close() }
        runCatching { process.descendants().toList().forEach { runCatching { it.destroyForcibly() } } }
        process.destroyForcibly()
    }
}

/**
 * A process ended abnormally (nonzero exit, e.g. 127). Not a [CancellationException], so a dropped stream is not
 * mistaken for a cancel.
 */
class ProcessExitException(
    val exitCode: Int,
) : RuntimeException("claude process exited with code $exitCode")
