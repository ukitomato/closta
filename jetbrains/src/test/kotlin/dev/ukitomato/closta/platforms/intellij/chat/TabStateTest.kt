package dev.ukitomato.closta.platforms.intellij.chat

import dev.ukitomato.closta.presenter.view.ToolResult
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class TabStateTest {
    @Test
    fun noResultIsRunning() = assertEquals(TabState.RUNNING, tabState(null))

    @Test
    fun aResultIsDone() {
        assertEquals(TabState.DONE, tabState(ToolResult(null, false)))
        assertEquals(TabState.DONE, tabState(ToolResult(null, null)))
    }

    @Test
    fun anErrorResultIsFailed() = assertEquals(TabState.FAILED, tabState(ToolResult(null, true)))

    @Test
    fun aLongTitleIsCutWithAnEllipsis() {
        assertEquals("Explore", tabTitle("Explore", 32, "Subagent"))
        assertEquals("Find the place where…", tabTitle("Find the place where the bug is", 21, "Subagent"))
        assertEquals("Subagent", tabTitle("  ", 32, "Subagent"))
    }

    @Test
    fun aConversationsTabIsNamedAfterItsFirstRequest() {
        val first = "Retry up to 3 times when login fails. Fix AuthServiceTest.kt too"
        assertTrue(chatTabTitle(first).length <= CHAT_TAB_MAX)
        assertTrue(chatTabTitle(first).endsWith("…"))
        assertEquals("Fix the CI cache", chatTabTitle("Fix the CI cache"))
        assertEquals(chatTabTitle(""), chatTabTitle("   "))
    }
}
