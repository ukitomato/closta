package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.lang.Language
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.editor.richcopy.HtmlSyntaxInfoUtil
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.fileTypes.LanguageFileType
import com.intellij.openapi.project.Project

/**
 * GitHub-flavoured Markdown (with tables) to HTML, one piece per top-level block, by the commonmark the IDE bundles
 * with Jewel (a public module). Code fences are coloured by the IDE's lexer for the fence's language, the way the
 * IDE's documentation does; a fence that cannot be coloured is written plain and the rest is not affected.
 */
class MarkdownBlocks(
    private val project: Project,
) {
    private val html = MarkdownHtml { info, code -> coloured(info.orEmpty(), code) }

    fun of(markdown: String): List<HtmlBlock> = html.blocks(markdown)

    private fun coloured(
        info: String,
        code: String,
    ): String? {
        val language = fenceLanguage(info) ?: return null
        return try {
            HtmlSyntaxInfoUtil
                .appendHighlightedByLexerAndEncodedAsHtmlCodeSnippet(StringBuilder(), project, language, code, true, 1f)
                .toString()
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Exception,
        ) {
            thisLogger().info("a code fence is left uncoloured (${failure.javaClass.simpleName})")
            null
        }
    }
}

/** The language a code fence names in its info string (`kotlin`, `Kotlin`, `kt`); null when none is known. */
fun fenceLanguage(info: String?): Language? {
    val name = info.orEmpty().trim().substringBefore(' ')
    if (name.isEmpty()) return null
    return Language.getRegisteredLanguages().firstOrNull {
        it.id.equals(
            name,
            true,
        ) ||
            it.displayName.equals(name, true)
    }
        ?: (FileTypeManager.getInstance().getFileTypeByExtension(name) as? LanguageFileType)?.language
}
