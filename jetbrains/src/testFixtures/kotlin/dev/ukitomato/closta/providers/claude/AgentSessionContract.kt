package dev.ukitomato.closta.providers.claude

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.ApprovalKind
import dev.ukitomato.closta.core.models.Attachment
import dev.ukitomato.closta.core.models.AttachmentKind
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.PendingApproval
import dev.ukitomato.closta.core.models.resolveApproval
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout

/**
 * The one conformance suite for the [AgentSession] contract. It runs against [FakeAgentSession],
 * and the same suite runs against `ClaudeSession` by overriding [sessionFor] alone.
 *
 * Every assertion is on the interface's observable surface — the [AgentEvent] stream and the pure
 * `resolveApproval` — never on any implementation detail, so a subclass that swaps the session changes
 * nothing else. Time is never spent in the tested path: the four host inputs are values, and the
 * "waiting" a control request implies is crossed with [yield] rather than a clock (no
 * `delay`/`Thread.sleep`). Each test carries a coarse [Timeout] as a *safety net* so a session that
 * fails to release a wait (a concern for the real process) fails with a diagnostic instead of
 * hanging the build; the timeout is only ever reached on
 * a genuine hang, never in the success path.
 *
 * The suite is driven under a single-threaded `runBlocking`, which confines the collector coroutine and
 * the test body to one dispatcher; that is what makes the plain `received` list safe to share and the
 * [yield] hand-off deterministic. A subclass that needs a real dispatcher must revisit that assumption.
 */
abstract class AgentSessionContract {
    /** Which behaviour of the contract a test exercises; [sessionFor] returns a session scripted for it. */
    enum class Scenario {
        /** The session that returns must stream assistant output and end the turn with a result. */
        SEND_TURN,

        /** Must emit a control request, block on it, then resume to a result once the host allows. */
        APPROVAL_ALLOW,

        /** Must emit a control request, block on it, then resume to a result once the host denies. */
        APPROVAL_DENY,

        /** Must emit a control request, block on it, then resume to a result once the host times out (AFK). */
        AFK_TIMEOUT,

        /** Must emit a control request, block on it, then end when the host interrupts (never answered). */
        INTERRUPT,

        /** Must emit a control request and block on it forever unless answered — used to prove no advance. */
        UNANSWERED,

        /** Must emit some events and then fail the stream — a dropped connection or dead process. */
        DROPPED_CONNECTION,

        /** Must fail the stream on subscription with no events — a launch that never produced a process. */
        LAUNCH_FAILURE,
    }

    /** The system under test for [scenario]: a [FakeAgentSession], or a `ClaudeSession`. */
    protected abstract fun sessionFor(scenario: Scenario): AgentSession

    /** The opaque body the host attaches to an AFK timeout (`updatedInput.afkTimeoutMs`); null by default. */
    protected open fun afkPayload(): String? = null

    /**
     * The accepted permissions [session] was given with each allow, in order, as the JSON text it passed on (null for
     * an allow that carried none): read from where the implementation puts them — the fake's record, the stdin.
     */
    protected abstract fun updatedPermissionsGiven(session: AgentSession): List<String?>

    /** One control request [session] was asked to make for the host, as it was written: its kind, its id, its value. */
    data class RequestGiven(
        val subtype: String,
        val requestId: String,
        val value: String?,
    )

