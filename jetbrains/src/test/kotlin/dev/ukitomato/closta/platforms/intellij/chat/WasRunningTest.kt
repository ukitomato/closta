package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.platforms.intellij.session.SessionFailure
import dev.ukitomato.closta.platforms.intellij.session.SessionStatus
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class WasRunningTest {
    @Test
    fun aLiveSessionWithAConversationIsMarked() {
        val open =
            listOf(
                OpenAtClose("live", alive = true, messages = 3),
                OpenAtClose("empty", alive = true, messages = 0),
                OpenAtClose("ended", alive = false, messages = 5),
                OpenAtClose("tree", alive = true, messages = 1, workingDirectory = "/w", title = "t"),
            )
        assertEquals(
            mapOf("kept" to WasRunningMark(), "live" to WasRunningMark(), "tree" to WasRunningMark("/w", "t")),
            marksAtClose(mapOf("kept" to WasRunningMark()), open),
        )
    }

    @Test
    fun aClearedSessionIsMarkedUnderItsConversationWithTheTabsId() {
        val open = listOf(OpenAtClose("new", alive = true, messages = 2, hostId = "host"))
        assertEquals(mapOf("new" to WasRunningMark(hostId = "host")), marksAtClose(emptyMap(), open))
    }

    @Test
    fun aTabResumesTheConversationItLastShowedInItsFolder() {
        val marks =
            mapOf(
                "new" to WasRunningMark("/w", "t", hostId = "host"),
                "host" to WasRunningMark("/old"),
                "plain" to WasRunningMark("/p"),
            )
        val cleared =
            mapOf(
                "host" to ClearedTab("kept", "/k"),
                "gone" to ClearedTab(null, "/g"),
                "nodir" to ClearedTab("new", null),
            )
        assertEquals(TabResume("new", "/w"), tabResume("host", emptyMap(), marks), "after a restart, from the mark")
        assertEquals(TabResume("kept", "/k"), tabResume("host", cleared, marks), "from the table")
        assertEquals(TabResume(null, "/g"), tabResume("gone", cleared, marks), "nothing after the clear")
        assertEquals(TabResume("new", "/w"), tabResume("nodir", cleared, marks), "the folder from the mark")
        assertEquals(TabResume("plain", "/p"), tabResume("plain", emptyMap(), marks))
        assertEquals(TabResume("none", null), tabResume("none", emptyMap(), marks))
    }

    @Test
    fun eachProjectHasItsOwnKey() {
        assertEquals("closta.sessions.wasRunning.abc123", wasRunningKey("abc123"))
    }
}

class AliveAtCloseTest {
    @Test
    fun aSessionTheIdeClosedWasAlive() {
        assertEquals(
            listOf(true, true, false, false),
            listOf(
                SessionStatus.Starting,
                SessionStatus.Closed,
                SessionStatus.Ended,
                SessionStatus.Failed(SessionFailure.CommandNotFound),
            ).map(::aliveAtClose),
        )
    }
}
