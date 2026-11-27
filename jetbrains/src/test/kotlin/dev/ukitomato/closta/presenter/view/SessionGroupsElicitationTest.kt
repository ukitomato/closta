package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ElicitationAction
import dev.ukitomato.closta.core.models.RawJson
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** A session waiting for an MCP server's request for input is waiting, whatever else it does; made-up lines. */
class SessionGroupsElicitationTest {
    private fun elicitation(
        id: String,
        title: String?,
    ) = AgentEvent.Elicitation(
        requestId = id,
        serverName = "files",
        mode = "form",
        elicitationId = null,
        request =
            RawJson(
                """{"subtype":"elicitation","mcp_server_name":"files","message":"m"""" +
                    title?.let { ""","title":"$it"""" }.orEmpty() +
                    "}",
            ),
    )

    private fun HostState.line(event: AgentEvent) = next(PresenterInput.Event(event))

    @Test
    fun `type only - a waiting elicitation is counted, in the order it came, with its heading as the reason`() {
        val state = HostState().line(elicitation("e1", "Sign in")).line(elicitation("e2", null))
        val waiting = waitingElicitations(state.conversation, state.transcript)
        assertEquals(listOf("e1", "e2"), waiting.map { it.requestId })
        val summary = sessionSummary(state.conversation, state.transcript, unread = false)
        assertEquals(SessionSummary(SessionGroup.WAITING, WaitReason.Elicitation("Sign in")), summary)
    }

    @Test
    fun `type only - an answered elicitation is not counted`() {
        val state =
            HostState().line(elicitation("e1", null)).next(
                PresenterInput.ElicitationDecided("e1", ElicitationAction.DECLINE, null),
            )
        assertTrue(waitingElicitations(state.conversation, state.transcript).isEmpty())
        assertEquals(SessionGroup.OTHER, sessionSummary(state.conversation, state.transcript, false).group)
    }

    @Test
    fun `type only - the detail shows the elicitation's card, and a notification asks to open the session`() {
        val state = HostState().line(elicitation("e1", "Sign in"))
        val detail = sessionDetail(state.conversation, state.transcript) as SessionDetail.Waiting
        assertEquals("e1", (detail.card as ElicitationCard).requestId)
        val raised = alertsBetween(null, state.conversation to state.transcript).raised
        assertEquals(listOf(OpenOnlyAlert("e1", "e1", AlertKind.ELICITATION)), raised)
        val answered =
            state.next(PresenterInput.ElicitationDecided("e1", ElicitationAction.CANCEL, null))
        val change = alertsBetween(state.conversation to state.transcript, answered.conversation to answered.transcript)
        assertEquals(listOf("e1"), change.expired)
    }
}
