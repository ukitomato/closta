package dev.ukitomato.closta.core.models

import dev.ukitomato.closta.providers.claude.fixtures.CaptureFixtures
import org.junit.jupiter.api.Assertions.assertAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test

/**
 * What the fold does with a rejected control request, the permission mode the CLI reports, and the two
 * kinds that change nothing.
 */
class ControlErrorAndModeFoldTest {
    private fun session(mode: String) =
        SessionInfo(sessionId = "s", model = "m", permissionMode = mode, cwd = "/c", version = "2.1.282")

    private fun status(mode: String?) =
        AgentEvent.SystemStatus(uuid = "u", sessionId = "s", status = null, permissionMode = mode)

    @Test
    fun `an error control response leaves one notice with the text and the request id`() {
        val rejected =
            CaptureFixtures.parse(
                """{"type":"control_response","response":{"subtype":"error","request_id":"req-8","error":"nope"}}""",
            )

        val end = fold(ConversationState(), rejected)

        assertEquals(listOf(Notice(NoticeKind.CONTROL_ERROR, "nope", requestId = "req-8")), end.notices)
    }

    @Test
    fun `a success control response changes nothing`() {
        val start = ConversationState(session = session("default"))
        val ok =
            CaptureFixtures.parse(
                """{"type":"control_response","response":""" +
                    """{"subtype":"success","request_id":"r","response":{"mode":"plan"}}}""",
            )

        assertEquals(start, fold(start, ok))
    }

    @Test
    fun `a status with a mode replaces the session's mode`() {
        val end = fold(ConversationState(session = session("default")), status("acceptEdits"))

        assertEquals("acceptEdits", end.session?.permissionMode)
    }

    @Test
    fun `a status with no mode, or with no session, changes nothing`() {
        val withSession = ConversationState(session = session("default"))
        assertAll(
            { assertEquals(withSession, fold(withSession, status(null)), "no mode in the line") },
            { assertNull(fold(ConversationState(), status("plan")).session, "no session yet: the line is dropped") },
            { assertEquals(ConversationState(), fold(ConversationState(), status("plan"))) },
        )
    }

    @Test
    fun `commands_changed and compact_boundary leave the state as it was`() {
        val start = ConversationState(session = session("default"))
        val changed = AgentEvent.SystemCommandsChanged("u", "s", RawJson("[]"))
        val boundary = AgentEvent.SystemCompactBoundary("u", "s", RawJson("""{"trigger":"manual","pre_tokens":1}"""))

        assertAll(
            { assertSame(start, fold(start, changed)) },
            { assertSame(start, fold(start, boundary)) },
        )
    }
}
