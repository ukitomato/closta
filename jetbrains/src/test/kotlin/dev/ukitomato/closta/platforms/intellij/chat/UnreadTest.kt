package dev.ukitomato.closta.platforms.intellij.chat

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class UnreadTest {
    @Test
    fun aTurnThatEndsOutOfViewIsUnread() {
        assertTrue(unreadAfter(wasRunning = true, running = false, inView = false, unread = false))
    }

    @Test
    fun aTurnThatEndsInViewIsRead() {
        assertFalse(unreadAfter(wasRunning = true, running = false, inView = true, unread = false))
    }

    @Test
    fun unreadStaysUntilSeen() {
        assertTrue(unreadAfter(wasRunning = false, running = false, inView = false, unread = true))
        assertTrue(unreadAfter(wasRunning = false, running = true, inView = false, unread = true))
        assertFalse(unreadAfter(wasRunning = false, running = false, inView = true, unread = true))
    }
}
