package dev.ukitomato.closta.platforms.intellij.session

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/** The id of the session a start opens: a fork's is new, a resume's is the saved one's. */
class SessionIdForTest {
    @Test
    fun `a fork has the new id, a resume the saved id, and a new conversation the new id`() {
        assertEquals("new", sessionIdFor(SessionOpening.Fork("old"), newId = "new"))
        assertEquals("old", sessionIdFor(SessionOpening.Resume("old"), newId = "new"))
        assertEquals("new", sessionIdFor(SessionOpening.New, newId = "new"))
    }
}
