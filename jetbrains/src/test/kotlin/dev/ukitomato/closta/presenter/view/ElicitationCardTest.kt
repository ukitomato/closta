package dev.ukitomato.closta.presenter.view

import dev.ukitomato.closta.core.models.AgentEvent
import dev.ukitomato.closta.core.models.ApprovalDecision
import dev.ukitomato.closta.core.models.ElicitationAction
import dev.ukitomato.closta.core.models.RawJson
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotSame
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/** An MCP server's request for input as a card, through its stages; the lines are made up from the types. */
class ElicitationCardTest {
    private val schema =
        """{"type":"object","properties":{"name":{"type":"string","minLength":1}},"required":["name"]}"""

    private fun form(
        id: String = "e1",
        extra: String = "",
        mode: String? = "form",
    ) = AgentEvent.Elicitation(
        requestId = id,
        serverName = "files",
        mode = mode,
        elicitationId = null,
        request =
            RawJson(
                """{"subtype":"elicitation","mcp_server_name":"files","message":"Name the file",""" +
                    """"requested_schema":$schema$extra}""",
            ),
    )

    private fun link(
        id: String = "u1",
        elicitationId: String = "x1",
        url: String = "https://example.com/auth?code=1",
    ) = AgentEvent.Elicitation(
        requestId = id,
        serverName = "files",
        mode = "url",
        elicitationId = elicitationId,
        request =
            RawJson(
                """{"subtype":"elicitation","mcp_server_name":"files","message":"Sign in","mode":"url",""" +
                    """"url":"$url","elicitation_id":"$elicitationId"}""",
            ),
    )

    private fun HostState.line(event: AgentEvent) = next(PresenterInput.Event(event))

    private fun HostState.cards(): List<ElicitationCard> =
        ThreadRows()
            .of(transcript, conversation)
            .filterIsInstance<CardRow>()
            .map { it.card }
            .filterIsInstance<ElicitationCard>()

    private fun HostState.card(): ElicitationCard = cards().single()

    private fun HostState.answer(
        action: ElicitationAction,
        content: String? = null,
        id: String = "e1",
    ) = next(PresenterInput.ElicitationDecided(id, action, content))

    @Test
    fun `type only - a form is one card that waits and can be answered`() {
        val card = HostState().line(form()).card()
        assertEquals("e1", card.requestId)
        assertEquals("Name the file", card.message)
        assertEquals("files", card.heading)
        assertEquals(ElicitationStage.WAITING, card.stage)
        assertNull(card.answered)
        assertTrue(card.answerable)
        assertFalse(card.isUrl)
        assertEquals(listOf("name"), card.fields?.map { it.key })
    }

    @Test
    fun `type only - the same request again is still the one card, and an answered one is not raised again`() {
        val once = HostState().line(form()).line(form())
        assertEquals(1, once.cards().size)
        assertEquals(1, once.transcript.elicitations.size)
        val answered = once.answer(ElicitationAction.ACCEPT, """{"name":"a"}""").line(form())
        assertEquals(1, answered.cards().size)
        assertEquals(ElicitationStage.SENT, answered.card().stage)
    }

    @Test
    fun `type only - an answer sent shows what was sent`() {
        val sent = HostState().line(form()).answer(ElicitationAction.ACCEPT, """{"name":"a"}""").card()
        assertEquals(ElicitationStage.SENT, sent.stage)
        assertEquals(ElicitationAction.ACCEPT, sent.sentAction)
        assertEquals("""{"name":"a"}""", sent.sentContent)
        assertEquals(ApprovalOutcome.APPROVED, sent.answered)
        assertFalse(sent.answerable)
        val declined = HostState().line(form()).answer(ElicitationAction.DECLINE).card()
        assertEquals(ApprovalOutcome.DENIED, declined.answered)
        val closed = HostState().line(form()).answer(ElicitationAction.CANCEL).card()
        assertEquals(ApprovalOutcome.CANCELLED, closed.answered)
    }

    @Test
    fun `type only - a link accepted goes on in the browser until the server says it is done`() {
        val state = HostState().line(link()).answer(ElicitationAction.ACCEPT, id = "u1")
        val browser = state.card()
        assertEquals(ElicitationStage.IN_BROWSER, browser.stage)
        assertNull(browser.answered)
        assertFalse(browser.answerable)
        assertTrue(browser.isUrl)
        assertEquals("example.com", browser.urlHost)
        assertEquals("https://example.com/auth?code=1", browser.url)
        assertEquals(ElicitationStage.IN_BROWSER, state.line(done("other")).card().stage)
        assertEquals(ElicitationStage.COMPLETED, state.line(done("x1")).card().stage)
    }

