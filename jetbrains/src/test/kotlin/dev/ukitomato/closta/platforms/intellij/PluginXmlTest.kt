package dev.ukitomato.closta.platforms.intellij

import dev.ukitomato.closta.platforms.intellij.chat.NoticeGroups
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import org.w3c.dom.Element
import java.util.Properties
import javax.xml.parsers.DocumentBuilderFactory

class PluginXmlTest {
    private val loader = PluginXmlTest::class.java.classLoader
    private val document =
        DocumentBuilderFactory
            .newInstance()
            .newDocumentBuilder()
            .parse(checkNotNull(loader.getResourceAsStream("META-INF/plugin.xml")))

    private fun elements(tag: String): List<Element> =
        document.getElementsByTagName(tag).let { list -> (0 until list.length).map { list.item(it) as Element } }

    private val groups: List<Element> = elements("notificationGroup")
    private val words =
        Properties().apply {
            checkNotNull(
                loader.getResourceAsStream("messages/ClostaBundle.properties"),
            ).reader(Charsets.UTF_8).use(::load)
        }

    private fun id(group: Element) = group.getAttribute("id")

    @Test
    fun everyGroupIsNamedFromTheBundle() =
        groups.forEach { assertNotNull(words.getProperty(it.getAttribute("key").ifEmpty { "-" }), id(it)) }

    @Test
    fun everyGroupCanBeTurnedOffInTheSettings() =
        groups.forEach {
            assertFalse(it.hasAttribute("hideFromSettings"), id(it))
        }

    @Test
    fun noGroupIsTheBareName() = assertFalse(groups.any { id(it) == "Closta" })

    @Test
    fun theCodeUsesExactlyTheDeclaredGroups() = assertEquals(NoticeGroups.ALL.toSet(), groups.map(::id).toSet())

    @Test
    fun whatWaitsStaysUntilAnswered() =
        assertEquals("STICKY_BALLOON", groups.single { id(it) == NoticeGroups.WAITING }.getAttribute("displayType"))

    private val rowActions =
        listOf(
            "OpenInEditor",
            "OpenInSidebar",
            "EndSession",
            "Archive",
            "ResumeInEditor",
            "ResumeInSidebar",
            "ClearMark",
            "Open",
        ).map { "Closta.Sessions.$it" }

    @Test
    fun theSessionsWindowsActionsAreRegistered() {
        val registered = elements("action").map { it.getAttribute("id") }.toSet()
        assertEquals(emptyList<String>(), (rowActions + "Closta.ResumeSidebarChat").filter { it !in registered })
    }

    @Test
    fun theSessionsWindowsMenusAndToolbarAreRegistered() {
        val registered = elements("group").map { it.getAttribute("id") }.toSet()
        val wanted = listOf("LiveMenu", "MarkMenu", "Toolbar").map { "Closta.Sessions.$it" }
        assertEquals(emptyList<String>(), wanted.filter { it !in registered })
    }

    @Test
    fun everyActionIsWordedInTheBundle() =
        elements("action").forEach {
            val id = it.getAttribute("id")
            assertNotNull(words.getProperty("action.$id.text"), id)
            assertNotNull(words.getProperty("action.$id.description"), id)
        }

    // Delete is bound on the tree alone (registerCustomShortcutSet), so the keymap's own Delete stays free.
    @Test
    fun noSessionsActionTakesTheKeymapsDelete() =
        elements("action")
            .filter { it.getAttribute("id").startsWith("Closta.Sessions.") }
            .forEach { assertEquals(0, it.getElementsByTagName("keyboard-shortcut").length, it.getAttribute("id")) }
}
