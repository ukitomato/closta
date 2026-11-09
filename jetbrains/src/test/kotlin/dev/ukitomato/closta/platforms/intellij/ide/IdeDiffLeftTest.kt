package dev.ukitomato.closta.platforms.intellij.ide

import dev.ukitomato.closta.core.interfaces.DiffShowRequest
import dev.ukitomato.closta.core.interfaces.IdeFailureKind
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/** Where the left side of a Write's diff comes from, measured without an IDE. */
class IdeDiffLeftTest {
    private val base = "/work/p"
    private val resolved = "/work/p/src/A.kt"

    @Test
    fun `a file that is not there even after a refresh gives an empty left`() {
        val left = diffLeftSource(base, resolved, fileExists = false, canonicalPath = null) { error("not asked") }
        assertEquals(DiffLeft.Empty, left)
    }

    @Test
    fun `a file with a document gives the document as the left`() {
        val left = diffLeftSource(base, resolved, fileExists = true, canonicalPath = resolved) { true }
        assertEquals(DiffLeft.Current, left)
        // No canonical path known: the resolved path is the place checked.
        assertEquals(DiffLeft.Current, diffLeftSource(base, resolved, true, null) { true })
    }

    @Test
    fun `a file that is there without a document is refused, not shown as empty`() {
        val left = diffLeftSource(base, resolved, fileExists = true, canonicalPath = resolved) { false }
        val failure = (left as DiffLeft.Refused).failure
        assertEquals(IdeFailureKind.INVALID_ARGUMENT, failure.kind)
    }

    @Test
    fun `a link whose target is outside the project is refused, and the document is not asked`() {
        val left =
            diffLeftSource(base, resolved, fileExists = true, canonicalPath = "/work/other/A.kt") {
                error("the document of a file outside the project is not read")
            }
        assertEquals(IdeFailureKind.OUTSIDE_PROJECT, (left as DiffLeft.Refused).failure.kind)
    }

    @Test
    fun `a path outside the project does not resolve, so a Write to it never reaches the file`() {
        assertEquals(null, resolveInside(base, "../x/A.kt"))
        assertEquals(null, resolveInside(base, "/etc/hosts"))
    }

    @Test
    fun `a request says only the sizes of its texts`() {
        val text = DiffShowRequest("src/A.kt", "secret-before", "secret-after").toString()
        assertFalse(text.contains("secret"), text)
        assertTrue(text.contains("13") && text.contains("12"), text)
    }

    @Test
    fun `the platform side looks the file up with a refresh and never with the stale lookup (the real source)`() {
        val relative = "src/main/kotlin/dev/ukitomato/closta/platforms/intellij/ide/IdeDiffViews.kt"
        val file =
            generateSequence(File("").absoluteFile) { it.parentFile }
                .flatMap { sequenceOf(File(it, relative), File(it, "jetbrains/$relative")) }
                .firstOrNull { it.isFile }
        val source = checkNotNull(file) { "no $relative above ${File("").absoluteFile}" }.readText()
        assertTrue("refreshAndFindFileByPath" in source)
        val stale = Regex("(?<![A-Za-z])findFileByPath").findAll(source).map { it.value }.toList()
        assertEquals(emptyList<String>(), stale)
    }
}