    private fun done(elicitationId: String) = AgentEvent.SystemElicitationComplete("c", "s", "files", elicitationId)

    @Test
    fun `type only - a link declined is sent, not left in the browser`() {
        val card = HostState().line(link()).answer(ElicitationAction.DECLINE, id = "u1").card()
        assertEquals(ElicitationStage.SENT, card.stage)
        assertEquals(ApprovalOutcome.DENIED, card.answered)
    }

    @Test
    fun `type only - a withdrawn request ends as withdrawn, an answered one stays as it ended`() {
        val withdrawn = HostState().line(form()).line(AgentEvent.ControlCancel("e1")).card()
        assertEquals(ElicitationStage.WITHDRAWN, withdrawn.stage)
        assertEquals(ApprovalOutcome.WITHDRAWN, withdrawn.answered)
        assertFalse(withdrawn.answerable)
        val late =
            HostState()
                .line(form())
                .answer(ElicitationAction.ACCEPT, "{}")
                .line(AgentEvent.ControlCancel("e1"))
                .card()
        assertEquals(ElicitationStage.SENT, late.stage)
    }

    @Test
    fun `type only - a result the request did not survive cancels it`() {
        val running = HostState().line(Lines.queued("c1")).line(Lines.started("c1")).line(form())
        assertTrue(running.card().answerable)
        val cancelled = running.line(Lines.result("c1")).card()
        assertEquals(ElicitationStage.WAITING, cancelled.stage)
        assertEquals(ApprovalOutcome.CANCELLED, cancelled.answered)
        assertFalse(cancelled.answerable)
    }

    @Test
    fun `type only - a process that ended can no longer be answered, not even after a restart`() {
        val ended = HostState().line(form()).next(PresenterInput.ProcessEnded)
        assertFalse(ended.card().answerable)
        assertEquals(ApprovalOutcome.CANCELLED, ended.card().answered)
        val again = ended.next(PresenterInput.Launched(effort = null))
        assertFalse(again.card().answerable, "the new CLI never asked it")
        assertEquals(ApprovalOutcome.CANCELLED, again.card().answered)
        val asked = again.line(form(id = "e2"))
        assertEquals(listOf(false, true), asked.cards().map { it.answerable })
    }

    @Test
    fun `type only - an answer that could not be sent is a failure until the next answer`() {
        val failed = HostState().line(form()).next(PresenterInput.AnswerFailed("e1", "could not send"))
        assertEquals("could not send", failed.card().failure)
        assertEquals(ElicitationStage.WAITING, failed.card().stage)
        assertTrue(failed.card().answerable)
        val sent = failed.answer(ElicitationAction.ACCEPT, "{}").card()
        assertNull(sent.failure)
        assertEquals(ElicitationStage.SENT, sent.stage)
    }

