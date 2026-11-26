package dev.ukitomato.closta.platforms.intellij.thread

import org.commonmark.ext.gfm.tables.TableBlock
import org.commonmark.ext.gfm.tables.TablesExtension
import org.commonmark.node.FencedCodeBlock
import org.commonmark.node.Image
import org.commonmark.node.IndentedCodeBlock
import org.commonmark.node.Link
import org.commonmark.node.Node
import org.commonmark.node.Text
import org.commonmark.parser.Parser
import org.commonmark.renderer.NodeRenderer
import org.commonmark.renderer.html.HtmlNodeRendererContext
import org.commonmark.renderer.html.HtmlRenderer

/** One top-level block of a reply as HTML; a [wide] one (a code fence or a table) scrolls sideways on its own. */
data class HtmlBlock(
    val html: String,
    val wide: Boolean,
)

class MarkdownHtml(
    private val colour: (language: String?, code: String) -> String?,
) {
    private val extensions = listOf(TablesExtension.create())
    private val parser = Parser.builder().extensions(extensions).build()
    private val renderer =
        HtmlRenderer
            .builder()
            .extensions(extensions)
            .escapeHtml(true)
            .nodeRendererFactory { context -> FenceRenderer(context) }
            .nodeRendererFactory { context -> ImageRenderer(context) }
            .nodeRendererFactory { context -> TextRenderer(context) }
            .build()

    fun blocks(markdown: String): List<HtmlBlock> {
        val blocks = mutableListOf<HtmlBlock>()
        var node = parser.parse(markdown).firstChild
        while (node != null) {
            val wide = node is FencedCodeBlock || node is IndentedCodeBlock || node is TableBlock
            blocks += HtmlBlock(renderer.render(node), wide)
            node = node.next
        }
        return blocks
    }

    private inner class FenceRenderer(
        private val context: HtmlNodeRendererContext,
    ) : NodeRenderer {
        override fun getNodeTypes(): Set<Class<out Node>> = setOf(FencedCodeBlock::class.java)

        override fun render(node: Node) {
            val fence = node as FencedCodeBlock
            // Only the one newline the fence ends with goes; the code's own indentation stays.
            val code = fence.literal.removeSuffix("\n")
            val html = colour(fence.info?.takeIf { it.isNotBlank() }, code)
            val out = context.writer
            out.line()
            out.raw("<pre><code>")
            if (html != null) out.raw(html) else out.text(code)
            out.raw("</code></pre>")
            out.line()
        }
    }

    /**
     * Text with a `<wbr>` where a path or a name may break: after `/`, `)` or `]` before a letter or a digit, and
     * after a dot between letters. The pane is given the HTML as it is, so inline code is left whole: the IDE's own
     * pass would break it there too, and a piece of code broken in two can draw over its own last character.
     */
    private class TextRenderer(
        private val context: HtmlNodeRendererContext,
    ) : NodeRenderer {
        override fun getNodeTypes(): Set<Class<out Node>> = setOf(Text::class.java)

        override fun render(node: Node) {
            val text = (node as Text).literal
            val out = context.writer
            var from = 0
            for (i in 1 until text.length) {
                if (breaksBefore(text, i)) {
                    out.text(text.substring(from, i))
                    out.raw("<wbr>")
                    from = i
                }
            }
            out.text(text.substring(from))
        }

        private fun breaksBefore(
            text: String,
            i: Int,
        ): Boolean {
            val before = text[i - 1]
            val next = text[i]
            return when (before) {
                '/', ')', ']' -> next.isLetterOrDigit()
                '.' -> i >= 2 && text[i - 2].isLetter() && next.isLetter()
                else -> false
            }
        }
    }

    /** An image is never an `<img>`: its description and its address are written as text, the address as a link. */
    private class ImageRenderer(
        private val context: HtmlNodeRendererContext,
    ) : NodeRenderer {
        override fun getNodeTypes(): Set<Class<out Node>> = setOf(Image::class.java)

        override fun render(node: Node) {
            val image = node as Image
            val out = context.writer
            val alt = StringBuilder().also { collectText(image, it) }.toString().ifBlank { "image" }
            out.text("[$alt] ")
            if (hasLinkAncestor(image)) {
                out.text(image.destination)
            } else {
                out.raw("<a href=\"")
                out.raw(context.encodeUrl(image.destination).replace("\"", "&quot;"))
                out.raw("\">")
                out.text(image.destination)
                out.raw("</a>")
            }
        }

        private fun collectText(
            node: Node,
            into: StringBuilder,
        ) {
            var child = node.firstChild
            while (child != null) {
                if (child is Text) into.append(child.literal) else collectText(child, into)
                child = child.next
            }
        }

        private fun hasLinkAncestor(node: Node): Boolean {
            var parent = node.parent
            while (parent != null) {
                if (parent is Link) return true
                parent = parent.parent
            }
            return false
        }
    }
}
