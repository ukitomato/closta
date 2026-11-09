package dev.ukitomato.closta.core.interfaces

import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Every seam of [IdeBridge] can be absent, and a host can be written with none or with only one; no IntelliJ name
 * appears in `core/interfaces`; and a word scan shows the product reads no IDE lock file.
 */
class IdeBridgeSeamsTest {
    /** A host with none of the six seams: only the project root. */
    private class BareHost : IdeBridge {
        override fun projectBasePath(): String? = null
    }

    /** A host with only diagnostics, like a view that has analysis but no files or editor. */
    private class DiagnosticsOnlyHost : IdeBridge {
        override fun projectBasePath(): String = "/work"

        override val diagnostics: Diagnostics =
            object : Diagnostics {
                override suspend fun diagnostics(path: String?): IdeResult<List<Diagnostic>> =
                    IdeResult.Ok(listOf(Diagnostic("/work/A.kt", 1, 2, DiagnosticSeverity.ERROR, "boom")))
            }
    }

    @Test
    fun `a host with none of the six seams is a plain IdeBridge`() {
        val bridge: IdeBridge = BareHost()
        assertNull(bridge.projectFiles)
        assertNull(bridge.editorSelections)
        assertNull(bridge.editorEdits)
        assertNull(bridge.diagnostics)
        assertNull(bridge.worktrees)
        assertNull(bridge.diffViews)
    }

    @Test
    fun `a host with only diagnostics shows the other five as absent and the one as callable`() =
        runBlocking {
            val bridge: IdeBridge = DiagnosticsOnlyHost()
            assertNull(bridge.projectFiles)
            assertNull(bridge.editorSelections)
            assertNull(bridge.editorEdits)
            assertNull(bridge.worktrees)
            assertNull(bridge.diffViews)
            val result = checkNotNull(bridge.diagnostics).diagnostics(null)
            assertEquals(1, (result as IdeResult.Ok).value.size)
        }

    @Test
    fun `a failure is a value with a kind and a sentence`() {
        val failed: IdeResult<Unit> = IdeResult.Failed(IdeFailureKind.OUTSIDE_PROJECT, "outside")
        assertTrue(failed is IdeResult.Failed)
        assertEquals(IdeFailureKind.OUTSIDE_PROJECT, (failed as IdeResult.Failed).kind)
    }

    @Test
    fun `the interfaces name no IntelliJ type (the real sources)`() {
        val dir = File(mainRoot(), "core/interfaces")
        val files = dir.listFiles { file -> file.extension == "kt" }.orEmpty().toList()
        assertTrue(files.size >= 6, "core/interfaces is missing its files: $files")
        val found = files.flatMap { file -> IntelliJNames.hits(file.readText()).map { "${file.name}: $it" } }
        assertEquals(emptyList<String>(), found)
    }

    @Test
    fun `the scan catches every word on the list and a fully qualified name, and not a longer identifier`() {
        IntelliJNames.WORDS.forEach { word ->
            assertTrue(IntelliJNames.hits("val x: $word? = null").isNotEmpty(), "$word was not caught")
        }
        assertTrue(IntelliJNames.hits("import com.intellij.openapi.project.Project").isNotEmpty())
        assertTrue(IntelliJNames.hits("val f = com.intellij.Foo()").isNotEmpty())
        // Longer identifiers that merely contain a listed word are not hits, and neither is a comment.
        assertEquals(
            emptyList<String>(),
            IntelliJNames.hits("interface ProjectFiles { fun projectBasePath(): String? }"),
        )
        assertEquals(
            emptyList<String>(),
            IntelliJNames.hits("class EditorSelections // a Document of the Editor\n/* Project */"),
        )
        // A copy of a real interface with one listed word added fails — the mutation test for the scan.
        val real = File(mainRoot(), "core/interfaces/Diagnostics.kt").readText()
        assertEquals(emptyList<String>(), IntelliJNames.hits(real))
        assertFalse(IntelliJNames.hits("$real\nval leaked: HighlightInfo? = null").isEmpty())
    }

    @Test
    fun `the product reads no IDE lock file (the real sources)`() {
        val word = ".claude" + "/ide"
        val roots = listOf(File(mainRoot().path.substringBefore("src/main/kotlin") + "src/main"))
        val hits =
            roots
                .flatMap { it.walkTopDown().filter { file -> file.isFile } }
                .filter { it.extension in setOf("kt", "xml", "properties", "json") }
                .filter { word in it.readText() }
                .map { it.name }
        assertEquals(emptyList<String>(), hits)
    }

    private fun mainRoot(): File {
        val relative = "src/main/kotlin/dev/ukitomato/closta"
        val found =
            generateSequence(File("").absoluteFile) { it.parentFile }
                .flatMap { sequenceOf(File(it, relative), File(it, "jetbrains/$relative")) }
                .firstOrNull { File(it, "core/interfaces/IdeBridge.kt").isFile }
        return checkNotNull(found) { "no jetbrains/$relative above ${File("").absoluteFile}" }
    }
}

/** The IntelliJ names `core/interfaces` must not use, measured on the source without comments. */
internal object IntelliJNames {
    val WORDS =
        listOf(
            "VirtualFile",
            "PsiFile",
            "PsiElement",
            "Project",
            "Module",
            "Editor",
            "Document",
            "HighlightInfo",
            "RangeHighlighter",
            "AnAction",
            "DataContext",
            "FileEditor",
            "Notification",
        )

    private val wordPatterns = WORDS.associateWith { Regex("(?<![A-Za-z0-9_])${Regex.escape(it)}(?![A-Za-z0-9_])") }

    fun hits(source: String): List<String> {
        val code = withoutComments(source)
        return buildList {
            if ("com.intellij" in code) add("com.intellij")
            wordPatterns.forEach { (word, pattern) -> if (pattern.containsMatchIn(code)) add(word) }
        }
    }

    private fun withoutComments(source: String): String =
        source
            .replace(Regex("/\\*.*?\\*/", RegexOption.DOT_MATCHES_ALL), "")
            .lines()
            .joinToString("\n") { line -> line.substringBefore("//") }
}
