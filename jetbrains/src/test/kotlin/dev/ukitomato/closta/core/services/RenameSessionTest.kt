package dev.ukitomato.closta.core.services

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** `RenameSession` issues the request through the session with the caller's ids, and holds no state. */
class RenameSessionTest {
    @Test
    fun `RenameSession passes the title, the session id and the request id through the session`() =
        runBlocking {
            val session = RecordingAgentSession()

            RenameSession(session)("the new name", "sess-1", "req-9")

            assertEquals(listOf(Triple("the new name", "sess-1", "req-9")), session.renames)
        }

    @Test
    fun `RenameSession is stateless, so each call is its own request`() =
        runBlocking {
            val session = RecordingAgentSession()
            val rename = RenameSession(session)

            rename("a", "s", "r1")
            rename("b", "s", "r2")

            assertEquals(listOf(Triple("a", "s", "r1"), Triple("b", "s", "r2")), session.renames)
        }
}
