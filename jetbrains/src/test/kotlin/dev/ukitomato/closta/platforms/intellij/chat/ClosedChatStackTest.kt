package dev.ukitomato.closta.platforms.intellij.chat

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class ClosedChatStackTest {
    private fun chat(
        id: String,
        placement: Placement = Placement.EDITOR_TAB,
    ) = ClosedChat(id, placement, "title of $id", "/work/$id")

    @Test
    fun anEmptyStackHasNothingToReopen() {
        assertNull(ClosedChatStack().latest())
    }

    @Test
    fun theLatestIsTheOneClosedLast() {
        val stack = ClosedChatStack().closed(chat("a")).closed(chat("b"))
        assertEquals("b", stack.latest()?.hostId)
    }

    @Test
    fun reopeningTakesTheOneBeforeBack() {
        val stack = ClosedChatStack().closed(chat("a")).closed(chat("b")).reopened("b")
        assertEquals("a", stack.latest()?.hostId)
        assertNull(stack.reopened("a").latest())
    }

    @Test
    fun theSameHostIdKeepsOnlyTheNewerClose() {
        val stack =
            ClosedChatStack()
                .closed(chat("a", Placement.EDITOR_TAB))
                .closed(chat("b"))
                .closed(chat("a", Placement.SIDEBAR))
        assertEquals(Placement.SIDEBAR, stack.latest()?.placement)
        assertEquals("b", stack.reopened("a").latest()?.hostId)
        assertNull(stack.reopened("a").reopened("b").latest(), "no older copy of a was left")
    }

    @Test
    fun theEleventhCloseDropsTheOldest() {
        var stack = ClosedChatStack()
        (1..11).forEach { stack = stack.closed(chat("c$it")) }
        (11 downTo 2).forEach {
            assertEquals("c$it", stack.latest()?.hostId)
            stack = stack.reopened("c$it")
        }
        assertNull(stack.latest(), "c1 fell off")
    }

    @Test
    fun theStackIsNotChangedByAClose() {
        val before = ClosedChatStack().closed(chat("a"))
        before.closed(chat("b"))
        assertEquals("a", before.latest()?.hostId)
    }

    @Test
    fun aClosedChatShowsOnlyItsHostAndPlace() {
        val text = ClosedChat("h1", Placement.SIDEBAR, "secret title", "/secret/dir").toString()
        assertFalse(text.contains("secret"), text)
        assertEquals(true, text.contains("h1") && text.contains("SIDEBAR"), text)
    }
}
