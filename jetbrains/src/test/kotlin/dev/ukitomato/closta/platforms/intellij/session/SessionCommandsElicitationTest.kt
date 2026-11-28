package dev.ukitomato.closta.platforms.intellij.session

import dev.ukitomato.closta.core.interfaces.AgentSession
import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ElicitationAction
import dev.ukitomato.closta.core.models.ElicitationDecision
import dev.ukitomato.closta.core.models.RawJson
import dev.ukitomato.closta.core.services.FixedClock
import dev.ukitomato.closta.core.services.RecordingAgentSession
import dev.ukitomato.closta.presenter.view.ElicitationStage
import dev.ukitomato.closta.presenter.view.PresenterInput
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.io.IOException
import java.time.Instant

/** The answer to an MCP server's request for input: one line written, and the view says what became of it. */
class SessionCommandsElicitationTest {
    private val store = ConversationStore()
    private val session = RecordingAgentSession()

    private fun commands(on: AgentSession = session) = SessionCommands(on, FixedClock(Instant.EPOCH), store)

    private fun asked(
        id: String = "e1",
        link: Boolean = false,
    ) = runBlocking {
        val raw =
            if (link) {
                """{"subtype":"elicitation","message":"Sign in","mode":"url",""" +
                    """"url":"https://example.com/a","elicitation_id":"x1"}"""
            } else {
                """{"subtype":"elicitation","message":"Name","requested_schema":""" +
                    """{"type":"object","properties":{"name":{"type":"string"}}}}"""
            }
        val event =
            AgentEvent.Elicitation(id, "files", if (link) "url" else "form", if (link) "x1" else null, RawJson(raw))
        store.transition { it.event(PresenterInput.Event(event)) }
    }

    private fun record(id: String = "e1") = store.view.value.transcript.elicitations[id]!!

    @Test
    fun `an accept writes one line and the request stands as sent`() =
        runBlocking {
            asked()
            commands().respondToElicitation(ElicitationDecision("e1", ElicitationAction.ACCEPT), """{"name":"Ada"}""")
            assertEquals(
                listOf(ElicitationDecision("e1", ElicitationAction.ACCEPT) to """{"name":"Ada"}"""),
                session.elicitationResponses,
            )
            assertEquals(ElicitationStage.SENT, record().stage)
            assertEquals("""{"name":"Ada"}""", record().sentContent)
            assertTrue(
                store.view.value.conversation.pendingApprovals
                    .isEmpty(),
            )
        }

    @Test
    fun `accepting a link goes on in the browser`() =
        runBlocking {
            asked(id = "u1", link = true)
            commands().respondToElicitation(ElicitationDecision("u1", ElicitationAction.ACCEPT), null)
            assertEquals(ElicitationStage.IN_BROWSER, record("u1").stage)
        }

    @Test
    fun `a second answer for the same request writes nothing more`() =
        runBlocking {
            asked()
            val commands = commands()
            commands.respondToElicitation(ElicitationDecision("e1", ElicitationAction.DECLINE), null)
            commands.respondToElicitation(ElicitationDecision("e1", ElicitationAction.ACCEPT), "{}")
            assertEquals(1, session.elicitationResponses.size)
            assertEquals(ElicitationAction.DECLINE, record().sentAction)
        }

    @Test
    fun `a write that throws leaves the request pending with the failure written on it`() =
        runBlocking {
            asked()
            val failing =
                object : AgentSession by session {
                    override suspend fun respondToElicitation(
                        decision: ElicitationDecision,
                        content: String?,
                    ): Unit = throw IOException("closed")
                }
            assertThrows<IOException> {
                commands(failing).respondToElicitation(ElicitationDecision("e1", ElicitationAction.ACCEPT), "{}")
            }
            assertEquals(ElicitationStage.WAITING, record().stage)
            assertEquals(SessionCommands.ANSWER_FAILED, record().failure)
            assertEquals(
                listOf("e1"),
                store.view.value.conversation.pendingApprovals
                    .map { it.requestId },
            )
        }
}
