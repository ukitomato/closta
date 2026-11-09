package dev.ukitomato.closta.providers.claude

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.Attachment
import dev.ukitomato.closta.providers.claude.protocol.StdinEncoder
import dev.ukitomato.closta.providers.claude.protocol.StreamJsonCodec
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The production [AgentSession]: one long-lived `claude` process driven over stream-json. Reads stdout
 * through [StreamJsonCodec], serialises stdin through [StdinEncoder], and owns the
 * process/jobs/channels' lifetime. It does **not** launch the process — it receives an already-launched
 * [AgentProcess]; the launch lives in `providers/claude/launch`.
 *
 * The same [AgentSessionContract] runs against this and against `FakeAgentSession`; only the factory
 * hook differs. To let that shared suite pass unchanged, the read pump, the stdin writer and
 * the process lifetime are all bound to the coroutine that **collects [events]**: cancelling that
 * collection tears the process, jobs and channels down, and under a single-threaded
 * `runBlocking` the contract's `yield` hand-off reaches the pump. Sends before a collection
 * buffer on [stdinChannel] and drain once collection starts. Intended use is a single collection.
 *
 * Parse and fold run in one coroutine — the collector decodes one line to one [AgentEvent] in
 * order, so `input_json_delta` never straddles and parallel-subagent indices never collide.
 */
@Suppress("TooManyFunctions") // one function per thing the host asks of the session, each writing one stdin line
class ClaudeSession(
    private val process: AgentProcess,
    private val sessionId: String,
) : AgentSession {
    // Outbound stdin, drained by a single writer so lines never interleave. Unbounded: sends
    // may arrive before the collection that starts the writer.
    private val stdinChannel = Channel<String>(Channel.UNLIMITED)

    // events is a single-collection stream: the lifetime is bound to the one collecting
    // coroutine, so re-collecting would re-read a spent process and race the writer. Surface that as an
    // error rather than let it fail silently.
    private val collected = AtomicBoolean(false)

    override val events: Flow<AgentEvent> =
        flow {
            check(collected.compareAndSet(false, true)) {
                // Fan-out belongs in the presenter (a StateFlow over one collection), not here.
                "ClaudeSession.events is single-collection; a second collection would re-read a spent " +
                    "process and race the writer."
            }
            coroutineScope {
                // stdout is pumped into an UNLIMITED channel so the OS reader is never paused: WSL-tunnelled
                // stdio deadlocks if the reader stops, measured at 200 KB. A suspending (bounded) channel would
                // push that backpressure back into the reader and re-create that deadlock; a conflating/dropping
                // buffer would lose protocol lines and corrupt state — neither is allowed.
                val stdoutBuffer = Channel<String>(Channel.UNLIMITED)
                launch {
                    try {
                        process.stdoutLines.collect { stdoutBuffer.send(it) }
                        stdoutBuffer.close()
                    } catch (cancel: CancellationException) {
                        stdoutBuffer.close(cancel)
                        throw cancel
                    } catch (
                        @Suppress("TooGenericExceptionCaught") failure: Throwable,
                    ) {
                        // A dead process or broken stdout surfaces to the stream as an error, not a silent end.
                        stdoutBuffer.close(failure)
                    }
                }
                val writer =
                    launch {
                        for (line in stdinChannel) process.writeStdin(line)
                    }
                try {
                    for (line in stdoutBuffer) emit(StreamJsonCodec.decode(line))
                } finally {
                    // Teardown is bound to this collecting scope: cancel the writer, destroy the process, and
                    // close stdin so a post-teardown send fails loudly (ClosedSendChannelException) instead of
                    // piling up silently in the unbounded channel.
                    writer.cancel()
                    process.destroy()
                    stdinChannel.close()
                }
            }
        }

    override suspend fun sendUserMessage(
        text: String,
        attachments: List<Attachment>,
        uuid: String?,
    ) {
        stdinChannel.send(StdinEncoder.userMessage(sessionId, uuid ?: newId(), text, attachments))
    }

    override suspend fun respondToApproval(
        decision: ApprovalDecision,
        payload: String?,
        updatedPermissions: String?,
    ) {
        val line =
            when (decision) {
                // allow / answered / afk-timeout all reply with `allow`; the difference is in the opaque
                // updatedInput (answers / afkTimeoutMs), which core passes through verbatim.
                is ApprovalDecision.Allow,
                is ApprovalDecision.Answered,
                is ApprovalDecision.AfkTimeout,
                -> StdinEncoder.allow(decision.requestId, payload ?: "{}", updatedPermissions)
                is ApprovalDecision.Deny -> StdinEncoder.deny(decision.requestId, payload ?: "")
            }
        stdinChannel.send(line)
    }

    // The ids of these three are the caller's: it has recorded the request under that id before it writes, so the
    // answer cannot be folded before the request is known.
    override suspend fun setModel(
        model: String,
        requestId: String,
    ) {
        stdinChannel.send(StdinEncoder.setModel(requestId, model))
    }

    override suspend fun setPermissionMode(
        mode: String,
        requestId: String,
    ) {
        stdinChannel.send(StdinEncoder.setPermissionMode(requestId, mode))
    }

    override suspend fun requestContextUsage(requestId: String) {
        stdinChannel.send(StdinEncoder.getContextUsage(requestId))
    }

    // The ids are the caller's, as above.
    override suspend fun requestSettings(requestId: String) {
        stdinChannel.send(StdinEncoder.getSettings(requestId))
    }

    override suspend fun setEffort(
        effort: String?,
        requestId: String,
    ) {
        stdinChannel.send(StdinEncoder.applyEffort(requestId, effort))
    }

    override suspend fun turnSandboxOff(requestId: String) {
        stdinChannel.send(StdinEncoder.sandboxOff(requestId))
    }

    // The same three-sided agreement. The ids are the caller's.
    override suspend fun requestMcpStatus(requestId: String) {
        stdinChannel.send(StdinEncoder.mcpStatus(requestId))
    }

    override suspend fun setMcpServerEnabled(
        name: String,
        enabled: Boolean,
        requestId: String,
    ) {
        stdinChannel.send(StdinEncoder.mcpToggle(requestId, name, enabled))
    }

    override suspend fun reconnectMcpServer(
        name: String,
        requestId: String,
    ) {
        stdinChannel.send(StdinEncoder.mcpReconnect(requestId, name))
    }

    // The request's id is the caller's, as above; [userMessageId] is the uuid the user's line was written with.
    override suspend fun rewindFiles(
        userMessageId: String,
        dryRun: Boolean,
        requestId: String,
    ) {
        stdinChannel.send(StdinEncoder.rewindFiles(requestId, userMessageId, dryRun))
    }

    override suspend fun interrupt() {
        stdinChannel.send(StdinEncoder.interrupt(newId()))
    }

    override suspend fun stopTask(taskId: String) {
        stdinChannel.send(StdinEncoder.stopTask(newId(), taskId))
    }

    // Control-request ids are the session's to mint; StdinEncoder stays pure (no random/clock).
    private fun newId(): String = UUID.randomUUID().toString()
}
