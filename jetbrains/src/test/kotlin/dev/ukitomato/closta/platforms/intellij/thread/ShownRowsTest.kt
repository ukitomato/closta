package dev.ukitomato.closta.platforms.intellij.thread

import dev.ukitomato.closta.presenter.view.TextRow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ShownRowsTest {
    private val shown = ShownRows { markdown -> markdown.split("\n\n").map { HtmlBlock("<p>$it</p>", false) } }

    @Test
    fun aReplyBeingWrittenEndsInATypingRow() {
        val rows = shown.of(listOf(TextRow("m1/0", "one\n\ntwo", streaming = true, opens = true)))
        assertEquals(listOf("m1/0#0", "m1/0#1", "m1/0#typing"), rows.map { it.key })
        assertTrue(rows.last() is ShownRow.Typing)
    }

    @Test
    fun aFinishedReplyHasNoTypingRow() {
        val rows = shown.of(listOf(TextRow("m1/0", "one", streaming = false, opens = true)))
        assertTrue(rows.none { it is ShownRow.Typing })
    }

    @Test
    fun aBlockGivesBackItsWholeReply() {
        shown.of(listOf(TextRow("m1/0", "one\n\ntwo", streaming = false, opens = true)))
        assertEquals("one\n\ntwo", shown.replyOf("m1/0#1"))
        assertNull(shown.replyOf("m2/0#0"))
    }
}
