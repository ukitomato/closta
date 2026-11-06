package dev.ukitomato.closta.providers.claude

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout

/**
 * Runs the shared [AgentSessionContract] against [FakeAgentSession], and adds fake-specific checks that the
 * double records over the interface what the shared suite (which only observes `events`) cannot see — the
 * `sent` decisions, the AFK payload, and the model switch.
 *
 * Scripts are built from the recorded captures via [CaptureFixtures.readCapture] (which decodes each line
 * with the production `StreamJsonCodec` — no second decoder) and the shared beat
 * builders [beatsEmitting] / [beatsAwaitingAfterControlRequests] from test fixtures.
 */
class FakeAgentSessionContractTest : AgentSessionContract() {
    override fun sessionFor(scenario: Scenario): AgentSession = FakeAgentSession(scriptFor(scenario))

    override fun afkPayload(): String = AFK_PAYLOAD

    override fun updatedPermissionsGiven(session: AgentSession): List<String?> =
        (session as FakeAgentSession).sent.filterIsInstance<Sent.Approval>().map { it.updatedPermissions }

    override fun requestsGiven(session: AgentSession): List<RequestGiven> =
        (session as FakeAgentSession).sent.mapNotNull {
            when (it) {
                is Sent.SetModel -> RequestGiven("set_model", it.requestId, it.model)
                is Sent.SetPermissionMode -> RequestGiven("set_permission_mode", it.requestId, it.mode)
                // The fake takes no detail: the real session's line says summary, so it is what the fake stands for.
                is Sent.RequestContextUsage -> RequestGiven("get_context_usage", it.requestId, "summary")
                is Sent.RequestMcpStatus -> RequestGiven("mcp_status", it.requestId, null)
                is Sent.SetMcpServerEnabled -> RequestGiven("mcp_toggle", it.requestId, "${it.name}:${it.enabled}")
                is Sent.ReconnectMcpServer -> RequestGiven("mcp_reconnect", it.requestId, it.name)
                is Sent.RewindFiles -> RequestGiven("rewind_files", it.requestId, "${it.userMessageId}:${it.dryRun}")
                else -> null
            }
        }

    override fun uuidsGiven(session: AgentSession): List<String?> =
        (session as FakeAgentSession).sent.filterIsInstance<Sent.UserMessage>().map { it.uuid }

    override fun messagesGiven(session: AgentSession): List<MessageGiven> =
        (session as FakeAgentSession).sent.filterIsInstance<Sent.UserMessage>().map {
            MessageGiven(it.text, it.attachments.size)
        }

    private fun scriptFor(scenario: Scenario): FakeScript =
        when (scenario) {
            Scenario.SEND_TURN -> FakeScript(beatsEmitting(capture(BASELINE)))
            Scenario.APPROVAL_ALLOW, Scenario.APPROVAL_DENY, Scenario.INTERRUPT, Scenario.UNANSWERED ->
                FakeScript(beatsAwaitingAfterControlRequests(capture(PERMISSION)))
            Scenario.AFK_TIMEOUT -> FakeScript(beatsAwaitingAfterControlRequests(capture(ASK_AFK)))
            Scenario.DROPPED_CONNECTION ->
                FakeScript(
                    beatsEmitting(capture(BASELINE)),
                    Termination.Error(IllegalStateException("connection dropped")),
                )
            Scenario.LAUNCH_FAILURE ->
                FakeScript(emptyList(), Termination.LaunchFailure(IllegalStateException("claude not found (exit 127)")))
        }

    private fun capture(name: String) = CaptureFixtures.readCapture(name)

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `the fake records both allow and deny decisions it receives`() =
        runBlocking {
            val session = FakeAgentSession(FakeScript(beatsAwaitingAfterControlRequests(capture(PERMISSION))))
            session.respondToApproval(ApprovalDecision.Allow("req-allow"))
            session.respondToApproval(ApprovalDecision.Deny("req-deny"))
            assertTrue(session.sent.any { it is Sent.Approval && it.decision is ApprovalDecision.Allow }) {
                "the fake should record the allow it received"
            }
            assertTrue(session.sent.any { it is Sent.Approval && it.decision is ApprovalDecision.Deny }) {
                "the fake should record the deny it received (both must be recorded)"
            }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `the fake records the afk timeout payload verbatim`() =
        runBlocking {
            val session = FakeAgentSession(FakeScript(emptyList()))
            session.respondToApproval(ApprovalDecision.AfkTimeout("req-afk"), AFK_PAYLOAD)
            val approval = session.sent.filterIsInstance<Sent.Approval>().single()
            assertTrue(approval.decision is ApprovalDecision.AfkTimeout) { "the decision is an afk timeout" }
            assertTrue(approval.payload?.contains("afkTimeoutMs") == true) {
                "the afk window is carried in the payload"
            }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `the fake records a user message, a model switch and an interrupt`() =
        runBlocking {
            val session = FakeAgentSession(FakeScript(beatsEmitting(capture(BASELINE))))
            session.sendUserMessage("hi")
            session.setModel("claude-opus-4-8", "id-1")
            session.interrupt()
            session.events.collect { } // baseline has no await; drains to completion
            assertTrue(session.sent.any { it is Sent.UserMessage && it.text == "hi" }) { "user message recorded" }
            assertTrue(session.sent.contains(Sent.SetModel("claude-opus-4-8", "id-1"))) { "model switch recorded" }
            assertTrue(session.sent.contains(Sent.Interrupt)) { "interrupt recorded" }
        }

    @Test
    @Timeout(TIMEOUT_SECONDS)
    fun `the fake records the tasks it was asked to stop, in order, and an interrupt is not one of them`() =
        runBlocking {
            val session = FakeAgentSession(FakeScript(beatsEmitting(capture(BASELINE))))
            session.stopTask("t1")
            session.stopTask("t2")
            session.interrupt()
            assertEquals(listOf("t1", "t2"), session.stoppedTasks)
            assertEquals(listOf<Sent>(Sent.Interrupt), session.sent)
        }

    private companion object {
        const val BASELINE = "01-baseline-text.ndjson"
        const val PERMISSION = "05-permission-can-use-tool.ndjson"
        const val ASK_AFK = "15-ask-afktimeout-updatedinput.ndjson"
        const val AFK_PAYLOAD = """{"afkTimeoutMs":5000}"""
        const val TIMEOUT_SECONDS = 30L
    }
}