    /**
     * The model, mode and context-usage requests [session] has made, in order: read from where the implementation puts
     * them — the fake's record, the stdin line.
     */
    protected abstract fun requestsGiven(session: AgentSession): List<RequestGiven>

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a model, mode and usage request is written with the id the caller gave it`() =
        runBlocking {
            val session = sessionFor(Scenario.UNANSWERED)
            val received = mutableListOf<AgentEvent>()
            val collector = launch { session.events.collect { received += it } }
            awaitControlRequest(received)
            session.setModel("opus", "id-model")
            session.setPermissionMode("plan", "id-mode")
            session.requestContextUsage("id-usage")
            repeat(MAX_YIELDS) { yield() }
            collector.cancelAndJoin()
            assertEquals(
                listOf(
                    RequestGiven("set_model", "id-model", "opus"),
                    RequestGiven("set_permission_mode", "id-mode", "plan"),
                    RequestGiven("get_context_usage", "id-usage", "summary"),
                ),
                requestsGiven(session),
            ) { "each line carries the caller's id as its request_id, and the usage request asks for the summary" }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `an MCP status, toggle and reconnect request is written with the id the caller gave it`() =
        runBlocking {
            val session = sessionFor(Scenario.UNANSWERED)
            val received = mutableListOf<AgentEvent>()
            val collector = launch { session.events.collect { received += it } }
            awaitControlRequest(received)
            session.requestMcpStatus("id-status")
            session.setMcpServerEnabled("fake-echo", false, "id-off")
            session.setMcpServerEnabled("fake-echo", true, "id-on")
            session.reconnectMcpServer("fake-echo", "id-reconnect")
            repeat(MAX_YIELDS) { yield() }
            collector.cancelAndJoin()
            assertEquals(
                listOf(
                    RequestGiven("mcp_status", "id-status", null),
                    RequestGiven("mcp_toggle", "id-off", "fake-echo:false"),
                    RequestGiven("mcp_toggle", "id-on", "fake-echo:true"),
                    RequestGiven("mcp_reconnect", "id-reconnect", "fake-echo"),
                ),
                requestsGiven(session).filter { it.subtype.startsWith("mcp_") },
            ) { "each line carries the caller's id as its request_id, the name, and for a toggle the wanted value" }
        }

    /** The uuids of the user messages [session] was given, in order; null where none is to be seen. */
    protected abstract fun uuidsGiven(session: AgentSession): List<String?>

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a uuid the caller gave a message goes with it, and a rewind request names it`() =
        runBlocking {
            val session = sessionFor(Scenario.UNANSWERED)
            val received = mutableListOf<AgentEvent>()
            val collector = launch { session.events.collect { received += it } }
            awaitControlRequest(received)
            session.sendUserMessage("first", uuid = "uuid-first")
            session.rewindFiles("uuid-first", true, "id-dry")
            session.rewindFiles("uuid-first", false, "id-real")
            repeat(MAX_YIELDS) { yield() }
            collector.cancelAndJoin()
            assertEquals(listOf<String?>("uuid-first"), uuidsGiven(session))
            assertEquals(
                listOf(
                    RequestGiven("rewind_files", "id-dry", "uuid-first:true"),
                    RequestGiven("rewind_files", "id-real", "uuid-first:false"),
                ),
                requestsGiven(session).filter { it.subtype == "rewind_files" },
            ) { "each line carries the caller's id, the uuid of the message and whether it is a dry run" }
        }

    /** One user message [session] was given: its text and the number of attachments that went with it. */
    data class MessageGiven(
        val text: String,
        val attachments: Int,
    )

