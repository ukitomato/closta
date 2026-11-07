package dev.ukitomato.closta.platforms.intellij.composer

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class StatusMessagesTest {
    private val base = StatusMessage("Esc to stop", StatusSource.SESSION, false, 0, null, false)

    private fun message(
        text: String,
        source: StatusSource = StatusSource.HINT,
        at: Long = 0,
        ttlMs: Long? = 4_000,
        untilKeystroke: Boolean = false,
    ) = StatusMessage(text, source, source != StatusSource.HINT, at, ttlMs, untilKeystroke)

    @Test
    fun anErrorDoesNotHideTheBaseForever() {
        val messages = StatusMessages()
        messages.post(message("No answer", StatusSource.SWITCH, ttlMs = 8_000))
        assertEquals("No answer", messages.shown(7_999, base)?.text)
        assertEquals(base, messages.shown(8_000, base))
        assertFalse(messages.pending)
    }

    @Test
    fun aHintSurvivesRepeatedShows() {
        val messages = StatusMessages()
        messages.post(message("Nothing is selected", ttlMs = 4_000))
        repeat(100) { assertEquals("Nothing is selected", messages.shown(it * 39L, base)?.text) }
        assertEquals(base, messages.shown(4_000, base))
    }

    @Test
    fun aKeystrokeClearsUntilKeystrokeMessages() {
        val messages = StatusMessages()
        messages.post(message("kept", at = 0, ttlMs = 10_000))
        messages.post(message("typed away", StatusSource.REFUSAL, at = 1, untilKeystroke = true))
        assertEquals("typed away", messages.shown(2, base)?.text)
        messages.keystroke()
        assertEquals("kept", messages.shown(3, base)?.text)
    }

    @Test
    fun theNewestPostWins() {
        val messages = StatusMessages()
        messages.post(message("first", StatusSource.REFUSAL, at = 0))
        messages.post(message("second", StatusSource.HINT, at = 10))
        assertEquals("second", messages.shown(20, base)?.text)
        messages.post(message("third", StatusSource.REFUSAL, at = 30))
        assertEquals("third", messages.shown(40, base)?.text)
    }

    @Test
    fun noColourDecides() {
        val messages = StatusMessages()
        messages.post(message("red", StatusSource.REFUSAL, ttlMs = 1_000))
        assertTrue(messages.shown(999, base)?.error == true)
        assertEquals(base, messages.shown(1_000, base))
        assertNull(messages.shown(1_001, null))
    }

    @Test
    fun clearDropsEverything() {
        val messages = StatusMessages()
        messages.post(message("one", ttlMs = null))
        messages.clear()
        assertEquals(base, messages.shown(1, base))
    }

    @Test
    fun aBlockedComposerSaysWhy() {
        assertNull(sendBlockReason(SendBlock.NONE))
        assertEquals("Starting Claude…", sendBlockReason(SendBlock.STARTING))
        assertEquals("This conversation cannot take messages", sendBlockReason(SendBlock.CLOSED))
    }

    @Test fun `a session that can send is not blocked`() =
        assertEquals(SendBlock.NONE, sendBlockOf(sendable = true, starting = true))

    @Test fun `a starting session waits`() =
        assertEquals(
            SendBlock.STARTING,
            sendBlockOf(sendable = false, starting = true),
        )

    @Test fun `a session that cannot send and is not starting has ended`() =
        assertEquals(SendBlock.CLOSED, sendBlockOf(sendable = false, starting = false))
}
