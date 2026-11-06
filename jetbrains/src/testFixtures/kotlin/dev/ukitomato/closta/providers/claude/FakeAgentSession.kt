package dev.ukitomato.closta.providers.claude

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.Attachment
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.selects.select

/**
 * An [AgentSession] fed by a [FakeScript] instead of a `claude` CLI — the test double that lets
 * send→turn-end, the approval round-trip, interrupt and the AFK timeout be measured without a
 * process and without real or virtual time (a `javax.swing.Timer` could not be unit-tested).
 *
 * The same [AgentSessionContract] runs against this fake and against `ClaudeSession`; only
 * the factory hook differs. Nothing here decodes JSON: a script's [AgentEvent]s come from
 * the caller, who builds them with `CaptureFixtures`/`StreamJsonCodec` — one decoder.
 *
 * The AFK window is a host *decision*, not a timer. A [Beat.AwaitResponse] suspends the stream on a
 * [CompletableDeferred] created **eagerly** below, so [respondToApproval] can complete it whether or not
 * the stream has reached the await yet. That removes the ordering hazard that would otherwise deadlock a
 * single-threaded `runBlocking` test — the answer can precede or follow the await.
 * No `delay` or `Thread.sleep` is ever used.
 *
 * Intended use is a **single collection** of [events] driven from one dispatcher (the gates are one-shot).
 * [sent] is an unsynchronised list, safe to read under that single-threaded confinement; a future consumer
 * that collects from a multi-threaded dispatcher (an integration test) must add its own synchronisation.
 */
class FakeAgentSession(
    private val script: FakeScript,
) : AgentSession {
    private val recorded = mutableListOf<Sent>()

    /** Sends the host made, in order — for fake-specific tests; the shared contract observes `events`. */
    val sent: List<Sent> get() = recorded.toList()

    // Eager, so respondToApproval completing a gate can never race the stream reaching its await. Each
    // gate is a signal (Unit), not a value channel — the decision itself is recorded in [sent].
    private val responseGates: Map<String, CompletableDeferred<Unit>> =
        script.beats
            .filterIsInstance<Beat.AwaitResponse>()
            .associate { it.requestId to CompletableDeferred<Unit>() }

    private val interrupted = CompletableDeferred<Unit>()

    override val events: Flow<AgentEvent> =
        flow {
            if (script.termination is Termination.LaunchFailure) throw script.termination.cause
            for (beat in script.beats) {
                when (beat) {
                    is Beat.Emit -> emit(beat.event)
                    is Beat.AwaitResponse ->
                        select {
                            responseGates.getValue(beat.requestId).onAwait { }
                            interrupted.onAwait { }
                        }
                }
            }
            if (script.termination is Termination.Error) throw script.termination.cause
        }

    override suspend fun sendUserMessage(
        text: String,
        attachments: List<Attachment>,
        uuid: String?,
    ) {
        recorded += Sent.UserMessage(text, attachments, uuid)
    }

    override suspend fun respondToApproval(
        decision: ApprovalDecision,
        payload: String?,
        updatedPermissions: String?,
    ) {
        recorded += Sent.Approval(decision, payload, updatedPermissions)
        responseGates[decision.requestId]?.complete(Unit)
    }

    override suspend fun setModel(
        model: String,
        requestId: String,
    ) {
        recorded += Sent.SetModel(model, requestId)
    }

    override suspend fun setPermissionMode(
        mode: String,
        requestId: String,
    ) {
        recorded += Sent.SetPermissionMode(mode, requestId)
    }

    override suspend fun requestContextUsage(requestId: String) {
        recorded += Sent.RequestContextUsage(requestId)
    }

    /** The settings and effort requests, kept apart from [recorded] so the scripts' expectations stay as they were. */
    val settingsRequests = mutableListOf<String>()
    val effortRequests = mutableListOf<Pair<String?, String>>()

    override suspend fun requestSettings(requestId: String) {
        settingsRequests += requestId
    }

    override suspend fun setEffort(
        effort: String?,
        requestId: String,
    ) {
        effortRequests += effort to requestId
    }

    override suspend fun requestMcpStatus(requestId: String) {
        recorded += Sent.RequestMcpStatus(requestId)
    }

    override suspend fun setMcpServerEnabled(
        name: String,
        enabled: Boolean,
        requestId: String,
    ) {
        recorded += Sent.SetMcpServerEnabled(name, enabled, requestId)
    }

    override suspend fun reconnectMcpServer(
        name: String,
        requestId: String,
    ) {
        recorded += Sent.ReconnectMcpServer(name, requestId)
    }

    override suspend fun rewindFiles(
        userMessageId: String,
        dryRun: Boolean,
        requestId: String,
    ) {
        recorded += Sent.RewindFiles(userMessageId, dryRun, requestId)
    }

    override suspend fun interrupt() {
        recorded += Sent.Interrupt
        interrupted.complete(Unit)
    }

    private val stopped = mutableListOf<String>()

    /** The CLI task ids the host asked to stop, in order. A stop never releases the stream (only an interrupt does). */
    val stoppedTasks: List<String> get() = stopped.toList()

    override suspend fun stopTask(taskId: String) {
        stopped += taskId
    }
}