    /** The user messages [session] has been given, in order: read from where the implementation puts them. */
    protected abstract fun messagesGiven(session: AgentSession): List<MessageGiven>

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a message goes through with its attachments, and a message without any as it always did`() =
        runBlocking {
            val session = sessionFor(Scenario.SEND_TURN)
            val image = Attachment(AttachmentKind.IMAGE, "image/png", "a.png", byteArrayOf(1, 2, 3))
            val notes = Attachment(AttachmentKind.TEXT, "text/plain", "notes.txt", "hello".toByteArray())
            session.sendUserMessage("with two", listOf(image, notes))
            session.sendUserMessage("plain")
            collectAll(session)
            assertEquals(
                listOf(MessageGiven("with two", 2), MessageGiven("plain", 0)),
                messagesGiven(session),
            ) { "the attachments go with the message that carried them, and none go with the other" }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `send streams through to a turn result`() =
        runBlocking {
            val session = sessionFor(Scenario.SEND_TURN)
            session.sendUserMessage("hi")
            val received = collectAll(session)
            val resultIndex = received.indexOfFirst { it is AgentEvent.Result }
            assertTrue(resultIndex >= 0) { "the turn should stream through to a result" }
            val streamIndex = received.indexOfFirst { it is AgentEvent.StreamEvent || it is AgentEvent.Assistant }
            assertTrue(streamIndex in 0 until resultIndex) { "assistant output should arrive before the result" }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `allow completes an approval round trip and drops only its pending`() =
        roundTrip(Scenario.APPROVAL_ALLOW) { ApprovalDecision.Allow(it) }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `an allow passes the accepted permissions on as given, and an allow without any passes none`() =
        runBlocking {
            val accepted = """[{"type":"setMode","mode":"acceptEdits","destination":"session"}]"""
            for (given in listOf<String?>(accepted, null)) {
                val session = sessionFor(Scenario.APPROVAL_ALLOW)
                val received = mutableListOf<AgentEvent>()
                val collector = launch { session.events.collect { received += it } }
                val request = awaitControlRequest(received)
                session.respondToApproval(ApprovalDecision.Allow(request.requestId), "{}", given)
                collector.join()
                assertEquals(
                    listOf(given),
                    updatedPermissionsGiven(session),
                ) { "the session passes on what it was given" }
            }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `deny completes an approval round trip and drops only its pending`() =
        roundTrip(Scenario.APPROVAL_DENY) { ApprovalDecision.Deny(it) }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `an afk timeout resolves the question with no waiting`() =
        runBlocking {
            val session = sessionFor(Scenario.AFK_TIMEOUT)
            val received = mutableListOf<AgentEvent>()
            val collector = launch { session.events.collect { received += it } }
            val request = awaitControlRequest(received)
            session.respondToApproval(ApprovalDecision.AfkTimeout(request.requestId), afkPayload())
            collector.join()
            assertTrue(received.any { it is AgentEvent.Result }) { "the turn should resume after the afk timeout" }
            assertDropsOnly(request.requestId, ApprovalDecision.AfkTimeout(request.requestId))
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `interrupt ends a stream that is waiting on the host`() =
        runBlocking {
            val session = sessionFor(Scenario.INTERRUPT)
            val received = mutableListOf<AgentEvent>()
            val collector = launch { session.events.collect { received += it } }
            awaitControlRequest(received)
            session.interrupt()
            collector.join() // returns only if the interrupt released the wait
            assertTrue(received.isNotEmpty()) { "events before the interrupt should have arrived" }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `an unanswered request never advances the stream and stays cancellable`() =
        runBlocking {
            val session = sessionFor(Scenario.UNANSWERED)
            val received = mutableListOf<AgentEvent>()
            val collector = launch { session.events.collect { received += it } }
            awaitControlRequest(received)
            val settled = received.size
            repeat(SETTLE_YIELDS) { yield() } // give the stream every chance to (wrongly) advance
            assertEquals(settled, received.size) { "an unanswered request must not advance the stream" }
            assertTrue(received.none { it is AgentEvent.Result }) { "no turn result before the host answers" }
            collector.cancelAndJoin() // the waiting stream is cancellable — it does not deadlock the test
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `stopTask is accepted by a session that waits on the host and leaves it cancellable`() =
        runBlocking {
            val session = sessionFor(Scenario.UNANSWERED)
            val received = mutableListOf<AgentEvent>()
            val collector = launch { session.events.collect { received += it } }
            awaitControlRequest(received)
            session.stopTask("task-1") // returns: the request is issued, and the task's end comes back as an event
            assertTrue(received.none { it is AgentEvent.Result }) { "a stop issues a request and answers nothing" }
            collector.cancelAndJoin()
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a dropped connection surfaces as a stream error after its events`() =
        runBlocking {
            val session = sessionFor(Scenario.DROPPED_CONNECTION)
            val received = mutableListOf<AgentEvent>()
            val thrown = failureOfCollecting(session, received)
            assertNotNull(thrown) { "a dropped connection should surface as an exception, not a silent end" }
            assertTrue(
                received.isNotEmpty(),
            ) { "events should arrive before the drop (distinguishes it from a launch failure)" }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `a launch failure surfaces on subscription with no events`() =
        runBlocking {
            val session = sessionFor(Scenario.LAUNCH_FAILURE)
            val received = mutableListOf<AgentEvent>()
            val thrown = failureOfCollecting(session, received)
            assertNotNull(thrown) { "a launch failure should surface as an exception" }
            assertTrue(received.isEmpty()) { "a launch that never started emits nothing" }
        }

    private fun roundTrip(
        scenario: Scenario,
        decisionFor: (String) -> ApprovalDecision,
    ) = runBlocking {
        val session = sessionFor(scenario)
        val received = mutableListOf<AgentEvent>()
        val collector = launch { session.events.collect { received += it } }
        val request = awaitControlRequest(received)
        session.respondToApproval(decisionFor(request.requestId))
        collector.join()
        assertTrue(received.any { it is AgentEvent.Result }) { "the turn should resume after the decision" }
        assertDropsOnly(request.requestId, decisionFor(request.requestId))
    }

    /** Collects the whole stream into a list (the stream must complete on its own for this to return). */
    private suspend fun collectAll(session: AgentSession): List<AgentEvent> {
        val received = mutableListOf<AgentEvent>()
        session.events.collect { received += it }
        return received
    }

    /** Collects until the stream ends, returning the exception it ended with (or null on normal completion). */
    private suspend fun failureOfCollecting(
        session: AgentSession,
        received: MutableList<AgentEvent>,
    ): Throwable? =
        try {
            session.events.collect { received += it }
            null
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Throwable,
        ) {
            // A stream can fail with any provider exception; the contract only cares that it surfaces.
            failure
        }

    /** Yields (never waits on a clock) until the stream has emitted a control request. */
    protected suspend fun awaitControlRequest(received: List<AgentEvent>): AgentEvent.ControlRequest {
        repeat(MAX_YIELDS) {
            received.filterIsInstance<AgentEvent.ControlRequest>().firstOrNull()?.let { return it }
            yield()
        }
        throw AssertionError("no control_request was observed after $MAX_YIELDS yields")
    }

    /** Asserts the pure `resolveApproval` drops only [requestId], leaving a second pending untouched. */
    private fun assertDropsOnly(
        requestId: String,
        decision: ApprovalDecision,
    ) {
        val after = resolveApproval(stateWith(requestId, OTHER_REQUEST), decision, elapsedMs = 0)
        assertEquals(listOf(OTHER_REQUEST), after.pendingApprovals.map { it.requestId }) {
            "resolveApproval should drop only the answered request"
        }
    }

    private fun stateWith(vararg requestIds: String): ConversationState =
        ConversationState(pendingApprovals = requestIds.map { PendingApproval(it, ApprovalKind.APPROVAL) })

    private companion object {
        const val MAX_YIELDS = 10_000
        const val SETTLE_YIELDS = 100
        const val TIMEOUT_SECONDS = 30L
        const val OTHER_REQUEST = "req-other"
    }
}
