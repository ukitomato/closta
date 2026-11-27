package dev.ukitomato.closta.core.services

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.models.ApprovalKind
import dev.ukitomato.closta.core.models.ConversationState
import dev.ukitomato.closta.core.models.ElicitationAction
import dev.ukitomato.closta.core.models.ElicitationDecision
import dev.ukitomato.closta.core.models.PendingApproval
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.io.IOException

class RespondToElicitationTest {
    private fun pending(): ConversationState =
        ConversationState(
            pendingApprovals =
                listOf(
                    PendingApproval("E", ApprovalKind.ELICITATION),
                    PendingApproval("A", ApprovalKind.APPROVAL),
                ),
        )

    @Test
    fun `an answer is sent and takes only its request out of the pending ones`() =
        runBlocking {
            val session = RecordingAgentSession()
            val decision = ElicitationDecision("E", ElicitationAction.ACCEPT)

            val next = RespondToElicitation(session)(pending(), decision, """{"name":"Ada"}""")

            assertAll(
                { assertEquals(listOf("A"), next.pendingApprovals.map { it.requestId }) },
                { assertEquals(listOf("E"), next.settledElicitations) },
                { assertEquals(listOf(decision to """{"name":"Ada"}"""), session.elicitationResponses) },
            )
        }

    @Test
    fun `a send that throws reaches the caller and the request stays pending`() {
        val before = pending()
        val failing =
            object : AgentSession by RecordingAgentSession() {
                override suspend fun respondToElicitation(
                    decision: ElicitationDecision,
                    content: String?,
                ): Unit = throw IOException("stdin is closed")
            }

        val thrown =
            assertThrows(IOException::class.java) {
                runBlocking {
                    RespondToElicitation(
                        failing,
                    )(before, ElicitationDecision("E", ElicitationAction.DECLINE), null)
                }
            }

        assertAll(
            { assertEquals("stdin is closed", thrown.message) },
            { assertEquals(listOf("E", "A"), before.pendingApprovals.map { it.requestId }) },
        )
    }
}
