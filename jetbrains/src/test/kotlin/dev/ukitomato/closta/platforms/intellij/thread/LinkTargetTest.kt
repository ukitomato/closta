package dev.ukitomato.closta.platforms.intellij.thread

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class LinkTargetTest {
    private val root = "/work/app"

    @Test
    fun webLinksGoToTheBrowser() {
        assertEquals(LinkTarget.Web("https://example.com/a"), linkTarget("https://example.com/a", root))
        assertEquals(LinkTarget.Web("http://example.com"), linkTarget("http://example.com", root))
        assertEquals(LinkTarget.Web("HTTPS://example.com"), linkTarget("HTTPS://example.com", root))
    }

    @Test
    fun aRelativePathOpensInTheProject() {
        assertEquals(LinkTarget.File("/work/app/src/A.kt", null), linkTarget("src/A.kt", root))
        assertEquals(LinkTarget.File("/work/app/src/A.kt", 42), linkTarget("src/A.kt:42", root))
        assertEquals(LinkTarget.File("/work/app/src/A.kt", 7), linkTarget("./src/A.kt#L7", root))
    }

    @Test
    fun aFileAtTheRootWithALineOpens() {
        assertEquals(LinkTarget.File("/work/app/README.md", 10), linkTarget("README.md:10", root))
        assertEquals(LinkTarget.File("/work/app/build.gradle.kts", 5), linkTarget("build.gradle.kts:5", root))
    }

    @Test
    fun anAbsolutePathInsideTheProjectOpens() {
        assertEquals(LinkTarget.File("/work/app/README.md", 3), linkTarget("/work/app/README.md:3", root))
        assertEquals(LinkTarget.File("/work/app/README.md", null), linkTarget("file:///work/app/README.md", root))
    }

    @Test
    fun aPathOutsideTheProjectDoesNothing() {
        assertNull(linkTarget("/etc/passwd", root))
        assertNull(linkTarget("../other/A.kt", root))
        assertNull(linkTarget("src/A.kt", null))
    }

    @Test
    fun otherSchemesDoNothing() {
        assertNull(linkTarget("javascript:alert(1)", root))
        assertNull(linkTarget("mailto:a@b.c", root))
        assertNull(linkTarget("ftp://example.com", root))
        assertNull(linkTarget("", root))
        assertNull(linkTarget("#section", root))
    }

    @Test
    fun aToolPathInsideTheProjectOpensNormalized() {
        assertEquals("/work/app/src/A.kt", toolPathTarget("/work/app/src/A.kt", root))
        assertEquals("/work/app/src/A.kt", toolPathTarget("src/./A.kt", root))
        assertEquals("/work/app/src/A.kt", toolPathTarget("/work/app/x/../src/A.kt", root))
    }

    @Test
    fun aToolPathOutsideTheProjectIsRefused() {
        assertNull(toolPathTarget("/etc/passwd", root))
        assertNull(toolPathTarget("../other/A.kt", root))
        assertNull(toolPathTarget("/work/app/../other/A.kt", root))
        assertNull(toolPathTarget("/work/app2/A.kt", root))
        assertNull(toolPathTarget("", root))
    }

    @Test
    fun aUncToolPathIsRefused() {
        val back = "\\"
        assertNull(toolPathTarget(back + back + "host" + back + "share" + back + "a", root))
        assertNull(toolPathTarget("//host/share/a", root))
        assertNull(toolPathTarget(back + back + "wsl.localhost" + back + "Ubuntu" + back + "work" + back + "app", root))
        assertNull(toolPathTarget(back + "/host/share/a", root))
    }
}