    @Test
    fun `type only - the heading is the title, else the display name, else the server`() {
        fun heading(extra: String) = HostState().line(form(extra = extra)).card().heading
        assertEquals("Permission", heading(""","title":"Permission","display_name":"Files tool""""))
        assertEquals("Files tool", heading(""","display_name":"Files tool""""))
        assertEquals("files", heading(""))
    }

    @Test
    fun `type only - the description, the property order and an unknown mode are read`() {
        val schemaTwo =
            """{"type":"object","properties":{"a":{"type":"boolean"},"b":{"type":"boolean"}}}"""
        val event =
            AgentEvent.Elicitation(
                "e2",
                "files",
                "mystery",
                null,
                RawJson(
                    """{"subtype":"elicitation","mcp_server_name":"files","message":"m","mode":"mystery",""" +
                        """"description":"why","requested_schema":$schemaTwo,"property_order":["b","a"]}""",
                ),
            )
        val card = HostState().line(event).card()
        assertEquals("why", card.description)
        assertFalse(card.isUrl)
        assertEquals(listOf("b", "a"), card.fields?.map { it.key })
    }

    @Test
    fun `type only - a schema Closta cannot fill in leaves no fields to fill`() {
        val nested = """{"type":"object","properties":{"a":{"type":"object","properties":{}}}}"""
        val event =
            AgentEvent.Elicitation(
                "e3",
                "files",
                "form",
                null,
                RawJson(
                    """{"subtype":"elicitation","mcp_server_name":"files","message":"m","requested_schema":$nested}""",
                ),
            )
        assertNull(HostState().line(event).card().fields)
    }

    @Test
    fun `type only - the card sits after the message it came with, as an approval does`() {
        val state =
            HostState()
                .line(Lines.queued("c1"))
                .line(Lines.started("c1"))
                .line(Lines.assistant("m1", Lines.text("Asking.")))
                .line(form())
        val rows = ThreadRows().of(state.transcript, state.conversation)
        val at = rows.indexOfFirst { it is CardRow }
        assertTrue(at > 0)
        assertEquals("${rows[at - 1].key.substringBefore("/")}/card:e1", rows[at].key)
    }

    @Test
    fun `an approval and an elicitation waiting together each have their card`() {
        val state = HostState().line(Lines.request("r1", "Write", null, """{"file_path":"/x"}""")).line(form())
        val rows = ThreadRows().of(state.transcript, state.conversation).filterIsInstance<CardRow>()
        assertEquals(2, rows.size)
        assertTrue(rows.any { it.card is PermissionCard })
        assertTrue(rows.any { it.card is ElicitationCard })
        val answered = state.next(PresenterInput.Decided(ApprovalDecision.Deny("r1"), 1))
        assertEquals(1, answered.cards().size)
    }

    @Test
    fun `an unchanged card is the same row on the next draw`() {
        val state = HostState().line(form())
        val rows = ThreadRows()
        val first = rows.of(state.transcript, state.conversation).filterIsInstance<CardRow>().single()
        val second = rows.of(state.transcript, state.conversation).filterIsInstance<CardRow>().single()
        assertSame(first, second)
        val sent = state.answer(ElicitationAction.CANCEL)
        val third = rows.of(sent.transcript, sent.conversation).filterIsInstance<CardRow>().single()
        assertNotSame(first, third)
        val card = third.card as ElicitationCard
        assertEquals(ElicitationStage.SENT, card.stage)
        assertEquals(ApprovalOutcome.CANCELLED, card.answered)
    }

    @Test
    fun `a card is drawn again only when something it shows besides the message changed`() {
        val shown = HostState().line(form()).card()
        assertFalse(rebuildsElicitationCard(shown, shown.copy(message = "Another words")))
        assertFalse(rebuildsElicitationCard(shown, shown.copy(heading = "Another")))
        assertTrue(rebuildsElicitationCard(shown, shown.copy(requestId = "e9")))
        assertTrue(rebuildsElicitationCard(shown, shown.copy(stage = ElicitationStage.SENT)))
        assertTrue(rebuildsElicitationCard(shown, shown.copy(sentAction = ElicitationAction.ACCEPT)))
        assertTrue(rebuildsElicitationCard(shown, shown.copy(failure = "could not send")))
        assertTrue(rebuildsElicitationCard(shown, shown.copy(answerable = false)))
    }

    @Test
    fun `type only - a card waits by whether it can be answered, not by having no outcome`() {
        val asked = HostState().line(link())
        assertTrue(asked.card().waits)
        val browser = asked.answer(ElicitationAction.ACCEPT, id = "u1")
        assertNull(browser.card().answered)
        assertFalse(browser.card().waits, "a link followed in the browser has no outcome and waits for nothing")
        assertFalse(browser.line(done("x1")).card().waits)
        assertFalse(
            HostState()
                .line(form())
                .answer(ElicitationAction.DECLINE)
                .card()
                .waits,
        )
        assertFalse(
            HostState()
                .line(form())
                .next(PresenterInput.ProcessEnded)
                .card()
                .waits,
        )
    }

    @Test
    fun `a card prints no message, link or form values`() {
        val state =
            HostState()
                .line(link(url = "https://example.com/auth?code=SECRET-CODE"))
                .answer(ElicitationAction.DECLINE, id = "u1")
        val text = state.card().toString()
        assertFalse(text.contains("SECRET-CODE") || text.contains("Sign in"), text)
        val form = HostState().line(form()).answer(ElicitationAction.ACCEPT, """{"name":"SECRET-VALUE"}""")
        assertFalse(form.card().toString().contains("SECRET-VALUE"), form.card().toString())
        assertTrue(text.contains("u1"), text)
    }

    @Test
    fun `a request whose process ended does not count as waiting`() {
        val asked = HostState().line(form())
        assertEquals(listOf("e1"), waitingElicitations(asked.conversation, asked.transcript).map { it.requestId })
        val ended = asked.next(PresenterInput.ProcessEnded)
        assertTrue(waitingElicitations(ended.conversation, ended.transcript).isEmpty())
        assertFalse(threadIsRunning(ended.conversation, ended.transcript))
        assertEquals(SessionGroup.OTHER, sessionSummary(ended.conversation, ended.transcript, false).group)
    }
}
