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
