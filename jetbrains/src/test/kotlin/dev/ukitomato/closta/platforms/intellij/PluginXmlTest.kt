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
    private val groups: List<Element> =
        DocumentBuilderFactory
            .newInstance()
            .newDocumentBuilder()
            .parse(checkNotNull(loader.getResourceAsStream("META-INF/plugin.xml")))
            .getElementsByTagName("notificationGroup")
            .let { list -> (0 until list.length).map { list.item(it) as Element } }
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
}
