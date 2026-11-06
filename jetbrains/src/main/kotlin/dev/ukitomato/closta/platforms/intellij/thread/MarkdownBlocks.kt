package dev.ukitomato.closta.platforms.intellij.thread

import com.intellij.lang.Language
import com.intellij.openapi.diagnostic.thisLogger
import com.intellij.openapi.editor.richcopy.HtmlSyntaxInfoUtil
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.fileTypes.LanguageFileType
import com.intellij.openapi.project.Project
import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.IndentedCodeBlock
import org.commonmark.node.Node
import org.commonmark.parser.Parser
import org.commonmark.renderer.NodeRenderer
import org.commonmark.renderer.html.HtmlNodeRendererContext
import org.commonmark.renderer.html.HtmlRenderer

/** One top-level block of a reply as HTML; a [wide] one (a code fence or a table) scrolls sideways on its own. */
data class HtmlBlock(
    val html: String,
    val wide: Boolean,
)

/**
 * GitHub-flavoured Markdown (with tables) to HTML, one piece per top-level block, by the commonmark the IDE bundles
 * with Jewel (a public module). Code fences are coloured by the IDE's lexer for the fence's language, the way the
 * IDE's documentation does; a fence that cannot be coloured is written plain and the rest is not affected.
 */
class MarkdownBlocks(
    private val project: Project,
) {
    private val extensions = listOf(TablesExtension.create())
    private val parser = Parser.builder().extensions(extensions).build()
    private val renderer =
        HtmlRenderer
            .builder()
            .extensions(extensions)
            .escapeHtml(true)
            .nodeRendererFactory { context -> FenceRenderer(context) }
            .build()

    fun of(markdown: String): List<HtmlBlock> {
        val blocks = mutableListOf<HtmlBlock>()
        var node = parser.parse(markdown).firstChild
        while (node != null) {
            val wide = node is FencedCodeBlock || node is IndentedCodeBlock || node is TableBlock
            blocks += HtmlBlock(renderer.render(node), wide)
            node = node.next
        }
        return blocks
    }

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

    private inner class FenceRenderer(
        private val context: HtmlNodeRendererContext,
    ) : NodeRenderer {
        override fun getNodeTypes(): Set<Class<out Node>> = setOf(FencedCodeBlock::class.java)

        override fun render(node: Node) {
            val fence = node as FencedCodeBlock
            // Only the one newline the fence ends with goes; the code's own indentation stays.
            val code = fence.literal.removeSuffix("\n")
            val html = coloured(fence.info.orEmpty(), code)
            val out = context.writer
            out.line()
            out.raw("<pre><code>")
            if (html != null) out.raw(html) else out.text(code)
            out.raw("</code></pre>")
            out.line()
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
