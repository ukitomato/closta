package dev.ukitomato.closta.platforms.intellij.composer

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class RulesTextsTest {
    @Test
    fun `the project's, the local and the user's settings are files`() {
        assertEquals("/w/p/.claude/settings.json", settingsFileOf("projectSettings", "/w/p", "/c"))
        assertEquals("/w/p/.claude/settings.local.json", settingsFileOf("localSettings", "/w/p/", "/c"))
        assertEquals("/c/settings.json", settingsFileOf("userSettings", "/w/p", "/c"))
    }

    @Test
    fun `no file where the place is not known or the source is no file`() {
        assertNull(settingsFileOf("userSettings", "/w/p", null))
        assertNull(settingsFileOf("projectSettings", "", "/c"))
        assertNull(settingsFileOf("policySettings", "/w/p", "/c"))
        assertNull(settingsFileOf("session", "/w/p", "/c"))
        assertNull(settingsFileOf("somethingNew", "/w/p", "/c"))
    }

    @Test
    fun `a Windows directory keeps its separators`() {
        assertEquals("C:\\w\\.claude\\settings.json", settingsFileOf("projectSettings", "C:\\w", null))
    }

    @Test
    fun `the twelve sources the CLI names have words, and another has none`() {
        val sources =
            listOf(
                "userSettings",
                "projectSettings",
                "localSettings",
                "flagSettings",
                "policySettings",
                "cliArg",
                "command",
                "session",
                "mcpMount",
                "toolsNarrowing",
                "mcpServerPolicy",
                "hostCredential",
            )
        sources.forEach { assertEquals("composer.rules.source.$it", ruleSourceKey(it)) }
        assertNull(ruleSourceKey("somethingNew"))
        assertNull(ruleSourceKey(""))
    }

    @Test
    fun `only a saved rule that is in effect links to its file`() {
        assertEquals(true, linksToSettingsFile("persistent", false))
        assertEquals(false, linksToSettingsFile("persistent", true))
        assertEquals(false, linksToSettingsFile("session", false))
        assertEquals(false, linksToSettingsFile("readonly", false))
        assertEquals(false, linksToSettingsFile("", false))
    }
}
