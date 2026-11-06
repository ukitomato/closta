package dev.ukitomato.closta.platforms.intellij.composer

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PromptHistoryTest {
    @Test
    fun upWalksBackThroughAll() {
        val history = PromptHistory(listOf("one", "two", "three"))
        assertEquals("three", history.up(""))
        assertEquals("two", history.up("three"))
        assertEquals("one", history.up("two"))
        assertNull(history.up("one"))
        assertFalse(history.canUp)
    }

    @Test
    fun downComesBackToTheDraft() {
        val history = PromptHistory(listOf("one", "two"))
        assertFalse(history.canDown)
        assertNull(history.down("draft"))
        assertEquals("two", history.up("draft"))
        assertEquals("one", history.up("two"))
        assertEquals("two", history.down("one"))
        assertEquals("draft", history.down("two"))
        assertFalse(history.canDown)
        assertNull(history.down("draft"))
    }

    @Test
    fun editingWhileWalkingKeepsTheEdit() {
        val history = PromptHistory(listOf("one", "two"))
        assertEquals("two", history.up("draft"))
        assertEquals("one", history.up("two, edited"))
        assertEquals("two, edited", history.down("one"))
        assertEquals("draft", history.down("two, edited"))
        assertEquals("two, edited", history.up("draft"))
    }

    @Test
    fun duplicatesInARowAreOne() {
        val history = PromptHistory(listOf("one", "one", "two"))
        history.add("two")
        history.add("three")
        history.add("  ")
        assertEquals("three", history.up(""))
        assertEquals("two", history.up("three"))
        assertEquals("one", history.up("two"))
        assertNull(history.up("one"))
    }

    @Test
    fun addingEndsTheWalk() {
        val history = PromptHistory(listOf("one"))
        assertEquals("one", history.up("draft"))
        history.add("sent")
        assertTrue(history.canUp)
        assertFalse(history.canDown)
        assertEquals("sent", history.up(""))
        assertEquals("one", history.up("sent"))
    }

    @Test
    fun aResumedConversationSeedsOnce() {
        val history = PromptHistory(emptyList())
        assertFalse(history.seeded)
        history.seed(listOf("old one", "old two"))
        assertTrue(history.seeded)
        history.seed(listOf("ignored"))
        assertEquals("old two", history.up(""))
        val sent = PromptHistory(emptyList())
        sent.add("mine")
        assertTrue(sent.seeded)
        sent.seed(listOf("ignored"))
        assertEquals("mine", sent.up(""))
        assertNull(sent.up("mine"))
    }

    @Test
    fun aRestoreThatGrowsSeedsAgainUntilOneIsSent() {
        val history = PromptHistory(emptyList())
        history.seed(listOf("tail"))
        history.seed(listOf("head", "tail"))
        assertEquals("tail", history.up(""))
        assertEquals("head", history.up("tail"))
        history.add("mine")
        history.seed(listOf("other", "head", "tail"))
        assertEquals("mine", history.up(""))
        assertEquals("tail", history.up("mine"))
        assertEquals("head", history.up("tail"))
        assertNull(history.up("head"))
    }

    @Test
    fun emptyHistoryGivesNull() {
        val history = PromptHistory(emptyList())
        assertFalse(history.canUp)
        assertNull(history.up(""))
        assertNull(history.down(""))
    }

    @Test
    fun aSentPromptLosesWhatTheComposerAddedToIt() {
        assertEquals("fix it", promptOf("fix it\n@src/Main.kt"))
        assertEquals("fix it", promptOf("fix it\n⧉ src/A.kt#L1-L3\n@src/Main.kt"))
        assertEquals("fix it", promptOf("fix it\n@src/A.kt#L1-3"))
        assertEquals("look at @this and that", promptOf("look at @this and that"))
        assertEquals("@src/Main.kt", promptOf("@src/Main.kt"))
    }
}
