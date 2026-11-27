package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.presenter.view.Keyed
import dev.ukitomato.closta.presenter.view.MessageRecord
import dev.ukitomato.closta.presenter.view.MessageSource
import dev.ukitomato.closta.presenter.view.Role
import dev.ukitomato.closta.presenter.view.Transcript
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ClearedTabsTest {
    @Test
    fun aTableReadsBackAsItWasWritten() {
        val tabs =
            linkedMapOf(
                "a" to ClearedTab("conv", "/w"),
                "b" to ClearedTab("conv2", null),
                "c" to ClearedTab(null, "/x"),
                "d" to ClearedTab(null, null),
            )
        assertEquals(tabs.toList(), ClearedTabs.decode(ClearedTabs.encode(tabs)).toList())
    }

    @Test
    fun aValueThatIsNotATableReadsAsEmpty() {
        listOf(
            null,
            "",
            "{",
            "{}",
            "[1]",
        ).forEach { assertEquals(emptyMap<String, ClearedTab>(), ClearedTabs.decode(it), it) }
        assertEquals(
            mapOf("a" to ClearedTab("x", null)),
            ClearedTabs.decode("""[{"id":"nohost"},{"host":"a","id":"x"}]"""),
        )
    }

    @Test
    fun theOldestTabIsDroppedPastTheLimitAndARewrittenOneMovesBack() {
        var tabs = emptyMap<String, ClearedTab>()
        (0..64).forEach { tabs = ClearedTabs.withTab(tabs, "h$it", ClearedTab("c$it", null)) }
        assertEquals(64, tabs.size)
        assertFalse("h0" in tabs)
        tabs = ClearedTabs.withTab(tabs, "h1", ClearedTab("again", null))
        assertEquals("h1", tabs.keys.last())
        assertEquals(ClearedTab("again", null), tabs["h1"])
        assertEquals(64, tabs.size)
    }

    @Test
    fun aTabThatWasNeverClearedLeavesNothing() {
        assertNull(clearedTabOf("h", "h", null, false, "/w", "/p"))
        assertNull(clearedTabOf("h", "c", null, true, "/w", "/p"))
    }

    @Test
    fun aClearWithNothingSentAfterItResumesNothing() {
        assertEquals(ClearedTab(null, "/w"), clearedTabOf("h", "h", 3, true, "/w", "/p"))
        assertEquals(ClearedTab(null, "/w"), clearedTabOf("h", "c", 3, false, "/w", "/p"))
        assertEquals(ClearedTab("c", "/w"), clearedTabOf("h", "c", 3, true, "/w", "/p"))
    }

    @Test
    fun theProjectsOwnFolderIsNotKept() {
        assertEquals(ClearedTab("c", null), clearedTabOf("h", "c", 0, true, "/p", "/p"))
        assertEquals(ClearedTab("c", null), clearedTabOf("h", "c", 0, true, null, "/p"))
    }

    private fun transcript(
        clearedAt: Int?,
        vararg sources: MessageSource,
    ): Transcript {
        var messages = Keyed.empty<MessageRecord>()
        sources.forEachIndexed { i, s -> messages = messages.put("m$i", MessageRecord("m$i", Role.USER, s)) }
        return Transcript(messages = messages, clearedAt = clearedAt)
    }

    @Test
    fun onlyAMessageSentAfterTheClearCounts() {
        assertTrue(transcript(1, MessageSource.Sent, MessageSource.Nested, MessageSource.Sent).sentAfterClear())
        assertFalse(transcript(1, MessageSource.Sent, MessageSource.Nested).sentAfterClear())
        assertFalse(
            transcript(0, MessageSource.Nested, MessageSource.Turn("u"), MessageSource.Resume()).sentAfterClear(),
        )
        assertFalse(transcript(null, MessageSource.Sent).sentAfterClear())
    }

    @Test
    fun aSessionThatStopsUnclearedDropsItsOldRow() {
        val cleared = ClearedTab("c1", null)
        var tabs = ClearedTabs.after(emptyMap(), listOf("H" to cleared, "other" to ClearedTab("o", "/w")))
        assertEquals(cleared, tabs["H"])
        assertEquals(ClearedTab("o", "/w"), tabs["other"])
        tabs = ClearedTabs.after(tabs, listOf("H" to null, "never" to null))
        assertEquals(listOf("other"), tabs.keys.toList())
    }
}
