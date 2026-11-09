package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.Attachment
import dev.ukitomato.closta.core.services.FixedClock
import dev.ukitomato.closta.core.services.RecordingAgentSession
import dev.ukitomato.closta.presenter.tree.JsonObject
import dev.ukitomato.closta.presenter.tree.JsonRead
import dev.ukitomato.closta.presenter.view.CaptureReplay
import dev.ukitomato.closta.presenter.view.HostState
import dev.ukitomato.closta.presenter.view.MessageSource
import dev.ukitomato.closta.presenter.view.PassedOn
import dev.ukitomato.closta.presenter.view.PresenterInput
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

/**
 * The session's store folds core and the transcript the way the host does — the tests' own [HostState] — for every
 * input of every capture, and keeps core's state alone in step with it. Its commands write the transcript
 * under the same lock: a sent message before the CLI hears it, an answer with core's state after it.
 */
class SessionViewTest {
    @Test
    fun `the store folds every capture as the host does, and core's flow follows the same writes`() =
        runBlocking {
            for (scenario in CaptureReplay.scenarios()) {
                val store = ConversationStore()
                var host = HostState()
                for ((index, input) in CaptureReplay.inputs(scenario).withIndex()) {
                    store.transition { view -> view.fold(input) }
                    host = host.next(input)
                    assertEquals(
                        SessionView(host.conversation, host.transcript),
                        store.view.value,
                    ) { "$scenario #$index" }
                    assertEquals(host.conversation, store.state.value) { "$scenario #$index" }
                }
            }
        }

    @Test
    fun `a sent message is in the transcript before the CLI is told, under the id the host chose`() =
        runBlocking {
            val store = ConversationStore()
            // What the store held at the moment the CLI was told.
            var seenWhenSent: List<String>? = null
            val session =
                object : AgentSession by RecordingAgentSession() {
                    val sentMessages = mutableListOf<String>()

                    override suspend fun sendUserMessage(
                        text: String,
                        attachments: List<Attachment>,
                        uuid: String?,
                    ) {
                        seenWhenSent = store.view.value.transcript.messages.order
                        sentMessages += text
                    }
                }
            val commands = SessionCommands(session, FixedClock(Instant.EPOCH), store)
            commands.sendMessage("send-1", "Explain the build")
            assertEquals(listOf("send-1"), seenWhenSent)
            assertEquals(listOf("Explain the build"), session.sentMessages)
            val message = store.view.value.transcript.messages["send-1"]
            assertEquals(MessageSource.Sent, message?.source)
            assertTrue(store.view.value.transcript.messages.order == listOf("send-1"))
        }

    @Test
    fun `an approval is answered to the CLI once, however often the answer is given`() =
        runBlocking {
            val inputs = CaptureReplay.inputs("05-permission-can-use-tool")
            val store = ConversationStore()
            inputs.takeWhile { it !is PresenterInput.Decided }.forEach { input ->
                store.transition { view -> view.fold(input) }
            }
            val pending =
                store.view.value.conversation.pendingApprovals
                    .single()
            val session = RecordingAgentSession()
            val asked = Instant.parse("2026-10-09T00:00:00Z")
            val commands = SessionCommands(session, FixedClock(asked.plusSeconds(1)), store)
            repeat(2) { commands.respondToApproval(ApprovalDecision.Allow(pending.requestId), asked, "{}") }
            assertEquals(1, session.approvalResponses.size)
        }

    @Test
    fun `an answer goes to the CLI with its payload and resolves the approval in core and in the transcript`() =
        runBlocking {
            val scenario = "05-permission-can-use-tool"
            val inputs = CaptureReplay.inputs(scenario)
            val upToRequest = inputs.takeWhile { it !is PresenterInput.Decided }
            val store = ConversationStore()
            for (input in upToRequest) {
                check(input !is PresenterInput.Decided) { "not before the answer" }
                store.transition { view -> view.fold(input) }
            }
            val pending =
                store.view.value.conversation.pendingApprovals
                    .single()
            val session = RecordingAgentSession()
            val asked = Instant.parse("2026-10-09T00:00:00Z")
            val commands = SessionCommands(session, FixedClock(asked.plusSeconds(2)), store)
            val sent = JsonRead.parse("""{"file_path":"x"}""") as JsonObject
            commands.respondToApproval(
                ApprovalDecision.Allow(pending.requestId),
                asked,
                """{"file_path":"x"}""",
                PassedOn(input = sent),
            )
            assertEquals(
                listOf(ApprovalDecision.Allow(pending.requestId) to """{"file_path":"x"}"""),
                session.approvalResponses,
            )
            assertTrue(
                store.view.value.conversation.pendingApprovals
                    .isEmpty(),
            )
            assertTrue(
                store.state.value.pendingApprovals
                    .isEmpty(),
            )
            // The same as the host's fold of the answer, two seconds after the request.
            val host =
                (
                    upToRequest +
                        PresenterInput.Decided(
                            ApprovalDecision.Allow(pending.requestId),
                            2_000,
                            PassedOn(input = sent),
                        )
                ).fold(HostState()) { state, input -> state.next(input) }
            assertEquals(SessionView(host.conversation, host.transcript), store.view.value)
            assertTrue(
                store.view.value.transcript.approvals[pending.requestId]
                    ?.outcome != null,
            )
        }

    @Test
    fun `accepted suggestions go to the session and are shown on the approval, and a failed answer is recorded`() =
        runBlocking {
            val inputs = CaptureReplay.inputs("16-permission-suggestion-accept")
            val store = ConversationStore()
            for (input in inputs.takeWhile { it !is PresenterInput.Decided }) {
                store.transition { view ->
                    when (input) {
                        is PresenterInput.Event -> view.event(input)
                        is PresenterInput.UserSent -> view.sent(input)
                        else -> error("not before the answer")
                    }
                }
            }
            val pending =
                store.view.value.conversation.pendingApprovals
                    .single()
            val session = RecordingAgentSession()
            val asked = Instant.parse("2026-10-09T00:00:00Z")
            val commands = SessionCommands(session, FixedClock(asked.plusSeconds(1)), store)
            commands.answerFailed(pending.requestId)
            val failed = checkNotNull(store.view.value.transcript.approvals[pending.requestId])
            assertEquals(SessionCommands.ANSWER_FAILED, failed.failure)
            assertEquals(1, failed.failures)
            assertEquals(1, store.state.value.pendingApprovals.size, "a failed answer leaves the approval pending")

            val updated = """[{"type":"setMode","mode":"acceptEdits","destination":"session"}]"""
            commands.respondToApproval(
                ApprovalDecision.Allow(pending.requestId),
                asked,
                """{"file_path":"x"}""",
                PassedOn(updated, listOf("s1")),
            )
            assertEquals(listOf<String?>(updated), session.acceptedPermissions, "the suggestions reach the session")
            val settled = checkNotNull(store.view.value.transcript.approvals[pending.requestId])
            assertEquals(listOf("s1"), settled.acceptedSuggestions)
            assertEquals(null, settled.failure)
            assertEquals(1, settled.failures)
        }
}
