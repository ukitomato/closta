package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.interfaces.Clock
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.Attachment
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.asFlow
import java.time.Instant

/**
 * A recording stand-in for [AgentSession] — the test fake that proves the use cases perform their
 * IO through the interface and hold no state. It is deliberately separate
 * from the contract-conformance `FakeAgentSession`: this one only records calls and replays a fixed
 * event list.
 */
class RecordingAgentSession(
    private val emit: List<AgentEvent> = emptyList(),
) : AgentSession {
    val sentMessages = mutableListOf<String>()
    val sentAttachments = mutableListOf<List<Attachment>>()
    val approvalResponses = mutableListOf<Pair<ApprovalDecision, String?>>()
    val acceptedPermissions = mutableListOf<String?>()
    val setModels = mutableListOf<String>()
    val setModelIds = mutableListOf<String>()
    val setModes = mutableListOf<Pair<String, String>>()
    val contextRequests = mutableListOf<String>()
    val sentUuids = mutableListOf<String?>()
    val rewinds = mutableListOf<Triple<String, Boolean, String>>()
    var interruptCount = 0
    val stoppedTasks = mutableListOf<String>()

    override val events: Flow<AgentEvent> get() = emit.asFlow()

    override suspend fun sendUserMessage(
        text: String,
        attachments: List<Attachment>,
        uuid: String?,
    ) {
        sentMessages += text
        sentAttachments += attachments
        sentUuids += uuid
    }

    override suspend fun respondToApproval(
        decision: ApprovalDecision,
        payload: String?,
        updatedPermissions: String?,
    ) {
        approvalResponses += decision to payload
        acceptedPermissions += updatedPermissions
    }

    override suspend fun setModel(
        model: String,
        requestId: String,
    ) {
        setModels += model
        setModelIds += requestId
    }

    override suspend fun setPermissionMode(
        mode: String,
        requestId: String,
    ) {
        setModes += mode to requestId
    }

    override suspend fun rewindFiles(
        userMessageId: String,
        dryRun: Boolean,
        requestId: String,
    ) {
        rewinds += Triple(userMessageId, dryRun, requestId)
    }

    override suspend fun requestContextUsage(requestId: String) {
        contextRequests += requestId
    }

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

    val sandboxOffRequests = mutableListOf<String>()

    override suspend fun turnSandboxOff(requestId: String) {
        sandboxOffRequests += requestId
    }

    val mcpStatusRequests = mutableListOf<String>()
    val mcpToggles = mutableListOf<Triple<String, Boolean, String>>()
    val mcpReconnects = mutableListOf<Pair<String, String>>()

    override suspend fun requestMcpStatus(requestId: String) {
        mcpStatusRequests += requestId
    }

    override suspend fun setMcpServerEnabled(
        name: String,
        enabled: Boolean,
        requestId: String,
    ) {
        mcpToggles += Triple(name, enabled, requestId)
    }

    override suspend fun reconnectMcpServer(
        name: String,
        requestId: String,
    ) {
        mcpReconnects += name to requestId
    }

    override suspend fun interrupt() {
        interruptCount++
    }

    override suspend fun stopTask(taskId: String) {
        stoppedTasks += taskId
    }
}

/** A [Clock] pinned to a fixed instant, so a use case's elapsed-time computation is deterministic. */
class FixedClock(
    private val instant: Instant,
) : Clock {
    override fun now(): Instant = instant
}

/**
 * A [Clock] that counts how many times it was read, so a test can prove a use case consumes the
 * injected clock rather than a real one. A plain [FixedClock] cannot: `resolveApproval` discards the
 * elapsed figure, so nothing about the clock reaches the returned state, and a fixed-clock assertion
 * would stay green even if the `clock.now()` call were removed. [nowCalls] catches that.
 */
class CountingClock(
    private val instant: Instant,
) : Clock {
    var nowCalls: Int = 0
        private set

    override fun now(): Instant {
        nowCalls++
        return instant
    }
}
